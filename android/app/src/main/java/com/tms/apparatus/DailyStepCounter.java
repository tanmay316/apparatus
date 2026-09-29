package com.tms.apparatus;

import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * All-day step totals from the hardware step counter (TYPE_STEP_COUNTER).
 *
 * The sensor only reports steps since boot, so the counter is sampled whenever the app
 * runs (open/resume, dashboard refresh, periodic worker) and each delta is credited to
 * the local days it happened in. Reboots are detected via elapsedRealtime going backwards.
 */
public final class DailyStepCounter {
    private static final String PREFS = "apparatus_daily_steps";
    private static final String KEY_COUNTER = "lastCounter";
    private static final String KEY_AT = "lastAt";
    private static final String KEY_ELAPSED = "lastElapsed";
    private static final String KEY_DAYS = "days";
    private static final String KEY_SINCE = "trackingSince";
    private static final long SAMPLE_TIMEOUT_MS = 4000;
    private static final int KEEP_DAYS = 35;
    private static final float MAX_PLAUSIBLE_DELTA = 150_000f;

    private static HandlerThread thread;
    private static SensorEventListener foregroundListener;
    private static volatile float liveCounter = -1f;
    private static long lastForegroundRecord = 0L;

    public interface Callback {
        /** counter = steps since boot, or -1 when no reading arrived. */
        void onDone(float counter);
    }

    private DailyStepCounter() {}

    public static boolean isAvailable(Context ctx) {
        SensorManager sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        return sm != null && sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null;
    }

    private static synchronized Handler handler() {
        if (thread == null || !thread.isAlive()) {
            thread = new HandlerThread("apparatus-step-sampler");
            thread.start();
        }
        return new Handler(thread.getLooper());
    }

    /** Latest counter seen by the foreground listener, or -1 if none since it started. */
    public static float liveCounter() {
        return liveCounter;
    }

    /** Follows the counter while the app is visible, recording at most once a minute. */
    public static synchronized void startForegroundListener(Context context) {
        if (foregroundListener != null) return;
        Context ctx = context.getApplicationContext();
        SensorManager sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        Sensor sensor = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (sensor == null) return;
        SensorEventListener listener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                liveCounter = event.values[0];
                long now = System.currentTimeMillis();
                if (now - lastForegroundRecord >= 60_000L) {
                    lastForegroundRecord = now;
                    record(ctx, event.values[0], now, SystemClock.elapsedRealtime());
                }
            }

