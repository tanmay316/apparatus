from typing import List, Dict, Any
from app.engine.models import ExerciseMetadata, MovementPattern, ExerciseCategory

# Helper function to easily create metadata
def _ex(
    name: str,
    eq: str,
    pattern: MovementPattern,
    cat: ExerciseCategory,
    primary: List[str],
    cns: int = 5,
    spine: int = 0,
    shoulder: int = 0,
    elbow: int = 0,
    knee: int = 0,
    hip: int = 0,
    hyper: int = 80,
    str_score: int = 50,
    calis: int = 0
) -> ExerciseMetadata:
    return ExerciseMetadata(
        name=name,
        equipment=eq,
        movement_pattern=pattern,
        category=cat,
        primary_muscles=primary,
        cns_load=cns,
        spine_load=spine,
        shoulder_load=shoulder,
        elbow_load=elbow,
        knee_load=knee,
        hip_load=hip,
        hypertrophy_score=hyper,
        strength_score=str_score,
        calisthenics_score=calis
    )

EXERCISES: List[ExerciseMetadata] = [
    # ── Horizontal Push ──
    _ex("Barbell Bench Press", "barbell", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND, ["chest", "triceps", "front_delt"], cns=8, shoulder=6, elbow=5, hyper=90, str_score=100),
    _ex("Incline Barbell Bench Press", "barbell", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND, ["upper_chest", "triceps", "front_delt"], cns=7, shoulder=7, elbow=5, hyper=95, str_score=80),
    _ex("Dumbbell Bench Press", "dumbbell", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND, ["chest", "triceps"], cns=6, shoulder=5, elbow=4, hyper=95, str_score=70),
    _ex("Incline Dumbbell Press", "dumbbell", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND, ["upper_chest", "triceps"], cns=6, shoulder=6, elbow=4, hyper=100, str_score=70),
    _ex("Machine Chest Press", "machine", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.MACHINE_COMPOUND, ["chest", "triceps"], cns=4, shoulder=4, elbow=3, hyper=90, str_score=50),
    _ex("Push-Ups", "bodyweight", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND, ["chest", "triceps"], cns=3, shoulder=3, elbow=3, hyper=70, str_score=40, calis=100),
    _ex("Weighted Dips", "bodyweight", MovementPattern.HORIZONTAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND, ["chest", "triceps"], cns=8, shoulder=9, elbow=7, hyper=90, str_score=90, calis=100),
    
    # ── Vertical Push ──
    _ex("Overhead Press", "barbell", MovementPattern.VERTICAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND, ["front_delt", "triceps"], cns=8, spine=7, shoulder=8, elbow=5, hyper=80, str_score=100),
    _ex("Dumbbell Overhead Press", "dumbbell", MovementPattern.VERTICAL_PUSH, ExerciseCategory.SECONDARY_COMPOUND, ["front_delt", "triceps"], cns=6, spine=5, shoulder=7, elbow=4, hyper=90, str_score=70),
    _ex("Machine Shoulder Press", "machine", MovementPattern.VERTICAL_PUSH, ExerciseCategory.MACHINE_COMPOUND, ["front_delt", "triceps"], cns=4, spine=2, shoulder=6, elbow=3, hyper=85, str_score=50),
    _ex("Handstand Push-Ups (Wall)", "bodyweight", MovementPattern.VERTICAL_PUSH, ExerciseCategory.PRIMARY_COMPOUND, ["front_delt", "triceps"], cns=9, spine=6, shoulder=9, elbow=7, hyper=70, str_score=80, calis=100),
    
    # ── Horizontal Pull ──
    _ex("Barbell Bent-Over Row", "barbell", MovementPattern.HORIZONTAL_PULL, ExerciseCategory.PRIMARY_COMPOUND, ["lats", "rhomboids", "biceps"], cns=8, spine=8, shoulder=5, elbow=4, hyper=85, str_score=100),
    _ex("Pendlay Row", "barbell", MovementPattern.HORIZONTAL_PULL, ExerciseCategory.SECONDARY_COMPOUND, ["lats", "rhomboids"], cns=8, spine=8, shoulder=5, elbow=4, hyper=70, str_score=90),
    _ex("Dumbbell Row", "dumbbell", MovementPattern.HORIZONTAL_PULL, ExerciseCategory.SECONDARY_COMPOUND, ["lats", "rhomboids", "biceps"], cns=5, spine=3, shoulder=4, elbow=4, hyper=95, str_score=80),
    _ex("Chest-Supported Row", "machine", MovementPattern.HORIZONTAL_PULL, ExerciseCategory.MACHINE_COMPOUND, ["lats", "rhomboids"], cns=3, spine=0, shoulder=4, elbow=4, hyper=100, str_score=60),
    _ex("Seated Cable Row", "cable", MovementPattern.HORIZONTAL_PULL, ExerciseCategory.MACHINE_COMPOUND, ["lats", "rhomboids"], cns=4, spine=4, shoulder=4, elbow=3, hyper=90, str_score=60),
    _ex("Inverted Rows", "bodyweight", MovementPattern.HORIZONTAL_PULL, ExerciseCategory.SECONDARY_COMPOUND, ["lats", "rhomboids", "rear_delt"], cns=4, spine=2, shoulder=4, elbow=3, hyper=70, str_score=40, calis=100),
    
    # ── Vertical Pull ──
    _ex("Pull-Ups", "bodyweight", MovementPattern.VERTICAL_PULL, ExerciseCategory.PRIMARY_COMPOUND, ["lats", "biceps"], cns=7, spine=0, shoulder=7, elbow=5, hyper=90, str_score=80, calis=100),
    _ex("Weighted Pull-Ups", "bodyweight", MovementPattern.VERTICAL_PULL, ExerciseCategory.PRIMARY_COMPOUND, ["lats", "biceps"], cns=9, spine=0, shoulder=8, elbow=7, hyper=90, str_score=100, calis=100),
    _ex("Lat Pulldown", "cable", MovementPattern.VERTICAL_PULL, ExerciseCategory.MACHINE_COMPOUND, ["lats", "biceps"], cns=4, spine=0, shoulder=5, elbow=3, hyper=100, str_score=60),
    _ex("Chin-Ups", "bodyweight", MovementPattern.VERTICAL_PULL, ExerciseCategory.SECONDARY_COMPOUND, ["lats", "biceps"], cns=6, spine=0, shoulder=6, elbow=6, hyper=90, str_score=70, calis=100),
    
    # ── Squat ──
    _ex("Barbell Back Squat", "barbell", MovementPattern.SQUAT, ExerciseCategory.PRIMARY_COMPOUND, ["quads", "glutes"], cns=10, spine=9, knee=8, hip=7, hyper=90, str_score=100),
    _ex("Barbell Front Squat", "barbell", MovementPattern.SQUAT, ExerciseCategory.SECONDARY_COMPOUND, ["quads", "upper_back"], cns=9, spine=7, knee=9, hip=6, hyper=85, str_score=90),
    _ex("Leg Press", "machine", MovementPattern.SQUAT, ExerciseCategory.MACHINE_COMPOUND, ["quads", "glutes"], cns=6, spine=2, knee=8, hip=7, hyper=100, str_score=60),
    _ex("Hack Squat", "machine", MovementPattern.SQUAT, ExerciseCategory.MACHINE_COMPOUND, ["quads"], cns=7, spine=3, knee=9, hip=6, hyper=100, str_score=60),
    _ex("Goblet Squat", "dumbbell", MovementPattern.SQUAT, ExerciseCategory.SECONDARY_COMPOUND, ["quads", "core"], cns=5, spine=4, knee=6, hip=5, hyper=70, str_score=50),
    
    # ── Hinge ──
    _ex("Barbell Deadlift", "barbell", MovementPattern.HINGE, ExerciseCategory.PRIMARY_COMPOUND, ["hamstrings", "glutes", "lower_back"], cns=10, spine=10, knee=4, hip=9, hyper=60, str_score=100),
    _ex("Romanian Deadlift", "barbell", MovementPattern.HINGE, ExerciseCategory.SECONDARY_COMPOUND, ["hamstrings", "glutes"], cns=8, spine=8, knee=3, hip=9, hyper=95, str_score=80),
    _ex("Dumbbell RDL", "dumbbell", MovementPattern.HINGE, ExerciseCategory.SECONDARY_COMPOUND, ["hamstrings", "glutes"], cns=6, spine=6, knee=2, hip=7, hyper=90, str_score=60),
    
    # ── Lunge ──
    _ex("Bulgarian Split Squat", "dumbbell", MovementPattern.LUNGE, ExerciseCategory.SECONDARY_COMPOUND, ["quads", "glutes"], cns=8, spine=3, knee=8, hip=8, hyper=100, str_score=70),
    _ex("Walking Lunges", "dumbbell", MovementPattern.LUNGE, ExerciseCategory.SECONDARY_COMPOUND, ["quads", "glutes"], cns=7, spine=4, knee=7, hip=7, hyper=90, str_score=60),
    _ex("Pistol Squat", "bodyweight", MovementPattern.LUNGE, ExerciseCategory.SECONDARY_COMPOUND, ["quads", "glutes", "core"], cns=7, spine=0, knee=9, hip=7, hyper=60, str_score=50, calis=100),
    
    # ── Isolation ──
    _ex("Dumbbell Lateral Raise", "dumbbell", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["lateral_delt"], cns=2, shoulder=4, hyper=100, str_score=30),
    _ex("Cable Lateral Raise", "cable", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["lateral_delt"], cns=2, shoulder=3, hyper=100, str_score=20),
    _ex("Dumbbell Bicep Curl", "dumbbell", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["biceps"], cns=2, elbow=4, hyper=100, str_score=40),
    _ex("Hammer Curl", "dumbbell", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["biceps", "brachialis"], cns=2, elbow=3, hyper=100, str_score=40),
    _ex("Preacher Curl", "machine", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["biceps"], cns=2, elbow=5, hyper=100, str_score=40),
    _ex("Tricep Pushdown", "cable", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["triceps"], cns=2, elbow=5, hyper=100, str_score=30),
    _ex("Skull Crushers", "barbell", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["triceps"], cns=3, elbow=7, hyper=100, str_score=40),
    _ex("Overhead Tricep Extension", "dumbbell", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["triceps"], cns=2, elbow=5, hyper=100, str_score=30),
    _ex("Leg Extension", "machine", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["quads"], cns=3, knee=7, hyper=100, str_score=30),
    _ex("Leg Curl", "machine", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["hamstrings"], cns=3, knee=4, hyper=100, str_score=30),
    _ex("Calf Raises", "machine", MovementPattern.CALF, ExerciseCategory.ISOLATION, ["calves"], cns=1, hyper=100, str_score=30),
    _ex("Band Face Pull", "band", MovementPattern.ISOLATION, ExerciseCategory.ISOLATION, ["rear_delt", "rotator_cuff"], cns=1, shoulder=3, hyper=80, str_score=10),
    
    # ── Core ──
    _ex("Hanging Leg Raise", "bodyweight", MovementPattern.CORE, ExerciseCategory.CORE, ["core"], cns=4, spine=2, shoulder=5, hyper=90, str_score=50, calis=100),
    _ex("Cable Crunch", "cable", MovementPattern.CORE, ExerciseCategory.CORE, ["core"], cns=3, spine=4, hyper=100, str_score=40),
    _ex("Plank", "bodyweight", MovementPattern.CORE, ExerciseCategory.CORE, ["core"], cns=2, spine=2, hyper=50, str_score=30, calis=80),
    _ex("L-Sit", "bodyweight", MovementPattern.CORE, ExerciseCategory.SKILL, ["core", "hip_flexors", "triceps"], cns=7, shoulder=6, hyper=50, str_score=70, calis=100),
]

def get_exercises_for_equipment(equipment: str) -> List[ExerciseMetadata]:
    # Filter out exercises that require equipment the user doesn't have
    if equipment == "Full Gym":
        return EXERCISES
    elif equipment == "Dumbbells Only":
        allowed = ["bodyweight", "dumbbell"]
        return [ex for ex in EXERCISES if ex.equipment in allowed]
    elif equipment == "Bodyweight" or equipment == "Calisthenics Park":
        allowed = ["bodyweight", "rings", "parallettes"]
        return [ex for ex in EXERCISES if ex.equipment in allowed]
    elif equipment == "Home Gym":
        allowed = ["bodyweight", "dumbbell", "barbell", "band"]
        return [ex for ex in EXERCISES if ex.equipment in allowed]
    else:
        return EXERCISES
