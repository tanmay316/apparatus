"""
Apparatus AI — Movement-Specific Warmup & Cooldown Database
Warmups target the joints and muscles used in that day's main lifts.
Cooldowns stretch the specific muscles trained.
"""

from typing import Dict, List

# ═══════════════════════════════════════════════════════════
# WARMUP MAPS — keyed by the primary movement pattern of the day
# ═══════════════════════════════════════════════════════════
WARMUP_MAP: Dict[str, List[Dict]] = {
    "chest": [
        {"name": "Band Pull-Apart", "sets": "2 x 15", "tempo": "", "rest": "0s"},
        {"name": "Shoulder External Rotation", "sets": "2 x 10 each", "tempo": "slow", "rest": "0s"},
        {"name": "Push-Up Plus (Scap)", "sets": "2 x 10", "tempo": "", "rest": "0s"},
        {"name": "Arm Circles", "sets": "2 x 10 each direction", "tempo": "", "rest": "0s"},
        {"name": "Light Incline Push-Ups", "sets": "1 x 15", "tempo": "", "rest": "30s"},
    ],
    "back": [
        {"name": "Cat-Cow Stretch", "sets": "2 x 10", "tempo": "slow", "rest": "0s"},
        {"name": "Band Pull-Apart", "sets": "2 x 15", "tempo": "", "rest": "0s"},
        {"name": "Dead Hang", "sets": "2 x 20s", "tempo": "", "rest": "0s"},
        {"name": "Scapular Pull-Ups", "sets": "2 x 8", "tempo": "", "rest": "0s"},
        {"name": "Light Band Rows", "sets": "1 x 15", "tempo": "", "rest": "30s"},
    ],
    "shoulders": [
        {"name": "Band Dislocates", "sets": "2 x 10", "tempo": "slow", "rest": "0s"},
        {"name": "Shoulder CARs", "sets": "2 x 5 each", "tempo": "slow", "rest": "0s"},
        {"name": "Band Face Pull", "sets": "2 x 12", "tempo": "", "rest": "0s"},
        {"name": "Arm Circles", "sets": "2 x 10 each direction", "tempo": "", "rest": "0s"},
        {"name": "Light Lateral Raise", "sets": "1 x 15", "tempo": "", "rest": "30s"},
    ],
    "squat": [
        {"name": "Hip Circles", "sets": "2 x 10 each", "tempo": "slow", "rest": "0s"},
        {"name": "Ankle Circles", "sets": "2 x 10 each", "tempo": "", "rest": "0s"},
        {"name": "Bodyweight Squat", "sets": "2 x 10", "tempo": "controlled", "rest": "0s"},
        {"name": "Glute Bridge", "sets": "2 x 10", "tempo": "", "rest": "0s"},
        {"name": "Goblet Squat (Light)", "sets": "1 x 8", "tempo": "3010", "rest": "30s"},
    ],
    "deadlift": [
        {"name": "Hip Hinge Drill", "sets": "2 x 10", "tempo": "slow", "rest": "0s"},
        {"name": "Hamstring Walkout", "sets": "2 x 5", "tempo": "slow", "rest": "0s"},
        {"name": "Glute Bridge", "sets": "2 x 10", "tempo": "", "rest": "0s"},
        {"name": "Cat-Cow Stretch", "sets": "2 x 8", "tempo": "slow", "rest": "0s"},
        {"name": "Light Romanian Deadlift", "sets": "1 x 10", "tempo": "", "rest": "30s"},
    ],
    "legs": [
        {"name": "Hip Circles", "sets": "2 x 10 each", "tempo": "slow", "rest": "0s"},
        {"name": "Leg Swings (Front/Back)", "sets": "2 x 10 each", "tempo": "", "rest": "0s"},
        {"name": "Leg Swings (Lateral)", "sets": "2 x 10 each", "tempo": "", "rest": "0s"},
        {"name": "Bodyweight Squat", "sets": "2 x 10", "tempo": "controlled", "rest": "0s"},
        {"name": "Walking Lunges (BW)", "sets": "1 x 8 each", "tempo": "", "rest": "30s"},
    ],
    "upper_body": [
        {"name": "Arm Circles", "sets": "2 x 10 each direction", "tempo": "", "rest": "0s"},
        {"name": "Band Pull-Apart", "sets": "2 x 15", "tempo": "", "rest": "0s"},
        {"name": "Shoulder CARs", "sets": "2 x 5 each", "tempo": "slow", "rest": "0s"},
        {"name": "Push-Up Plus (Scap)", "sets": "2 x 8", "tempo": "", "rest": "0s"},
        {"name": "Scapular Pull-Ups", "sets": "2 x 6", "tempo": "", "rest": "30s"},
    ],
    "full_body": [
        {"name": "Jumping Jacks", "sets": "1 x 30", "tempo": "", "rest": "0s"},
        {"name": "Hip Circles", "sets": "1 x 10 each", "tempo": "slow", "rest": "0s"},
        {"name": "Arm Circles", "sets": "1 x 10 each direction", "tempo": "", "rest": "0s"},
        {"name": "Bodyweight Squat", "sets": "1 x 10", "tempo": "", "rest": "0s"},
        {"name": "Push-Ups", "sets": "1 x 8", "tempo": "", "rest": "0s"},
        {"name": "Inchworm", "sets": "1 x 5", "tempo": "slow", "rest": "30s"},
    ],
    "calisthenics": [
        {"name": "Wrist Circles", "sets": "2 x 10 each direction", "tempo": "slow", "rest": "0s"},
        {"name": "Wrist Push-Up Position Stretches", "sets": "2 x 15s each", "tempo": "", "rest": "0s"},
        {"name": "Scapular Push-Ups", "sets": "2 x 10", "tempo": "", "rest": "0s"},
        {"name": "Scapular Pull-Ups", "sets": "2 x 8", "tempo": "", "rest": "0s"},
        {"name": "Dead Hang", "sets": "2 x 20s", "tempo": "", "rest": "0s"},
        {"name": "Hollow Body Hold", "sets": "2 x 15s", "tempo": "", "rest": "30s"},
    ],
    "arms": [
        {"name": "Wrist Circles", "sets": "2 x 10 each", "tempo": "", "rest": "0s"},
        {"name": "Arm Circles", "sets": "2 x 10 each direction", "tempo": "", "rest": "0s"},
        {"name": "Band Curl", "sets": "1 x 15", "tempo": "", "rest": "0s"},
        {"name": "Band Tricep Pushdown", "sets": "1 x 15", "tempo": "", "rest": "30s"},
    ],
}


