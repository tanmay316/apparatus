from typing import Dict, Any, List
import random

from app.engine.models import MovementPattern, ExerciseCategory
from app.data.exercise_db import get_exercises_for_equipment
from app.engine.scoring import score_exercise
from app.engine.fatigue_manager import FatigueManager
from app.engine.weekly_volume import VolumeTracker
from app.data.warmup_cooldown_db import get_warmup_for_day, get_cooldown_for_day
from app.data.skill_progressions import get_skill_exercises

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

def get_estimated_duration(category: ExerciseCategory, goal: str) -> int:
    """Returns estimated time in minutes for an exercise based on its category and goal."""
    if category == ExerciseCategory.PRIMARY_COMPOUND:
        return 12 if goal == "strength" else 10
    elif category == ExerciseCategory.SECONDARY_COMPOUND:
        return 10 if goal == "strength" else 8
    elif category == ExerciseCategory.MACHINE_COMPOUND:
        return 7
    else: # Isolation or Core
        return 5

def assemble_plan(blueprint: Dict[str, Any], user_request: Dict[str, Any]) -> Dict[str, Any]:
    goal = user_request.get("goal", "Hypertrophy").lower().replace(" ", "_")
    days = user_request.get("days", 4)
    equipment = user_request.get("equipment", "Full Gym")
    experience = user_request.get("experience", "intermediate").lower()
    
    session_duration = user_request.get("sessionDuration", 60)
    if isinstance(session_duration, str):
        try:
            session_duration = int(session_duration)
        except ValueError:
            session_duration = 60
            
    # Time available for strength training (warmups and cooldowns are extra)
    time_budget = session_duration
    
    # 1. Initialize Expert Systems
    fatigue_mgr = FatigueManager()
    vol_tracker = VolumeTracker(goal, experience)
    available_exs = get_exercises_for_equipment(equipment)
    
    split_type = blueprint.get("split_type", "upper_lower")
    
    # ── Override bad LLM decisions (Elite Coaching) ──
    if days == 3:
        split_type = "full_body"
    elif days == 4:
        split_type = "upper_lower"
    elif days == 5:
        split_type = "phat"
    elif days >= 6:
        split_type = "push_pull_legs"
        
    split_key = split_type.lower().replace(" ", "_").replace("-", "_")
    split_aliases = {
        "push_pull_legs": "push_pull_legs", "ppl": "push_pull_legs",
        "upper_lower": "upper_lower", "ul": "upper_lower",
        "full_body": "full_body",
        "phat": "phat"
    }
    split_key = split_aliases.get(split_key, "upper_lower")
    day_templates = get_day_templates(split_key, days)
    
    # Requested skills
    skills_req = user_request.get("customInfo", "").lower()
    requested_skills = []
    for s in ["planche", "front lever", "handstand", "muscle up", "l-sit", "pistol squat"]:
        if s.replace(" ", "") in skills_req.replace(" ", ""):
            requested_skills.append(s)
            
    blueprint_skills = blueprint.get("skills", [])
    all_skills = list(set(requested_skills + blueprint_skills))
    
    cycle_used = set()
    assembled_days = []
    
    for i, template in enumerate(day_templates):
        # Reset cycle used every 3 days (e.g. for PPL 1 vs PPL 2)
        if i > 0 and i % 3 == 0:
            cycle_used.clear()
            
        day_used = set()
        
        # ── WARMUP ──
        warmup = get_warmup_for_day(template["warmup_focus"])
        
        # ── SKILL WORK ──
        skill_exercises = []
        is_upper_day = any(m in template["warmup_focus"] for m in ["chest", "shoulders", "back", "arms", "upper_body", "full_body"])
        
        for skill in all_skills:
            if fatigue_mgr.can_train_skill(skill, max_frequency=2):
                # Ensure handstands/planche only happen on upper body days, and pistols on leg days
                is_leg_skill = skill in ["pistol squat", "shrimp squat"]
                if (is_upper_day and not is_leg_skill) or (not is_upper_day and is_leg_skill):
                    skill_exs = get_skill_exercises(skill, experience)
                    for sex in skill_exs[:2]:
                        if sex["name"] not in day_used:
                            skill_exercises.append({
                                "name": sex["name"],
                                "sets": sex.get("sets", "3 x 5"),
                                "tempo": "",
                                "rest": sex.get("rest", "90s"),
                                "cues": sex.get("cues", []),
                                "yt": ""
                            })
                            day_used.add(sex["name"])
                    fatigue_mgr.register_skill_session(skill)
                    # Max 1 skill per day
                    break
                
        # ── STRENGTH ──
        strength_exercises = []
        accumulated_time = 0
        
        for pattern, category in template["slots"]:
            ex_duration = get_estimated_duration(category, goal)
            
            # If we're out of time budget (allowing a 5-min grace period) and already have >=3 exercises, stop adding.
            if accumulated_time + ex_duration > time_budget + 5 and len(strength_exercises) >= 3:
                break
                
            # Score all available exercises for this slot
            scored = []
            for ex in available_exs:
                score = score_exercise(ex, pattern, category, goal, experience, fatigue_mgr, vol_tracker, cycle_used)
                if score > 0:
                    scored.append((score, ex))
                    
            if scored:
                # Sort by score descending
                scored.sort(key=lambda x: x[0], reverse=True)
                # Pick the top exercise
                best_ex = scored[0][1]
                
                # Format sets/reps based on goal
                sets = "3 x 8-12" if goal == "hypertrophy" else "5 x 5" if category == ExerciseCategory.PRIMARY_COMPOUND else "3 x 10"
                rest = "90s" if goal == "hypertrophy" else "3 min"
                
                strength_exercises.append({
                    "name": best_ex.name,
                    "sets": sets,
                    "tempo": "31X1" if category == ExerciseCategory.PRIMARY_COMPOUND else "2011",
                    "rest": rest,
                    "cues": [f"Focus on {best_ex.primary_muscles[0]}"],
                    "yt": ""
                })
                
                cycle_used.add(best_ex.name)
                fatigue_mgr.add_exercise_fatigue(best_ex)
                vol_tracker.add_sets(best_ex.primary_muscles, 3)
                accumulated_time += ex_duration
                
        # ── COOLDOWN ──
        cooldown = get_cooldown_for_day(template["muscles_trained"])
        
        # Calculate accurate estimated time (excluding warmup/cooldown as requested)
        base_time = accumulated_time + (len(skill_exercises) * 5)
        est_time = f"{max(20, base_time - 5)}-{base_time + 10} min"
        
        assembled_days.append({
            "dayNumber": i + 1,
            "title": template["title"],
            "time": est_time,
            "warmup": warmup,
            "skillWork": skill_exercises,
            "strength": strength_exercises,
            "cooldown": cooldown
        })
        
    return {
        "title": blueprint.get("title", f"{goal.replace('_', ' ').title()} Program"),
        "description": blueprint.get("description", "A deterministically built, expert-level training program."),
        "days": assembled_days
    }
