package com.tms.apparatus;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.pm.ServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.app.ServiceCompat;

import org.json.JSONObject;

/** Owns Android location collection independently of the WebView. */
public final class WorkoutLocationService extends Service implements LocationListener {
    static final String ACTION_START = "com.tms.apparatus.workout.START";
    static final String ACTION_STOP = "com.tms.apparatus.workout.STOP";
    static final String ACTION_LOCATION = "com.tms.apparatus.workout.LOCATION";
    private static final String CHANNEL_ID = "workout_location";
    private static final int NOTIFICATION_ID = 4101;
    private static final String PREFS = "workout_location";
    private static final String KEY_ACTIVE = "active";
    private static final String KEY_ACTIVITY_TYPE = "activity_type";
    private static final String KEY_STARTED_AT = "started_at";
    private static final String KEY_DISTANCE_METERS = "distance_meters";
    private static final String KEY_LAST_LAT = "last_lat";
    private static final String KEY_LAST_LNG = "last_lng";
    private static final String KEY_LAST_TIMESTAMP = "last_timestamp";
    private static final String KEY_LAST_SPEED_KMH = "last_speed_kmh";
    private static final float MAX_ACCEPTED_ACCURACY_M = 75f;
    private LocationManager locationManager;
    private WorkoutLocationDatabase database;
    private PowerManager.WakeLock wakeLock;

    @Override public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        database = new WorkoutLocationDatabase(this);
        createChannel();
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Apparatus:WorkoutLocation");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            return START_NOT_STICKY;
        }
        boolean reset = intent != null && intent.getBooleanExtra("reset", false);
        String activityType = intent != null ? intent.getStringExtra("activityType") : null;
        if (reset) {
            database.beginNewSession();
            resetLiveStats(activityType);
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getLong(KEY_STARTED_AT, 0L) == 0L) resetLiveStats(activityType);
        SharedPreferences.Editor editor = prefs.edit().putBoolean(KEY_ACTIVE, true);
        if (activityType != null) editor.putString(KEY_ACTIVITY_TYPE, activityType);
        editor.apply();
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
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

    private void stopTracking() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, false).apply();
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID);
        }
        stopSelf();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID);
        }
        super.onDestroy();
    }

    @Override public void onLocationChanged(Location location) {
        if (location == null) return;
        if (location.hasAccuracy() && location.getAccuracy() > MAX_ACCEPTED_ACCURACY_M) return;
        try {
            JSONObject point = toJson(location);
            database.append(point);
            updateLiveStats(location);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification());
            }
            Intent update = new Intent(ACTION_LOCATION).setPackage(getPackageName());
            update.putExtra("point", point.toString());
            sendBroadcast(update);
        } catch (Exception ignored) {}
    }

    @Override public void onProviderDisabled(String provider) {}
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public @Nullable IBinder onBind(Intent intent) { return null; }

    private Notification buildNotification() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        long startedAt = prefs.getLong(KEY_STARTED_AT, System.currentTimeMillis());
        long elapsedSeconds = Math.max(0L, (System.currentTimeMillis() - startedAt) / 1000L);
        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        float speedKmh = prefs.getFloat(KEY_LAST_SPEED_KMH, 0f);
        String activity = activityLabel(prefs.getString(KEY_ACTIVITY_TYPE, "walk"));
        String primary = formatDuration(elapsedSeconds) + "  •  " + String.format(java.util.Locale.US, "%.2f km", distanceMeters / 1000f);
        String secondary = "Speed " + String.format(java.util.Locale.US, "%.1f km/h", speedKmh)
                + "  •  Pace " + formatPace(distanceMeters, elapsedSeconds) + " /km";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(activity + " tracking")
                .setContentText(primary)
                .setSubText(secondary)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(primary + "\n" + secondary))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    private void resetLiveStats(String activityType) {
        String safeType = "run".equals(activityType) || "cycle".equals(activityType) ? activityType : "walk";
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_ACTIVITY_TYPE, safeType)
                .putLong(KEY_STARTED_AT, System.currentTimeMillis())
                .putFloat(KEY_DISTANCE_METERS, 0f)
                .remove(KEY_LAST_LAT)
                .remove(KEY_LAST_LNG)
                .remove(KEY_LAST_TIMESTAMP)
                .putFloat(KEY_LAST_SPEED_KMH, 0f)
                .apply();
    }

    private void updateLiveStats(Location location) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        float speedKmh = location.hasSpeed() ? Math.max(0f, location.getSpeed() * 3.6f) : prefs.getFloat(KEY_LAST_SPEED_KMH, 0f);
        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        long previousTimestamp = prefs.getLong(KEY_LAST_TIMESTAMP, 0L);
        if (location.hasAccuracy() && location.getAccuracy() <= MAX_ACCEPTED_ACCURACY_M && previousTimestamp > 0L && prefs.contains(KEY_LAST_LAT)) {
            Location previous = new Location("stored");
            previous.setLatitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_LAT, 0L)));
            previous.setLongitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_LNG, 0L)));
            float deltaMeters = previous.distanceTo(location);
            float deltaSeconds = Math.max(1f, (location.getTime() - previousTimestamp) / 1000f);
            float derivedSpeedKmh = (deltaMeters / deltaSeconds) * 3.6f;
            if (deltaMeters >= 2f && derivedSpeedKmh <= maxSpeedKmh(prefs.getString(KEY_ACTIVITY_TYPE, "walk"))) {
                distanceMeters += deltaMeters;
                if (!location.hasSpeed()) speedKmh = derivedSpeedKmh;
            }
        }
        if (location.hasAccuracy() && location.getAccuracy() <= MAX_ACCEPTED_ACCURACY_M) {
            editor.putLong(KEY_LAST_LAT, Double.doubleToRawLongBits(location.getLatitude()));
            editor.putLong(KEY_LAST_LNG, Double.doubleToRawLongBits(location.getLongitude()));
            editor.putLong(KEY_LAST_TIMESTAMP, location.getTime());
        }
        editor.putFloat(KEY_DISTANCE_METERS, distanceMeters)
                .putFloat(KEY_LAST_SPEED_KMH, speedKmh)
                .apply();
    }

    private static float maxSpeedKmh(String activityType) {
        if ("cycle".equals(activityType)) return 125f;
        if ("run".equals(activityType)) return 45f;
        return 20f;
    }

    private static String activityLabel(String activityType) {
        if ("cycle".equals(activityType)) return "Cycling";
        if ("run".equals(activityType)) return "Running";
        return "Walking";
    }

    private static String formatDuration(long seconds) {
        long hours = seconds / 3600L;
        long minutes = (seconds % 3600L) / 60L;
        long remainder = seconds % 60L;
        return hours > 0L
                ? String.format(java.util.Locale.US, "%d:%02d:%02d", hours, minutes, remainder)
                : String.format(java.util.Locale.US, "%02d:%02d", minutes, remainder);
    }

    private static String formatPace(float distanceMeters, long elapsedSeconds) {
        if (distanceMeters < 10f || elapsedSeconds <= 0L) return "--:--";
        long secondsPerKm = Math.round((elapsedSeconds * 1000f) / distanceMeters);
        return String.format(java.util.Locale.US, "%d:%02d", secondsPerKm / 60L, secondsPerKm % 60L);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Workout location tracking", NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    private static JSONObject toJson(Location location) throws Exception {
        JSONObject point = new JSONObject();
        point.put("lat", location.getLatitude());
        point.put("lng", location.getLongitude());
        point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        point.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
        point.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
        point.put("timestamp", location.getTime());
        return point;
    }

}
