package com.tms.apparatus;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
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

    /** Status bar height in dp (replaces @capacitor/status-bar getInfo, which used deprecated Window APIs). */
    @PluginMethod
    public void getStatusBar(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            View decor = getActivity().getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
            JSObject res = new JSObject();
            if (insets == null) {
                res.put("visible", false);
                res.put("height", 0);
            } else {
                Insets bar = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.statusBars());
                float density = getActivity().getResources().getDisplayMetrics().density;
                res.put("visible", insets.isVisible(WindowInsetsCompat.Type.statusBars()));
                res.put("height", Math.round(bar.top / density));
            }
            call.resolve(res);
        });
    }

    /** SystemBars resets the decor background on config changes; repaint ours after it. */
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        WebView webView = getBridge().getWebView();
        if (webView != null) webView.post(() -> applySaved(getActivity(), webView));
    }

    /** Keeps the WebView renderer from being killed first while we're briefly in the background. */
    static void keepRendererWarm(WebView webView) {
        if (webView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }
}
