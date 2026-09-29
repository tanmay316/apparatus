"""
Programming rules for the plan generator: goal normalisation, set/rep/rest
prescriptions, injury-aware exercise filtering and muscle priorities.
Pure functions so they are easy to test without an LLM.
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Set

from app.engine.models import ExerciseCategory, ExerciseMetadata

GOALS = ("strength", "hypertrophy", "endurance", "fat_loss", "calisthenics")

_GOAL_PATTERNS = [
    ("calisthenics", r"calisthenic|street ?workout|planche|front ?lever|handstand|muscle[ -]?up|\bskills?\b"),
    ("strength", r"strength|strong|powerlift|\b1 ?rm\b|\bpower\b"),
    ("fat_loss", r"weight ?loss|\bfat\b|lose|\blean\b|\bcut\b|shred|ton(e|ing)|recomp"),
    ("endurance", r"endurance|stamina|conditioning|hyrox|crossfit|athletic|work ?capacity"),
    ("hypertrophy", r"hypertroph|muscle|bodybuild|\bsize\b|\bmass\b|bulk|aesthetic|\bgain"),
]


def normalize_goal(goal: str, style: str = "", fitness_goal: str = "") -> str:
    """Maps free-text goal/style/profile goal onto one of GOALS (explicit goal wins)."""
    for text in (goal, style, fitness_goal):
        lowered = (text or "").lower()
        for key, pattern in _GOAL_PATTERNS:
            if re.search(pattern, lowered):
                return key
    return "hypertrophy"


def normalize_experience(experience: str) -> str:
    e = (experience or "").lower()
    if e.startswith("beg") or e in ("novice", "new"):
        return "beginner"
    if e.startswith("adv") or e in ("elite", "expert"):
        return "advanced"
    return "intermediate"


# ─── Equipment ───────────────────────────────────────────────────

_EQUIPMENT_SETS = {
    "full gym": None,
    "dumbbells only": {"bodyweight", "dumbbell"},
    "bodyweight": {"bodyweight"},
    "calisthenics park": {"bodyweight", "rings", "parallettes"},
    "kettlebells & bands": {"bodyweight", "kettlebell", "band"},
    "home gym": {"bodyweight", "dumbbell", "barbell", "band", "kettlebell"},
}


def allowed_equipment(equipment: str) -> Optional[Set[str]]:
    """None = everything. Unknown free text is parsed by keyword."""
    key = (equipment or "").strip().lower()
    if key in _EQUIPMENT_SETS:
        return _EQUIPMENT_SETS[key]
    if not key or ("gym" in key and "home" not in key):
        return None
    found = {"bodyweight"}
    for word, eq in (("dumbbell", "dumbbell"), ("barbell", "barbell"), ("kettlebell", "kettlebell"), ("band", "band"),
                     ("ring", "rings"), ("cable", "cable"), ("machine", "machine"), ("parallette", "parallettes")):
        if word in key:
            found.add(eq)
    return found


# ─── Prescriptions ───────────────────────────────────────────────

P, S, M, I, C = (ExerciseCategory.PRIMARY_COMPOUND, ExerciseCategory.SECONDARY_COMPOUND,
                 ExerciseCategory.MACHINE_COMPOUND, ExerciseCategory.ISOLATION, ExerciseCategory.CORE)

# goal -> category -> (sets, reps, rest, tempo, rir)
_TABLE: Dict[str, Dict[ExerciseCategory, tuple]] = {
    "strength": {
        P: (5, "3-5", "3 min", "20X1", "1-2"), S: (4, "5-8", "2-3 min", "2010", "1-2"),
        M: (3, "8-10", "2 min", "2011", "1-2"), I: (3, "10-12", "90s", "2011", "1"), C: (3, "8-12", "60s", "2011", "1-2"),
    },
    "hypertrophy": {
        P: (4, "6-10", "2-3 min", "3010", "1-2"), S: (3, "8-12", "2 min", "3010", "1-2"),
        M: (3, "10-12", "90s", "3011", "0-1"), I: (3, "12-15", "60-90s", "2011", "0-1"), C: (3, "10-15", "60s", "2011", "1"),
    },
    "endurance": {
        P: (3, "12-15", "90s", "2010", "2-3"), S: (3, "12-15", "75s", "2010", "2"),
        M: (3, "15-20", "60s", "2010", "1-2"), I: (2, "15-20", "45s", "2010", "1"), C: (3, "15-20", "45s", "2010", "1-2"),
    },
    "fat_loss": {
        P: (3, "8-12", "90s", "2010", "1-2"), S: (3, "10-12", "75s", "2010", "1-2"),
        M: (3, "12-15", "60s", "2011", "1"), I: (3, "12-15", "45-60s", "2011", "0-1"), C: (3, "12-20", "45s", "2010", "1"),
    },
    "calisthenics": {
        P: (4, "5-8", "2-3 min", "2010", "1-2"), S: (3, "8-12", "2 min", "2010", "1-2"),
        M: (3, "10-12", "90s", "2011", "1"), I: (3, "10-15", "60s", "2011", "1"), C: (3, "8-12", "60s", "2011", "1-2"),
    },
}

_HOLD = re.compile(r"hold|plank|l-sit|lever(?! raise)|flag", re.I)


def _table_category(category: ExerciseCategory) -> ExerciseCategory:
    if category in (P, S, M, I, C):
        return category
    return C if category in (ExerciseCategory.SKILL, ExerciseCategory.CORRECTIVE) else S


def prescribe(ex: ExerciseMetadata, goal: str, experience: str) -> dict:
    """Sets/reps/rest/tempo/cues for one exercise."""
    cat = _table_category(ex.category)
    if cat == I and ex.cns_load >= 6:  # hard "isolations" (Nordics) need compound rep ranges
        cat = S
    sets, reps, rest, tempo, rir = _TABLE.get(goal, _TABLE["hypertrophy"])[cat]
    if experience == "beginner" and cat in (P, S):
        sets = max(3, sets - 1)
        if goal == "strength" and cat == P:
            reps = "5"
    elif experience == "advanced" and cat in (P, S) and goal in ("hypertrophy", "calisthenics"):
        sets += 1
    if _HOLD.search(ex.name):
        reps_text = "20-40s" if goal in ("endurance", "fat_loss") else "10-30s"
        return _exercise(ex, f"{sets} x {reps_text}", rest, "", rir, goal, hold=True)
    return _exercise(ex, f"{sets} x {reps}", rest, tempo, rir, goal)


def _pretty(muscle: str) -> str:
    return muscle.replace("_", " ")


def _exercise(ex: ExerciseMetadata, sets: str, rest: str, tempo: str, rir: str, goal: str, hold: bool = False) -> dict:
    cues = [f"Target: {', '.join(_pretty(m) for m in ex.primary_muscles[:3])}"]
    cues.append(f"Stop {rir} reps short of failure" if not hold else "Hold with perfect form; end the set before it breaks")
    compound = ex.category in (P, S, M)
    if ex.equipment in ("bodyweight", "rings", "parallettes"):
        cues.append("Progress: add reps each week, then a harder variation or added weight at the top of the range")
    elif goal == "strength" and compound:
        cues.append("Progress: add 2.5 kg once every set hits the top of the rep range")
    else:
        cues.append("Double progression: reach the top of the rep range on all sets, then add load")
    if goal == "fat_loss" and not compound:
        cues.append("Short rest - superset with the next exercise if time is tight")
    return {"name": ex.name, "sets": sets, "tempo": tempo, "rest": rest, "cues": cues, "yt": ""}


def _rest_seconds(rest: str) -> float:
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", rest or "")]
    if not nums:
        return 60
    avg = sum(nums) / len(nums)
    return avg * 60 if "min" in rest else avg


# Productive hard sets per session before quality drops off.
MAX_SESSION_SETS = {"beginner": 16, "intermediate": 22, "advanced": 26}


def estimate_minutes(exercise: dict) -> float:
    """Working time for an exercise: sets × (work + rest) plus setup."""
    sets_text = exercise.get("sets") or ""
    m = re.match(r"\s*(\d+)", sets_text)
    sets = int(m.group(1)) if m else 3
    hold = re.search(r"(\d+)\s*s\b", sets_text)
    work = min(60, int(hold.group(1))) + 10 if hold else 40
    if "each" in sets_text:
        work *= 2
    return sets * (work + _rest_seconds(exercise.get("rest", ""))) / 60 + 1


# ─── Injuries ────────────────────────────────────────────────────

# joint -> (pattern, load attribute, hard limit, soft limit, skills to skip, exercise-name pattern)
INJURY_RULES = {
    "shoulder": (r"shoulder|rotator|impingement|labrum|\bac joint", "shoulder_load", 8, 6,
                 {"planche", "handstand", "front_lever", "back_lever", "muscle_up", "human_flag"}, r"dip|handstand|behind the neck"),
    "knee": (r"knee|\bacl\b|\bmcl\b|menisc|patell|jumper", "knee_load", 9, 7, {"pistol_squat"}, r"sissy|pistol|shrimp|jump"),
    "lower_back": (r"lower back|low back|lumbar|\bdiscs?\b|herniat|sciatica|spine|spinal|back pain|slipped", "spine_load", 7, 5,
                   {"human_flag"}, r"good morning"),
    "elbow": (r"elbow|tennis|golfer", "elbow_load", 7, 5, {"planche", "back_lever", "muscle_up"}, r"skull|tiger bend"),
    "wrist": (r"wrist|carpal", "", 0, 0, {"planche", "handstand", "l_sit"}, r"handstand|planche|tiger bend"),
    "hip": (r"\bhips?\b|groin|hip flexor", "hip_load", 9, 7, set(), r""),
}


def detect_injuries(text: str) -> List[str]:
    lowered = (text or "").lower()
    if re.fullmatch(r"\s*(none|no|n/?a|nothing|-)?\s*", lowered):
        return []
    return [joint for joint, rule in INJURY_RULES.items() if re.search(rule[0], lowered)]


def injury_excluded(ex: ExerciseMetadata, injuries: Iterable[str]) -> bool:
    for joint in injuries:
        _, attr, hard, _, _, name_pattern = INJURY_RULES[joint]
        if attr and getattr(ex, attr, 0) >= hard:
            return True
        if name_pattern and re.search(name_pattern, ex.name, re.I):
            return True
    return False


def injury_penalty(ex: ExerciseMetadata, injuries: Iterable[str]) -> int:
    penalty = 0
    for joint in injuries:
        _, attr, _, soft, _, _ = INJURY_RULES[joint]
        if attr and getattr(ex, attr, 0) >= soft:
            penalty += 25
    return penalty


def skills_blocked(injuries: Iterable[str]) -> Set[str]:
    blocked: Set[str] = set()
    for joint in injuries:
        blocked |= INJURY_RULES[joint][4]
    return blocked


# ─── Muscles ─────────────────────────────────────────────────────

MUSCLE_ALIASES = {
    "chest": ["chest", "upper_chest"], "pecs": ["chest", "upper_chest"], "upper chest": ["upper_chest"],
    "back": ["lats", "rhomboids", "upper_back"], "lats": ["lats"], "upper back": ["rhomboids", "upper_back", "rear_delt"],
    "shoulders": ["front_delt", "lateral_delt", "rear_delt"], "delts": ["front_delt", "lateral_delt", "rear_delt"],
    "side delts": ["lateral_delt"], "rear delts": ["rear_delt"],
    "arms": ["biceps", "triceps"], "biceps": ["biceps", "brachialis"], "triceps": ["triceps"], "forearms": ["forearms"],
    "legs": ["quads", "hamstrings", "glutes"], "quads": ["quads"], "hamstrings": ["hamstrings"],
    "glutes": ["glutes"], "butt": ["glutes"], "calves": ["calves"],
    "core": ["core", "obliques"], "abs": ["core", "obliques"], "traps": ["traps"],
}


def priority_muscles(names: Iterable[str], text: str = "") -> Set[str]:
    """Canonical DB muscle names from blueprint priorities and phrases like 'bigger arms'."""
    found: Set[str] = set()
    for name in names or []:
        key = str(name).lower().replace("_", " ").strip()
        found.update(MUSCLE_ALIASES.get(key, [key.replace(" ", "_")]))
    lowered = (text or "").lower()
    for phrase, muscles in MUSCLE_ALIASES.items():
        if re.search(rf"(bigger|stronger|grow|build|weak|lagging|focus on|prioriti[sz]e|more)\s+(my\s+)?{phrase}\b", lowered):
            found.update(muscles)
    return found


def match_exercise_names(names: Iterable[str], pool: Iterable[ExerciseMetadata], max_per_name: int = 6) -> Set[str]:
    """Resolves loose names ('deadlifts', 'bench') to exact DB names; generic words ('press') are ignored."""
    pool = list(pool)
    out: Set[str] = set()
    for raw in names or []:
        q = re.sub(r"s\b", "", str(raw).lower()).strip()
        if len(q) < 3:
            continue
        hits = []
        for ex in pool:
            n = re.sub(r"s\b", "", ex.name.lower())
            if n == q:
                hits = [ex.name]
                break
            if re.search(rf"(^|[\s-]){re.escape(q)}($|[\s-])", n):
                hits.append(ex.name)
        if len(hits) <= max_per_name:
            out.update(hits)
    return out
