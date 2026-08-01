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
    "push_pull_legs": [
        {
            "title": "Push Day",
            "slots": [
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.VERTICAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION)
            ],
            "warmup_focus": ["chest", "shoulders"],
            "muscles_trained": ["chest", "shoulders", "triceps"]
        },
        {
            "title": "Pull Day",
            "slots": [
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.VERTICAL_PULL, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.MACHINE_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_SHOULDERS, ExerciseCategory.ISOLATION) # Rear delts usually fall here
            ],
            "warmup_focus": ["back", "arms"],
            "muscles_trained": ["back", "biceps", "rear_delt"]
        },
        {
            "title": "Leg Day",
            "slots": [
                (MovementPattern.SQUAT, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HINGE, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.LUNGE, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_LEGS, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE)
            ],
            "warmup_focus": ["squat", "legs"],
            "muscles_trained": ["quads", "hamstrings", "glutes", "calves", "core"]
        }
    ],
    "upper_lower": [
        {
            "title": "Upper Body",
            "slots": [
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.VERTICAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.VERTICAL_PULL, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.ISOLATION_TRICEPS, ExerciseCategory.ISOLATION)
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
                (MovementPattern.CORE, ExerciseCategory.CORE)
            ],
            "warmup_focus": ["squat", "deadlift", "legs"],
            "muscles_trained": ["quads", "hamstrings", "glutes", "calves", "core"]
        }
    ],
    "full_body": [
        {
            "title": "Full Body",
            "slots": [
                (MovementPattern.SQUAT, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND),
                (MovementPattern.HINGE, ExerciseCategory.SECONDARY_COMPOUND),
                (MovementPattern.ISOLATION_BICEPS, ExerciseCategory.ISOLATION),
                (MovementPattern.CORE, ExerciseCategory.CORE)
            ],
            "warmup_focus": ["full_body"],
            "muscles_trained": ["full_body"]
        }
    ]
}

def get_day_templates(split_key: str, days: int) -> List[Dict]:
    base_templates = SPLIT_TEMPLATES.get(split_key)
    if not base_templates:
        base_templates = SPLIT_TEMPLATES["upper_lower"]
        
    result = []
    for i in range(days):
        template = dict(base_templates[i % len(base_templates)])
        result.append(template)
    return result

def assemble_plan(blueprint: Dict[str, Any], user_request: Dict[str, Any]) -> Dict[str, Any]:
    goal = user_request.get("goal", "Hypertrophy").lower().replace(" ", "_")
    days = user_request.get("days", 4)
    equipment = user_request.get("equipment", "Full Gym")
    experience = user_request.get("experience", "intermediate").lower()
    
    # 1. Initialize Expert Systems
    fatigue_mgr = FatigueManager()
    vol_tracker = VolumeTracker(goal, experience)
    available_exs = get_exercises_for_equipment(equipment)
    
    split_type = blueprint.get("split_type", "upper_lower")
    
    # ── Override bad LLM decisions ──
    # If it's a 6-day split, force PPL to avoid Upper/Lower burnout
    if days >= 6:
        split_type = "push_pull_legs"
        
    split_key = split_type.lower().replace(" ", "_").replace("-", "_")
    split_aliases = {
        "push_pull_legs": "push_pull_legs", "ppl": "push_pull_legs",
        "upper_lower": "upper_lower", "ul": "upper_lower",
        "full_body": "full_body"
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
        for pattern, category in template["slots"]:
            # Score all available exercises for this slot
            scored = []
            for ex in available_exs:
                score = score_exercise(ex, pattern, category, goal, experience, fatigue_mgr, cycle_used)
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
                
        # ── COOLDOWN ──
        cooldown = get_cooldown_for_day(template["muscles_trained"])
        
        # Calculate accurate estimated time
        base_time = 10 + (len(strength_exercises) * 10) + (len(skill_exercises) * 5)
        est_time = f"{max(30, base_time - 10)}-{base_time + 10} min"
        
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
