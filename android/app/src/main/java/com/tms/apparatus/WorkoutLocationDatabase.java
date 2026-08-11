package com.tms.apparatus;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/** Durable, offline journal for an active workout. It is cleared only for a new session. */
final class WorkoutLocationDatabase extends SQLiteOpenHelper {
    private static final String NAME = "workout_locations.db";
    private static final int VERSION = 1;

    WorkoutLocationDatabase(Context context) { super(context, NAME, null, VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE points (timestamp INTEGER PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL, speed REAL, altitude REAL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    void beginNewSession() { getWritableDatabase().delete("points", null, null); }

    void append(JSONObject point) {
        ContentValues values = new ContentValues();
        values.put("timestamp", point.optLong("timestamp"));
        values.put("lat", point.optDouble("lat"));
        values.put("lng", point.optDouble("lng"));
        if (!point.isNull("accuracy")) values.put("accuracy", point.optDouble("accuracy"));
        if (!point.isNull("speed")) values.put("speed", point.optDouble("speed"));
        if (!point.isNull("altitude")) values.put("altitude", point.optDouble("altitude"));
        getWritableDatabase().insertWithOnConflict("points", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    JSONArray locationsAfter(long timestamp) throws Exception {
        JSONArray points = new JSONArray();
        try (Cursor cursor = getReadableDatabase().query("points", null, "timestamp > ?", new String[]{String.valueOf(timestamp)}, null, null, "timestamp ASC")) {
            while (cursor.moveToNext()) {
                JSONObject point = new JSONObject();
                point.put("timestamp", cursor.getLong(cursor.getColumnIndexOrThrow("timestamp")));
                point.put("lat", cursor.getDouble(cursor.getColumnIndexOrThrow("lat")));
                point.put("lng", cursor.getDouble(cursor.getColumnIndexOrThrow("lng")));
                putNullable(point, "accuracy", cursor, "accuracy");
                putNullable(point, "speed", cursor, "speed");
                putNullable(point, "altitude", cursor, "altitude");
                points.put(point);
            }
        }
        return points;
    }

    private static void putNullable(JSONObject target, String key, Cursor cursor, String column) throws Exception {
        int index = cursor.getColumnIndexOrThrow(column);
        target.put(key, cursor.isNull(index) ? JSONObject.NULL : cursor.getDouble(index));
    }
}
