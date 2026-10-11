package com.tms.apparatus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkoutLocationPlugin.class);
        registerPlugin(MediaControlPlugin.class);
        registerPlugin(DailyStepsPlugin.class);
        registerPlugin(AppWindowPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            AppWindowPlugin.applySaved(this, getBridge().getWebView());
            AppWindowPlugin.keepRendererWarm(getBridge().getWebView());
        }
    }
}
