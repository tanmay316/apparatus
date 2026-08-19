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
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Process;
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
    public static final String KEY_LAST_RAW_LAT = "last_raw_lat";
    public static final String KEY_LAST_RAW_LNG = "last_raw_lng";
    public static final String KEY_LAST_RAW_TIMESTAMP = "last_raw_timestamp";

    // Quality Constants
    private static final float MAX_ACCEPTED_ACCURACY_M = 55.0f;
    private static final long GPS_SETTLING_DURATION_MS = 6000L; // First 6s suppresses noise while anchor settles
    private static final float SPEED_EMA_ALPHA = 0.25f;
    private static final float SPEED_EMA_ALPHA_CAUTIOUS = 0.12f; // Lower alpha when still, skeptical of initial noise

    // Hysteresis thresholds for robust movement detection
    private static final float MOVING_START_SPEED_KMH = 2.5f;   // Sustained speed above this to START moving
    private static final float MOVING_STOP_SPEED_KMH = 0.8f;    // Sustained speed below this to STOP moving
    private static final int CONSECUTIVE_MOVING_SAMPLES = 3;     // 3 consecutive "fast" samples to transition to moving
    private static final int CONSECUTIVE_STILL_SAMPLES = 5;      // 5 consecutive "slow" samples to transition to still
    private static final long AUTO_PAUSE_TIMEOUT_MS = 8000L;     // 8 seconds of stillness before auto-pause
    private static final float MIN_DISTANCE_GATE_M = 3.0f;       // Minimum displacement to add distance even when moving

    // Fused Location & System handles
    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private WorkoutLocationDatabase database;
    private PowerManager.WakeLock wakeLock;

    // In-memory Metric Engine State
    private long sessionSettleUntil = 0L;
    private float emaSpeedKmh = 0f;
    private Location lastAcceptedLocation = null;
    private Location lastRawLocation = null;
    private boolean isCurrentlyMoving = false;
    private int consecutiveMovingSamples = 0;
    private int consecutiveStillSamples = 0;
    private final List<Double> altBuffer = new ArrayList<>();
    private Double lastElevationAnchor = null;
    private long lastMovementTimeMs = 0L;
    private final GpsKalmanFilter gpsKalman = new GpsKalmanFilter();

    private HandlerThread locationThread;
    private Handler locationHandler;

    private final Runnable notificationTicker = new Runnable() {
        @Override
        public void run() {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            if ("TRACKING".equals(prefs.getString(KEY_STATE, "IDLE"))) {
                updateNotification();
                if (locationHandler != null) {
                    locationHandler.postDelayed(this, 3000L);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        
        locationThread = new HandlerThread("WorkoutLocationThread", Process.THREAD_PRIORITY_BACKGROUND);
        locationThread.start();
        locationHandler = new Handler(locationThread.getLooper());

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
        // START_STICKY may restart the service with a null intent after Android
        // kills the app process. The old implementation returned immediately,
        // leaving the workout marked TRACKING but with NO GPS updates running.
        // Always restore an active session in that case.
        if (intent == null) {
            restoreActiveSessionIfNeeded();
            return START_STICKY;
        }

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

        restoreActiveSessionIfNeeded();
        return START_STICKY;
    }

    private void restoreActiveSessionIfNeeded() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String state = prefs.getString(KEY_STATE, "IDLE");
        long startedAt = prefs.getLong(KEY_STARTED_AT, 0L);
        if (startedAt <= 0L || !("TRACKING".equals(state) || "PAUSED".equals(state))) {
            return;
        }

        restoreInMemoryState(prefs);
        startForegroundNotification();
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L);
        }
        if ("TRACKING".equals(state)) {
            requestFusedLocationUpdates();
            if (locationHandler != null) {
                locationHandler.removeCallbacks(notificationTicker);
                locationHandler.postDelayed(notificationTicker, 3000L);
            }
        }
        broadcastStateChange(state);
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
            lastRawLocation = null;
            isCurrentlyMoving = false;
            consecutiveMovingSamples = 0;
            consecutiveStillSamples = 0;
            emaSpeedKmh = 0f;
            lastMovementTimeMs = 0L;
            gpsKalman.reset();
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
                    .remove(KEY_LAST_RAW_LAT)
                    .remove(KEY_LAST_RAW_LNG)
                    .remove(KEY_LAST_RAW_TIMESTAMP)
                    .apply();
        } else {
            prefs.edit().putString(KEY_STATE, "TRACKING").apply();
            restoreInMemoryState(prefs);
        }

        startForegroundNotification();
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // 12hr safety timeout
        }
        requestFusedLocationUpdates();
        if (locationHandler != null) {
            locationHandler.removeCallbacks(notificationTicker);
            locationHandler.postDelayed(notificationTicker, 3000L);
        }
        broadcastStateChange("TRACKING");
    }

    private void restoreInMemoryState(SharedPreferences prefs) {
        lastAcceptedLocation = null;
        lastRawLocation = null;
        emaSpeedKmh = prefs.getFloat(KEY_CURRENT_SPEED_KMH, 0f);
        isCurrentlyMoving = emaSpeedKmh >= MOVING_START_SPEED_KMH;
        consecutiveMovingSamples = isCurrentlyMoving ? CONSECUTIVE_MOVING_SAMPLES : 0;
        consecutiveStillSamples = isCurrentlyMoving ? 0 : CONSECUTIVE_STILL_SAMPLES;
        lastMovementTimeMs = prefs.getLong(KEY_LAST_TIMESTAMP, 0L);

        if (prefs.contains(KEY_LAST_LAT) && prefs.contains(KEY_LAST_LNG)) {
            lastAcceptedLocation = new Location("restored_accepted");
            lastAcceptedLocation.setLatitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_LAT, 0L)));
            lastAcceptedLocation.setLongitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_LNG, 0L)));
            lastAcceptedLocation.setTime(prefs.getLong(KEY_LAST_TIMESTAMP, System.currentTimeMillis()));
            if (prefs.contains(KEY_LAST_ALT)) {
                lastAcceptedLocation.setAltitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_ALT, 0L)));
            }
        }

        if (prefs.contains(KEY_LAST_RAW_LAT) && prefs.contains(KEY_LAST_RAW_LNG)) {
            lastRawLocation = new Location("restored_raw");
            lastRawLocation.setLatitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_RAW_LAT, 0L)));
            lastRawLocation.setLongitude(Double.longBitsToDouble(prefs.getLong(KEY_LAST_RAW_LNG, 0L)));
            lastRawLocation.setTime(prefs.getLong(KEY_LAST_RAW_TIMESTAMP, prefs.getLong(KEY_LAST_TIMESTAMP, System.currentTimeMillis())));
        }

        lastElevationAnchor = null;
        altBuffer.clear();
        if (lastAcceptedLocation != null && lastAcceptedLocation.hasAltitude()) {
            lastElevationAnchor = lastAcceptedLocation.getAltitude();
            altBuffer.add(lastElevationAnchor);
        }
        // Do not start a new 6s session settling window after process death.
        sessionSettleUntil = 0L;
        gpsKalman.reset();
    }

    private void pauseTracking() {
        if (locationHandler != null) {
            locationHandler.removeCallbacks(notificationTicker);
        }
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
        if (locationHandler != null) {
            locationHandler.removeCallbacks(notificationTicker);
            locationHandler.postDelayed(notificationTicker, 3000L);
        }
        broadcastStateChange("TRACKING");
    }

    private void stopTracking() {
        if (locationHandler != null) {
            locationHandler.removeCallbacks(notificationTicker);
        }
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
            if (locationHandler == null) return;
            removeFusedLocationUpdates();
            LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                    .setMinUpdateIntervalMillis(1000L)
                    .setMaxUpdateDelayMillis(0) // Ensure delivery is not batched in the background
                    .setMinUpdateDistanceMeters(0f)
                    .setWaitForAccurateLocation(false)
                    .build();

            fusedClient.requestLocationUpdates(locationRequest, locationCallback, locationHandler.getLooper());

            // Instantly acquire and broadcast last known fix to center map with 0s latency
            fusedClient.getLastLocation().addOnSuccessListener(loc -> {
                if (loc != null) {
                    locationHandler.post(() -> handleNewLocation(loc));
                }
            });
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

        boolean isSettling = sessionSettleUntil > 0L && location.getTime() < sessionSettleUntil;

        // ─── Kalman Filter: Smooth raw GPS coordinates ───
        // Uses constant-velocity model. When stationary, process noise drops to near-zero
        // so jitter is absorbed. When moving, filter tracks the real trajectory.
        double[] kalmanCoords = gpsKalman.process(lat, lng, accuracy, location.getTime(), !isCurrentlyMoving);
        Location smoothedLoc = new Location("kalman");
        smoothedLoc.setLatitude(kalmanCoords[0]);
        smoothedLoc.setLongitude(kalmanCoords[1]);
        smoothedLoc.setTime(location.getTime());
        smoothedLoc.setAccuracy(accuracy);
        if (location.hasAltitude()) smoothedLoc.setAltitude(location.getAltitude());
        if (location.hasSpeed()) smoothedLoc.setSpeed(location.getSpeed());
        if (location.hasBearing()) smoothedLoc.setBearing(location.getBearing());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (location.hasSpeedAccuracy()) smoothedLoc.setSpeedAccuracyMetersPerSecond(location.getSpeedAccuracyMetersPerSecond());
        }

        // Hardware Doppler speed — independent of coordinate jitter
        float nativeSpeedKmh = -1f;
        boolean hasHighConfidenceSpeed = false;
        // Also extract raw Doppler for sanity-checking derived speed even at lower confidence
        float rawDopplerKmh = -1f;
        if (location.hasSpeed() && location.getSpeed() >= 0f) {
            rawDopplerKmh = location.getSpeed() * 3.6f;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
                hasHighConfidenceSpeed = location.getSpeedAccuracyMetersPerSecond() <= 1.5f;
            } else {
                hasHighConfidenceSpeed = accuracy <= 20.0f;
            }
            if (hasHighConfidenceSpeed) {
                // Zero out stationary Doppler noise (< 2.0 km/h)
                nativeSpeedKmh = rawDopplerKmh < 2.0f ? 0f : rawDopplerKmh;
            }
        }

        float distanceMeters = prefs.getFloat(KEY_DISTANCE_METERS, 0f);
        long movingDurationSec = prefs.getLong(KEY_MOVING_DURATION_SEC, 0L);
        float maxSpeedKmh = prefs.getFloat(KEY_MAX_SPEED_KMH, 0f);
        float elevationGainM = prefs.getFloat(KEY_ELEVATION_GAIN_M, 0f);

        boolean isAccepted = false;
        float addedDistanceM = 0f;
        float currentSpeedKmh = 0f;
        boolean isMoving = false;

        // Use Kalman-smoothed coordinates for delta distance and speed derivation
        float smoothedDeltaDistanceM = 0f;
        float rawDtSec = 1f;
        if (lastRawLocation != null) {
            smoothedDeltaDistanceM = lastRawLocation.distanceTo(smoothedLoc);
            rawDtSec = Math.max(0.1f, (location.getTime() - lastRawLocation.getTime()) / 1000f);
        }

        if (lastAcceptedLocation != null) {
            float deltaDistanceM = lastAcceptedLocation.distanceTo(smoothedLoc);
            float dtSec = Math.max(0.1f, (location.getTime() - lastAcceptedLocation.getTime()) / 1000f);
            float derivedSpeedKmh = (smoothedDeltaDistanceM / rawDtSec) * 3.6f;

            // Spike Detection: Validate gradual acceleration/deceleration.
            float maxAllowedDeltaSpeedKmh = Math.max(30.0f, emaSpeedKmh * 0.8f + 25.0f) * Math.min(3.0f, rawDtSec);
            boolean isSuddenSpike = Math.abs(derivedSpeedKmh - emaSpeedKmh) > maxAllowedDeltaSpeedKmh && smoothedDeltaDistanceM > 20.0f;
            boolean isAbsurdTeleport = derivedSpeedKmh > 180.0f;

            if ((isSuddenSpike && !hasHighConfidenceSpeed) || isAbsurdTeleport) {
                saveLiveLocationPrefs(prefs, smoothedLoc, accuracy, distanceMeters, movingDurationSec, 0f, maxSpeedKmh, elevationGainM);
                broadcastLocation(smoothedLoc, accuracy, distanceMeters, movingDurationSec, 0f, maxSpeedKmh, elevationGainM, false, false, true);
                return;
            }

            // ─── Speed Estimation with Doppler cross-check ───
            float candidateSpeedKmh;
            if (nativeSpeedKmh >= 2.0f) {
                // High-confidence Doppler — most reliable signal
                candidateSpeedKmh = nativeSpeedKmh;
            } else if (rawDopplerKmh >= 0f && rawDopplerKmh < 2.0f && derivedSpeedKmh > 4.0f) {
                // Doppler says nearly stopped but derived says fast → GPS coordinate jitter.
                // Clamp hard. This is the key fix for the "stopped but showing 5-10 km/h" bug.
                candidateSpeedKmh = 0f;
            } else if (consecutiveStillSamples > 0 || !isCurrentlyMoving) {
                // Transitioning to still or already still — clamp derived speed from position drift.
                // Without this, jitter-derived 5-10 km/h values keep resetting the still counter.
                candidateSpeedKmh = Math.min(derivedSpeedKmh, 1.5f);
            } else {
                candidateSpeedKmh = derivedSpeedKmh;
            }

            if (isSettling) {
                candidateSpeedKmh = 0f;
            }

            // Feed EMA speed filter with adaptive alpha
            float alpha = isCurrentlyMoving ? SPEED_EMA_ALPHA : SPEED_EMA_ALPHA_CAUTIOUS;
            if (candidateSpeedKmh < 0.8f && smoothedDeltaDistanceM < 1.5f) {
                // If moving very slowly or barely any displacement, decay speed
                emaSpeedKmh = (1f - SPEED_EMA_ALPHA) * emaSpeedKmh;
                if (emaSpeedKmh < 0.3f) emaSpeedKmh = 0f;
            } else if (emaSpeedKmh == 0f) {
                emaSpeedKmh = candidateSpeedKmh;
            } else {
                emaSpeedKmh = (alpha * candidateSpeedKmh) + ((1f - alpha) * emaSpeedKmh);
            }

            // Spatial displacement noise threshold based on GPS accuracy
            float dynamicNoiseThreshold = Math.max(5.0f, accuracy * 0.40f);
            if (nativeSpeedKmh >= 2.5f) {
                dynamicNoiseThreshold = 0f; // High confidence hardware doppler speed
            }

            // ─── Hysteresis-Based Movement Detection ───
            // Requires CONSECUTIVE samples to transition states, preventing single-sample flicker.
            boolean sampleLooksMoving = false;
            if (!isSettling) {
                boolean hasSpeedEvidence = (emaSpeedKmh >= (isCurrentlyMoving ? MOVING_STOP_SPEED_KMH : MOVING_START_SPEED_KMH))
                        || (nativeSpeedKmh >= (isCurrentlyMoving ? 1.5f : 2.5f));
                // Spatial evidence only counts if Doppler doesn't contradict it
                boolean dopplerContradictsMovement = rawDopplerKmh >= 0f && rawDopplerKmh < 1.5f;
                boolean hasSpatialEvidence = (deltaDistanceM >= dynamicNoiseThreshold)
                        && dynamicNoiseThreshold > 0f
                        && !dopplerContradictsMovement;
                sampleLooksMoving = hasSpeedEvidence || hasSpatialEvidence;
            }

            if (isCurrentlyMoving) {
                // Currently MOVING — need consecutive still samples to stop
                if (sampleLooksMoving) {
                    consecutiveStillSamples = 0;
                    currentSpeedKmh = emaSpeedKmh > 0.5f ? emaSpeedKmh : Math.max(derivedSpeedKmh, 0.5f);
                } else {
                    consecutiveStillSamples++;
                    if (consecutiveStillSamples >= CONSECUTIVE_STILL_SAMPLES) {
                        // Confirmed transition: MOVING → STILL
                        isCurrentlyMoving = false;
                        consecutiveMovingSamples = 0;
                        currentSpeedKmh = 0f;
                        emaSpeedKmh = 0f; // Hard reset EMA on confirmed stop
                    } else {
                        // Grace period — show decaying speed
                        currentSpeedKmh = emaSpeedKmh > 0.3f ? emaSpeedKmh : 0f;
                    }
                }
            } else {
                // Currently STILL — need consecutive moving samples to start
                if (sampleLooksMoving) {
                    consecutiveMovingSamples++;
                    if (consecutiveMovingSamples >= CONSECUTIVE_MOVING_SAMPLES) {
                        // Confirmed transition: STILL → MOVING
                        isCurrentlyMoving = true;
                        consecutiveStillSamples = 0;
                        currentSpeedKmh = emaSpeedKmh > 0.5f ? emaSpeedKmh : Math.max(derivedSpeedKmh, 0.5f);
                    } else {
                        currentSpeedKmh = 0f;
                    }
                } else {
                    consecutiveMovingSamples = 0;
                    currentSpeedKmh = 0f;
                }
            }

            isMoving = isCurrentlyMoving;

            // Acceptance Gate:
            // When moving: accept when displacement >= minimum gate AND >= accuracy-scaled floor
            // When stationary: accept only if physical displacement breaks past the noise threshold.
            float minDistGate = isMoving ? Math.max(MIN_DISTANCE_GATE_M, accuracy * 0.25f) : dynamicNoiseThreshold;
            boolean movementConfirmed = !isSettling && isMoving && (deltaDistanceM >= minDistGate);

            if (movementConfirmed) {
                isAccepted = true;
                addedDistanceM = deltaDistanceM;
                distanceMeters += addedDistanceM;
                lastAcceptedLocation = smoothedLoc;

                // Moving Time Accumulation (cap burst when waking from background)
                if (dtSec < 60f) {
                    movingDurationSec += Math.round(dtSec);
                }

                // Elevation Gain Accumulation (only on real horizontal movement)
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
            } else if (isSettling) {
                // During settling, update anchor without distance accumulation
                lastAcceptedLocation = smoothedLoc;
                if (location.hasAltitude()) {
                    lastElevationAnchor = smoothAltitude(location.getAltitude());
                }
            }
            
            // Max Speed calculation
            if (currentSpeedKmh > 2.0f && currentSpeedKmh <= 180.0f) {
                maxSpeedKmh = Math.max(maxSpeedKmh, currentSpeedKmh);
            }
        } else {
            // First accepted location of the session
            isAccepted = true;
            lastAcceptedLocation = smoothedLoc;
            if (nativeSpeedKmh >= 2.0f) {
                emaSpeedKmh = nativeSpeedKmh;
                currentSpeedKmh = emaSpeedKmh;
                isCurrentlyMoving = true;
            } else {
                emaSpeedKmh = 0f;
                currentSpeedKmh = 0f;
                isCurrentlyMoving = false;
            }
            isMoving = isCurrentlyMoving;
            if (location.hasAltitude()) {
                lastElevationAnchor = smoothAltitude(location.getAltitude());
            }
        }

        lastRawLocation = smoothedLoc;

        if (isMoving) {
            lastMovementTimeMs = location.getTime();
            sessionSettleUntil = 0L;
        } else if (lastMovementTimeMs == 0L) {
            lastMovementTimeMs = location.getTime();
        }

        boolean isAutoPaused = !isMoving && (location.getTime() - lastMovementTimeMs >= AUTO_PAUSE_TIMEOUT_MS);

        try {
            JSONObject pointJson = locationToJson(smoothedLoc, accuracy, distanceMeters, movingDurationSec, currentSpeedKmh, maxSpeedKmh, elevationGainM, isMoving, isAccepted, isAutoPaused);

            // Persist ONLY accepted route points to durable SQLite journal
            if (isAccepted) {
                database.append(pointJson);
            }

            // Update SharedPreferences with smoothed coordinates
            saveLiveLocationPrefs(prefs, smoothedLoc, accuracy, distanceMeters, movingDurationSec, currentSpeedKmh, maxSpeedKmh, elevationGainM);

            // Update Ongoing Foreground Notification
            updateNotification();

            // BROADCAST smoothed location to web UI
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

        editor.putLong(KEY_LAST_RAW_LAT, Double.doubleToRawLongBits(location.getLatitude()))
              .putLong(KEY_LAST_RAW_LNG, Double.doubleToRawLongBits(location.getLongitude()))
              .putLong(KEY_LAST_RAW_TIMESTAMP, location.getTime());

        editor.apply();
    }

    private void broadcastLocation(Location location, float accuracy, float distanceMeters,
                                  long movingDurationSec, float currentSpeedKmh, float maxSpeedKmh,
                                  float elevationGainM, boolean isMoving, boolean isAccepted, boolean isAutoPaused) {
        try {
            JSONObject pointJson = locationToJson(location, accuracy, distanceMeters, movingDurationSec, currentSpeedKmh, maxSpeedKmh, elevationGainM, isMoving, isAccepted, isAutoPaused);
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

        long startedAt = prefs.getLong(KEY_STARTED_AT, System.currentTimeMillis());
        long totalPausedMs = prefs.getLong(KEY_TOTAL_PAUSED_MS, 0L);
        long pausedAt = prefs.getLong(KEY_PAUSED_AT, 0L);
        if (pausedAt > 0L) {
            totalPausedMs += (System.currentTimeMillis() - pausedAt);
        }
        long baseTime = startedAt + totalPausedMs;

        String title = isPaused ? activity + " (Paused)" : "Apparatus • " + activity;
        String paceStr = formatPace(distanceMeters, movingDurationSec);
        String distStr = String.format(Locale.US, "%.2f km", distanceMeters / 1000f);

        String line1 = distStr + "  •  " + (paceStr.equals("--:--") ? "0.0 km/h" : paceStr + " /km");
        String line2 = "Moving: " + formatDuration(movingDurationSec) + "  •  Speed: " + String.format(Locale.US, "%.1f km/h", speedKmh);
        if (isPaused) {
            line1 = distStr + "  •  Paused at " + formatDuration(movingDurationSec);
            line2 = "Pace: " + paceStr + (paceStr.equals("--:--") ? "" : " /km");
        }

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
                .setWhen(baseTime)
                .setShowWhen(true)
                .setUsesChronometer(!isPaused)
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
        // Do not pause or stop a workout when the WebView/Activity is removed from
        // recents. The foreground location service is deliberately independent of
        // the UI lifecycle.
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (locationHandler != null) {
            locationHandler.removeCallbacks(notificationTicker);
        }
        removeFusedLocationUpdates();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (locationThread != null) {
            locationThread.quitSafely();
        }
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
                                             float elevationGainM, boolean isMoving, boolean isAccepted, boolean isAutoPaused) throws Exception {
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
        point.put("isAutoPaused", isAutoPaused);

        return point;
    }

    // ─────────────────────────────────────────────────────────────
    // GPS Kalman Filter: Constant-Velocity model on lat/lng axes
    // Smooths raw GPS coordinates to eliminate jitter-derived phantom
    // distances and speeds. Adaptive process noise: near-zero when
    // stationary (absorbs jitter), higher when moving (tracks trajectory).
    // ─────────────────────────────────────────────────────────────
    private static final class GpsKalmanFilter {
        private boolean initialized = false;

        // Latitude axis state
        private double posLat, velLat;               // position, velocity (deg/s)
        private double ppLat, pvLat, vpLat, vvLat;   // 2×2 covariance

        // Longitude axis state
        private double posLng, velLng;
        private double ppLng, pvLng, vpLng, vvLng;

        private long lastTimeMs;

        void reset() {
            initialized = false;
        }

        /**
         * Process a raw GPS measurement and return Kalman-smoothed [lat, lng].
         *
         * @param measLat      Raw GPS latitude
         * @param measLng      Raw GPS longitude
         * @param accuracyM    Horizontal accuracy in meters
         * @param timeMs       Fix timestamp (ms)
         * @param isStationary true when the hysteresis engine considers user still
         */
        double[] process(double measLat, double measLng, float accuracyM, long timeMs, boolean isStationary) {
            // Convert horizontal accuracy (meters) → approximate variance (degrees²)
            // 1° latitude ≈ 111 320 m
            double accDeg = accuracyM / 111_320.0;
            double R = accDeg * accDeg;

            if (!initialized) {
                posLat = measLat;  velLat = 0;
                posLng = measLng;  velLng = 0;
                ppLat = ppLng = R;
                pvLat = pvLng = vpLat = vpLng = 0;
                vvLat = vvLng = R * 0.01;
                lastTimeMs = timeMs;
                initialized = true;
                return new double[]{posLat, posLng};
            }

            double dt = Math.max(0.1, (timeMs - lastTimeMs) / 1000.0);
            if (dt > 30.0) {
                // Large gap (background wake) — reinitialize to avoid wild prediction
                posLat = measLat;  velLat = 0;
                posLng = measLng;  velLng = 0;
                ppLat = ppLng = R;
                pvLat = pvLng = vpLat = vpLng = 0;
                vvLat = vvLng = R * 0.01;
                lastTimeMs = timeMs;
                return new double[]{posLat, posLng};
            }
            lastTimeMs = timeMs;

            // Adaptive process noise
            // Stationary: near-zero → filter becomes very confident, absorbs jitter
            // Moving:     moderate  → filter follows real trajectory
            double qPos = isStationary ? 1e-14 : 5e-10;
            double qVel = isStationary ? 1e-14 : 5e-9;

            // ── Latitude axis ────────────────────────────────
            double predLat = posLat + velLat * dt;
            double predPPLat = ppLat + dt * (pvLat + vpLat) + dt * dt * vvLat + qPos;
            double predPVLat = pvLat + dt * vvLat;
            double predVPLat = vpLat + dt * vvLat;
            double predVVLat = vvLat + qVel;

            double innovLat = measLat - predLat;
            double sLat = predPPLat + R;
            double k0Lat = predPPLat / sLat;
            double k1Lat = predVPLat / sLat;

            posLat = predLat + k0Lat * innovLat;
            velLat = velLat + k1Lat * innovLat;
            ppLat = (1 - k0Lat) * predPPLat;
            pvLat = (1 - k0Lat) * predPVLat;
            vpLat = predVPLat - k1Lat * predPPLat;
            vvLat = predVVLat - k1Lat * predPVLat;

            // ── Longitude axis ───────────────────────────────
            double predLng = posLng + velLng * dt;
            double predPPLng = ppLng + dt * (pvLng + vpLng) + dt * dt * vvLng + qPos;
            double predPVLng = pvLng + dt * vvLng;
            double predVPLng = vpLng + dt * vvLng;
            double predVVLng = vvLng + qVel;

            double innovLng = measLng - predLng;
            double sLng = predPPLng + R;
            double k0Lng = predPPLng / sLng;
            double k1Lng = predVPLng / sLng;

            posLng = predLng + k0Lng * innovLng;
            velLng = velLng + k1Lng * innovLng;
            ppLng = (1 - k0Lng) * predPPLng;
            pvLng = (1 - k0Lng) * predPVLng;
            vpLng = predVPLng - k1Lng * predPPLng;
            vvLng = predVVLng - k1Lng * predPVLng;

            // When stationary, actively decay velocity toward zero
            // This prevents the filter from "drifting" with accumulated jitter momentum
            if (isStationary) {
                velLat *= 0.3;
                velLng *= 0.3;
            }

            return new double[]{posLat, posLng};
        }
    }
}
