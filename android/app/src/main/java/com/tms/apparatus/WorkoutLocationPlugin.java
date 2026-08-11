package com.tms.apparatus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

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

    @Override public void load() {
        locationReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (!WorkoutLocationService.ACTION_LOCATION.equals(intent.getAction())) return;
                try { notifyListeners("location", new JSObject(intent.getStringExtra("point"))); } catch (Exception ignored) {}
            }
        };
        IntentFilter filter = new IntentFilter(WorkoutLocationService.ACTION_LOCATION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(locationReceiver, filter);
    }

    @Override protected void handleOnDestroy() {
        if (locationReceiver != null) getContext().unregisterReceiver(locationReceiver);
    }

    @PluginMethod public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), WorkoutLocationService.class).setAction(WorkoutLocationService.ACTION_START);
        intent.putExtra("reset", call.getBoolean("reset", false));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
        else getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod public void stop(PluginCall call) {
        getContext().startService(new Intent(getContext(), WorkoutLocationService.class).setAction(WorkoutLocationService.ACTION_STOP));
        call.resolve();
    }

    @PluginMethod public void getLocationsAfter(PluginCall call) {
        try {
            long timestamp = call.getLong("timestamp", 0L);
            JSONArray points = new WorkoutLocationDatabase(getContext()).locationsAfter(timestamp);
            JSArray array = new JSArray();
            for (int i = 0; i < points.length(); i++) array.put(new JSObject(points.getJSONObject(i).toString()));
            JSObject result = new JSObject();
            result.put("points", array);
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read saved workout locations", error); }
    }
}