            @Override
            public void onAccuracyChanged(Sensor s, int accuracy) {}
        };
        try {
            if (sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 0, handler())) {
                foregroundListener = listener;
            }
        } catch (SecurityException ignored) {
            // Permission not granted yet.
        }
    }

    public static synchronized void stopForegroundListener(Context context) {
        if (foregroundListener == null) return;
        SensorManager sm = (SensorManager) context.getApplicationContext().getSystemService(Context.SENSOR_SERVICE);
        if (sm != null) sm.unregisterListener(foregroundListener);
        foregroundListener = null;
        float counter = liveCounter;
        liveCounter = -1f;
        if (counter >= 0) {
            lastForegroundRecord = System.currentTimeMillis();
            record(context.getApplicationContext(), counter, lastForegroundRecord, SystemClock.elapsedRealtime());
        }
    }

    /** Reads the counter once and records it. Callback runs on a background thread. */
    public static void sample(Context context, Callback callback) {
        Context ctx = context.getApplicationContext();
        SensorManager sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        Sensor sensor = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (sensor == null) {
            callback.onDone(-1f);
            return;
        }
        Handler h = handler();
        AtomicBoolean finished = new AtomicBoolean(false);
        SensorEventListener listener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (!finished.compareAndSet(false, true)) return;
                sm.unregisterListener(this);
                float counter = event.values[0];
                record(ctx, counter, System.currentTimeMillis(), SystemClock.elapsedRealtime());
                callback.onDone(counter);
            }

            @Override
            public void onAccuracyChanged(Sensor s, int accuracy) {}
        };
        boolean registered;
        try {
            registered = sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 0, h);
        } catch (SecurityException e) {
            registered = false; // ACTIVITY_RECOGNITION not granted
        }
        if (!registered) {
            finished.set(true);
            callback.onDone(-1f);
            return;
        }
        h.postDelayed(() -> {
            if (finished.compareAndSet(false, true)) {
                sm.unregisterListener(listener);
                callback.onDone(-1f);
            }
        }, SAMPLE_TIMEOUT_MS);
    }

    static synchronized void record(Context ctx, float counter, long now, long elapsed) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        float lastCounter = prefs.getFloat(KEY_COUNTER, -1f);
        long lastAt = prefs.getLong(KEY_AT, 0L);
        long lastElapsed = prefs.getLong(KEY_ELAPSED, 0L);
        long bootAt = now - elapsed;
        JSONObject days = readDays(prefs);

        float delta = 0f;
        long from = now;
        if (lastCounter < 0) {
            // First reading: everything since boot is known to be from today only if the phone booted today.
            if (bootAt >= startOfDay(now)) {
                delta = counter;
                from = bootAt;
            }
            prefs.edit().putLong(KEY_SINCE, bootAt >= startOfDay(now) ? bootAt : now).apply();
        } else if (elapsed < lastElapsed || counter < lastCounter) {
            delta = counter; // rebooted: the counter restarted from zero
            from = Math.max(bootAt, lastAt);
        } else {
            delta = counter - lastCounter;
            from = lastAt;
        }

        if (delta > 0 && delta < MAX_PLAUSIBLE_DELTA) {
            distribute(days, Math.min(from, now), now, delta);
        }
        add(days, dateKey(now), 0f);
        prune(days, now);
        prefs.edit()
            .putFloat(KEY_COUNTER, counter)
            .putLong(KEY_AT, now)
            .putLong(KEY_ELAPSED, elapsed)
            .putString(KEY_DAYS, days.toString())
            .apply();
    }

    /** Steps recorded for a local yyyy-MM-dd day; -1 when nothing is known for it. */
    public static synchronized long stepsFor(Context ctx, String dateKey) {
        JSONObject days = readDays(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE));
        if (!days.has(dateKey)) return -1;
        return Math.round(days.optDouble(dateKey, 0));
    }

    public static long trackingSince(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_SINCE, 0L);
    }

    public static String dateKey(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        return f.format(new Date(ms));
    }

    /**
     * Spreads a delta over [from, to] by hour, weighting night hours (23:00-06:00) low,
     * so an evening walk sampled next morning lands mostly on the evening's day.
     */
    static void distribute(JSONObject days, long from, long to, float delta) {
        long minFrom = to - 7L * 24 * 3600 * 1000;
        if (from < minFrom) from = minFrom;
        String toKey = dateKey(to);
        if (to - from < 60_000L || dateKey(from).equals(toKey)) {
            add(days, toKey, delta);
            return;
        }
        List<String> keys = new ArrayList<>();
        List<Double> weights = new ArrayList<>();
        double total = 0;
        Calendar c = Calendar.getInstance();
        long t = from;
        while (t < to) {
            c.setTimeInMillis(t);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            c.add(Calendar.HOUR_OF_DAY, 1);
            long next = Math.min(c.getTimeInMillis(), to);
            c.setTimeInMillis(t);
            int hour = c.get(Calendar.HOUR_OF_DAY);
            double w = (next - t) / 3_600_000.0 * ((hour >= 23 || hour < 6) ? 0.1 : 1.0);
            String key = dateKey(t);
            int idx = keys.indexOf(key);
            if (idx < 0) {
                keys.add(key);
                weights.add(w);
            } else {
                weights.set(idx, weights.get(idx) + w);
            }
            total += w;
            t = next;
        }
        if (total <= 0) {
            add(days, toKey, delta);
            return;
        }
        for (int i = 0; i < keys.size(); i++) {
            add(days, keys.get(i), (float) (delta * weights.get(i) / total));
        }
    }

    private static void add(JSONObject days, String key, float value) {
        try {
            days.put(key, days.optDouble(key, 0) + value);
        } catch (Exception ignored) {
        }
    }

    private static void prune(JSONObject days, long now) {
        String oldest = dateKey(now - (long) KEEP_DAYS * 24 * 3600 * 1000);
        List<String> drop = new ArrayList<>();
        for (Iterator<String> it = days.keys(); it.hasNext(); ) {
            String k = it.next();
            if (k.compareTo(oldest) < 0) drop.add(k);
        }
        for (String k : drop) days.remove(k);
    }

    private static JSONObject readDays(SharedPreferences prefs) {
        try {
            return new JSONObject(prefs.getString(KEY_DAYS, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static long startOfDay(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }
}
