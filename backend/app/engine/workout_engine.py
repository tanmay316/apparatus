from typing import Dict, Any, Iterable, List, Optional, Set
import re

from app.engine.models import MovementPattern, ExerciseCategory
from app.data.exercise_db import get_exercises_for_equipment, EXERCISES
from app.engine.scoring import score_exercise
from app.engine.fatigue_manager import FatigueManager
from app.engine.weekly_volume import VolumeTracker
from app.engine import programming as prog
from app.data.warmup_cooldown_db import get_warmup_for_day, get_cooldown_for_day
from app.data.skill_progressions import get_skill_exercises, detect_skills_from_text

# Templates explicitly mapping day to its required categories and patterns
SPLIT_TEMPLATES = {
    # 6-Day Elite PPL (Arnold Variant): Push (Chest/Tri), Pull (Back/Bi), Legs & Shoulders
    "push_pull_legs": [
        {
            "title": "Push Day (Chest & Triceps)",
            "slots": [
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.FLY, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.FLY, ExerciseCategory.ISOLATION),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION)
            ],
            "warmup_focus": ["chest"],
            "muscles_trained": ["chest", "triceps"]
        },
        {
            "title": "Pull Day (Back & Biceps)",
            "slots": [
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.VERTICAL_PULL, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.VERTICAL_PULL, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION)
            ],
            "warmup_focus": ["back", "arms"],
            "muscles_trained": ["back", "biceps", "rear_delt"]
        },
        {
            "title": "Legs & Shoulders Day",
            "slots": [
                (MovementPattern.SQUAT, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.VERTICAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND), # Overhead press
                (MovementPattern.HINGE, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION), # Lateral raise
                (MovementPattern.LUNGE, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_LEGS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION),
                (MovementPattern.CALF, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE),
                (MovementPattern.SQUAT, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION),
                (MovementPattern.CALF, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE)
            ],
            "warmup_focus": ["squat", "shoulders", "legs"],
            "muscles_trained": ["quads", "hamstrings", "glutes", "calves", "shoulders", "core"]
        }
    ],
    # 4-Day Elite Upper / Lower
    "upper_lower": [
        {
            "title": "Upper Body",
            "slots": [
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.VERTICAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.VERTICAL_PULL, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.FLY, ExerciseCategory.ISOLATION)
            ],
            "warmup_focus": ["upper_body"],
            "muscles_trained": ["chest", "back", "shoulders", "arms"]
        },
        {
            "title": "Lower Body",
            "slots": [
                (MovementPattern.SQUAT, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HINGE, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.LUNGE, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_LEGS, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE),
                (MovementPattern.SQUAT, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_LEGS, ExerciseCategory.ISOLATION),
                (MovementPattern.CALF, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE),
                (MovementPattern.HINGE, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.CALF, ExerciseCategory.ISOLATION)
            ],
            "warmup_focus": ["squat", "deadlift", "legs"],
            "muscles_trained": ["quads", "hamstrings", "glutes", "calves", "core"]
        }
    ],
    # 3-Day Elite Full Body
    "full_body": [
        {
            "title": "Full Body",
            "slots": [
                (MovementPattern.SQUAT, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HINGE, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE),
                (MovementPattern.VERTICAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.VERTICAL_PULL, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_LEGS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE)
            ],
            "warmup_focus": ["full_body"],
            "muscles_trained": ["full_body"]
        }
    ]
}

# Add PHAT (5-day hybrid) dynamically based on existing templates
SPLIT_TEMPLATES["phat"] = [
    SPLIT_TEMPLATES["upper_lower"][0],
    SPLIT_TEMPLATES["upper_lower"][1],
    SPLIT_TEMPLATES["push_pull_legs"][0],
    SPLIT_TEMPLATES["push_pull_legs"][1],
    SPLIT_TEMPLATES["push_pull_legs"][2]
]

def get_day_templates(split_key: str, days: int) -> List[Dict]:
    base_templates = SPLIT_TEMPLATES.get(split_key)
    if not base_templates:
        base_templates = SPLIT_TEMPLATES["upper_lower"]
        
    result = []
    for i in range(days):
        template = dict(base_templates[i % len(base_templates)])
        result.append(template)
    return result

SPLIT_ALIASES = {
    "push_pull_legs": "push_pull_legs", "ppl": "push_pull_legs", "ppl_ppl": "push_pull_legs",
    "upper_lower": "upper_lower", "ul": "upper_lower",
    "full_body": "full_body", "fullbody": "full_body", "total_body": "full_body",
    "phat": "phat", "ppl_ul": "phat", "upper_lower_ppl": "phat", "ul_ppl": "phat",
}

