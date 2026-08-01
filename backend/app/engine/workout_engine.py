"""
Apparatus AI — Workout Engine
Deterministic plan assembler that takes an LLM coaching blueprint
and produces a complete, scientifically-sound workout plan from the exercise database.

Flow: LLM Blueprint → Exercise Selection → Ordering → Sets/Reps → Warmup → Cooldown → Final JSON
"""

import random
import logging
from typing import Dict, List, Any, Optional

from app.data.exercise_db import EXERCISES, EQUIPMENT_MAP, get_exercises_for_equipment
from app.data.skill_progressions import get_skill_exercises, detect_skills_from_text
from app.data.warmup_cooldown_db import get_warmup_for_day, get_cooldown_for_day

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════
# SCIENTIFIC PROGRAMMING RULES
# ═══════════════════════════════════════════════════════════

GOAL_PARAMS = {
    "hypertrophy": {
        "compound_sets": "3 x 10",
        "compound_rest": "90s",
        "compound_tempo": "2010",
        "accessory_sets": "3 x 12",
        "accessory_rest": "60s",
        "accessory_tempo": "2011",
        "isolation_sets": "3 x 15",
        "isolation_rest": "45s",
        "isolation_tempo": "2010",
        "core_sets": "3 x 15",
        "core_rest": "30s",
    },
    "strength": {
        "compound_sets": "5 x 5",
        "compound_rest": "180s",
        "compound_tempo": "2010",
        "accessory_sets": "4 x 6",
        "accessory_rest": "120s",
        "accessory_tempo": "2010",
        "isolation_sets": "3 x 10",
        "isolation_rest": "60s",
        "isolation_tempo": "2010",
        "core_sets": "3 x 10",
        "core_rest": "45s",
    },
    "endurance": {
        "compound_sets": "3 x 15",
        "compound_rest": "45s",
        "compound_tempo": "1010",
        "accessory_sets": "3 x 15",
        "accessory_rest": "30s",
        "accessory_tempo": "1010",
        "isolation_sets": "2 x 20",
        "isolation_rest": "30s",
        "isolation_tempo": "1010",
        "core_sets": "3 x 20",
        "core_rest": "20s",
    },
    "weight_loss": {
        "compound_sets": "3 x 12",
        "compound_rest": "60s",
        "compound_tempo": "2010",
        "accessory_sets": "3 x 12",
        "accessory_rest": "45s",
        "accessory_tempo": "2010",
        "isolation_sets": "2 x 15",
        "isolation_rest": "30s",
        "isolation_tempo": "2010",
        "core_sets": "3 x 15",
        "core_rest": "30s",
    },
}

# Default split selections based on day count
DEFAULT_SPLITS = {
    2: "full_body",
    3: "full_body",     # or push_pull_legs
    4: "upper_lower",
    5: "ppl_ul",
    6: "ppl_ppl",
}

