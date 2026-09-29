package com.tms.apparatus;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkoutLocationPlugin.class);
        registerPlugin(MediaControlPlugin.class);
        registerPlugin(DailyStepsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
