package com.tms.apparatus;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.List;

/**
 * Now-playing card. With the user's opt-in "Notification access" (MediaNotificationListener)
 * it reads the active media session of any player (YouTube, YT Music, Spotify, …): title,
 * artwork, progress and transport controls. Without it, track info comes from the metadata
 * broadcasts Spotify ("Device broadcast status") and some players send, and controls are
 * system media key events.
 */
@CapacitorPlugin(name = "MediaControl")
public class MediaControlPlugin extends Plugin {
    private static final String EVENT = "mediaChange";
    private static final long POLL_MS = 1500;
    private static final String SPOTIFY = "com.spotify.music";

    private static final String[] ACTIONS = {
        "com.spotify.music.metadatachanged",
        "com.spotify.music.playbackstatechanged",
        "com.android.music.metachanged",
        "com.android.music.playstatechanged",
        "com.sec.android.app.music.metachanged",
        "com.sec.android.app.music.playstatechanged",
        "com.miui.player.metachanged",
        "com.miui.player.playstatechanged",
        "com.htc.music.metachanged",
        "com.amazon.mp3.metachanged",
        "com.amazon.mp3.playstatechanged",
        "com.maxmpz.audioplayer.TRACK_CHANGED",
        "com.maxmpz.audioplayer.STATUS_CHANGED",
    };

    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioManager audio;
    private boolean observing = false;
    private boolean receiverRegistered = false;
    private boolean lastActive = false;

    private String source;
    private String title;
    private String artist;
    private String album;
    private String trackId;
    private String artworkUrl;
    private long durationMs;
    private long positionMs;
    private long positionAt;
    private Boolean playing;

    // Media-session mode (only with notification access).
    private MediaSessionManager sessionManager;
    private MediaController controller;
    private boolean sessionsListening = false;
    private String artKey;
    private String artDataUrl;