# Split templates — what muscle groups to focus on each day
SPLIT_TEMPLATES = {
    "full_body": lambda n: [
        {"title": f"Day {i+1} - Full Body {'A' if i % 2 == 0 else 'B'}",
         "focus": ["chest", "back", "legs"],
         "warmup_focus": ["full_body"],
         "categories": ["compound_push", "compound_pull", "squat_pattern", "hinge_pattern", "core"],
         "muscles_trained": ["chest", "back", "quads", "hamstrings", "glutes", "core"]}
        for i in range(n)
    ],
    "upper_lower": lambda n: [
        {"title": f"Day {i+1} - {'Upper' if i % 2 == 0 else 'Lower'} Body",
         "focus": ["chest", "back", "shoulders"] if i % 2 == 0 else ["legs"],
         "warmup_focus": ["upper_body"] if i % 2 == 0 else ["legs"],
         "categories": ["compound_push", "compound_pull", "isolation_shoulder", "isolation_arms", "core"] if i % 2 == 0
                        else ["squat_pattern", "hinge_pattern", "lunge_pattern", "isolation_legs", "core"],
         "muscles_trained": ["chest", "back", "shoulders", "triceps", "biceps"] if i % 2 == 0
                            else ["quads", "hamstrings", "glutes", "calves", "core"]}
        for i in range(n)
    ],
    "push_pull_legs": lambda n: [
        {"title": f"Day {i+1} - {['Push', 'Pull', 'Legs'][i % 3]}",
         "focus": [["chest", "shoulders"], ["back"], ["legs"]][i % 3],
         "warmup_focus": [["chest", "shoulders"], ["back"], ["squat", "legs"]][i % 3],
         "categories": [
             ["compound_push", "isolation_shoulder", "isolation_chest", "isolation_arms"],
             ["compound_pull", "isolation_arms", "isolation_shoulder"],
             ["squat_pattern", "hinge_pattern", "lunge_pattern", "isolation_legs"],
         ][i % 3],
         "muscles_trained": [
             ["chest", "shoulders", "triceps"],
             ["back", "biceps", "rear_delt"],
             ["quads", "hamstrings", "glutes", "calves"],
         ][i % 3]}
        for i in range(n)
    ],
    "ppl_ul": lambda n: [
        *[{"title": f"Day {i+1} - {['Push', 'Pull', 'Legs'][i]}",
           "focus": [["chest", "shoulders"], ["back"], ["legs"]][i],
           "warmup_focus": [["chest", "shoulders"], ["back"], ["squat", "legs"]][i],
           "categories": [
               ["compound_push", "isolation_shoulder", "isolation_chest", "isolation_arms"],
               ["compound_pull", "isolation_arms", "isolation_shoulder"],
               ["squat_pattern", "hinge_pattern", "lunge_pattern", "isolation_legs"],
           ][i],
           "muscles_trained": [
               ["chest", "shoulders", "triceps"],
               ["back", "biceps"],
               ["quads", "hamstrings", "glutes", "calves"],
           ][i]}
         for i in range(3)],
        {"title": f"Day 4 - Upper Body",
         "focus": ["chest", "back", "shoulders"],
         "warmup_focus": ["upper_body"],
         "categories": ["compound_push", "compound_pull", "isolation_shoulder", "isolation_arms"],
         "muscles_trained": ["chest", "back", "shoulders", "triceps", "biceps"]},
        {"title": f"Day 5 - Lower Body",
         "focus": ["legs"],
         "warmup_focus": ["legs"],
         "categories": ["squat_pattern", "hinge_pattern", "lunge_pattern", "isolation_legs", "core"],
         "muscles_trained": ["quads", "hamstrings", "glutes", "calves", "core"]},
    ],
    "ppl_ppl": lambda n: [
        {"title": f"Day {i+1} - {['Push', 'Pull', 'Legs'][i % 3]} {'(Heavy)' if i < 3 else '(Volume)'}",
         "focus": [["chest", "shoulders"], ["back"], ["legs"]][i % 3],
         "warmup_focus": [["chest", "shoulders"], ["back"], ["squat", "legs"]][i % 3],
         "categories": [
             ["compound_push", "isolation_shoulder", "isolation_chest", "isolation_arms"],
             ["compound_pull", "isolation_arms", "isolation_shoulder"],
             ["squat_pattern", "hinge_pattern", "lunge_pattern", "isolation_legs"],
         ][i % 3],
         "muscles_trained": [
             ["chest", "shoulders", "triceps"],
             ["back", "biceps"],
             ["quads", "hamstrings", "glutes", "calves"],
         ][i % 3]}
        for i in range(n)
    ],
}


def _format_exercise(ex: Dict, params: Dict, ex_type: str = "compound") -> Dict:
    """Format an exercise entry with the correct sets/reps/tempo/rest for the goal."""
    key = "compound" if ex_type in ("compound", "power") else ("isolation" if ex_type == "isolation" else "accessory" if ex_type == "accessory" else "core")
    return {
        "name": ex["name"],
        "sets": params.get(f"{key}_sets", "3 x 10"),
        "tempo": params.get(f"{key}_tempo", "2010"),
        "rest": params.get(f"{key}_rest", "60s"),
        "cues": ex.get("cues", []),
        "yt": "",
    }


def _select_exercises(
    category: str,
    available: Dict[str, list],
    count: int,
    used_names: set,
    difficulty: str = "intermediate"
) -> list:
    """Select exercises from a category, avoiding duplicates and respecting difficulty."""
    pool = available.get(category, [])
    
    # Filter by difficulty
    diff_order = {"beginner": 0, "intermediate": 1, "advanced": 2}
    max_diff = diff_order.get(difficulty, 1)
    pool = [ex for ex in pool if diff_order.get(ex.get("difficulty", "beginner"), 0) <= max_diff]
    
    # Remove already-used exercises
    pool = [ex for ex in pool if ex["name"] not in used_names]
    
    if not pool:
        return []
    
    # Shuffle for variety
    random.shuffle(pool)
    selected = pool[:count]
    
    for ex in selected:
        used_names.add(ex["name"])
    
    return selected


