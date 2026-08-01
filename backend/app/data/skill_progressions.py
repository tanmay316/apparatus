"""
Apparatus AI — Calisthenics Skill Progression Trees
Each skill has a logical progression from beginner to advanced.
Used by the workout engine to select the correct progression step based on user experience.
"""

from typing import Dict, List

# Each progression is ordered from easiest to hardest.
# The engine picks the appropriate level based on user experience.
SKILL_PROGRESSIONS: Dict[str, List[Dict]] = {
    "planche": [
        {"name": "Planche Lean", "sets": "4 x 15s", "rest": "60s", "difficulty": "beginner", "cues": ["Lean forward on palms", "Protract scapulae", "Squeeze glutes"]},
        {"name": "Frog Stand", "sets": "4 x 15s", "rest": "60s", "difficulty": "beginner", "cues": ["Knees on elbows", "Lean forward", "Control the balance"]},
        {"name": "Tuck Planche", "sets": "5 x 8s", "rest": "90s", "difficulty": "intermediate", "cues": ["Round the back slightly", "Protract shoulders", "Hips at shoulder height"]},
        {"name": "Advanced Tuck Planche", "sets": "5 x 6s", "rest": "120s", "difficulty": "intermediate", "cues": ["Extend hips back", "Maintain protraction", "Keep arms straight"]},
        {"name": "Straddle Planche", "sets": "5 x 5s", "rest": "120s", "difficulty": "advanced", "cues": ["Open legs wide", "Push through shoulders", "Posterior pelvic tilt"]},
        {"name": "Full Planche", "sets": "5 x 3s", "rest": "180s", "difficulty": "advanced", "cues": ["Legs together", "Full body tension", "Maximum protraction"]},
    ],
    "front_lever": [
        {"name": "Tuck Front Lever", "sets": "4 x 10s", "rest": "90s", "difficulty": "beginner", "cues": ["Retract scapulae", "Tuck knees tight", "Depress shoulders"]},
        {"name": "Advanced Tuck Front Lever", "sets": "5 x 8s", "rest": "90s", "difficulty": "intermediate", "cues": ["Extend hips", "Keep back flat", "Pull shoulder blades together"]},
        {"name": "Straddle Front Lever", "sets": "5 x 5s", "rest": "120s", "difficulty": "intermediate", "cues": ["Open legs to reduce lever", "Retract and depress", "Body parallel to ground"]},
        {"name": "Full Front Lever", "sets": "5 x 3s", "rest": "120s", "difficulty": "advanced", "cues": ["Body perfectly straight", "Maximum lat engagement", "Depress and retract"]},
        {"name": "Front Lever Raise", "sets": "4 x 3", "rest": "120s", "difficulty": "advanced", "cues": ["Control the descent", "Straight arms throughout", "No kipping"]},
    ],
    "back_lever": [
        {"name": "Skin the Cat", "sets": "3 x 5", "rest": "60s", "difficulty": "beginner", "cues": ["Slow and controlled", "Full range of motion", "Build shoulder mobility"]},
        {"name": "Tuck Back Lever", "sets": "4 x 10s", "rest": "90s", "difficulty": "intermediate", "cues": ["Tuck knees", "Supinated grip", "Keep arms straight"]},
        {"name": "Full Back Lever", "sets": "4 x 5s", "rest": "120s", "difficulty": "advanced", "cues": ["Body straight", "Supinated or neutral grip", "Full body tension"]},
    ],
    "handstand": [
        {"name": "Wall Handstand Hold", "sets": "4 x 30s", "rest": "60s", "difficulty": "beginner", "cues": ["Chest to wall", "Squeeze glutes", "Push through shoulders"]},
        {"name": "Chest-to-Wall Handstand", "sets": "4 x 20s", "rest": "90s", "difficulty": "beginner", "cues": ["Fingers spread", "Look at hands", "Hollow body position"]},
        {"name": "Kick-Up to Handstand (Wall)", "sets": "5 x 3", "rest": "60s", "difficulty": "intermediate", "cues": ["Light kick", "Find balance", "Hold before touching wall"]},
        {"name": "Freestanding Handstand", "sets": "5 x 10s", "rest": "90s", "difficulty": "intermediate", "cues": ["Finger corrections", "Stacked alignment", "Hollow body"]},
        {"name": "Handstand Walk", "sets": "4 x 5m", "rest": "90s", "difficulty": "advanced", "cues": ["Shift weight side to side", "Small steps", "Keep core tight"]},
        {"name": "Press to Handstand", "sets": "4 x 3", "rest": "120s", "difficulty": "advanced", "cues": ["Lean forward slowly", "Compression strength", "Control throughout"]},
    ],
    "muscle_up": [
        {"name": "False Grip Hang", "sets": "4 x 15s", "rest": "60s", "difficulty": "beginner", "cues": ["Wrists over bar/rings", "Squeeze tight", "Build grip endurance"]},
        {"name": "High Pull-Ups", "sets": "4 x 5", "rest": "90s", "difficulty": "intermediate", "cues": ["Pull to sternum", "Explosive pull", "Keep elbows close"]},
        {"name": "Muscle-Up Transition (Band)", "sets": "4 x 5", "rest": "90s", "difficulty": "intermediate", "cues": ["Practice the transition", "Roll wrists over", "Lean forward at top"]},
        {"name": "Negative Muscle-Ups", "sets": "4 x 3", "rest": "120s", "difficulty": "intermediate", "cues": ["Start at top", "Slow 5s descent", "Control the transition"]},
        {"name": "Bar Muscle-Up", "sets": "4 x 3", "rest": "120s", "difficulty": "advanced", "cues": ["Explosive pull", "Lean forward", "Press out at top"]},
        {"name": "Ring Muscle-Up", "sets": "4 x 3", "rest": "120s", "difficulty": "advanced", "cues": ["False grip", "Deep pull", "Turn rings out at top"]},
    ],
    "l_sit": [
        {"name": "Tucked L-Sit", "sets": "4 x 15s", "rest": "45s", "difficulty": "beginner", "cues": ["Push down hard", "Lift hips", "Compress abs"]},
        {"name": "Single-Leg L-Sit", "sets": "4 x 10s each", "rest": "45s", "difficulty": "beginner", "cues": ["Alternate legs", "Push floor away", "Lock the knee"]},
        {"name": "L-Sit (Floor)", "sets": "4 x 10s", "rest": "60s", "difficulty": "intermediate", "cues": ["Straight legs", "Point toes", "Depress shoulders"]},
        {"name": "L-Sit (Parallettes)", "sets": "4 x 15s", "rest": "60s", "difficulty": "intermediate", "cues": ["Parallettes allow more ROM", "Push hard", "Keep legs parallel"]},
        {"name": "V-Sit", "sets": "4 x 5s", "rest": "90s", "difficulty": "advanced", "cues": ["Legs above horizontal", "Maximum compression", "Point toes"]},
    ],
    "pistol_squat": [
        {"name": "Assisted Pistol Squat (Band)", "sets": "3 x 8 each", "rest": "60s", "difficulty": "beginner", "cues": ["Hold band for support", "Full depth", "Drive through heel"]},
        {"name": "Pistol Squat to Box", "sets": "3 x 6 each", "rest": "60s", "difficulty": "intermediate", "cues": ["Sit to box", "Stand with control", "Extend non-working leg"]},
        {"name": "Pistol Squat (Counterweight)", "sets": "3 x 5 each", "rest": "90s", "difficulty": "intermediate", "cues": ["Hold weight in front", "Balance aid", "Full ROM"]},
        {"name": "Pistol Squat", "sets": "4 x 5 each", "rest": "90s", "difficulty": "advanced", "cues": ["Full depth", "Arms forward for balance", "Control the descent"]},
    ],
    "human_flag": [
        {"name": "Vertical Flag Hold", "sets": "4 x 10s", "rest": "90s", "difficulty": "intermediate", "cues": ["Body vertical", "Push-pull with arms", "Tight core"]},
        {"name": "Human Flag (Tuck)", "sets": "4 x 5s", "rest": "120s", "difficulty": "advanced", "cues": ["Tuck knees", "Push bottom arm", "Pull top arm"]},
        {"name": "Human Flag", "sets": "4 x 3s", "rest": "120s", "difficulty": "advanced", "cues": ["Body horizontal", "Maximum tension", "Squeeze obliques"]},
    ],
}