# Splits that make sense for each weekly frequency (first = default).
ALLOWED_SPLITS = {
    1: ["full_body"], 2: ["full_body", "upper_lower"], 3: ["full_body", "push_pull_legs"],
    4: ["upper_lower", "full_body"], 5: ["phat", "upper_lower"], 6: ["push_pull_legs", "upper_lower"],
    7: ["push_pull_legs"],
}

LEG_SKILLS = {"pistol_squat"}
UPPER_FOCUS = {"chest", "shoulders", "back", "arms", "upper_body", "full_body"}
SKILL_LABELS = {"l_sit": "L-Sit", "muscle_up": "Muscle-Up"}

PROGRESSION_NOTES = {
    "strength": "Add 2.5 kg to a lift once every set hits the top of its rep range; deload (about 40% fewer sets) every 5th week.",
    "hypertrophy": "Double progression: add reps until every set reaches the top of the range, then add load. Deload every 5-6 weeks.",
    "endurance": "Add a rep or trim 10-15 s of rest each week; once rest is short, add load.",
    "fat_loss": "Keep loads heavy enough to hold on to muscle and trim rest before adding sets. Pair with a modest calorie deficit and daily steps.",
    "calisthenics": "Train skills first while fresh. Add reps weekly, then step up to the next progression; deload every 5th week.",
}


def choose_split(requested: str, days: int, experience: str) -> str:
    """Honours the coach's split when it suits the frequency; beginners get full body up to 3 days."""
    allowed = ALLOWED_SPLITS[max(1, min(7, days))]
    if experience == "beginner" and days <= 3:
        return "full_body"
    key = re.sub(r"[\s\-/&+]+", "_", (requested or "").lower()).strip("_")
    split = SPLIT_ALIASES.get(key)
    return split if split in allowed else allowed[0]


def resolve_skills(blueprint_skills: Optional[Iterable[Any]], *texts: str) -> List[str]:
    """Canonical skill keys (e.g. front_lever) from the blueprint and the user's own words."""
    parts = [str(s).replace("_", " ") for s in (blueprint_skills or [])] + [t or "" for t in texts]
    return detect_skills_from_text(" ".join(parts))


def _set_count(exercise: Dict[str, Any]) -> int:
    m = re.match(r"\s*(\d+)", exercise.get("sets") or "")
    return int(m.group(1)) if m else 3


def _day_minutes(day: Dict[str, Any]) -> float:
    return sum(prog.estimate_minutes(e) for e in day.get("skillWork", []) + day.get("strength", []))


def _time_range(minutes: float) -> str:
    mid = max(20, int(round(minutes / 5.0)) * 5)
    return f"{mid - 5}-{mid + 5} min"


# Muscles each slot pattern trains directly, used to move priority work earlier in the day.
PATTERN_MUSCLES = {
    MovementPattern.HORIZONTAL_PUSH: {"chest", "upper_chest"},
    MovementPattern.VERTICAL_PUSH: {"front_delt"},
    MovementPattern.HORIZONTAL_PULL: {"lats", "rhomboids", "rear_delt"},
    MovementPattern.VERTICAL_PULL: {"lats"},
    MovementPattern.SQUAT: {"quads", "glutes"},
    MovementPattern.HINGE: {"hamstrings", "glutes"},
    MovementPattern.LUNGE: {"quads", "glutes"},
    MovementPattern.FLY: {"chest", "upper_chest"},
    MovementPattern.CORE: {"core", "obliques"},
    MovementPattern.CALF: {"calves"},
    MovementPattern.ISOLATION_BICEPS: {"biceps", "brachialis", "forearms"},
    MovementPattern.ISOLATION_TRICEPS: {"triceps"},
    MovementPattern.ISOLATION_SHOULDERS: {"lateral_delt", "rear_delt", "traps"},
    MovementPattern.ISOLATION_LEGS: {"quads", "hamstrings"},
}


def _order_slots(slots: List[tuple], priority: Set[str]) -> List[tuple]:
    """Keeps the two main lifts first, then pulls slots for priority muscles forward."""
    if not priority:
        return list(slots)
    head, tail = list(slots[:2]), list(slots[2:])
    tail.sort(key=lambda s: 0 if PATTERN_MUSCLES.get(s[0], set()) & priority else 1)
    return head + tail


def _list(blueprint: Dict[str, Any], key: str) -> List[str]:
    """LLM list fields sometimes arrive as a bare string or with junk entries."""
    value = blueprint.get(key)
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [str(v).strip()[:60] for v in value if isinstance(v, (str, int)) and str(v).strip()][:12]


