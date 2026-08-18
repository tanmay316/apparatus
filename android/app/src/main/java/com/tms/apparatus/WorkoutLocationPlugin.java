package com.tms.apparatus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "WorkoutLocation")
public class WorkoutLocationPlugin extends Plugin {
    private BroadcastReceiver locationReceiver;

    @Override
    public void load() {
        super.load();

        locationReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                String action = intent.getAction();

                if (WorkoutLocationService.ACTION_LOCATION.equals(action)) {
                    try {
                        String pointStr = intent.getStringExtra("point");
                        if (pointStr != null) {
                            notifyListeners("location", new JSObject(pointStr));
                        }
                    } catch (Exception ignored) {
                    }
                } else if (WorkoutLocationService.ACTION_STATE_CHANGE.equals(action)) {
                    try {
                        JSObject event = new JSObject();
                        event.put("state", intent.getStringExtra("state"));
                        notifyListeners("stateChange", event);
                    } catch (Exception ignored) {
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(WorkoutLocationService.ACTION_LOCATION);
        filter.addAction(WorkoutLocationService.ACTION_STATE_CHANGE);

        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(locationReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (locationReceiver != null) {
            try {
                getContext().unregisterReceiver(locationReceiver);
            } catch (Exception ignored) {
            }
            locationReceiver = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), WorkoutLocationService.class)
                    .setAction(WorkoutLocationService.ACTION_START);
            intent.putExtra("reset", call.getBoolean("reset", false));
            intent.putExtra("activityType", call.getString("activityType", "walk"));

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not start workout location service", error);
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        startServiceAction(WorkoutLocationService.ACTION_PAUSE, call);
    }

    @PluginMethod
    public void resume(PluginCall call) {
        startServiceAction(WorkoutLocationService.ACTION_RESUME, call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        startServiceAction(WorkoutLocationService.ACTION_STOP, call);
    }

    private void startServiceAction(String action, PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), WorkoutLocationService.class).setAction(action);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !WorkoutLocationService.ACTION_STOP.equals(action)) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not send workout location action", error);
        }
    }

    @PluginMethod
    public void getSessionSummary(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(
                    WorkoutLocationService.PREFS, Context.MODE_PRIVATE);

            JSObject summary = new JSObject();
            summary.put("state", prefs.getString(WorkoutLocationService.KEY_STATE, "IDLE"));
            summary.put("activityType", prefs.getString(WorkoutLocationService.KEY_ACTIVITY_TYPE, "walk"));
            summary.put("startedAt", prefs.getLong(WorkoutLocationService.KEY_STARTED_AT, 0L));
            summary.put("pausedAt", prefs.getLong(WorkoutLocationService.KEY_PAUSED_AT, 0L));
            summary.put("totalPausedMs", prefs.getLong(WorkoutLocationService.KEY_TOTAL_PAUSED_MS, 0L));
            summary.put("movingDurationSec", prefs.getLong(WorkoutLocationService.KEY_MOVING_DURATION_SEC, 0L));
            summary.put("distanceMeters", (double) prefs.getFloat(WorkoutLocationService.KEY_DISTANCE_METERS, 0f));
            summary.put("currentSpeedKmh", (double) prefs.getFloat(WorkoutLocationService.KEY_CURRENT_SPEED_KMH, 0f));
            summary.put("maxSpeedKmh", (double) prefs.getFloat(WorkoutLocationService.KEY_MAX_SPEED_KMH, 0f));
            summary.put("elevationGainM", (double) prefs.getFloat(WorkoutLocationService.KEY_ELEVATION_GAIN_M, 0f));

            if (prefs.contains(WorkoutLocationService.KEY_LAST_LAT)) {
                summary.put("lastLat", Double.longBitsToDouble(
                        prefs.getLong(WorkoutLocationService.KEY_LAST_LAT, 0L)));
                summary.put("lastLng", Double.longBitsToDouble(
                        prefs.getLong(WorkoutLocationService.KEY_LAST_LNG, 0L)));
            } else {
                summary.put("lastLat", JSONObject.NULL);
                summary.put("lastLng", JSONObject.NULL);
            }

            if (prefs.contains(WorkoutLocationService.KEY_LAST_ALT)) {
                summary.put("lastAlt", Double.longBitsToDouble(
                        prefs.getLong(WorkoutLocationService.KEY_LAST_ALT, 0L)));
            }
            if (prefs.contains(WorkoutLocationService.KEY_LAST_BEARING)) {
                summary.put("lastBearing", (double) prefs.getFloat(
                        WorkoutLocationService.KEY_LAST_BEARING, 0f));
            }
            summary.put("lastAccuracy", (double) prefs.getFloat(
                    WorkoutLocationService.KEY_LAST_ACCURACY, 0f));
            summary.put("lastTimestamp", prefs.getLong(
                    WorkoutLocationService.KEY_LAST_TIMESTAMP, 0L));
            summary.put("pointCount", new WorkoutLocationDatabase(getContext()).getPointCount());

            call.resolve(summary);
        } catch (Exception error) {
            call.reject("Could not read workout session summary", error);
        }
    }

    @PluginMethod
    public void getDownsampledPoints(PluginCall call) {
        try {
            int maxPoints = call.getInt("maxPoints", 2000);
            JSONArray points = new WorkoutLocationDatabase(getContext()).getDownsampledPoints(maxPoints);
            call.resolve(toResult(points));
        } catch (Exception error) {
            call.reject("Could not read downsampled workout points", error);
        }
    }

    @PluginMethod
    public void getLocationsAfter(PluginCall call) {
        try {
            long timestamp = call.getLong("timestamp", 0L);
            JSONArray points = new WorkoutLocationDatabase(getContext()).locationsAfter(timestamp);
            call.resolve(toResult(points));
        } catch (Exception error) {
            call.reject("Could not read saved workout locations", error);
        }
    }

    private JSObject toResult(JSONArray points) throws Exception {
        JSArray array = new JSArray();
        for (int i = 0; i < points.length(); i++) {
            array.put(new JSObject(points.getJSONObject(i).toString()));
        }
        JSObject result = new JSObject();
        result.put("points", array);
        return result;
    }

    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                String packageName = getContext().getPackageName();
                boolean isIgnoring = pm != null && pm.isIgnoringBatteryOptimizations(packageName);

                if (!isIgnoring) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + packageName));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                }

                JSObject ret = new JSObject();
                ret.put("isExempt", isIgnoring);
                call.resolve(ret);
            } else {
                JSObject ret = new JSObject();
                ret.put("isExempt", true);
                call.resolve(ret);
            }
        } catch (Exception error) {
            call.reject("Failed to request battery exemption", error);
        }
    }
}
