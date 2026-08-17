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
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Production-grade Android Foreground Location Service.
 * Single Authoritative Source of Truth for GPS tracking, metric calculation,
 * durable SQLite journaling, and real-time state synchronization.
 */
public final class WorkoutLocationService extends Service {
    public static final String ACTION_START = "com.tms.apparatus.workout.START";
    public static final String ACTION_STOP = "com.tms.apparatus.workout.STOP";
    public static final String ACTION_PAUSE = "com.tms.apparatus.workout.PAUSE";
    public static final String ACTION_RESUME = "com.tms.apparatus.workout.RESUME";
    public static final String ACTION_LOCATION = "com.tms.apparatus.workout.LOCATION";
    public static final String ACTION_STATE_CHANGE = "com.tms.apparatus.workout.STATE_CHANGE";

    private static final String CHANNEL_ID = "workout_location_tracking";
    private static final int NOTIFICATION_ID = 4101;
    public static final String PREFS = "workout_location_session";

    // SharedPreferences State Keys
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

    // Quality Constants
    private static final float MAX_ACCEPTED_ACCURACY_M = 35.0f;
    private static final long GPS_SETTLING_DURATION_MS = 6000L; // First 6s suppresses noise while anchor settles
    private static final float SPEED_EMA_ALPHA = 0.25f;

    // Fused Location & System handles
    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private WorkoutLocationDatabase database;
    private PowerManager.WakeLock wakeLock;

    // In-memory Metric Engine State
    private long sessionSettleUntil = 0L;
    private float emaSpeedKmh = 0f;
    private Location lastAcceptedLocation = null;
    private final List<Double> altBuffer = new ArrayList<>();
    private Double lastElevationAnchor = null;