def assemble_plan(blueprint: Dict[str, Any], user_request: Dict[str, Any]) -> Dict[str, Any]:
    goal_text = user_request.get("goal") or ""
    custom = user_request.get("customInfo") or ""
    style = (user_request.get("trainingStyle") or "").lower()
    goal = prog.normalize_goal(goal_text, style, user_request.get("fitnessGoal") or "")
    experience = prog.normalize_experience(user_request.get("experience") or "")
    days = max(1, min(7, int(user_request.get("days") or 4)))
    equipment = user_request.get("equipment") or "Full Gym"

    try:
        budget = int(user_request.get("sessionDuration") or 60)
    except (TypeError, ValueError):
        budget = 60
    budget = max(15, min(180, budget))

    injury_text = user_request.get("injuries") or ""
    if re.search(r"injur|pain|hurt|surgery|tear|strain|sprain|tendin", custom, re.I):
        injury_text += " " + custom
    injuries = prog.detect_injuries(injury_text)

    # 1. Exercise pool: equipment, injuries, and anything the user asked to avoid
    pool = [ex for ex in get_exercises_for_equipment(equipment) if not prog.injury_excluded(ex, injuries)]
    avoid = prog.match_exercise_names(_list(blueprint, "avoid_exercises"), pool)
    if len(avoid) <= len(pool) * 0.4:  # an over-broad avoid list ("press") would gut the plan
        pool = [ex for ex in pool if ex.name not in avoid]
    preferred = prog.match_exercise_names(_list(blueprint, "include_exercises"), pool)
    priority = prog.priority_muscles(_list(blueprint, "priority_muscles"), f"{goal_text} {custom}")
    familiar = {str(n).lower() for n in user_request.get("familiarExercises") or []}
    allowed_eq = prog.allowed_equipment(equipment)
    calisthenics_bias = (goal == "calisthenics" or "calisthenic" in style
                         or (allowed_eq is not None and allowed_eq <= {"bodyweight", "rings", "parallettes"}))

    split_key = choose_split(str(blueprint.get("split_type") or ""), days, experience)
    day_templates = get_day_templates(split_key, days)
    title_counts: Dict[str, int] = {}
    for t in day_templates:
        title_counts[t["title"]] = title_counts.get(t["title"], 0) + 1

    blocked = prog.skills_blocked(injuries)
    skills = [s for s in resolve_skills(_list(blueprint, "skills"), custom, goal_text) if s not in blocked]
    skill_freq = 3 if days >= 5 else 2

    fatigue_mgr = FatigueManager()
    vol_tracker = VolumeTracker(goal, experience)
    week_used: Set[str] = set()
    template_last: Dict[str, Set[str]] = {}
    seen: Dict[str, int] = {}
    assembled_days = []

    for i, template in enumerate(day_templates):
        if i:
            fatigue_mgr.new_day()
        title = template["title"]
        seen[title] = seen.get(title, 0) + 1
        day_title = f"{title} {'ABC'[seen[title] - 1]}" if title_counts[title] > 1 and seen[title] <= 3 else title
        day_used: Set[str] = set()
        template_prev = template_last.get(title, set())

        warmup = get_warmup_for_day(template["warmup_focus"])

        # ── SKILL WORK (least-practised skill that fits the day first) ──
        skill_exercises: List[Dict[str, Any]] = []
        day_skill = ""
        focus = set(template["warmup_focus"])
        is_full = "full_body" in focus
        is_upper = bool(focus & UPPER_FOCUS)
        candidates = [
            s for s in skills
            if fatigue_mgr.can_train_skill(s, max_frequency=skill_freq)
            and (is_full or (s in LEG_SKILLS) != is_upper)
        ]
        candidates.sort(key=lambda s: fatigue_mgr.skills_trained_this_week.get(s, 0))
        if candidates:
            skill = candidates[0]
            for sex in get_skill_exercises(skill, experience)[:1 if budget <= 45 else 2]:
                if sex["name"] in day_used:
                    continue
                skill_exercises.append({
                    "name": sex["name"],
                    "sets": sex.get("sets", "3 x 5"),
                    "tempo": "",
                    "rest": sex.get("rest", "90s"),
                    "cues": sex.get("cues", []),
                    "yt": "",
                })
                day_used.add(sex["name"])
            if skill_exercises:
                fatigue_mgr.register_skill_session(skill)
                day_skill = SKILL_LABELS.get(skill, skill.replace("_", " ").title())

        # ── STRENGTH (slots in priority order until the time budget is used) ──
        strength_exercises: List[Dict[str, Any]] = []
        spent = sum(prog.estimate_minutes(e) for e in skill_exercises)
        day_sets = sum(_set_count(e) for e in skill_exercises)
        max_sets = prog.MAX_SESSION_SETS[experience]

        for pattern, category in _order_slots(template["slots"], priority):
            scored = []
            for ex in pool:
                score = score_exercise(
                    ex, pattern, category, goal, experience, fatigue_mgr, vol_tracker, day_used,
                    week_used=week_used, template_prev=template_prev, priority=priority,
                    preferred=preferred, familiar=familiar, injuries=injuries,
                    calisthenics_bias=calisthenics_bias,
                )
                if score > 0:
                    scored.append((score, ex))
            if not scored:
                continue
            best_ex = max(scored, key=lambda x: x[0])[1]
            entry = prog.prescribe(best_ex, goal, experience)
            minutes = prog.estimate_minutes(entry)
            if len(strength_exercises) >= 3 and (spent + minutes > budget + 5 or day_sets + _set_count(entry) > max_sets):
                break
            strength_exercises.append(entry)
            day_used.add(best_ex.name)
            week_used.add(best_ex.name)
            fatigue_mgr.add_exercise_fatigue(best_ex)
            vol_tracker.add_sets(best_ex.primary_muscles, _set_count(entry))
            spent += minutes
            day_sets += _set_count(entry)

        template_last[title] = {e["name"] for e in strength_exercises}
        cooldown = get_cooldown_for_day(template["muscles_trained"])

        assembled_days.append({
            "dayNumber": i + 1,
            "title": day_title,
            "time": _time_range(spent),
            "skill": day_skill,
            "warmup": warmup,
            "skillWork": skill_exercises,
            "strength": strength_exercises,
            "cooldown": cooldown,
        })

    description = str(blueprint.get("description") or "").strip()[:300] \
        or f"A {days}-day {goal.replace('_', ' ')} program built for {equipment.lower()}."
    progression = str(blueprint.get("progression") or "").strip()[:240] or PROGRESSION_NOTES[goal]
    parts = [description, f"Progression: {progression}"]
    if injuries:
        joints = ", ".join(j.replace("_", " ") for j in injuries)
        parts.append(f"Adjusted for your {joints}: high-stress movements for that area are left out. Stop any exercise that causes pain.")

    return {
        "title": str(blueprint.get("title") or f"{goal.replace('_', ' ').title()} Program").strip()[:80],
        "description": " ".join(parts),
        "days": assembled_days,
        "_meta": {
            "goal": goal,
            "experience": experience,
            "split": split_key,
            "budget": budget,
            "injuries": injuries,
            "skills": skills,
            "pool": [ex.name for ex in pool],
        },
    }