    private final MediaController.Callback controllerCallback = new MediaController.Callback() {
        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            emit();
        }

        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            // Another player may have taken over; follow whichever is playing.
            refreshController();
            emit();
        }

        @Override
        public void onSessionDestroyed() {
            setController(null);
            refreshController();
            emit();
        }
    };

    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsChanged = controllers -> {
        refreshController();
        emit();
    };

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            main.post(() -> handleBroadcast(intent));
        }
    };

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (!observing) return;
            boolean active = isMusicActive();
            if (active != lastActive) {
                // Freeze the position while audio is silent and resume counting from now.
                long now = System.currentTimeMillis();
                if (!active && positionAt > 0 && !Boolean.FALSE.equals(playing)) {
                    positionMs = Math.min(durationMs > 0 ? durationMs : Long.MAX_VALUE, positionMs + (now - positionAt));
                }
                positionAt = now;
                lastActive = active;
                emit();
            }
            main.postDelayed(this, POLL_MS);
        }
    };

    @Override
    public void load() {
        super.load();
        audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        sessionManager = (MediaSessionManager) getContext().getSystemService(Context.MEDIA_SESSION_SERVICE);
        registerReceiver();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // The user may have just granted (or revoked) notification access in Settings.
        if (observing) {
            attachSessions();
            emit();
        }
    }

    private ComponentName listenerComponent() {
        return new ComponentName(getContext(), MediaNotificationListener.class);
    }

    private boolean hasAccess() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
    }

    private void attachSessions() {
        if (sessionManager == null) return;
        if (!hasAccess()) {
            detachSessions();
            return;
        }
        try {
            if (!sessionsListening) {
                sessionManager.addOnActiveSessionsChangedListener(sessionsChanged, listenerComponent(), main);
                sessionsListening = true;
            }
            refreshController();
        } catch (SecurityException e) {
            detachSessions();
        }
    }

    private void detachSessions() {
        if (sessionsListening && sessionManager != null) {
            try {
                sessionManager.removeOnActiveSessionsChangedListener(sessionsChanged);
            } catch (Exception ignored) {
            }
        }
        sessionsListening = false;
        setController(null);
    }

    /** Picks the playing session, else the most recent one. */
    private void refreshController() {
        if (sessionManager == null || !hasAccess()) return;
        List<MediaController> list;
        try {
            list = sessionManager.getActiveSessions(listenerComponent());
        } catch (SecurityException e) {
            return;
        }
        MediaController best = null;
        for (MediaController c : list) {
            PlaybackState s = c.getPlaybackState();
            if (s != null && (s.getState() == PlaybackState.STATE_PLAYING || s.getState() == PlaybackState.STATE_BUFFERING)) {
                best = c;
                break;
            }
        }
        if (best == null && !list.isEmpty()) best = list.get(0);
        if (best == null || controller == null || !best.getSessionToken().equals(controller.getSessionToken())) {
            setController(best);
        }
    }

    private void setController(MediaController next) {
        if (controller != null) {
            try {
                controller.unregisterCallback(controllerCallback);
            } catch (Exception ignored) {
            }
        }
        controller = next;
        if (controller != null) controller.registerCallback(controllerCallback, main);
    }

    private static String meta(MediaMetadata m, String... keys) {
        if (m == null) return null;
        for (String k : keys) {
            CharSequence v = m.getText(k);
            if (v != null && v.length() > 0) return v.toString();
        }
        return null;
    }

    /** Small JPEG data URL of the session artwork, cached per track. */
    private String artworkFor(MediaMetadata m, String key) {
        if (key.equals(artKey)) return artDataUrl;
        artKey = key;
        artDataUrl = null;
        Bitmap bmp = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (bmp == null) bmp = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (bmp == null) bmp = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        if (bmp != null) {
            try {
                int size = 160;
                float scale = Math.min(1f, (float) size / Math.max(bmp.getWidth(), bmp.getHeight()));
                Bitmap small = scale < 1f
                        ? Bitmap.createScaledBitmap(bmp, Math.max(1, Math.round(bmp.getWidth() * scale)), Math.max(1, Math.round(bmp.getHeight() * scale)), true)
                        : bmp;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                small.compress(Bitmap.CompressFormat.JPEG, 80, out);
                artDataUrl = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (Exception ignored) {
            }
        }
        return artDataUrl;
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** Session-based state, or null when no usable session (falls back to broadcasts). */
    private JSObject sessionState() {
        if (controller == null) return null;
        MediaMetadata m = controller.getMetadata();
        PlaybackState s = controller.getPlaybackState();
        String t = meta(m, MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
        boolean isPlaying = s != null && (s.getState() == PlaybackState.STATE_PLAYING || s.getState() == PlaybackState.STATE_BUFFERING);
        if (t == null && !isPlaying) return null;

        String pkg = controller.getPackageName();
        JSObject o = new JSObject();
        o.put("granted", true);
        o.put("basic", t == null);
        o.put("timestamp", System.currentTimeMillis());
        o.put("hasSession", true);
        o.put("isPlaying", isPlaying);
        long actions = s != null ? s.getActions() : 0;
        o.put("canSkipNext", (actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0 || actions == 0);
        o.put("canSkipPrevious", (actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0 || actions == 0);
        o.put("canSeek", (actions & PlaybackState.ACTION_SEEK_TO) != 0);
        o.put("packageName", pkg);
        String label = appLabel(pkg);
        if (label != null) o.put("appName", label);
        if (t != null) {
            o.put("title", t);
            o.put("artist", meta(m, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_ALBUM_ARTIST, MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE));
            o.put("album", meta(m, MediaMetadata.METADATA_KEY_ALBUM));
            String art = artworkFor(m, pkg + "|" + t);
            if (art != null) {
                o.put("artwork", art);
            } else {
                String uri = meta(m, MediaMetadata.METADATA_KEY_ART_URI, MediaMetadata.METADATA_KEY_ALBUM_ART_URI, MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI);
                if (uri != null && uri.startsWith("https://")) o.put("artworkUrl", uri);
            }
        }
        long duration = m != null ? m.getLong(MediaMetadata.METADATA_KEY_DURATION) : 0;
        long position = 0;
        float speed = 1f;
        if (s != null && s.getPosition() >= 0) {
            position = s.getPosition();
            speed = s.getPlaybackSpeed() > 0 ? s.getPlaybackSpeed() : 1f;
            if (isPlaying && s.getLastPositionUpdateTime() > 0) {
                position += (long) ((SystemClock.elapsedRealtime() - s.getLastPositionUpdateTime()) * speed);
            }
        }
        if (duration > 0) position = Math.min(position, duration);
        o.put("durationMs", Math.max(0, duration));
        o.put("positionMs", Math.max(0, position));
        o.put("playbackSpeed", speed);
        return o;
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        if (receiverRegistered) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
            }
            receiverRegistered = false;
        }
        super.handleOnDestroy();
    }

    private void registerReceiver() {
        IntentFilter filter = new IntentFilter();
        for (String action : ACTIONS) filter.addAction(action);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                getContext().registerReceiver(receiver, filter);
            }
            receiverRegistered = true;
        } catch (Exception ignored) {
        }
    }

    private boolean isMusicActive() {
        return audio != null && audio.isMusicActive();
    }

    private long currentPosition() {
        if (positionAt == 0 || Boolean.FALSE.equals(playing) || !isMusicActive()) return positionMs;
        long pos = positionMs + (System.currentTimeMillis() - positionAt);
        return durationMs > 0 ? Math.min(pos, durationMs) : pos;
    }

    private static String text(Bundle extras, String... keys) {
        if (extras == null) return null;
        for (String k : keys) {
            Object v = extras.get(k);
            if (v != null && v.toString().length() > 0) return v.toString();
        }
        return null;
    }

    private static long number(Bundle extras, String... keys) {
        if (extras == null) return -1;
        for (String k : keys) {
            Object v = extras.get(k);
            if (v instanceof Number) return ((Number) v).longValue();
        }
        return -1;
    }

    private void handleBroadcast(Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        Bundle extras = intent.getExtras();
        // Poweramp nests the track in a bundle.
        if (action.startsWith("com.maxmpz.audioplayer") && extras != null && extras.getBundle("track") != null) {
            Bundle track = extras.getBundle("track");
            extras = new Bundle(extras);
            extras.putAll(track);
        }
        String nextSource = action.startsWith("com.spotify.music") ? SPOTIFY : action.substring(0, action.lastIndexOf('.'));

        String nextTitle = text(extras, "track", "title");
        if (nextTitle != null) {
            String nextId = text(extras, "id");
            boolean changed = !nextTitle.equals(title) || (nextId != null && !nextId.equals(trackId));
            title = nextTitle;
            artist = text(extras, "artist");
            album = text(extras, "album");
            source = nextSource;
            if (changed) {
                trackId = nextId;
                artworkUrl = null;
                positionMs = 0;
                positionAt = System.currentTimeMillis();
                if (SPOTIFY.equals(source) && trackId != null) fetchSpotifyArt(trackId);
            }
            long len = number(extras, "length", "duration", "durationMs");
            if (len > 0) durationMs = len < 10000 ? len * 1000 : len;
        }

        long pos = number(extras, "playbackPosition", "position", "pos");
        if (pos >= 0) {
            positionMs = pos;
            positionAt = System.currentTimeMillis();
        }
        if (extras != null && extras.containsKey("playing")) {
            boolean nowPlaying = extras.getBoolean("playing");
            if (!nowPlaying && !Boolean.FALSE.equals(playing)) positionMs = currentPosition();
            playing = nowPlaying;
            positionAt = System.currentTimeMillis();
        }
        emit();
    }

    /** Spotify's public oEmbed endpoint returns album art for a track id without any login. */
    private void fetchSpotifyArt(String id) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String trackUrl = "https://open.spotify.com/track/" + id.replace("spotify:track:", "");
                URL url = new URL("https://open.spotify.com/oembed?url=" + URLEncoder.encode(trackUrl, "UTF-8"));
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                if (conn.getResponseCode() != 200) return;
                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
                String thumb = new JSONObject(body.toString()).optString("thumbnail_url", null);
                if (thumb != null && thumb.startsWith("https://")) {
                    main.post(() -> {
                        if (id.equals(trackId)) {
                            artworkUrl = thumb;
                            emit();
                        }
                    });
                }
            } catch (Exception ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void stopInternal() {
        observing = false;
        main.removeCallbacks(poll);
        detachSessions();
    }

    private void emit() {
        if (observing) notifyListeners(EVENT, buildState());
    }

    private JSObject buildState() {
        JSObject session = sessionState();
        if (session != null) return session;
        boolean active = isMusicActive();
        // The broadcasting player says it's paused yet audio is playing: another app took over.
        boolean hasMeta = title != null && !(Boolean.FALSE.equals(playing) && active);
        JSObject o = new JSObject();
        o.put("granted", hasAccess());
        o.put("basic", !hasMeta);
        o.put("timestamp", System.currentTimeMillis());
        o.put("hasSession", active || hasMeta);
        o.put("isPlaying", active);
        o.put("canSkipNext", true);
        o.put("canSkipPrevious", true);
        o.put("canSeek", false);
        if (hasMeta) {
            o.put("title", title);
            o.put("artist", artist);
            o.put("album", album);
            o.put("packageName", source);
            if (SPOTIFY.equals(source)) o.put("appName", "Spotify");
            if (artworkUrl != null) o.put("artworkUrl", artworkUrl);
            o.put("durationMs", durationMs);
            o.put("positionMs", currentPosition());
        } else {
            o.put("durationMs", 0);
            o.put("positionMs", 0);
        }
        o.put("playbackSpeed", 1);
        return o;
    }

    private void sendKey(int keyCode, PluginCall call) {
        if (audio == null) {
            call.reject("Audio service unavailable");
            return;
        }
        long now = SystemClock.uptimeMillis();
        audio.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0));
        audio.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0));
        // The player updates its state shortly after handling the key.
        main.postDelayed(() -> {
            lastActive = isMusicActive();
            emit();
        }, 700);
        call.resolve();
    }

    @PluginMethod
    public void isAccessGranted(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", hasAccess());
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                    .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, listenerComponent().flattenToString());
        } else {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            getContext().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    @PluginMethod
    public void startObserving(PluginCall call) {
        main.post(() -> {
            if (!observing) {
                observing = true;
                lastActive = isMusicActive();
                main.postDelayed(poll, POLL_MS);
            }
            attachSessions();
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
        main.post(() -> call.resolve(buildState()));
    }

    @PluginMethod
    public void play(PluginCall call) {
        if (withControls(c -> c.play(), call)) return;
        sendKey(KeyEvent.KEYCODE_MEDIA_PLAY, call);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (withControls(c -> c.pause(), call)) return;
        sendKey(KeyEvent.KEYCODE_MEDIA_PAUSE, call);
    }

    @PluginMethod
    public void togglePlayPause(PluginCall call) {
        if (controller != null && controller.getPlaybackState() != null) {
            int st = controller.getPlaybackState().getState();
            boolean isPlaying = st == PlaybackState.STATE_PLAYING || st == PlaybackState.STATE_BUFFERING;
            if (withControls(c -> { if (isPlaying) c.pause(); else c.play(); }, call)) return;
        }
        sendKey(isMusicActive() ? KeyEvent.KEYCODE_MEDIA_PAUSE : KeyEvent.KEYCODE_MEDIA_PLAY, call);
    }

    @PluginMethod
    public void next(PluginCall call) {
        if (withControls(c -> c.skipToNext(), call)) return;
        sendKey(KeyEvent.KEYCODE_MEDIA_NEXT, call);
    }

    @PluginMethod
    public void previous(PluginCall call) {
        if (withControls(c -> c.skipToPrevious(), call)) return;
        sendKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS, call);
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        Long pos = call.getLong("positionMs");
        if (pos != null && withControls(c -> c.seekTo(Math.max(0, pos)), call)) return;
        call.reject("Seeking is not available");
    }

    private interface ControlAction {
        void run(MediaController.TransportControls controls);
    }

    /** Runs on the active session's transport controls; false when there is no session. */
    private boolean withControls(ControlAction action, PluginCall call) {
        MediaController c = controller;
        if (c == null) return false;
        try {
            action.run(c.getTransportControls());
        } catch (Exception e) {
            return false;
        }
        main.postDelayed(this::emit, 400);
        call.resolve();
        return true;
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = controller != null ? controller.getPackageName() : SPOTIFY.equals(source) ? SPOTIFY : null;
        Intent launch = pkg != null ? getContext().getPackageManager().getLaunchIntentForPackage(pkg) : null;
        if (launch == null) {
            call.reject("Media app unknown");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
        call.resolve();
    }
}