# ═══════════════════════════════════════════════════════════
# COOLDOWN MAPS — keyed by muscle groups trained that day
# ═══════════════════════════════════════════════════════════
COOLDOWN_MAP: Dict[str, List[Dict]] = {
    "chest": [
        {"name": "Doorway Chest Stretch", "sets": "2 x 30s each", "tempo": "", "rest": "0s"},
        {"name": "Cross-Body Shoulder Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "back": [
        {"name": "Child's Pose", "sets": "1 x 45s", "tempo": "", "rest": "0s"},
        {"name": "Lat Stretch (Doorway)", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "shoulders": [
        {"name": "Cross-Body Shoulder Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
        {"name": "Overhead Tricep Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "quads": [
        {"name": "Standing Quad Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
        {"name": "Couch Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "hamstrings": [
        {"name": "Standing Hamstring Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
        {"name": "Seated Forward Fold", "sets": "1 x 45s", "tempo": "", "rest": "0s"},
    ],
    "glutes": [
        {"name": "Pigeon Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
        {"name": "Figure-4 Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "triceps": [
        {"name": "Overhead Tricep Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "biceps": [
        {"name": "Wall Bicep Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "core": [
        {"name": "Cobra Stretch", "sets": "1 x 30s", "tempo": "", "rest": "0s"},
        {"name": "Supine Twist", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "hip_flexors": [
        {"name": "Kneeling Hip Flexor Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "calves": [
        {"name": "Wall Calf Stretch", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
    ],
    "wrists": [
        {"name": "Wrist Flexor Stretch", "sets": "1 x 20s each", "tempo": "", "rest": "0s"},
        {"name": "Wrist Extensor Stretch", "sets": "1 x 20s each", "tempo": "", "rest": "0s"},
    ],
    "full_body": [
        {"name": "Child's Pose", "sets": "1 x 45s", "tempo": "", "rest": "0s"},
        {"name": "Supine Twist", "sets": "1 x 30s each", "tempo": "", "rest": "0s"},
        {"name": "Deep Breathing", "sets": "1 x 60s", "tempo": "", "rest": "0s"},
    ],
}


def get_warmup_for_day(focus_areas: List[str]) -> List[Dict]:
    """
    Generate a warmup routine based on the focus areas of the day.
    focus_areas: e.g. ["chest", "shoulders"] or ["squat", "deadlift"]
    """
    warmup = []
    seen_names = set()
    
    for area in focus_areas:
        area_lower = area.lower()
        exercises = WARMUP_MAP.get(area_lower, WARMUP_MAP.get("full_body", []))
        for ex in exercises:
            if ex["name"] not in seen_names:
                warmup.append(ex)
                seen_names.add(ex["name"])
    
    # Cap at 6 exercises to keep warmup concise
    return warmup[:6]


def get_cooldown_for_day(muscles_trained: List[str]) -> List[Dict]:
    """
    Generate a cooldown routine based on the muscles trained that day.
    muscles_trained: e.g. ["chest", "triceps", "shoulders"]
    """
    cooldown = []
    seen_names = set()
    
    for muscle in muscles_trained:
        muscle_lower = muscle.lower()
        stretches = COOLDOWN_MAP.get(muscle_lower, [])
        for stretch in stretches:
            if stretch["name"] not in seen_names:
                cooldown.append(stretch)
                seen_names.add(stretch["name"])
    
    # Always add breathing at the end
    if "Deep Breathing" not in seen_names:
        cooldown.append({"name": "Deep Breathing", "sets": "1 x 60s", "tempo": "", "rest": "0s"})
    
    # Cap at 5
    return cooldown[:5]