def assemble_plan(blueprint: Dict[str, Any], user_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Assemble a complete workout plan from an LLM coaching blueprint.
    
    blueprint: The LLM's coaching decisions (split type, muscle focus, volume, skills)
    user_request: The original user request (goal, days, equipment, customInfo, experience)
    
    Returns: A complete plan dict ready for JSON serialization.
    """
    goal = user_request.get("goal", "Hypertrophy").lower().replace(" ", "_")
    days = user_request.get("days", 4)
    equipment = user_request.get("equipment", "Full Gym")
    experience = user_request.get("experience", "intermediate").lower()
    custom_info = user_request.get("customInfo", "")
    session_duration = user_request.get("sessionDuration", 60)
    
    # Get goal parameters
    params = GOAL_PARAMS.get(goal, GOAL_PARAMS["hypertrophy"])
    
    # Get the split from the blueprint (LLM decides), with fallback
    split_type = blueprint.get("split_type", DEFAULT_SPLITS.get(days, "upper_lower"))
    
    # Normalize split type
    split_key = split_type.lower().replace(" ", "_").replace("/", "_").replace("-", "_")
    
    # Map common LLM outputs to our template keys
    split_aliases = {
        "push_pull_legs": "push_pull_legs", "ppl": "push_pull_legs",
        "upper_lower": "upper_lower", "ul": "upper_lower",
        "full_body": "full_body", "fullbody": "full_body",
        "ppl_ppl": "ppl_ppl", "pplppl": "ppl_ppl",
        "ppl_ul": "ppl_ul", "pplul": "ppl_ul",
    }
    split_key = split_aliases.get(split_key, split_key)
    
    # Fallback if LLM returned unknown split
    if split_key not in SPLIT_TEMPLATES:
        split_key = DEFAULT_SPLITS.get(days, "upper_lower")
    
    # Generate the day templates
    template_fn = SPLIT_TEMPLATES[split_key]
    day_templates = template_fn(days)
    
    # Get available exercises for the equipment
    available = get_exercises_for_equipment(equipment)
    
    # Detect skills from custom info
    requested_skills = detect_skills_from_text(custom_info)
    # Also check blueprint for skills
    blueprint_skills = blueprint.get("skills", [])
    all_skills = list(set(requested_skills + blueprint_skills))
    
    # Track used exercise names globally to avoid duplicates
    global_used = set()
    
    # Override day titles from blueprint if provided
    blueprint_days = blueprint.get("days", [])
    
    # Build each day
    assembled_days = []
    for i, template in enumerate(day_templates):
        # Use blueprint title if available, otherwise template
        bp_day = blueprint_days[i] if i < len(blueprint_days) else {}
        day_title = bp_day.get("title", template["title"])
        
        # Determine exercise count based on session duration
        if session_duration <= 30:
            main_count, accessory_count, iso_count = 2, 1, 0
        elif session_duration <= 45:
            main_count, accessory_count, iso_count = 2, 1, 1
        elif session_duration <= 60:
            main_count, accessory_count, iso_count = 2, 2, 1
        elif session_duration <= 75:
            main_count, accessory_count, iso_count = 3, 2, 2
        else:
            main_count, accessory_count, iso_count = 3, 3, 2
        
        # Track per-day used names (allow some reuse across days)
        day_used = set()
        
        # ── WARMUP ──
        warmup = get_warmup_for_day(template["warmup_focus"])
        
        # ── SKILL WORK ──
        skill_exercises = []
        if all_skills:
            for skill in all_skills:
                skill_exs = get_skill_exercises(skill, experience)
                for sex in skill_exs:
                    if sex["name"] not in day_used:
                        skill_exercises.append({
                            "name": sex["name"],
                            "sets": sex.get("sets", "3 x 5"),
                            "tempo": "",
                            "rest": sex.get("rest", "90s"),
                            "cues": sex.get("cues", []),
                            "yt": "",
                        })
                        day_used.add(sex["name"])
            # Distribute skills: not every day needs every skill
            # Alternate skills across days
            if len(skill_exercises) > 3:
                start = (i * 2) % len(skill_exercises)
                skill_exercises = skill_exercises[start:start + 3] or skill_exercises[:3]
        
        # ── STRENGTH (main exercises) ──
        strength_exercises = []
        categories = template["categories"]
        
        # Primary compounds first
        compound_cats = [c for c in categories if "compound" in c or "squat" in c or "hinge" in c or "lunge" in c]
        accessory_cats = [c for c in categories if "isolation" in c]
        
        for cat in compound_cats[:2]:  # Max 2 compound categories
            selected = _select_exercises(cat, available, main_count, day_used, experience)
            for ex in selected:
                strength_exercises.append(_format_exercise(ex, params, "compound"))
        
        # Accessories
        for cat in accessory_cats:
            selected = _select_exercises(cat, available, iso_count, day_used, experience)
            for ex in selected:
                strength_exercises.append(_format_exercise(ex, params, "isolation"))
        
        # Core (add 1-2 core exercises if there's room)
        if "core" in categories or len(strength_exercises) < 4:
            core_exs = _select_exercises("core", available, 1, day_used, experience)
            for ex in core_exs:
                strength_exercises.append(_format_exercise(ex, params, "core"))
        
        # ── COOLDOWN ──
        cooldown = get_cooldown_for_day(template["muscles_trained"])
        
        # Calculate estimated time
        ex_count = len(warmup) + len(skill_exercises) + len(strength_exercises) + len(cooldown)
        est_time = f"{max(30, ex_count * 4)}-{max(45, ex_count * 6)} min"
        
        assembled_days.append({
            "dayNumber": i + 1,
            "title": day_title,
            "time": est_time,
            "warmup": warmup,
            "skillWork": skill_exercises,
            "strength": strength_exercises,
            "cooldown": cooldown,
        })
    
    # Use blueprint title/description if provided
    title = blueprint.get("title", f"{goal.replace('_', ' ').title()} Program")
    description = blueprint.get("description", f"A {days}-day {goal.replace('_', ' ')} program tailored for {equipment}.")
    
    return {
        "title": title,
        "description": description,
        "days": assembled_days,
    }
