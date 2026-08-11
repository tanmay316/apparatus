package com.tms.apparatus;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(WorkoutLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
