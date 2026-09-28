package com.tms.apparatus;

import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.List;

/**
 * Mirrors the system "now playing" media session (Spotify, YouTube Music,
 * Apple Music, etc.) and forwards transport controls to it. Requires the user
 * to enable notification access for {@link MediaNotificationListener}.
 */
@CapacitorPlugin(name = "MediaControl")
public class MediaControlPlugin extends Plugin {
    private static final String EVENT = "mediaChange";
    private static final int ART_MAX_PX = 256;

    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaSessionManager sessionManager;
    private ComponentName listenerComponent;
    private MediaController current;
    private boolean observing = false;

    private String artKey = null;
    private String artData = null;

    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsListener =
        controllers -> main.post(() -> {
            selectController(controllers);
            emit();
        });

    private final MediaController.Callback controllerCallback = new MediaController.Callback() {
        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            emit();
        }

        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            emit();
        }

        @Override
        public void onSessionDestroyed() {
            main.post(() -> {
                attach(null);
                selectController(activeControllers());
                emit();
            });
        }
    };

    @Override
    public void load() {
        super.load();
        sessionManager = (MediaSessionManager) getContext().getSystemService(Context.MEDIA_SESSION_SERVICE);
        listenerComponent = new ComponentName(getContext(), MediaNotificationListener.class);
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Access may have been granted in system settings while we were away.
        if (observing) {
            main.post(() -> {
                ensureSessionListener();
                selectController(activeControllers());
                emit();
            });
        }
    }

    // ─── Session tracking ───────────────────────────────────────────

    private boolean hasAccess() {
        try {
            return NotificationManagerCompat.getEnabledListenerPackages(getContext())
                .contains(getContext().getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private List<MediaController> activeControllers() {
        if (sessionManager == null || !hasAccess()) return Collections.emptyList();
        try {
            List<MediaController> list = sessionManager.getActiveSessions(listenerComponent);
            return list != null ? list : Collections.emptyList();
        } catch (SecurityException e) {
            return Collections.emptyList();
        }
    }

    private boolean isOwn(MediaController c) {
        return c.getPackageName().equals(getContext().getPackageName());
    }

    private static boolean isPlaying(MediaController c) {
        PlaybackState st = c.getPlaybackState();
        if (st == null) return false;
        int s = st.getState();
        return s == PlaybackState.STATE_PLAYING || s == PlaybackState.STATE_BUFFERING;
    }

    /** Prefer whatever is actively playing; otherwise stick with the current app. */
    private void selectController(List<MediaController> list) {
        MediaController pick = null;
        if (list != null) {
            for (MediaController c : list) {
                if (!isOwn(c) && isPlaying(c)) {
                    pick = c;
                    break;
                }
            }
            if (pick == null && current != null) {
                for (MediaController c : list) {
                    if (c.getSessionToken().equals(current.getSessionToken())) {
                        pick = c;
                        break;
                    }
                }
            }
            if (pick == null) {
                for (MediaController c : list) {
                    if (!isOwn(c)) {
                        pick = c;
                        break;
                    }
                }
            }
        }
        attach(pick);
    }

    private void attach(MediaController next) {
        if (current != null && next != null && current.getSessionToken().equals(next.getSessionToken())) return;
        if (current != null) {
            try {
                current.unregisterCallback(controllerCallback);
            } catch (Exception ignored) {
            }
        }
        current = next;
        if (current != null) {
            try {
                current.registerCallback(controllerCallback, main);
            } catch (Exception ignored) {
            }
        }
    }

    private boolean sessionListenerAdded = false;

    private void ensureSessionListener() {
        if (sessionListenerAdded || sessionManager == null || !hasAccess()) return;
        try {
            sessionManager.addOnActiveSessionsChangedListener(sessionsListener, listenerComponent, main);
            sessionListenerAdded = true;
        } catch (SecurityException ignored) {
        }
    }

    private void stopInternal() {
        observing = false;
        if (sessionListenerAdded && sessionManager != null) {
            try {
                sessionManager.removeOnActiveSessionsChangedListener(sessionsListener);
            } catch (Exception ignored) {
            }
        }
        sessionListenerAdded = false;
        attach(null);
    }

    private void emit() {
        if (!observing) return;
        notifyListeners(EVENT, buildState());
    }

    // ─── State snapshot ─────────────────────────────────────────────

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return String.valueOf(pm.getApplicationLabel(info));
        } catch (Exception e) {
            return pkg;
        }
    }

    private static String firstText(MediaMetadata md, String... keys) {
        for (String k : keys) {
            CharSequence v = md.getText(k);
            if (v != null && v.length() > 0) return v.toString();
        }
        return null;
    }

    private static Bitmap firstBitmap(MediaMetadata md) {
        String[] keys = {
            MediaMetadata.METADATA_KEY_ALBUM_ART,
            MediaMetadata.METADATA_KEY_ART,
            MediaMetadata.METADATA_KEY_DISPLAY_ICON
        };
        for (String k : keys) {
            Bitmap b = md.getBitmap(k);
            if (b != null && !b.isRecycled()) return b;
        }
        return null;
    }

    private static String encodeArt(Bitmap src) {
        try {
            int w = src.getWidth();
            int h = src.getHeight();
            if (w <= 0 || h <= 0) return null;
            float scale = Math.min(1f, (float) ART_MAX_PX / Math.max(w, h));
            Bitmap bmp = scale < 1f
                ? Bitmap.createScaledBitmap(src, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), true)
                : src;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 82, out);
            if (bmp != src) bmp.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    private JSObject buildState() {
        JSObject o = new JSObject();
        o.put("granted", hasAccess());
        o.put("timestamp", System.currentTimeMillis());
        MediaController c = current;
        o.put("hasSession", c != null);
        if (c == null) return o;

        String pkg = c.getPackageName();
        o.put("packageName", pkg);
        o.put("appName", appLabel(pkg));

        long duration = 0;
        MediaMetadata md = c.getMetadata();
        if (md != null) {
            String title = firstText(md, MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
            String artist = firstText(md, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_ALBUM_ARTIST,
                MediaMetadata.METADATA_KEY_AUTHOR, MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE);
            String album = firstText(md, MediaMetadata.METADATA_KEY_ALBUM);
            duration = Math.max(0, md.getLong(MediaMetadata.METADATA_KEY_DURATION));
            o.put("title", title);
            o.put("artist", artist);
            o.put("album", album);

            Bitmap bmp = firstBitmap(md);
            String key = pkg + "|" + title + "|" + artist + "|" + (bmp != null ? bmp.getGenerationId() + "x" + bmp.getWidth() : "none");
            if (!key.equals(artKey)) {
                artKey = key;
                artData = bmp != null ? encodeArt(bmp) : null;
            }
            if (artData != null) o.put("artwork", artData);

            String uri = firstText(md, MediaMetadata.METADATA_KEY_ALBUM_ART_URI, MediaMetadata.METADATA_KEY_ART_URI,
                MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI);
            if (uri != null && uri.startsWith("https://")) o.put("artworkUrl", uri);
        }
        o.put("durationMs", duration);

        PlaybackState ps = c.getPlaybackState();
        boolean playing = false;
        long position = 0;
        float speed = 1f;
        long actions = 0;
        if (ps != null) {
            int state = ps.getState();
            playing = state == PlaybackState.STATE_PLAYING || state == PlaybackState.STATE_BUFFERING;
            position = Math.max(0, ps.getPosition());
            speed = ps.getPlaybackSpeed();
            if (state == PlaybackState.STATE_PLAYING && ps.getLastPositionUpdateTime() > 0) {
                position += (long) ((SystemClock.elapsedRealtime() - ps.getLastPositionUpdateTime()) * speed);
            }
            if (duration > 0) position = Math.min(position, duration);
            actions = ps.getActions();
        }
        o.put("positionMs", position);
        o.put("playbackSpeed", speed == 0f ? 1f : speed);
        o.put("isPlaying", playing);
        // Some players don't advertise actions; assume skip is available then.
        o.put("canSkipNext", actions == 0 || (actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
        o.put("canSkipPrevious", actions == 0 || (actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
        o.put("canSeek", (actions & PlaybackState.ACTION_SEEK_TO) != 0 && duration > 0);
        return o;
    }

    private MediaController requireController(PluginCall call) {
        if (current == null) selectController(activeControllers());
        if (current == null) {
            call.reject(hasAccess() ? "No active media session" : "Notification access not granted");
            return null;
        }
        return current;
    }

    // ─── Plugin API ─────────────────────────────────────────────────

    @PluginMethod
    public void isAccessGranted(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", hasAccess());
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        Context ctx = getContext();
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
            intent.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listenerComponent.flattenToString());
        } else {
            intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            try {
                Intent fallback = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fallback);
            } catch (ActivityNotFoundException e2) {
                call.reject("Notification access settings unavailable");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void startObserving(PluginCall call) {
        main.post(() -> {
            observing = true;
            ensureSessionListener();
            selectController(activeControllers());
            call.resolve(buildState());
        });
    }

    @PluginMethod
    public void stopObserving(PluginCall call) {
        main.post(() -> {
            stopInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void getNowPlaying(PluginCall call) {
        main.post(() -> {
            if (current == null && observing) selectController(activeControllers());
            call.resolve(buildState());
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        c.getTransportControls().play();
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        c.getTransportControls().pause();
        call.resolve();
    }

    @PluginMethod
    public void togglePlayPause(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        if (isPlaying(c)) c.getTransportControls().pause();
        else c.getTransportControls().play();
        call.resolve();
    }

    @PluginMethod
    public void next(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        c.getTransportControls().skipToNext();
        call.resolve();
    }

    @PluginMethod
    public void previous(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        c.getTransportControls().skipToPrevious();
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        Double pos = call.getDouble("positionMs");
        if (pos == null || pos < 0) {
            call.reject("positionMs required");
            return;
        }
        c.getTransportControls().seekTo(pos.longValue());
        call.resolve();
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        MediaController c = requireController(call);
        if (c == null) return;
        try {
            Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(launch);
                call.resolve();
                return;
            }
            PendingIntent pi = c.getSessionActivity();
            if (pi != null) {
                pi.send();
                call.resolve();
                return;
            }
            call.reject("Cannot open media app");
        } catch (Exception e) {
            call.reject("Cannot open media app", e);
        }
    }
}
