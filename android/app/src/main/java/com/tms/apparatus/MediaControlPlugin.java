package com.tms.apparatus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Now-playing card without notification access (which Play Protect blocks for
 * sideloaded apps). Track info comes from the metadata broadcasts that Spotify
 * ("Device broadcast status") and many other players send; transport controls
 * are sent as system media key events.
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
        registerReceiver();
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
    }

    private void emit() {
        if (observing) notifyListeners(EVENT, buildState());
    }

    private JSObject buildState() {
        boolean active = isMusicActive();
        // The broadcasting player says it's paused yet audio is playing: another app took over.
        boolean hasMeta = title != null && !(Boolean.FALSE.equals(playing) && active);
        JSObject o = new JSObject();
        o.put("granted", true);
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
        r.put("granted", true);
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
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
        sendKey(KeyEvent.KEYCODE_MEDIA_PLAY, call);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        sendKey(KeyEvent.KEYCODE_MEDIA_PAUSE, call);
    }

    @PluginMethod
    public void togglePlayPause(PluginCall call) {
        sendKey(isMusicActive() ? KeyEvent.KEYCODE_MEDIA_PAUSE : KeyEvent.KEYCODE_MEDIA_PLAY, call);
    }

    @PluginMethod
    public void next(PluginCall call) {
        sendKey(KeyEvent.KEYCODE_MEDIA_NEXT, call);
    }

    @PluginMethod
    public void previous(PluginCall call) {
        sendKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS, call);
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        call.reject("Seeking is not available");
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = SPOTIFY.equals(source) ? SPOTIFY : null;
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
