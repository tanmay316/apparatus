package com.tms.apparatus;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/** Durable, offline journal for an active workout with rich GNSS metrics. */
final class WorkoutLocationDatabase extends SQLiteOpenHelper {
    private static final String NAME = "workout_locations.db";
    private static final int VERSION = 2;

    WorkoutLocationDatabase(Context context) { super(context, NAME, null, VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE points (" +
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
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS points");
        onCreate(db);
    }

    void beginNewSession() {
        try {
            getWritableDatabase().delete("points", null, null);
        } catch (Exception ignored) {}
    }

    void append(JSONObject point) {
        try {
            ContentValues values = new ContentValues();
            values.put("timestamp", point.optLong("timestamp"));
            values.put("lat", point.optDouble("lat"));
            values.put("lng", point.optDouble("lng"));
            if (!point.isNull("accuracy")) values.put("accuracy", point.optDouble("accuracy"));
            if (!point.isNull("speed")) values.put("speed", point.optDouble("speed"));
            if (!point.isNull("speedAccuracy")) values.put("speedAccuracy", point.optDouble("speedAccuracy"));
            if (!point.isNull("altitude")) values.put("altitude", point.optDouble("altitude"));
            if (!point.isNull("verticalAccuracy")) values.put("verticalAccuracy", point.optDouble("verticalAccuracy"));
            if (!point.isNull("bearing")) values.put("bearing", point.optDouble("bearing"));
            if (!point.isNull("bearingAccuracy")) values.put("bearingAccuracy", point.optDouble("bearingAccuracy"));
            getWritableDatabase().insertWithOnConflict("points", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        } catch (Exception ignored) {}
    }

    JSONArray locationsAfter(long timestamp) throws Exception {
        JSONArray points = new JSONArray();
        try (Cursor cursor = getReadableDatabase().query(
                "points", null,
                "timestamp > ?", new String[]{String.valueOf(timestamp)},
                null, null, "timestamp ASC")) {
            while (cursor.moveToNext()) {
                points.put(cursorToPoint(cursor));
            }
        }
        return points;
    }

    /**
     * Retrieves an evenly spaced downsampled array of points for fast map rendering in WebView.
     * Prevents rendering thousands of DOM/SVG polyline nodes on long workouts.
     */
    JSONArray getDownsampledPoints(int maxPoints) {
        JSONArray points = new JSONArray();
        if (maxPoints <= 0) maxPoints = 500;
        try (Cursor cursor = getReadableDatabase().query("points", null, null, null, null, null, "timestamp ASC")) {
            int total = cursor.getCount();
            if (total == 0) return points;

            if (total <= maxPoints) {
                while (cursor.moveToNext()) {
                    points.put(cursorToPoint(cursor));
                }
            } else {
                double step = (double) (total - 1) / (maxPoints - 1);
                for (int i = 0; i < maxPoints; i++) {
                    int targetIndex = (int) Math.round(i * step);
                    if (cursor.moveToPosition(targetIndex)) {
                        points.put(cursorToPoint(cursor));
                    }
                }
            }
        } catch (Exception ignored) {}
        return points;
    }

    int getPointCount() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM points", null)) {
            if (cursor.moveToFirst()) return cursor.getInt(0);
        } catch (Exception ignored) {}
        return 0;
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
