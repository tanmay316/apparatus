package com.tms.apparatus;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the native window + WebView in the app's theme colour so returning from another app
 * shows the right canvas (not a white/black frame) while the WebView redraws.
 */
@CapacitorPlugin(name = "AppWindow")
public class AppWindowPlugin extends Plugin {
    private static final String PREFS = "app_window";
    private static final String KEY_COLOR = "background";

    /** Applies the last saved theme colour; called from MainActivity before the first frame. */
    static void applySaved(Activity activity, WebView webView) {
        int color = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_COLOR, 0);
        if (color != 0) apply(activity, webView, color);
    }

    private static void apply(Activity activity, WebView webView, int color) {
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
        if (webView != null) webView.setBackgroundColor(color);
    }

    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        String value = call.getString("color");
        int color;
        try {
            color = Color.parseColor(value);
        } catch (Exception e) {
            call.reject("Invalid color");
            return;
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY_COLOR, color).apply();
        getActivity().runOnUiThread(() -> {
            apply(getActivity(), getBridge().getWebView(), color);
            call.resolve();
        });
    }

    /** Keeps the WebView renderer from being killed first while we're briefly in the background. */
    static void keepRendererWarm(WebView webView) {
        if (webView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }
}
