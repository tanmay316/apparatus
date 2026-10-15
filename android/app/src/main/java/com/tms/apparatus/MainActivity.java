package com.tms.apparatus;

import android.content.res.Resources;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;

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
            android.webkit.WebView webView = getBridge().getWebView();
            AppWindowPlugin.applySaved(this, webView);
            // SystemBars' first setStyle (posted during load) repaints the decor; reapply after it.
            if (webView != null) webView.post(() -> AppWindowPlugin.applySaved(this, webView));
            AppWindowPlugin.keepRendererWarm(webView);
        }
    }

    /** Text selection shows only the plain edit actions (copy, cut, paste, select all). */
    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback, int type) {
        return super.onWindowStartingActionMode(new PlainSelectionCallback(callback, getResources()), type);
    }

    private static final class PlainSelectionCallback extends ActionMode.Callback2 {
        private final ActionMode.Callback inner;
        private final Resources res;

        PlainSelectionCallback(ActionMode.Callback inner, Resources res) {
            this.inner = inner;
            this.res = res;
        }

        /**
         * WebView's own items are "select_action_menu_*" (they carry icons too, so icons can't be
         * used to tell them apart). Drops other apps' entries (Translate, Lens…), the smart-assist
         * chip (Maps, Call, app logos), Share and Web search.
         */
        private boolean keep(MenuItem item) {
            if (item.getIntent() != null) return false;
            int id = item.getItemId();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && id == android.R.id.textAssist) return false;
            if (id == android.R.id.copy || id == android.R.id.cut || id == android.R.id.paste
                    || id == android.R.id.selectAll
                    || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && id == android.R.id.pasteAsPlainText)) return true;
            if (id == Menu.NONE) return false;
            try {
                String name = res.getResourceEntryName(id);
                if (name.startsWith("select_action_menu_")) {
                    return !(name.endsWith("share") || name.endsWith("web_search"));
                }
            } catch (Resources.NotFoundException ignored) {
            }
            return true;
        }

        private void strip(Menu menu) {
            for (int i = menu.size() - 1; i >= 0; i--) {
                MenuItem item = menu.getItem(i);
                if (!keep(item)) menu.removeItem(item.getItemId());
            }
        }

        @Override
        public boolean onCreateActionMode(ActionMode mode, Menu menu) {
            boolean ok = inner.onCreateActionMode(mode, menu);
            strip(menu);
            return ok;
        }

        @Override
        public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
            boolean changed = inner.onPrepareActionMode(mode, menu);
            strip(menu);
            return changed;
        }

        @Override
        public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
            return inner.onActionItemClicked(mode, item);
        }

        @Override
        public void onDestroyActionMode(ActionMode mode) {
            inner.onDestroyActionMode(mode);
        }

        @Override
        public void onGetContentRect(ActionMode mode, View view, Rect outRect) {
            if (inner instanceof ActionMode.Callback2) {
                ((ActionMode.Callback2) inner).onGetContentRect(mode, view, outRect);
            } else {
                super.onGetContentRect(mode, view, outRect);
            }
        }
    }
}
