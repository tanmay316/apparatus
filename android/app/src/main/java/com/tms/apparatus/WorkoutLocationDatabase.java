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