MAX_REVIEW_CHANGES = 10
MIN_STRENGTH = 3
MAX_STRENGTH = 10


def apply_llm_review_delta(
    assembled_plan: Dict[str, Any],
    delta: Dict[str, Any],
    goal: str,
    experience: str = "intermediate",
    allowed_names: Optional[Iterable[str]] = None,
    budget_minutes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Applies the LLM's suggested changes (delta) to the assembled_plan in-place.
    Only exercises from the user's filtered pool are accepted, never duplicates,
    and a day keeps at least MIN_STRENGTH strength exercises.
    """
    if not isinstance(delta, dict) or delta.get("approved") is True:
        return assembled_plan
    changes = delta.get("suggested_changes")
    if not isinstance(changes, list) or not changes:
        return assembled_plan

    allowed = set(allowed_names) if allowed_names is not None else None
    by_name = {ex.name.lower(): ex for ex in EXERCISES if allowed is None or ex.name in allowed}
    applied = 0

    for change in changes:
        if applied >= MAX_REVIEW_CHANGES:
            break
        if not isinstance(change, dict):
            continue
        action = str(change.get("action") or "").lower()
        section = change.get("section") or "strength"
        try:
            day_number = int(change.get("day_number"))
        except (TypeError, ValueError):
            continue
        day = next((d for d in assembled_plan["days"] if d["dayNumber"] == day_number), None)
        if not day or section not in ("strength", "skillWork"):
            continue

        items = day.setdefault(section, [])
        in_day = {e["name"].lower() for e in day.get("strength", []) + day.get("skillWork", [])}
        target = str(change.get("target_exercise") or "").strip().lower()
        new_meta = by_name.get(str(change.get("exercise_name") or "").strip().lower())

        if action == "remove":
            if section == "strength" and len(items) <= MIN_STRENGTH:
                continue
            kept = [e for e in items if e["name"].lower() != target]
            if len(kept) == len(items):
                continue
            day[section] = kept
        elif action == "add":
            if section != "strength" or not new_meta or new_meta.name.lower() in in_day or len(items) >= MAX_STRENGTH:
                continue
            entry = prog.prescribe(new_meta, goal, experience)
            if budget_minutes and _day_minutes(day) + prog.estimate_minutes(entry) > budget_minutes + 10:
                continue
            items.append(entry)
        elif action == "replace":
            if section != "strength" or not new_meta or new_meta.name.lower() in in_day:
                continue
            idx = next((k for k, e in enumerate(items) if e["name"].lower() == target), -1)
            if idx < 0:
                continue
            items[idx] = prog.prescribe(new_meta, goal, experience)
        else:
            continue
        applied += 1

    for day in assembled_plan["days"]:
        day["time"] = _time_range(_day_minutes(day))
    return assembled_plan
