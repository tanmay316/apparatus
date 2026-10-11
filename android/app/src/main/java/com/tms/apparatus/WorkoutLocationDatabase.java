package com.tms.apparatus;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Durable offline GPS journal for the active workout.
 *
 * IMPORTANT: upgrades are non-destructive. Never DROP the points table during
 * an app update or an active workout.
 */
final class WorkoutLocationDatabase extends SQLiteOpenHelper {
    private static final String NAME = "workout_locations.db";
    private static final int VERSION = 3;

    WorkoutLocationDatabase(Context context) {
        super(context.getApplicationContext(), NAME, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS points (" +
                "timestamp INTEGER PRIMARY KEY, " +
                "lat REAL NOT NULL, " +
                "lng REAL NOT NULL, " +
                "accuracy REAL, " +
                "speed REAL, " +
                "speedAccuracy REAL, " +
                "altitude REAL, " +
                "verticalAccuracy REAL, " +
                "bearing REAL, " +
                "bearingAccuracy REAL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_points_timestamp ON points(timestamp ASC)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Version 2 already has the correct point schema. Version 3 only adds
        // an index. NEVER drop route history on upgrade.
        if (oldVersion < 3) {
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_points_timestamp ON points(timestamp ASC)");
        }
    }

    void beginNewSession() {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("points", null, null);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    void append(JSONObject point) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues values = new ContentValues();
        long timestamp = point.optLong("timestamp", System.currentTimeMillis());
        values.put("timestamp", timestamp);
        values.put("lat", point.optDouble("lat"));
        values.put("lng", point.optDouble("lng"));
        if (!point.isNull("accuracy")) values.put("accuracy", point.optDouble("accuracy"));
        if (!point.isNull("speed")) values.put("speed", point.optDouble("speed"));
        if (!point.isNull("speedAccuracy")) values.put("speedAccuracy", point.optDouble("speedAccuracy"));
        if (!point.isNull("altitude")) values.put("altitude", point.optDouble("altitude"));
        if (!point.isNull("verticalAccuracy")) values.put("verticalAccuracy", point.optDouble("verticalAccuracy"));
        if (!point.isNull("bearing")) values.put("bearing", point.optDouble("bearing"));
        if (!point.isNull("bearingAccuracy")) values.put("bearingAccuracy", point.optDouble("bearingAccuracy"));

        db.insertWithOnConflict("points", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    JSONArray locationsAfter(long timestamp) throws Exception {
        return queryPoints(
                "timestamp > ?",
                new String[]{String.valueOf(timestamp)},
                "timestamp ASC"
        );
    }

    JSONArray getAllPoints() throws Exception {
        return queryPoints(null, null, "timestamp ASC");
    }

    /**
     * Evenly samples the full durable route while ALWAYS retaining the first
     * and last point. This is for display only; the full route remains in SQLite.
     */
    JSONArray getDownsampledPoints(int maxPoints) {
        JSONArray points = new JSONArray();
        if (maxPoints <= 0) maxPoints = 2000;

        try (Cursor cursor = getReadableDatabase().query(
                "points", null, null, null, null, null, "timestamp ASC")) {
            int total = cursor.getCount();
            if (total == 0) return points;

            if (total <= maxPoints) {
                while (cursor.moveToNext()) {
                    points.put(cursorToPoint(cursor));
                }
                return points;
            }

            double step = (double) (total - 1) / (double) (maxPoints - 1);
            for (int i = 0; i < maxPoints; i++) {
                int targetIndex = (int) Math.round(i * step);
                if (cursor.moveToPosition(targetIndex)) {
                    points.put(cursorToPoint(cursor));
                }
            }
        } catch (Exception ignored) {
        }
        return points;
    }

    /**
     * Shape-preserving reduction to at most maxPoints: Ramer-Douglas-Peucker keeps every curve and
     * turn, then the leftover budget is spread evenly. Unlike even sampling alone it never cuts corners.
     */
    JSONArray getSimplifiedPoints(int maxPoints) {
        JSONArray points = new JSONArray();
        if (maxPoints < 2) maxPoints = 2000;
        try (Cursor cursor = getReadableDatabase().query(
                "points", null, null, null, null, null, "timestamp ASC")) {
            int n = cursor.getCount();
            if (n == 0) return points;
            if (n <= maxPoints) {
                while (cursor.moveToNext()) points.put(cursorToPoint(cursor));
                return points;
            }

            int latIdx = cursor.getColumnIndexOrThrow("lat");
            int lngIdx = cursor.getColumnIndexOrThrow("lng");
            double[] xs = new double[n];
            double[] ys = new double[n];
            double mPerLng = 0;
            int i = 0;
            while (cursor.moveToNext() && i < n) {
                double lat = cursor.getDouble(latIdx);
                if (i == 0) mPerLng = 111320.0 * Math.cos(Math.toRadians(lat));
                xs[i] = cursor.getDouble(lngIdx) * mPerLng;
                ys[i] = lat * 110540.0;
                i++;
            }

            double lo = 0.5, hi = 100.0;
            boolean[] best = rdpKeep(xs, ys, lo);
            if (countKept(best) > maxPoints) {
                best = rdpKeep(xs, ys, hi);
                for (int iter = 0; iter < 14; iter++) {
                    double mid = (lo + hi) / 2.0;
                    boolean[] keep = rdpKeep(xs, ys, mid);
                    if (countKept(keep) <= maxPoints) { best = keep; hi = mid; } else { lo = mid; }
                }
            }

            // Spend the leftover budget on evenly spaced fixes so timing stays dense on straights.
            int spare = maxPoints - countKept(best);
            if (spare > 0) {
                double step = (double) n / spare;
                for (int j = 0; j < spare; j++) best[Math.min(n - 1, (int) (j * step))] = true;
            }

            for (int k = 0; k < n; k++) {
                if (best[k] && cursor.moveToPosition(k)) points.put(cursorToPoint(cursor));
            }
        } catch (Exception ignored) {
        }
        return points;
    }

    private static boolean[] rdpKeep(double[] xs, double[] ys, double toleranceM) {
        int n = xs.length;
        boolean[] keep = new boolean[n];
        keep[0] = true;
        keep[n - 1] = true;
        double tol2 = toleranceM * toleranceM;
        int[] stack = new int[Math.max(4, n * 2)];
        int sp = 0;
        stack[sp++] = 0;
        stack[sp++] = n - 1;
        while (sp > 0) {
            int end = stack[--sp];
            int start = stack[--sp];
            double ax = xs[start], ay = ys[start];
            double dx = xs[end] - ax, dy = ys[end] - ay;
            double len2 = dx * dx + dy * dy;
            double maxD = -1;
            int idx = -1;
            for (int i = start + 1; i < end; i++) {
                double px = xs[i] - ax, py = ys[i] - ay;
                if (len2 > 0) {
                    double t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
                    px -= t * dx;
                    py -= t * dy;
                }
                double d = px * px + py * py;
                if (d > maxD) { maxD = d; idx = i; }
            }
            if (idx > 0 && maxD > tol2) {
                keep[idx] = true;
                if (sp + 4 > stack.length) stack = java.util.Arrays.copyOf(stack, stack.length * 2);
                stack[sp++] = start;
                stack[sp++] = idx;
                stack[sp++] = idx;
                stack[sp++] = end;
            }
        }
        return keep;
    }

    private static int countKept(boolean[] keep) {
        int c = 0;
        for (boolean k : keep) if (k) c++;
        return c;
    }

    int getPointCount() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM points", null)) {
            if (cursor.moveToFirst()) return cursor.getInt(0);
        } catch (Exception ignored) {
        }
        return 0;
    }

    private JSONArray queryPoints(String selection, String[] args, String orderBy) throws Exception {
        JSONArray points = new JSONArray();
        try (Cursor cursor = getReadableDatabase().query(
                "points", null, selection, args, null, null, orderBy)) {
            while (cursor.moveToNext()) {
                points.put(cursorToPoint(cursor));
            }
        }
        return points;
    }

    private JSONObject cursorToPoint(Cursor cursor) throws Exception {
        JSONObject point = new JSONObject();
        point.put("timestamp", cursor.getLong(cursor.getColumnIndexOrThrow("timestamp")));
        point.put("lat", cursor.getDouble(cursor.getColumnIndexOrThrow("lat")));
        point.put("lng", cursor.getDouble(cursor.getColumnIndexOrThrow("lng")));
        putNullable(point, "accuracy", cursor, "accuracy");
        putNullable(point, "speed", cursor, "speed");
        putNullable(point, "speedAccuracy", cursor, "speedAccuracy");
        putNullable(point, "altitude", cursor, "altitude");
        putNullable(point, "verticalAccuracy", cursor, "verticalAccuracy");
        putNullable(point, "bearing", cursor, "bearing");
        putNullable(point, "bearingAccuracy", cursor, "bearingAccuracy");
        return point;
    }

    private static void putNullable(JSONObject target, String key, Cursor cursor, String column) throws Exception {
        int index = cursor.getColumnIndex(column);
        if (index != -1 && !cursor.isNull(index)) {
            target.put(key, cursor.getDouble(index));
        } else {
            target.put(key, JSONObject.NULL);
        }
    }
}