def get_skill_exercises(skill_name: str, experience: str = "intermediate") -> list:
    """
    Get the appropriate progression exercises for a skill based on user experience.
    Returns 2-3 exercises at the right difficulty level.
    """
    skill_key = skill_name.lower().replace(" ", "_").replace("-", "_")
    
    # Try to match the skill key
    progression = None
    for key, prog in SKILL_PROGRESSIONS.items():
        if key in skill_key or skill_key in key:
            progression = prog
            break
    
    if not progression:
        return []
    
    # Map experience to difficulty
    diff_map = {
        "beginner": ["beginner"],
        "intermediate": ["beginner", "intermediate"],
        "advanced": ["intermediate", "advanced"],
    }
    allowed_diffs = diff_map.get(experience, ["beginner", "intermediate"])
    
    # Get exercises at the appropriate level
    suitable = [ex for ex in progression if ex["difficulty"] in allowed_diffs]
    
    # Return the top 2-3 most advanced ones the user can handle
    if len(suitable) > 3:
        suitable = suitable[-3:]
    
    return suitable


def detect_skills_from_text(text: str) -> list:
    """Detect which calisthenics skills the user wants from their custom info text."""
    text_lower = text.lower()
    detected = []
    
    skill_keywords = {
        "planche": ["planche", "plance", "planch"],
        "front_lever": ["front lever", "frontlever"],
        "back_lever": ["back lever", "backlever"],
        "handstand": ["handstand", "hand stand", "hspu"],
        "muscle_up": ["muscle up", "muscleup", "muscle-up", "bar muscle", "ring muscle"],
        "l_sit": ["l-sit", "l sit", "lsit", "v-sit", "v sit"],
        "pistol_squat": ["pistol squat", "pistol", "single leg squat"],
        "human_flag": ["human flag", "flag hold"],
    }
    
    # Also detect generic calisthenics skill mentions
    generic_keywords = ["frog", "frog stand", "frog pose", "crow", "crow pose"]
    for kw in generic_keywords:
        if kw in text_lower and "planche" not in detected:
            detected.append("planche")  # Frog stand is a planche prerequisite
            break
    
    for skill, keywords in skill_keywords.items():
        for kw in keywords:
            if kw in text_lower:
                if skill not in detected:
                    detected.append(skill)
                break
    
    return detected
