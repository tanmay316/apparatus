"""
Read-only access to the user's training data in Firestore (workouts, cardio,
stats, profile) using the user's own ID token, so security rules still apply.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

PROJECT_ID = "apparatus-46b1b"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
CACHE_TTL = 180

_cache: Dict[str, tuple] = {}

WORKOUT_FIELDS = ["date", "startedAt", "planTitle", "dayTitle", "durationMin", "volume", "calories", "exercises"]
CARDIO_FIELDS = ["date", "startedAt", "type", "distanceKm", "movingDurationSec", "durationSec", "avgSpeedKmh",
                 "elevationGainM", "calories", "steps"]


def decode_value(value: dict) -> Any:
    """Firestore REST typed value → plain Python."""
    if not isinstance(value, dict):
        return None
    if "nullValue" in value:
        return None
    for key in ("stringValue", "booleanValue"):
        if key in value:
            return value[key]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "timestampValue" in value:
        return value["timestampValue"]
    if "mapValue" in value:
        return decode_fields(value["mapValue"].get("fields", {}))
    if "arrayValue" in value:
        return [decode_value(v) for v in value["arrayValue"].get("values", [])]
    return None


def decode_fields(fields: dict) -> dict:
    return {k: decode_value(v) for k, v in (fields or {}).items()}


async def _run_query(client: httpx.AsyncClient, headers: dict, collection: str, uid: str, fields: List[str],
                     order_by: Optional[str], limit: int) -> List[dict]:
    query: dict = {
        "from": [{"collectionId": collection}],
        "where": {"fieldFilter": {"field": {"fieldPath": "userId"}, "op": "EQUAL", "value": {"stringValue": uid}}},
        "select": {"fields": [{"fieldPath": f} for f in fields]},
        "limit": limit,
    }
    if order_by:
        query["orderBy"] = [{"field": {"fieldPath": order_by}, "direction": "DESCENDING"}]
    resp = await client.post(f"{BASE}:runQuery", headers=headers, json={"structuredQuery": query})
    if resp.status_code >= 400 and order_by:
        return await _run_query(client, headers, collection, uid, fields, None, limit * 3)
    resp.raise_for_status()
    docs = [decode_fields(row["document"].get("fields", {})) for row in resp.json() if isinstance(row, dict) and row.get("document")]
    docs.sort(key=lambda d: str(d.get("startedAt") or d.get("date") or ""), reverse=True)
    return docs[:limit]


async def _get_doc(client: httpx.AsyncClient, headers: dict, path: str) -> dict:
    resp = await client.get(f"{BASE}/{path}", headers=headers)
    if resp.status_code != 200:
        return {}
    return decode_fields(resp.json().get("fields", {}))


async def fetch_training_data(uid: str, token: Optional[str]) -> dict:
    """{workouts, cardio, stats, profile}; empty lists when unavailable. Cached briefly per user."""
    empty = {"workouts": [], "cardio": [], "stats": {}, "profile": {}, "available": False}
    if not uid or not token:
        return empty
    cached = _cache.get(uid)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            workouts, cardio, stats, profile = await asyncio.gather(
                _run_query(client, headers, "workouts", uid, WORKOUT_FIELDS, "startedAt", 60),
                _run_query(client, headers, "cardioActivities", uid, CARDIO_FIELDS, None, 120),
                _get_doc(client, headers, f"users/{uid}/stats/current"),
                _get_doc(client, headers, f"users/{uid}"),
                return_exceptions=True,
            )
        data = {
            "workouts": workouts if isinstance(workouts, list) else [],
            "cardio": cardio if isinstance(cardio, list) else [],
            "stats": stats if isinstance(stats, dict) else {},
            "profile": {k: profile.get(k) for k in ("displayName", "weight", "height", "gender", "athleteRank", "experienceLevel", "fitnessGoal", "workoutType")}
            if isinstance(profile, dict) else {},
            "available": True,
        }
        _cache[uid] = (time.time(), data)
        return data
    except Exception as exc:
        logger.warning("Training data fetch failed for %s: %s", uid, type(exc).__name__)
        return empty


def invalidate(uid: str) -> None:
    _cache.pop(uid, None)


# ─── Summaries ───────────────────────────────────────────────────

def _completed_sets(exercise: dict) -> List[dict]:
    return [s for s in (exercise.get("sets") or []) if isinstance(s, dict) and s.get("completed") is not False
            and ((s.get("reps") or 0) > 0 or (s.get("seconds") or 0) > 0 or (s.get("weight") or 0) > 0)]


def best_set_text(sets: List[dict]) -> str:
    def score(s):
        w, r = s.get("weight") or 0, s.get("reps") or 0
        return w * (1 + r / 30) if w else (r or (s.get("seconds") or 0))
    if not sets:
        return ""
    s = max(sets, key=score)
    if s.get("weight"):
        return f"{s.get('reps') or 0}×{s['weight']:g}kg"
    if s.get("reps"):
        return f"{s['reps']} reps"
    return f"{s.get('seconds') or 0}s hold"


def days_ago(date_str: Optional[str], today: Optional[str] = None) -> Optional[int]:
    if not date_str:
        return None
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
        t = datetime.strptime(today, "%Y-%m-%d").date() if today else datetime.now(timezone.utc).date()
        return (t - d).days
    except ValueError:
        return None


def within_days(date_str: Optional[str], days: int, today: Optional[str] = None) -> bool:
    d = days_ago(date_str, today)
    return d is not None and 0 <= d <= days


def workout_line(w: dict) -> str:
    exercises = [e for e in (w.get("exercises") or []) if isinstance(e, dict)]
    parts = []
    for e in exercises[:8]:
        sets = _completed_sets(e)
        if sets:
            parts.append(f"{e.get('name')} {len(sets)} sets best {best_set_text(sets)}")
    title = w.get("dayTitle") or w.get("planTitle") or "Workout"
    vol = f", volume {round(w.get('volume') or 0)} kg" if w.get("volume") else ""
    return f"{w.get('date')} {title} ({round(w.get('durationMin') or 0)} min{vol}): " + ("; ".join(parts) or "no sets logged")


def cardio_line(c: dict) -> str:
    km = c.get("distanceKm") or 0
    sec = c.get("movingDurationSec") or c.get("durationSec") or 0
    kind = {"run": "Run", "walk": "Walk", "cycle": "Ride"}.get(c.get("type"), "Cardio")
    if c.get("type") == "cycle":
        rate = f"{(km / (sec / 3600)):.1f} km/h" if sec else "-"
    else:
        pace = sec / km if km else 0
        rate = f"{int(pace // 60)}:{int(pace % 60):02d}/km" if pace else "-"
    return f"{c.get('date')} {kind} {km:.2f} km in {int(sec // 60)} min ({rate}, +{round(c.get('elevationGainM') or 0)} m)"


def training_snapshot(data: dict, today: Optional[str] = None) -> str:
    """Compact multi-line summary for the system prompt."""
    if not data.get("available"):
        return "Training data unavailable right now."
    stats, profile = data.get("stats") or {}, data.get("profile") or {}
    rank = (profile.get("athleteRank") or {}).get("label")
    week_w = [w for w in data["workouts"] if within_days(w.get("date"), 6, today)]
    week_c = [c for c in data["cardio"] if within_days(c.get("date"), 6, today)]
    km_by: Dict[str, float] = {}
    for c in week_c:
        km_by[c.get("type") or "cardio"] = km_by.get(c.get("type") or "cardio", 0) + (c.get("distanceKm") or 0)
    lines = [
        f"Athlete rank: {rank}" if rank else "",
        f"Experience: {profile.get('experienceLevel')}" if profile.get("experienceLevel") else "",
        f"Lifetime: {stats.get('totalWorkouts', 0)} strength sessions, {stats.get('totalCardioSessions', 0)} cardio sessions, "
        f"longest streak {stats.get('longestStreak', 0)} days, current streak {stats.get('currentStreak', 0)}",
        f"Last 7 days: {len(week_w)} strength sessions, {len(week_c)} cardio sessions"
        + (" (" + ", ".join(f"{t} {km:.1f} km" for t, km in km_by.items()) + ")" if km_by else ""),
    ]
    if data["workouts"]:
        lines.append("Latest strength: " + workout_line(data["workouts"][0]))
    if data["cardio"]:
        lines.append("Latest cardio: " + cardio_line(data["cardio"][0]))
    return "\n".join(l for l in lines if l)
