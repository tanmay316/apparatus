package com.tms.apparatus;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Keeps followers' Live Training card fresh while the WebView is frozen (screen off or
 * app in background) by writing the cardio heartbeat to Firestore over REST.
 * Credentials live in memory only; the WebView re-sends them with every heartbeat.
 */
final class LiveSessionSync {
    static final long TICK_MS = 15_000L;
    /** The WebView publishes every 15 s; take over only once it has gone quiet. */
    private static final long JS_QUIET_MS = 25_000L;
    private static final int TIMEOUT_MS = 15_000;

    private static String projectId;
    private static String apiKey;
    private static String origin;
    private static String uid;
    private static String refreshToken;
    private static String idToken;
    private static long idTokenExpiresAt;
    private static long jsPublishedAt;
    private static double activeSec;
    private static long activeAt;
    private static double jsDistanceKm;
    private static double jsCalories;
    private static double jsSteps = -1;

    private LiveSessionSync() {}

    static synchronized void configure(String projectId, String apiKey, String origin, String uid,
                                       String refreshToken, String idToken, long idTokenExpiresAt,
                                       double activeSec, double distanceKm, double calories, double steps) {
        LiveSessionSync.projectId = projectId;
        LiveSessionSync.apiKey = apiKey;
        LiveSessionSync.origin = origin;
        LiveSessionSync.uid = uid;
        LiveSessionSync.refreshToken = refreshToken;
        if (idToken != null && idTokenExpiresAt > LiveSessionSync.idTokenExpiresAt) {
            LiveSessionSync.idToken = idToken;
            LiveSessionSync.idTokenExpiresAt = idTokenExpiresAt;
        }
        long now = System.currentTimeMillis();
        jsPublishedAt = now;
        LiveSessionSync.activeSec = activeSec;
        activeAt = now;
        jsDistanceKm = distanceKm;
        jsCalories = calories;
        jsSteps = steps;
    }

    static synchronized void clear() {
        projectId = apiKey = origin = uid = refreshToken = idToken = null;
        idTokenExpiresAt = jsPublishedAt = activeAt = 0L;
        activeSec = jsDistanceKm = jsCalories = 0d;
        jsSteps = -1;
    }

