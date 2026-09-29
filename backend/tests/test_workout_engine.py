"""
Plan generator engine checks (no LLM). Run:
  cd backend; ./venv/Scripts/python tests/test_workout_engine.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.engine.workout_engine import assemble_plan, apply_llm_review_delta, choose_split  # noqa: E402
from app.engine import programming as prog  # noqa: E402
from app.data.exercise_db import EXERCISES  # noqa: E402
from app.schemas.workout import WorkoutPlanResponse  # noqa: E402

BY_NAME = {e.name: e for e in EXERCISES}
failures = 0


def check(cond, msg):
    global failures
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures += 1


def names(day, section="strength"):
    return [e["name"] for e in day[section]]


def plan(blueprint=None, **req):
    base = {"goal": "Hypertrophy", "days": 4, "equipment": "Full Gym", "experience": "intermediate", "sessionDuration": 60}
    base.update(req)
    p = assemble_plan(blueprint or {}, base)
    meta = p.pop("_meta")
    WorkoutPlanResponse(**p)  # schema-valid
    return p, meta


print("goal / experience normalisation")
check(prog.normalize_goal("Weight Loss") == "fat_loss", "Weight Loss -> fat_loss")
check(prog.normalize_goal("Endurance") == "endurance", "Endurance -> endurance")
check(prog.normalize_goal("Calisthenics front lever") == "calisthenics", "front lever text -> calisthenics")
check(prog.normalize_goal("get bigger", "Powerlifting") == "strength", "style used when goal is vague")
check(prog.normalize_goal("Muscle gain") == "hypertrophy", "Muscle gain -> hypertrophy")
check(prog.normalize_experience("Beginner") == "beginner", "experience normalised")

print("split selection")
check(choose_split("push_pull_legs", 3, "beginner") == "full_body", "beginners get full body at 3 days")
check(choose_split("push_pull_legs", 3, "advanced") == "push_pull_legs", "advanced may choose PPL at 3 days")
check(choose_split("ppl_ul", 5, "intermediate") == "phat", "ppl_ul alias -> phat")
check(choose_split("nonsense", 4, "intermediate") == "upper_lower", "unknown split -> default for 4 days")
check(choose_split("push_pull_legs", 4, "intermediate") == "upper_lower", "PPL not allowed at 4 days")

print("equipment")
p, meta = plan(equipment="Kettlebells & Bands")
used = {n for d in p["days"] for n in names(d)}
check(all(BY_NAME[n].equipment in {"bodyweight", "kettlebell", "band"} for n in used), "kettlebell plan only uses KB/band/bodyweight")
check(all(len(d["strength"]) >= 3 for d in p["days"]), "every kettlebell day has >= 3 strength exercises")
p, _ = plan(equipment="Dumbbells Only")
check(all(BY_NAME[n].equipment in {"bodyweight", "dumbbell"} for d in p["days"] for n in names(d)), "dumbbell plan respects equipment")

print("prescriptions per goal")
p, _ = plan(goal="Strength", days=3, experience="advanced")
first = p["days"][0]["strength"][0]
check(first["sets"].startswith("5 x 3-5") and first["rest"] == "3 min", f"strength primary lift is heavy ({first['sets']}, {first['rest']})")
p, _ = plan(goal="Endurance")
check(all("3 min" not in e["rest"] for d in p["days"] for e in d["strength"]), "endurance plan never rests 3 min")
p, _ = plan(goal="Weight Loss")
check(any("superset" in " ".join(e["cues"]).lower() for d in p["days"] for e in d["strength"]), "fat loss isolations suggest supersets")
check(all(len(e["cues"]) >= 3 for d in p["days"] for e in d["strength"]), "every exercise has target/effort/progression cues")

print("variation")
p, _ = plan(days=4)
check([d["title"] for d in p["days"]] == ["Upper Body A", "Lower Body A", "Upper Body B", "Lower Body B"], "A/B day titles")
a, b = set(names(p["days"][0])), set(names(p["days"][2]))
check(len(a & b) <= len(a) // 2, f"Upper A/B differ ({len(a & b)} shared of {len(a)})")
for d in p["days"]:
    check(len(names(d)) == len(set(names(d))), f"no duplicates on {d['title']}")

print("session budget")
short, _ = plan(sessionDuration=30)
long, _ = plan(sessionDuration=90)
check(sum(len(d["strength"]) for d in short["days"]) < sum(len(d["strength"]) for d in long["days"]), "longer sessions get more exercises")
check(all(len(d["strength"]) >= 3 for d in short["days"]), "30 min sessions still have 3 exercises")

print("injuries")
p, meta = plan(injuries="bad right shoulder, impingement")
used = [BY_NAME[n] for d in p["days"] for n in names(d)]
check("shoulder" in meta["injuries"], "shoulder injury detected")
check(all(e.shoulder_load < 8 for e in used), "no high shoulder-load exercises")
check("Adjusted for your shoulder" in p["description"], "description mentions the adjustment")
p, meta = plan(injuries="lower back pain / herniated disc", goal="Strength")
check(all(BY_NAME[n].spine_load < 7 for d in p["days"] for n in names(d)), "no heavy spinal loading with back pain")
p, meta = plan(injuries="none")
check(meta["injuries"] == [], "'none' is not an injury")
p, meta = plan(injuries="knee discomfort")
check(meta["injuries"] == ["knee"], "'discomfort' does not trigger the disc rule")
p, meta = plan(injuries="wrist pain", goal="Calisthenics planche and handstand", equipment="Bodyweight")
check("planche" not in meta["skills"] and "handstand" not in meta["skills"], "wrist pain blocks planche/handstand skill work")

print("skills")
p, meta = plan(goal="Calisthenics", customInfo="I want my first front lever and pistol squat", equipment="Calisthenics Park", days=4)
check("front_lever" in meta["skills"] and "pistol_squat" in meta["skills"], "skills detected from custom text")
upper = [d for d in p["days"] if d["title"].startswith("Upper")]
lower = [d for d in p["days"] if d["title"].startswith("Lower")]
check(all(d["skill"] != "Pistol Squat" for d in upper), "pistol squat never on upper days")
check(any(d["skill"] == "Pistol Squat" for d in lower), "pistol squat on a lower day")
check(any(d["skill"] == "Front Lever" for d in upper), "front lever on an upper day")
p, meta = plan({"skills": ["front_lever"]}, days=3)
check("front_lever" in meta["skills"], "blueprint skill keys with underscores are recognised")

print("blueprint priorities")
p, _ = plan({"priority_muscles": ["arms"]}, days=4)
base, _ = plan(days=4)
arm = lambda pl: sum(1 for d in pl["days"] for n in names(d) if set(BY_NAME[n].primary_muscles) & {"biceps", "triceps"})
check(arm(p) >= arm(base), f"arm priority keeps or adds arm work ({arm(base)} -> {arm(p)})")
p30, _ = plan({"priority_muscles": ["arms"]}, days=4, sessionDuration=45)
b30, _ = plan(days=4, sessionDuration=45)
check(arm(p30) > arm(b30), f"arm priority moves arm work ahead of the time cut ({arm(b30)} -> {arm(p30)})")
p, _ = plan({"avoid_exercises": ["Barbell Deadlift", "Good Mornings"]}, goal="Strength")
check(not any(n in ("Barbell Deadlift", "Good Mornings") for d in p["days"] for n in names(d)), "avoid list honoured")
p, _ = plan({"avoid_exercises": ["press"]})
check(any("Press" in n for d in p["days"] for n in names(d)), "over-broad avoid list is ignored")
p, _ = plan({"include_exercises": ["hip thrust", "Bulgarian split squats"]})
check(any(n == "Bulgarian Split Squat" for d in p["days"] for n in names(d)), "requested lift included")
p, _ = plan({"priority_muscles": "chest", "skills": "planche", "split_type": None})
check(len(p["days"]) == 4, "string/None blueprint fields do not crash")

print("review delta validation")
p, meta = plan(equipment="Dumbbells Only")
day1 = p["days"][0]
before = list(names(day1))
delta = {"approved": False, "suggested_changes": [
    {"action": "add", "day_number": 1, "section": "strength", "exercise_name": "Barbell Back Squat"},  # not in pool
    {"action": "add", "day_number": 1, "section": "strength", "exercise_name": before[0]},  # duplicate
    {"action": "replace", "day_number": 1, "section": "strength", "target_exercise": before[-1].upper(), "exercise_name": "hammer curl"},
    {"action": "remove", "day_number": "x", "target_exercise": before[0]},
    "garbage",
]}
apply_llm_review_delta(p, delta, meta["goal"], meta["experience"], allowed_names=meta["pool"], budget_minutes=meta["budget"])
after = names(day1)
check("Barbell Back Squat" not in after, "exercise outside the pool rejected")
check(len(after) == len(set(after)), "duplicate add rejected")
check("Hammer Curl" in after or "Hammer Curl" in before, "case-insensitive replace applied")
for _ in range(10):
    apply_llm_review_delta(p, {"suggested_changes": [{"action": "remove", "day_number": 1, "target_exercise": names(day1)[0]}]},
                           meta["goal"], meta["experience"], allowed_names=meta["pool"])
check(len(day1["strength"]) >= 3, "removals never drop a day below 3 exercises")
WorkoutPlanResponse(**p)

print(f"\n{'ALL PASSED' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
