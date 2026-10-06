"""
Nutrition compare tests (no network, no database).
Run: cd backend; ./venv/Scripts/python tests/test_nutrition_compare.py
"""
import os
import sys
from datetime import date, datetime, timezone
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import nutrition_compare as nc  # noqa: E402

failed = 0


def check(name, ok):
    global failed
    if not ok:
        failed += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}")


def meal(day, hour, cal, protein, score=None):
    return SimpleNamespace(logged_at=datetime(2026, 10, day, hour, tzinfo=timezone.utc), total_calories=cal, total_protein=protein, health_score=score)


today = date(2026, 10, 6)
meals = [
    meal(6, 8, 900, 60, 80), meal(6, 13, 1100, 70, 60),   # 2000 kcal, 130 g
    meal(5, 9, 2500, 90),                                 # over target, low protein
    meal(4, 20, 1800, 140, 90),                           # IST: 4 Oct 20:00 UTC = 5 Oct 01:30
    meal(1, 10, 0, 0),                                    # zero-calorie row doesn't count as logged
    meal(9, 10, 3000, 200),                               # in the future: ignored
]
goals = {"calories": 2000, "protein": 140}

s = nc.summarize(meals, goals, 7, today)
check("logged days (UTC)", s["loggedDays"] == 3)
check("avg calories", s["avgCalories"] == round((2000 + 2500 + 1800) / 3))
check("calorie on target %", s["calorieOnTargetPct"] == round(2 / 3 * 100))
check("protein hit % (within 10% of goal)", s["proteinHitPct"] == round(2 / 3 * 100))
check("health score avg", s["avgHealthScore"] == round((80 + 60 + 90) / 3))
check("logging %", s["loggingPct"] == round(3 / 7 * 100))
check("last logged", s["lastLogged"] == "2026-10-06")
check("one weekly bucket for 7 days", len(s["weeks"]) == 1 and s["weeks"][0]["loggedDays"] == 3)

ist = nc.summarize(meals, goals, 7, today, tz_minutes=330)
check("time zone moves late meals to the next day", ist["loggedDays"] == 2)

none = nc.summarize([], goals, 30, today)
check("no meals → nulls, not zeros", none["loggedDays"] == 0 and none["avgCalories"] is None and none["proteinHitPct"] is None and none["lastLogged"] is None)
no_goals = nc.summarize(meals, {}, 7, today)
check("no goals → no hit rates", no_goals["calorieOnTargetPct"] is None and no_goals["proteinHitPct"] is None)
check("days clamp", nc.clamp_days(1) == 7 and nc.clamp_days(9999) == 365 and nc.clamp_days(30) == 30)
check("uid pattern", nc.UID_RE.match("abcDEF123456") and not nc.UID_RE.match("../users") and not nc.UID_RE.match("a b"))


def fetcher(docs):
    return lambda path: docs.get(path)


follow = {"followers/T/followers/V": {}}
check("not following", nc.access_status("V", "T", fetcher({"users/T": {"privacySettings": {"shareNutritionWithFollowers": True}}})) == "not_following")
check("following but not opted in", nc.access_status("V", "T", fetcher({**follow, "users/T": {"privacySettings": {}}})) == "private")
check("opt-in must be exactly true", nc.access_status("V", "T", fetcher({**follow, "users/T": {"privacySettings": {"shareNutritionWithFollowers": "yes"}}})) == "private")
check("following and opted in", nc.access_status("V", "T", fetcher({**follow, "users/T": {"privacySettings": {"shareNutritionWithFollowers": True}}})) == "ok")


def boom(path):
    raise RuntimeError("down")


check("errors fail closed", nc.access_status("V", "T", boom) == "unavailable")

print("\nall passed" if not failed else f"\n{failed} failed")
sys.exit(1 if failed else 0)
