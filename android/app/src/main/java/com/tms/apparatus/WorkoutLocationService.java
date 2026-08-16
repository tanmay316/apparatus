package com.tms.apparatus;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Production-grade Android Foreground Location Service.
 * Owns workout session state, metrics calculation, and durable journaling independently of the WebView.
 */
public final class WorkoutLocationService extends Service implements LocationListener {
    public static final String ACTION_START = "com.tms.apparatus.workout.START";
    public static final String ACTION_STOP = "com.tms.apparatus.workout.STOP";
    public static final String ACTION_PAUSE = "com.tms.apparatus.workout.PAUSE";
    public static final String ACTION_RESUME = "com.tms.apparatus.workout.RESUME";
    public static final String ACTION_LOCATION = "com.tms.apparatus.workout.LOCATION";
    public static final String ACTION_STATE_CHANGE = "com.tms.apparatus.workout.STATE_CHANGE";

    private static final String CHANNEL_ID = "workout_location_tracking";
    private static final int NOTIFICATION_ID = 4101;
    public static final String PREFS = "workout_location_session";

    // State keys
    public static final String KEY_STATE = "state"; // "IDLE", "TRACKING", "PAUSED", "STOPPED"
    public static final String KEY_ACTIVITY_TYPE = "activity_type";
    public static final String KEY_STARTED_AT = "started_at";
    public static final String KEY_PAUSED_AT = "paused_at";
    public static final String KEY_TOTAL_PAUSED_MS = "total_paused_ms";
    public static final String KEY_MOVING_DURATION_SEC = "moving_duration_sec";
    public static final String KEY_DISTANCE_METERS = "distance_meters";
    public static final String KEY_CURRENT_SPEED_KMH = "current_speed_kmh";
    public static final String KEY_MAX_SPEED_KMH = "max_speed_kmh";
    public static final String KEY_ELEVATION_GAIN_M = "elevation_gain_m";
    public static final String KEY_LAST_LAT = "last_lat";
    public static final String KEY_LAST_LNG = "last_lng";
    public static final String KEY_LAST_ALT = "last_alt";
    public static final String KEY_LAST_BEARING = "last_bearing";
    public static final String KEY_LAST_ACCURACY = "last_accuracy";
    public static final String KEY_LAST_TIMESTAMP = "last_timestamp";

    // Quality constants
    private static final float MAX_ACCEPTED_ACCURACY_M = 40.0f;
    private static final float STRICT_MATH_ACCURACY_M = 20.0f;
    private static final float MIN_MOVEMENT_SPEED_MS = 0.6f; // ~2.16 km/h
    private static final float MIN_DISTANCE_DELTA_M = 2.0f;

    // GPS settling phase — suppress distance for first few seconds to prevent jitter drift
    private static final long GPS_SETTLING_DURATION_MS = 5000L;
    private static final float SETTLING_MIN_DISTANCE_M = 8.0f;
    private static final float SETTLING_MAX_SPEED_KMH = 3.0f;
    private long sessionSettleUntil = 0L;

    private LocationManager locationManager;
    private WorkoutLocationDatabase database;
    private PowerManager.WakeLock wakeLock;

    // Altitude smoothing buffer
    private final List<Double> altBuffer = new ArrayList<>();
    private Double lastElevationAnchor = null;

