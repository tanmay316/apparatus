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
import android.os.IBinder;

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
    private LocationManager locationManager;
    private WorkoutLocationDatabase database;

    @Override public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        database = new WorkoutLocationDatabase(this);
        createChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            return START_NOT_STICKY;
        }
        if (intent != null && intent.getBooleanExtra("reset", false)) database.beginNewSession();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, true).apply();
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        // Do not mix network fixes into a fitness route. Their lower precision
        // creates diagonal shortcuts and can overwrite a better GPS sequence.
        try { locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this); } catch (Exception ignored) {}
    }

    private void stopTracking() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, false).apply();
        if (locationManager != null) locationManager.removeUpdates(this);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onLocationChanged(Location location) {
        if (location == null) return;
        try {
            JSONObject point = toJson(location);
            database.append(point);
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
        Intent stop = new Intent(this, WorkoutLocationService.class).setAction(ACTION_STOP);
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? android.app.PendingIntent.FLAG_IMMUTABLE : 0);
        android.app.PendingIntent stopPending = android.app.PendingIntent.getService(this, 0, stop, flags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Workout tracking active")
                .setContentText("Apparatus is recording your route")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .addAction(0, "STOP", stopPending)
                .build();
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