    /** Runs on the service's live-sync thread every {@link #TICK_MS}. */
    static void tick(SharedPreferences prefs, boolean autoPaused) {
        String state = prefs.getString(WorkoutLocationService.KEY_STATE, "IDLE");
        boolean paused = "PAUSED".equals(state);
        if (!paused && !"TRACKING".equals(state)) return;

        String docPath;
        String commitUrl;
        String status = paused ? "paused" : autoPaused ? "auto_paused" : "active";
        int active;
        double distanceKm = prefs.getFloat(WorkoutLocationService.KEY_DISTANCE_METERS, 0f) / 1000d;
        double baseDistanceKm;
        double baseCalories;
        double baseSteps;
        synchronized (LiveSessionSync.class) {
            long now = System.currentTimeMillis();
            if (uid == null || now - jsPublishedAt < JS_QUIET_MS) return;
            if ("active".equals(status)) activeSec += (now - activeAt) / 1000d;
            activeAt = now;
            active = (int) Math.floor(activeSec);
            docPath = "projects/" + projectId + "/databases/(default)/documents/activeSessions/" + uid + "_cardio";
            commitUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents:commit";
            baseDistanceKm = jsDistanceKm;
            baseCalories = jsCalories;
            baseSteps = jsSteps;
        }

        try {
            String token = currentIdToken();
            if (token == null) return;

            int movingSec = (int) Math.min(prefs.getLong(WorkoutLocationService.KEY_MOVING_DURATION_SEC, 0L), active);
            double speedKmh = "active".equals(status) ? prefs.getFloat(WorkoutLocationService.KEY_CURRENT_SPEED_KMH, 0f) : 0d;
            double avgSpeedKmh = movingSec > 0 ? distanceKm / movingSec * 3600d : 0d;

            JSONObject fields = new JSONObject();
            JSONArray mask = new JSONArray();
            putString(fields, mask, "status", status);
            putString(fields, mask, "currentExercise", String.format(Locale.US, "%.2f km", distanceKm));
            putInt(fields, mask, "activeSec", active);
            putInt(fields, mask, "movingSec", movingSec);
            putDouble(fields, mask, "distanceKm", Math.round(distanceKm * 100d) / 100d);
            putDouble(fields, mask, "currentSpeedKmh", speedKmh);
            putDouble(fields, mask, "avgSpeedKmh", Math.round(avgSpeedKmh * 10d) / 10d);
            putInt(fields, mask, "paceSecPerKm", distanceKm >= 0.05 && movingSec > 0 ? (int) Math.round(movingSec / distanceKm) : 0);
            putInt(fields, mask, "elevationGainM", Math.round(prefs.getFloat(WorkoutLocationService.KEY_ELEVATION_GAIN_M, 0f)));
            // Calories/steps are modelled in JS; scale its last values by distance covered since.
            if (baseDistanceKm >= 0.2 && distanceKm > baseDistanceKm) {
                double scale = distanceKm / baseDistanceKm;
                putInt(fields, mask, "caloriesBurned", (int) Math.round(baseCalories * scale));
                if (baseSteps >= 0) putInt(fields, mask, "steps", (int) Math.round(baseSteps * scale));
            }

            JSONObject write = new JSONObject()
                    .put("update", new JSONObject().put("name", docPath).put("fields", fields))
                    .put("updateMask", new JSONObject().put("fieldPaths", mask))
                    .put("updateTransforms", new JSONArray().put(new JSONObject()
                            .put("fieldPath", "updatedAt").put("setToServerValue", "REQUEST_TIME")))
                    // Never recreate a session the app has already ended.
                    .put("currentDocument", new JSONObject().put("exists", true));
            JSONObject body = new JSONObject().put("writes", new JSONArray().put(write));

            HttpURLConnection conn = open(commitUrl, "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            int code = send(conn, body.toString());
            if (code == 401 || code == 403) {
                synchronized (LiveSessionSync.class) { idToken = null; idTokenExpiresAt = 0L; }
            }
            conn.disconnect();
        } catch (Exception ignored) {
        }
    }

    private static String currentIdToken() throws Exception {
        String refresh;
        String key;
        String referer;
        synchronized (LiveSessionSync.class) {
            if (idToken != null && System.currentTimeMillis() < idTokenExpiresAt - 60_000L) return idToken;
            refresh = refreshToken;
            key = apiKey;
            referer = origin;
        }
        if (refresh == null || key == null) return null;

        HttpURLConnection conn = open("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(key, "UTF-8"),
                "application/x-www-form-urlencoded");
        if (referer != null) conn.setRequestProperty("Referer", referer + "/");
        int code = send(conn, "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8"));
        if (code != 200) {
            conn.disconnect();
            return null;
        }
        JSONObject res = new JSONObject(read(conn.getInputStream()));
        conn.disconnect();
        String token = res.optString("id_token", null);
        long expiresIn = Long.parseLong(res.optString("expires_in", "3600"));
        synchronized (LiveSessionSync.class) {
            if (uid == null) return null;
            idToken = token;
            idTokenExpiresAt = System.currentTimeMillis() + expiresIn * 1000L;
            String rotated = res.optString("refresh_token", null);
            if (rotated != null) refreshToken = rotated;
        }
        return token;
    }

    private static HttpURLConnection open(String url, String contentType) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", contentType);
        return conn;
    }

    private static int send(HttpURLConnection conn, String body) throws Exception {
        try (OutputStream out = conn.getOutputStream()) {
            out.write(body.getBytes(StandardCharsets.UTF_8));
        }
        return conn.getResponseCode();
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream stream = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int n;
            while ((n = stream.read(chunk)) != -1) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        }
    }

    private static void putString(JSONObject fields, JSONArray mask, String name, String value) throws Exception {
        fields.put(name, new JSONObject().put("stringValue", value));
        mask.put(name);
    }

    private static void putInt(JSONObject fields, JSONArray mask, String name, long value) throws Exception {
        fields.put(name, new JSONObject().put("integerValue", String.valueOf(value)));
        mask.put(name);
    }

    private static void putDouble(JSONObject fields, JSONArray mask, String name, double value) throws Exception {
        fields.put(name, new JSONObject().put("doubleValue", value));
        mask.put(name);
    }
}
