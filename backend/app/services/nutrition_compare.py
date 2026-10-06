"""
Pro "Compare with athletes you follow": nutrition side.

Only aggregates leave the server (logging days, averages, goal hit rates); never meals or foods.
A followed athlete's numbers are shared only when the viewer follows them AND they
opted in with privacySettings.shareNutritionWithFollowers.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Iterable, Optional

from app.core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

UID_RE = re.compile(r"^[A-Za-z0-9]{6,128}$")
MIN_DAYS, MAX_DAYS = 7, 365


def clamp_days(days: int) -> int:
    return max(MIN_DAYS, min(MAX_DAYS, int(days)))


def local_day(ts, tz_minutes: int) -> Optional[date]:
    if ts is None:
        return None
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (ts.astimezone(timezone.utc) + timedelta(minutes=tz_minutes)).date()


def summarize(meals: Iterable, goals: dict, days: int, today: date, tz_minutes: int = 0) -> dict:
    """Per-day totals → averages and goal hit rates. `meals` need logged_at, total_calories, total_protein, health_score."""
    start = today - timedelta(days=days - 1)
    per_day: dict[date, dict] = {}
    scores: list[float] = []
    for m in meals:
        d = local_day(getattr(m, "logged_at", None), tz_minutes)
        if d is None or d < start or d > today:
            continue
        t = per_day.setdefault(d, {"cal": 0.0, "protein": 0.0})
        t["cal"] += float(getattr(m, "total_calories", 0) or 0)
        t["protein"] += float(getattr(m, "total_protein", 0) or 0)
        hs = getattr(m, "health_score", None)
        if isinstance(hs, (int, float)) and 0 <= hs <= 100:
            scores.append(float(hs))

    logged = [t for t in per_day.values() if t["cal"] > 0]
    n = len(logged)
    cal_goal = _num(goals.get("calories"))
    protein_goal = _num(goals.get("protein"))
    on_cal = sum(1 for t in logged if cal_goal and abs(t["cal"] - cal_goal) <= cal_goal * 0.1)
    hit_protein = sum(1 for t in logged if protein_goal and t["protein"] >= protein_goal * 0.9)

    weeks = []
    week_start = start
    while week_start <= today:
        week_end = min(week_start + timedelta(days=6), today)
        in_week = [t for d, t in per_day.items() if week_start <= d <= week_end and t["cal"] > 0]
        weeks.append({
            "start": week_start.isoformat(),
            "loggedDays": len(in_week),
            "proteinHitDays": sum(1 for t in in_week if protein_goal and t["protein"] >= protein_goal * 0.9),
        })
        week_start += timedelta(days=7)

    last = max(per_day) if per_day else None
    return {
        "days": days,
        "loggedDays": n,
        "loggingPct": round(n / days * 100),
        "avgCalories": round(sum(t["cal"] for t in logged) / n) if n else None,
        "avgProtein": round(sum(t["protein"] for t in logged) / n) if n else None,
        "calorieOnTargetPct": round(on_cal / n * 100) if n and cal_goal else None,
        "proteinHitPct": round(hit_protein / n * 100) if n and protein_goal else None,
        "avgHealthScore": round(sum(scores) / len(scores)) if scores else None,
        "lastLogged": last.isoformat() if last else None,
        "weeks": weeks[-26:],
    }


def _num(v) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def nutrition_goals(uid: str) -> dict:
    db = get_firestore_client()
    if not db:
        return {}
    try:
        snap = db.collection("users").document(uid).collection("private").document("nutrition").get()
        return ((snap.to_dict() or {}).get("goals") or {}) if snap.exists else {}
    except Exception as exc:
        logger.warning("Nutrition goals read failed for %s: %s", uid, exc)
        return {}


def access_status(viewer: str, target: str, fetch: Optional[Callable[[str], Optional[dict]]] = None) -> str:
    """'ok' | 'not_following' | 'private' | 'unavailable'. `fetch(path)` returns a doc dict or None (tests inject it)."""
    if fetch is None:
        db = get_firestore_client()
        if not db:
            return "unavailable"

        def fetch(path: str):
            snap = db.document(path).get()
            return (snap.to_dict() or {}) if snap.exists else None
    try:
        if fetch(f"followers/{target}/followers/{viewer}") is None:
            return "not_following"
        profile = fetch(f"users/{target}") or {}
    except Exception as exc:
        logger.warning("Compare access check failed %s -> %s: %s", viewer, target, exc)
        return "unavailable"
    privacy = profile.get("privacySettings") or {}
    if privacy.get("shareNutritionWithFollowers") is not True:
        return "private"
    return "ok"
