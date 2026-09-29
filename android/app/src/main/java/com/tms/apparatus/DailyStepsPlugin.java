package com.tms.apparatus;

import android.Manifest;
import android.os.Build;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** JS bridge for all-day step totals (see DailyStepCounter). */
@CapacitorPlugin(
    name = "DailySteps",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activityRecognition") }
)
public class DailyStepsPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        if (hasPermission()) {
            start();
            DailyStepCounter.startForegroundListener(getContext());
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (!hasPermission()) return;
        DailyStepCounter.sample(getContext(), counter -> {});
        DailyStepCounter.startForegroundListener(getContext());
    }

    @Override
    protected void handleOnPause() {
        DailyStepCounter.stopForegroundListener(getContext());
        super.handleOnPause();
    }

    /** Raw hardware counter (steps since boot) + boot time, for exact per-session step deltas. */
    @PluginMethod
    public void readCounter(PluginCall call) {
        if (!hasPermission()) {
            call.reject("Activity recognition permission not granted.");
            return;
        }
        DailyStepCounter.startForegroundListener(getContext());
        float live = DailyStepCounter.liveCounter();
        if (live >= 0) {
            call.resolve(counterResult(live));
            return;
        }
        DailyStepCounter.sample(getContext(), counter -> {
            if (counter < 0) {
                call.reject("Step counter unavailable.");
                return;
            }
            call.resolve(counterResult(counter));
        });
    }

    private JSObject counterResult(float counter) {
        JSObject res = new JSObject();
        res.put("counter", (double) counter);
        res.put("bootAt", System.currentTimeMillis() - SystemClock.elapsedRealtime());
        return res;
    }

    /** { available, permission, steps (-1 = unknown), trackingSince } for options.date (yyyy-MM-dd, default today). */
    @PluginMethod
    public void getSteps(PluginCall call) {
        String date = call.getString("date", DailyStepCounter.dateKey(System.currentTimeMillis()));
        if (!DailyStepCounter.isAvailable(getContext())) {
            JSObject res = new JSObject();
            res.put("available", false);
            res.put("permission", permissionName());
            res.put("steps", -1);
            call.resolve(res);
            return;
        }
        if (!hasPermission()) {
            call.resolve(result(date));
            return;
        }
        start();
        DailyStepCounter.startForegroundListener(getContext());
        DailyStepCounter.sample(getContext(), counter -> call.resolve(result(date)));
    }

    private void start() {
        try {
            StepSampleWorker.schedule(getContext());
        } catch (Exception ignored) {
            // WorkManager unavailable: foreground samples still work.
        }
    }

    private JSObject result(String date) {
        JSObject res = new JSObject();
        res.put("available", true);
        res.put("permission", permissionName());
        res.put("steps", hasPermission() ? DailyStepCounter.stepsFor(getContext(), date) : -1);
        res.put("trackingSince", DailyStepCounter.trackingSince(getContext()));
        return res;
    }

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("activityRecognition") == PermissionState.GRANTED;
    }

    private String permissionName() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "granted";
        PermissionState state = getPermissionState("activityRecognition");
        return state == null ? "prompt" : state.toString();
    }
}