    @Override
    public void onCreate() {
        super.onCreate();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        database = new WorkoutLocationDatabase(this);
        createNotificationChannel();

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Apparatus:WorkoutLocation");
            wakeLock.setReferenceCounted(false);
        }

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult locationResult) {
                for (Location location : locationResult.getLocations()) {
                    if (location != null) {
                        handleNewLocation(location);
                    }
                }
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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

        boolean hasActiveSession = prefs.getLong(KEY_STARTED_AT, 0L) > 0L
                && ("TRACKING".equals(prefs.getString(KEY_STATE, "IDLE")) || "PAUSED".equals(prefs.getString(KEY_STATE, "IDLE")));

        if (reset || (!hasActiveSession && prefs.getLong(KEY_STARTED_AT, 0L) == 0L)) {
            database.beginNewSession();
            altBuffer.clear();
            lastElevationAnchor = null;
            lastAcceptedLocation = null;
            emaSpeedKmh = 0f;
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
            // Restore last accepted location if available
            if (prefs.contains(KEY_LAST_LAT) && prefs.contains(KEY_LAST_LNG)) {
                lastAcceptedLocation = new Location("restored");
                lastAcceptedLocation.setLatitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_LAT, 0L)));
                lastAcceptedLocation.setLongitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_LNG, 0L)));
                lastAcceptedLocation.setTime(prefs.getLong(KEY_LAST_TIMESTAMP, System.currentTimeMillis()));
            }
        }

        startForegroundNotification();
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12hr safety timeout
        }
        requestFusedLocationUpdates();
        broadcastStateChange("TRACKING");
    }

    private void pauseTracking() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_STATE, "PAUSED")
                .putLong(KEY_PAUSED_AT, System.currentTimeMillis())
                .putFloat(KEY_CURRENT_SPEED_KMH, 0f)
                .apply();
        emaSpeedKmh = 0f;
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
        emaSpeedKmh = 0f;
        updateNotification();
        broadcastStateChange("TRACKING");
    }

    private void stopTracking() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_STATE, "STOPPED")
                .apply();
        removeFusedLocationUpdates();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
        broadcastStateChange("STOPPED");
        stopSelf();
    }

    private void requestFusedLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        try {
            LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                    .setMinUpdateIntervalMillis(1000L)
                    .setMinUpdateDistanceMeters(0f)
                    .setWaitForAccurateLocation(false)
                    .build();

            fusedClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
        } catch (Exception ignored) {}
    }

    private void removeFusedLocationUpdates() {
        try {
            if (fusedClient != null && locationCallback != null) {
                fusedClient.removeLocationUpdates(locationCallback);
            }
        } catch (Exception ignored) {}
    }

    /**
     * Primary GPS Ingestion & Single Source of Truth Metric Engine.
     */
    private void handleNewLocation(@NonNull Location location) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String currentState = prefs.getString(KEY_STATE, "IDLE");
        if (!"TRACKING".equals(currentState)) return;

        // 1. Quality Gate: Coordinate Validity
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        if (Double.isNaN(lat) || Double.isNaN(lng) || (lat == 0.0 && lng == 0.0) || Math.abs(lat) > 90.0 || Math.abs(lng) > 180.0) {
            return;
        }

        // 2. Quality Gate: Timestamp Monotonicity
        long lastTs = prefs.getLong(KEY_LAST_TIMESTAMP, 0L);
        if (location.getTime() <= lastTs && lastTs > 0L) {
            return;
        }

        // 3. Quality Gate: Strict Accuracy Limit
        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 999f;
        if (accuracy > MAX_ACCEPTED_ACCURACY_M) {
            return;
        }

        // Base noise floor
        float baseNoiseFloorM = 5.0f;
        boolean isSettling = sessionSettleUntil > 0L && location.getTime() < sessionSettleUntil;

        // Hardware Doppler speed confidence
        float nativeSpeedKmh = -1f;
        boolean hasHighConfidenceSpeed = false;
        if (location.hasSpeed() && location.getSpeed() >= 0f) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
                hasHighConfidenceSpeed = location.getSpeedAccuracyMetersPerSecond() <= 1.5f;
            } else {
                hasHighConfidenceSpeed = accuracy <= 20.0f;
            }
            if (hasHighConfidenceSpeed) {
                nativeSpeedKmh = location.getSpeed() * 3.6f;
            }
        }

        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        long movingDurationSec = prefs.getLong(KEY_MOVING_DURATION_SEC, 0L);
        float maxSpeedKmh = prefs.getFloat(KEY_MAX_SPEED_KMH, 0f);
        float elevationGainM = prefs.getFloat(KEY_ELEVATION_GAIN_M, 0f);

        boolean isAccepted = false;
        float addedDistanceM = 0f;
        float currentSpeedKmh = 0f;

        if (lastAcceptedLocation != null) {
            float deltaDistanceM = lastAcceptedLocation.distanceTo(location);
            float dtSec = Math.max(0.1f, (location.getTime() - lastAcceptedLocation.getTime()) / 1000f);
            float derivedSpeedKmh = (deltaDistanceM / dtSec) * 3.6f;

            // Spike Detection: Validate gradual acceleration/deceleration.
            // No hard speed cap (user can walk -> board motorbike/car).
            // Reject sudden impossible instantaneous jumps (e.g. 5 km/h -> 90 km/h in 1 sec).
            float maxAllowedDeltaSpeedKmh = Math.max(30.0f, emaSpeedKmh * 0.8f + 25.0f) * Math.min(3.0f, dtSec);
            boolean isSuddenSpike = Math.abs(derivedSpeedKmh - emaSpeedKmh) > maxAllowedDeltaSpeedKmh && deltaDistanceM > 20.0f;
            boolean isAbsurdTeleport = derivedSpeedKmh > 180.0f; // >180 km/h is impossible ground workout speed

            if ((isSuddenSpike && !hasHighConfidenceSpeed) || isAbsurdTeleport) {
                // Reject glitch point from distance/route accumulation
                saveLiveLocationPrefs(prefs, location, accuracy, distanceMeters, movingDurationSec, 0f, maxSpeedKmh, elevationGainM);
                broadcastLocation(location, accuracy, distanceMeters, movingDurationSec, 0f, maxSpeedKmh, elevationGainM, false, false);
                return;
            }

            // Dynamic noise threshold based on GPS accuracy
            float dynamicNoiseThreshold = Math.max(baseNoiseFloorM, accuracy * 0.35f);

            // Speed estimation
            float candidateSpeedKmh;
            if (nativeSpeedKmh >= 0f) {
                candidateSpeedKmh = nativeSpeedKmh < 1.0f ? 0f : nativeSpeedKmh;
            } else {
                candidateSpeedKmh = deltaDistanceM < dynamicNoiseThreshold ? 0f : derivedSpeedKmh;
            }

            if (isSettling) {
                candidateSpeedKmh = 0f;
            }

            // Feed EMA speed filter
            if (emaSpeedKmh == 0f && candidateSpeedKmh > 0f) {
                emaSpeedKmh = candidateSpeedKmh;
            } else {
                emaSpeedKmh = (SPEED_EMA_ALPHA * candidateSpeedKmh) + ((1f - SPEED_EMA_ALPHA) * emaSpeedKmh);
            }

            // Stationary Filter: EMA speed < 1.2 km/h and displacement under noise threshold
            boolean isStationary = (emaSpeedKmh < 1.2f && deltaDistanceM < dynamicNoiseThreshold);
            if (isStationary || isSettling) {
                currentSpeedKmh = 0f;
            } else {
                currentSpeedKmh = emaSpeedKmh;
            }

            // Acceptance Gate: Must be outside settling, not stationary, and have sufficient displacement
            boolean hasMovedThreshold = deltaDistanceM >= dynamicNoiseThreshold;
            boolean movementConfirmed = !isSettling && !isStationary && (
                    (emaSpeedKmh >= 1.2f && hasMovedThreshold) ||
                    (hasMovedThreshold && derivedSpeedKmh >= 2.0f)
            );

            if (movementConfirmed) {
                isAccepted = true;
                addedDistanceM = deltaDistanceM;
                distanceMeters += addedDistanceM;
                lastAcceptedLocation = location;

                // Moving Time Accumulation (cap burst when waking from background)
                if (dtSec < 30f) {
                    movingDurationSec += Math.round(dtSec);
                }

                // Elevation Gain Accumulation
                if (location.hasAltitude()) {
                    double smoothedAlt = smoothAltitude(location.getAltitude());
                    if (lastElevationAnchor != null) {
                        double altDiff = smoothedAlt - lastElevationAnchor;
                        if (altDiff >= 1.5 && altDiff < 80.0) {
                            elevationGainM += (float) altDiff;
                            lastElevationAnchor = smoothedAlt;
                        } else if (altDiff <= -1.5 && altDiff > -80.0) {
                            lastElevationAnchor = smoothedAlt;
                        }
                    } else {
                        lastElevationAnchor = smoothedAlt;
                    }
                }

                // Max Speed calculation
                if (currentSpeedKmh > 1.5f && currentSpeedKmh <= 180.0f) {
                    maxSpeedKmh = Math.max(maxSpeedKmh, currentSpeedKmh);
                }
            } else if (isSettling) {
                // During settling, update anchor without distance accumulation
                lastAcceptedLocation = location;
                if (location.hasAltitude()) {
                    lastElevationAnchor = smoothAltitude(location.getAltitude());
                }
            }
        } else {
            // First accepted location of the session
            isAccepted = true;
            lastAcceptedLocation = location;
            if (nativeSpeedKmh >= 0f) {
                emaSpeedKmh = nativeSpeedKmh < 1.0f ? 0f : nativeSpeedKmh;
                currentSpeedKmh = emaSpeedKmh;
            }
            if (location.hasAltitude()) {
                lastElevationAnchor = smoothAltitude(location.getAltitude());
            }
        }

        try {
            JSONObject pointJson = locationToJson(location, accuracy, distanceMeters, movingDurationSec, currentSpeedKmh, maxSpeedKmh, elevationGainM, emaSpeedKmh >= 1.2f, isAccepted);

            // Persist ONLY accepted route points to durable SQLite journal
            if (isAccepted) {
                database.append(pointJson);
            }

            // Update SharedPreferences
            saveLiveLocationPrefs(prefs, location, accuracy, distanceMeters, movingDurationSec, currentSpeedKmh, maxSpeedKmh, elevationGainM);

            // Update Ongoing Foreground Notification
            updateNotification();

            // Broadcast to WebView
            Intent update = new Intent(ACTION_LOCATION).setPackage(getPackageName());
            update.putExtra("point", pointJson.toString());
            sendBroadcast(update);
        } catch (Exception ignored) {}
    }

    private void saveLiveLocationPrefs(SharedPreferences prefs, Location location, float accuracy,
                                      float distanceMeters, long movingDurationSec, float currentSpeedKmh,
                                      float maxSpeedKmh, float elevationGainM) {
        SharedPreferences.Editor editor = prefs.edit();
        editor.putLong(KEY_LAST_LAT, Double.doubleToRawLongBits(location.getLatitude()))
              .putLong(KEY_LAST_LNG, Double.doubleToRawLongBits(location.getLongitude()))
              .putFloat(KEY_LAST_ACCURACY, accuracy)
              .putLong(KEY_LAST_TIMESTAMP, location.getTime())
              .putFloat(KEY_DISTANCE_METERS, distanceMeters)
              .putLong(KEY_MOVING_DURATION_SEC, movingDurationSec)
              .putFloat(KEY_CURRENT_SPEED_KMH, currentSpeedKmh)
              .putFloat(KEY_MAX_SPEED_KMH, maxSpeedKmh)
              .putFloat(KEY_ELEVATION_GAIN_M, elevationGainM);

        if (location.hasAltitude()) {
            editor.putLong(KEY_LAST_ALT, Double.doubleToRawLongBits(location.getAltitude()));
        }
        if (location.hasBearing()) {
            editor.putFloat(KEY_LAST_BEARING, location.getBearing());
        }
        editor.apply();
    }

    private void broadcastLocation(Location location, float accuracy, float distanceMeters,
                                  long movingDurationSec, float currentSpeedKmh, float maxSpeedKmh,
                                  float elevationGainM, boolean isMoving, boolean isAccepted) {
        try {
            JSONObject pointJson = locationToJson(location, accuracy, distanceMeters, movingDurationSec, currentSpeedKmh, maxSpeedKmh, elevationGainM, isMoving, isAccepted);
            Intent update = new Intent(ACTION_LOCATION).setPackage(getPackageName());
            update.putExtra("point", pointJson.toString());
            sendBroadcast(update);
        } catch (Exception ignored) {}
    }

    private double smoothAltitude(double alt) {
        altBuffer.add(alt);
        if (altBuffer.size() > 5) altBuffer.remove(0);
        List<Double> sorted = new ArrayList<>(altBuffer);
        Collections.sort(sorted);
        return sorted.get(sorted.size() / 2);
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
        long movingDurationSec = prefs.getLong(KEY_MOVING_DURATION_SEC, 0L);
        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        float speedKmh = prefs.getFloat(KEY_CURRENT_SPEED_KMH, 0f);
        String activity = activityLabel(prefs.getString(KEY_ACTIVITY_TYPE, "walk"));

        String title = isPaused ? activity + " (Paused)" : "Apparatus • " + activity;
        String paceStr = formatPace(distanceMeters, movingDurationSec);
        String line1 = formatDuration(movingDurationSec) + "  •  " + String.format(Locale.US, "%.2f km", distanceMeters / 1000f) + "  •  " + paceStr + (paceStr.equals("--:--") ? "" : " /km");
        String line2 = "Speed: " + String.format(Locale.US, "%.1f km/h", speedKmh);

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

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // User explicitly swiped app from recents — stop tracking cleanly
        stopTracking();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        removeFusedLocationUpdates();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public @Nullable IBinder onBind(Intent intent) {
        return null;
    }

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
        return h > 0L ? String.format(Locale.US, "%d:%02d:%02d", h, m, s)
                : String.format(Locale.US, "%02d:%02d", m, s);
    }

    private static String formatPace(float distanceMeters, long movingSec) {
        if (distanceMeters < 10f || movingSec <= 0L) return "--:--";
        long secPerKm = Math.round((movingSec * 1000f) / distanceMeters);
        if (secPerKm > 3600L) return ">60:00";
        return String.format(Locale.US, "%d:%02d", secPerKm / 60L, secPerKm % 60L);
    }

    private static JSONObject locationToJson(Location location, float accuracy, float distanceMeters,
                                             long movingDurationSec, float currentSpeedKmh, float maxSpeedKmh,
                                             float elevationGainM, boolean isMoving, boolean isAccepted) throws Exception {
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

        // Computed Authoritative Metrics
        point.put("distanceMeters", (double) distanceMeters);
        point.put("movingDurationSec", movingDurationSec);
        point.put("currentSpeedKmh", (double) currentSpeedKmh);
        point.put("maxSpeedKmh", (double) maxSpeedKmh);
        point.put("elevationGainM", (double) elevationGainM);
        point.put("isMoving", isMoving);
        point.put("isAccepted", isAccepted);

        return point;
    }
}