    @Override public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        database = new WorkoutLocationDatabase(this);
        createNotificationChannel();

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Apparatus:WorkoutLocation");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            return START_NOT_STICKY;
        } else if (ACTION_PAUSE.equals(action)) {
            pauseTracking();
            return START_STICKY;
        } else if (ACTION_RESUME.equals(action)) {
            resumeTracking();
            return START_STICKY;
        } else if (ACTION_START.equals(action)) {
            boolean reset = intent.getBooleanExtra("reset", false);
            String activityType = intent.getStringExtra("activityType");
            startNewSession(activityType, reset);
            return START_STICKY;
        }

        return START_STICKY;
    }

    private void startNewSession(String activityType, boolean reset) {
        String safeType = "run".equals(activityType) || "cycle".equals(activityType) ? activityType : "walk";
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        if (reset || prefs.getLong(KEY_STARTED_AT, 0L) == 0L) {
            database.beginNewSession();
            altBuffer.clear();
            lastElevationAnchor = null;
            sessionSettleUntil = System.currentTimeMillis() + GPS_SETTLING_DURATION_MS;

            prefs.edit()
                    .putString(KEY_STATE, "TRACKING")
                    .putString(KEY_ACTIVITY_TYPE, safeType)
                    .putLong(KEY_STARTED_AT, System.currentTimeMillis())
                    .putLong(KEY_PAUSED_AT, 0L)
                    .putLong(KEY_TOTAL_PAUSED_MS, 0L)
                    .putLong(KEY_MOVING_DURATION_SEC, 0L)
                    .putFloat(KEY_DISTANCE_METERS, 0f)
                    .putFloat(KEY_CURRENT_SPEED_KMH, 0f)
                    .putFloat(KEY_MAX_SPEED_KMH, 0f)
                    .putFloat(KEY_ELEVATION_GAIN_M, 0f)
                    .remove(KEY_LAST_LAT)
                    .remove(KEY_LAST_LNG)
                    .remove(KEY_LAST_ALT)
                    .remove(KEY_LAST_BEARING)
                    .remove(KEY_LAST_ACCURACY)
                    .remove(KEY_LAST_TIMESTAMP)
                    .apply();
        } else {
            prefs.edit().putString(KEY_STATE, "TRACKING").apply();
        }

        startForegroundNotification();
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12hr safety timeout
        }
        requestLocationUpdates();
        broadcastStateChange("TRACKING");
    }

    private void pauseTracking() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_STATE, "PAUSED")
                .putLong(KEY_PAUSED_AT, System.currentTimeMillis())
                .putFloat(KEY_CURRENT_SPEED_KMH, 0f)
                .apply();
        updateNotification();
        broadcastStateChange("PAUSED");
    }

    private void resumeTracking() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        long pausedAt = prefs.getLong(KEY_PAUSED_AT, 0L);
        long totalPaused = prefs.getLong(KEY_TOTAL_PAUSED_MS, 0L);
        if (pausedAt > 0L) {
            totalPaused += (System.currentTimeMillis() - pausedAt);
        }
        prefs.edit()
                .putString(KEY_STATE, "TRACKING")
                .putLong(KEY_PAUSED_AT, 0L)
                .putLong(KEY_TOTAL_PAUSED_MS, totalPaused)
                .apply();
        updateNotification();
        broadcastStateChange("TRACKING");
    }

    private void stopTracking() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_STATE, "STOPPED")
                .apply();
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
        broadcastStateChange("STOPPED");
        stopSelf();
    }

    private void requestLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            if (locationManager != null) {
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
                }
                if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 2f, this);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override public void onLocationChanged(Location location) {
        if (location == null) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String currentState = prefs.getString(KEY_STATE, "IDLE");
        if (!"TRACKING".equals(currentState)) return;

        // 1. Pipeline Gate: Timestamp validity (reject stale / out-of-order points)
        long lastTs = prefs.getLong(KEY_LAST_TIMESTAMP, 0L);
        if (location.getTime() <= lastTs && lastTs > 0L) return;

        // 2. Pipeline Gate: Accuracy limit
        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 999f;
        if (accuracy > MAX_ACCEPTED_ACCURACY_M) return;

        try {
            // Append to durable SQLite log
            JSONObject pointJson = locationToJson(location);
            database.append(pointJson);

            // Process live stats metrics
            processLocationMetrics(location, prefs);

            // Update live notification
            updateNotification();

            // Broadcast to WebView client
            Intent update = new Intent(ACTION_LOCATION).setPackage(getPackageName());
            update.putExtra("point", pointJson.toString());
            sendBroadcast(update);
        } catch (Exception ignored) {}
    }

    private void processLocationMetrics(Location location, SharedPreferences prefs) {
        String activityType = prefs.getString(KEY_ACTIVITY_TYPE, "walk");
        float maxSpeedLimitKmh = getMaxSpeedLimit(activityType);

        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 999f;
        boolean hasStrictAccuracy = accuracy <= STRICT_MATH_ACCURACY_M;

        float lastSpeedKmh = prefs.getFloat(KEY_CURRENT_SPEED_KMH, 0f);
        float maxSpeedKmh = prefs.getFloat(KEY_MAX_SPEED_KMH, 0f);
        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        long movingDurationSec = prefs.getLong(KEY_MOVING_DURATION_SEC, 0L);
        float elevationGainM = prefs.getFloat(KEY_ELEVATION_GAIN_M, 0f);
        long lastTimestamp = prefs.getLong(KEY_LAST_TIMESTAMP, 0L);

        float currentSpeedKmh = 0f;
        float addedDistanceM = 0f;
        float addedElevationM = 0f;
        boolean isMoving = false;

        // Speed calculation: Validate native speed vs derived speed
        boolean hasGoodNativeSpeed = false;
        if (location.hasSpeed()) {
            float speedMs = location.getSpeed();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
                hasGoodNativeSpeed = location.getSpeedAccuracyMetersPerSecond() <= 2.0f;
            } else {
                hasGoodNativeSpeed = speedMs >= 0f && hasStrictAccuracy;
            }
            if (hasGoodNativeSpeed) {
                currentSpeedKmh = speedMs * 3.6f;
            }
        }

        if (prefs.contains(KEY_LAST_LAT) && lastTimestamp > 0L) {
            double prevLat = Double.longBitsToDouble(prefs.getLong(KEY_LAST_LAT, 0L));
            double prevLng = Double.longBitsToDouble(prefs.getLong(KEY_LAST_LNG, 0L));
            Location prevLoc = new Location("prev");
            prevLoc.setLatitude(prevLat);
            prevLoc.setLongitude(prevLng);

            float deltaM = prevLoc.distanceTo(location);
            float deltaSec = Math.max(0.1f, (location.getTime() - lastTimestamp) / 1000f);
            float derivedSpeedKmh = (deltaM / deltaSec) * 3.6f;

            // Teleportation / jump rejection gate
            if (derivedSpeedKmh <= maxSpeedLimitKmh * 1.25f) {
                if (!hasGoodNativeSpeed) {
                    currentSpeedKmh = (derivedSpeedKmh < 0.6f && deltaM < 1.5f) ? 0f : derivedSpeedKmh;
                }

                // Distance acceptance gate with settling logic
                boolean isSettling = sessionSettleUntil > 0L && location.getTime() < sessionSettleUntil;
                float requiredDistance = isSettling ? SETTLING_MIN_DISTANCE_M : MIN_DISTANCE_DELTA_M;
                boolean settlingSpeedOk = !isSettling || derivedSpeedKmh <= SETTLING_MAX_SPEED_KMH;
                if (hasStrictAccuracy && deltaM >= requiredDistance && settlingSpeedOk) {
                    addedDistanceM = deltaM;
                    distanceMeters += addedDistanceM;
                }
            }

            // Elevation filtering & gain calculation
            if (location.hasAltitude() && hasStrictAccuracy) {
                double smoothedAlt = smoothAltitude(location.getAltitude());
                if (lastElevationAnchor != null) {
                    double altDiff = smoothedAlt - lastElevationAnchor;
                    if (altDiff >= 1.5 && altDiff < 80.0) {
                        addedElevationM = (float) altDiff;
                        elevationGainM += addedElevationM;
                        lastElevationAnchor = smoothedAlt;
                    } else if (altDiff <= -1.5 && altDiff > -80.0) {
                        lastElevationAnchor = smoothedAlt;
                    }
                } else {
                    lastElevationAnchor = smoothedAlt;
                }
            }
        } else {
            if (location.hasAltitude()) {
                lastElevationAnchor = smoothAltitude(location.getAltitude());
            }
        }

        // Movement State Machine
        isMoving = currentSpeedKmh >= (MIN_MOVEMENT_SPEED_MS * 3.6f) || addedDistanceM > 0f;
        if (isMoving && lastTimestamp > 0L) {
            long dtSec = Math.max(1L, (location.getTime() - lastTimestamp) / 1000L);
            movingDurationSec += dtSec;
        }

        // Don't update max speed during GPS settling (jitter causes phantom speeds)
        boolean isSettlingForMax = sessionSettleUntil > 0L && location.getTime() < sessionSettleUntil;
        if (!isSettlingForMax && currentSpeedKmh > 1.5f && currentSpeedKmh <= maxSpeedLimitKmh) {
            maxSpeedKmh = Math.max(maxSpeedKmh, currentSpeedKmh);
        }

        SharedPreferences.Editor editor = prefs.edit();
        if (hasStrictAccuracy) {
            editor.putLong(KEY_LAST_LAT, Double.doubleToRawLongBits(location.getLatitude()));
            editor.putLong(KEY_LAST_LNG, Double.doubleToRawLongBits(location.getLongitude()));
            if (location.hasAltitude()) editor.putLong(KEY_LAST_ALT, Double.doubleToRawLongBits(location.getAltitude()));
            if (location.hasBearing() && isMoving) editor.putFloat(KEY_LAST_BEARING, location.getBearing());
        }
        editor.putFloat(KEY_LAST_ACCURACY, accuracy);
        editor.putLong(KEY_LAST_TIMESTAMP, location.getTime());
        editor.putFloat(KEY_DISTANCE_METERS, distanceMeters);
        editor.putLong(KEY_MOVING_DURATION_SEC, movingDurationSec);
        editor.putFloat(KEY_CURRENT_SPEED_KMH, currentSpeedKmh);
        editor.putFloat(KEY_MAX_SPEED_KMH, maxSpeedKmh);
        editor.putFloat(KEY_ELEVATION_GAIN_M, elevationGainM);
        editor.apply();
    }

    private double smoothAltitude(double alt) {
        altBuffer.add(alt);
        if (altBuffer.size() > 5) altBuffer.remove(0);
        List<Double> sorted = new ArrayList<>(altBuffer);
        Collections.sort(sorted);
        return sorted.get(sorted.size() / 2);
    }

    private float getMaxSpeedLimit(String activityType) {
        if ("cycle".equals(activityType)) return 100f;
        if ("run".equals(activityType)) return 35f;
        return 15f;
    }

    private void startForegroundNotification() {
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String state = prefs.getString(KEY_STATE, "IDLE");
        boolean isPaused = "PAUSED".equals(state);
        long startedAt = prefs.getLong(KEY_STARTED_AT, System.currentTimeMillis());
        long movingDurationSec = prefs.getLong(KEY_MOVING_DURATION_SEC, 0L);
        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        float speedKmh = prefs.getFloat(KEY_CURRENT_SPEED_KMH, 0f);
        String activity = activityLabel(prefs.getString(KEY_ACTIVITY_TYPE, "walk"));

        String title = isPaused ? activity + " (Paused)" : "Apparatus • " + activity;
        String paceStr = formatPace(distanceMeters, movingDurationSec);
        String line1 = formatDuration(movingDurationSec) + "  •  " + String.format(java.util.Locale.US, "%.2f km", distanceMeters / 1000f) + "  •  " + paceStr + (paceStr.equals("--:--") ? "" : " /km");
        String line2 = "Speed: " + String.format(java.util.Locale.US, "%.1f km/h", speedKmh);

        Intent openAppIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        // Action 1: Pause or Resume
        Intent pauseResumeIntent = new Intent(this, WorkoutLocationService.class)
                .setAction(isPaused ? ACTION_RESUME : ACTION_PAUSE);
        PendingIntent pauseResumePending = PendingIntent.getService(this, 1, pauseResumeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        // Action 2: Stop
        Intent stopIntent = new Intent(this, WorkoutLocationService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 2, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(line1)
                .setSubText(line2)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(line1 + "\n" + line2))
                .setContentIntent(pendingIntent)
                .addAction(isPaused ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause,
                        isPaused ? "RESUME" : "PAUSE", pauseResumePending)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "STOP", stopPending)
                .setOngoing(true)
                .setOnlyAlertOnce(true);

        return builder.build();
    }

    private void broadcastStateChange(String state) {
        Intent intent = new Intent(ACTION_STATE_CHANGE).setPackage(getPackageName());
        intent.putExtra("state", state);
        sendBroadcast(intent);
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        // User explicitly swiped app from recents — stop tracking cleanly
        stopTracking();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public void onProviderDisabled(String provider) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public @Nullable IBinder onBind(Intent intent) { return null; }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Workout Tracking Location Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows continuous live workout stats and GPS status");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private static String activityLabel(String activityType) {
        if ("cycle".equals(activityType)) return "Cycling";
        if ("run".equals(activityType)) return "Running";
        return "Walking";
    }

    private static String formatDuration(long seconds) {
        long h = seconds / 3600L;
        long m = (seconds % 3600L) / 60L;
        long s = seconds % 60L;
        return h > 0L ? String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, s)
                : String.format(java.util.Locale.US, "%02d:%02d", m, s);
    }

    private static String formatPace(float distanceMeters, long movingSec) {
        if (distanceMeters < 10f || movingSec <= 0L) return "--:--";
        long secPerKm = Math.round((movingSec * 1000f) / distanceMeters);
        if (secPerKm > 3600L) return ">60:00";
        return String.format(java.util.Locale.US, "%d:%02d", secPerKm / 60L, secPerKm % 60L);
    }

    private static JSONObject locationToJson(Location location) throws Exception {
        JSONObject point = new JSONObject();
        point.put("lat", location.getLatitude());
        point.put("lng", location.getLongitude());
        point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        point.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
            point.put("speedAccuracy", location.getSpeedAccuracyMetersPerSecond());
        } else {
            point.put("speedAccuracy", JSONObject.NULL);
        }
        point.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()) {
            point.put("verticalAccuracy", location.getVerticalAccuracyMeters());
        } else {
            point.put("verticalAccuracy", JSONObject.NULL);
        }
        point.put("bearing", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasBearingAccuracy()) {
            point.put("bearingAccuracy", location.getBearingAccuracyDegrees());
        } else {
            point.put("bearingAccuracy", JSONObject.NULL);
        }
        point.put("timestamp", location.getTime());
        return point;
    }
}
