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

    // Nearby: the ~1 km cell the app shares ('' = not shared) and its on-device privacy zone.
    private static final long NEARBY_EVERY_MS = 3 * 60_000L;
    private static final long NEARBY_TTL_MS = 7L * 60 * 60_000L;
    private static String nearbyCell = "";
    private static double zoneLat = Double.NaN;
    private static double zoneLng = Double.NaN;
    private static double zoneRadiusM = 0;
    private static long nearbyWrittenAt;

    private LiveSessionSync() {}

    static synchronized void configureNearby(String cell, Double lat, Double lng, Double radiusM) {
        nearbyCell = cell == null ? "" : cell;
        zoneLat = lat == null ? Double.NaN : lat;
        zoneLng = lng == null ? Double.NaN : lng;
        zoneRadiusM = radiusM == null ? 0 : radiusM;
    }

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
        nearbyCell = "";
        zoneLat = zoneLng = Double.NaN;
        zoneRadiusM = 0;
        nearbyWrittenAt = 0L;
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
            tickNearby(prefs, token, commitUrl);
        } catch (Exception ignored) {
        }
    }

    /**
     * Moves the shared Nearby position with the runner and removes it on entering the privacy
     * zone. Only updates a presence the app created.
     */
    private static void tickNearby(SharedPreferences prefs, String token, String commitUrl) throws Exception {
        String sharedCell;
        double zLat;
        double zLng;
        double zRadius;
        String docPath;
        synchronized (LiveSessionSync.class) {
            long now = System.currentTimeMillis();
            if (uid == null || nearbyCell.isEmpty() || now - nearbyWrittenAt < NEARBY_EVERY_MS) return;
            nearbyWrittenAt = now;
            sharedCell = nearbyCell;
            zLat = zoneLat;
            zLng = zoneLng;
            zRadius = zoneRadiusM;
            docPath = "projects/" + projectId + "/databases/(default)/documents/nearby_presence/" + uid;
        }
        if (!prefs.contains(WorkoutLocationService.KEY_LAST_LAT) || !prefs.contains(WorkoutLocationService.KEY_LAST_LNG)) return;
        double lat = Double.longBitsToDouble(prefs.getLong(WorkoutLocationService.KEY_LAST_LAT, 0L));
        double lng = Double.longBitsToDouble(prefs.getLong(WorkoutLocationService.KEY_LAST_LNG, 0L));

        JSONObject write;
        // Inside the privacy zone: stop sharing. A paused session still counts as training.
        boolean hide = !Double.isNaN(zLat) && distanceM(lat, lng, zLat, zLng) <= zRadius;
        if (hide) {
            write = new JSONObject().put("delete", docPath);
        } else {
            String cell = geohash(lat, lng, 6);
            JSONObject fields = new JSONObject();
            JSONArray mask = new JSONArray();
            putString(fields, mask, "geohash4", cell.substring(0, 4));
            putString(fields, mask, "geohash5", cell.substring(0, 5));
            putString(fields, mask, "geohash6", cell);
            fields.put("lat", new JSONObject().put("doubleValue", Math.round(lat * 1e5) / 1e5));
            mask.put("lat");
            fields.put("lng", new JSONObject().put("doubleValue", Math.round(lng * 1e5) / 1e5));
            mask.put("lng");
            fields.put("expiresAt", new JSONObject().put("timestampValue", isoUtc(System.currentTimeMillis() + NEARBY_TTL_MS)));
            mask.put("expiresAt");
            // The landmark name belonged to the old cell; drop it rather than mislabel the area.
            if (!cell.equals(sharedCell)) mask.put("place");
            write = new JSONObject()
                    .put("update", new JSONObject().put("name", docPath).put("fields", fields))
                    .put("updateMask", new JSONObject().put("fieldPaths", mask))
                    .put("updateTransforms", new JSONArray().put(new JSONObject()
                            .put("fieldPath", "updatedAt").put("setToServerValue", "REQUEST_TIME")))
                    .put("currentDocument", new JSONObject().put("exists", true));
        }
        HttpURLConnection conn = open(commitUrl, "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        int code = send(conn, new JSONObject().put("writes", new JSONArray().put(write)).toString());
        conn.disconnect();
        if (hide && code == 200) {
            synchronized (LiveSessionSync.class) { nearbyCell = ""; }
        }
    }

    private static final String GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    static String geohash(double lat, double lng, int precision) {
        double latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
        StringBuilder hash = new StringBuilder();
        int bit = 0;
        int ch = 0;
        boolean even = true;
        while (hash.length() < precision) {
            if (even) {
                double mid = (lngMin + lngMax) / 2;
                if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch <<= 1; lngMax = mid; }
            } else {
                double mid = (latMin + latMax) / 2;
                if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
            }
            even = !even;
            if (++bit == 5) {
                hash.append(GEOHASH_BASE32.charAt(ch));
                bit = 0;
                ch = 0;
            }
        }
        return hash.toString();
    }

    private static double distanceM(double aLat, double aLng, double bLat, double bLng) {
        double dLat = Math.toRadians(bLat - aLat);
        double dLng = Math.toRadians(bLng - aLng);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6371000d * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    private static String isoUtc(long ms) {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date(ms));
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
