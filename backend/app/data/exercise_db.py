"""
Apparatus AI — Curated Exercise Database
Organized by movement pattern, equipment, and muscle group.
Every exercise has consistent naming for deterministic plan assembly.
"""

from typing import List, Dict, Any

# Each exercise: { name, equipment, muscles (primary), type, difficulty }
# equipment: "barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "rings", "parallettes"
# type: "compound", "isolation", "skill", "power", "core", "cardio"
# difficulty: "beginner", "intermediate", "advanced"

EXERCISES: Dict[str, List[Dict[str, Any]]] = {

    # ═══════════════════════════════════════════════════════════
    # COMPOUND PUSH
    # ═══════════════════════════════════════════════════════════
    "compound_push": [
        # Barbell
        {"name": "Barbell Bench Press", "equipment": "barbell", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Incline Barbell Bench Press", "equipment": "barbell", "muscles": ["upper_chest", "triceps", "front_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Close-Grip Bench Press", "equipment": "barbell", "muscles": ["triceps", "chest"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Overhead Press", "equipment": "barbell", "muscles": ["front_delt", "lateral_delt", "triceps"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Push Press", "equipment": "barbell", "muscles": ["front_delt", "triceps", "legs"], "type": "power", "difficulty": "intermediate"},
        {"name": "Floor Press", "equipment": "barbell", "muscles": ["chest", "triceps"], "type": "compound", "difficulty": "intermediate"},
        # Dumbbell
        {"name": "Dumbbell Bench Press", "equipment": "dumbbell", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Incline Dumbbell Press", "equipment": "dumbbell", "muscles": ["upper_chest", "triceps", "front_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Dumbbell Overhead Press", "equipment": "dumbbell", "muscles": ["front_delt", "lateral_delt", "triceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Arnold Press", "equipment": "dumbbell", "muscles": ["front_delt", "lateral_delt", "triceps"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Dumbbell Floor Press", "equipment": "dumbbell", "muscles": ["chest", "triceps"], "type": "compound", "difficulty": "beginner"},
        # Machine
        {"name": "Machine Chest Press", "equipment": "machine", "muscles": ["chest", "triceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Smith Machine Bench Press", "equipment": "machine", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Machine Shoulder Press", "equipment": "machine", "muscles": ["front_delt", "lateral_delt", "triceps"], "type": "compound", "difficulty": "beginner"},
        # Bodyweight
        {"name": "Push-Ups", "equipment": "bodyweight", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Diamond Push-Ups", "equipment": "bodyweight", "muscles": ["triceps", "chest"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Wide Push-Ups", "equipment": "bodyweight", "muscles": ["chest", "front_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Decline Push-Ups", "equipment": "bodyweight", "muscles": ["upper_chest", "triceps", "front_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Pike Push-Ups", "equipment": "bodyweight", "muscles": ["front_delt", "triceps"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Handstand Push-Ups (Wall)", "equipment": "bodyweight", "muscles": ["front_delt", "triceps", "traps"], "type": "compound", "difficulty": "advanced"},
        {"name": "Pseudo Planche Push-Ups", "equipment": "bodyweight", "muscles": ["chest", "front_delt", "triceps"], "type": "compound", "difficulty": "advanced"},
        {"name": "Archer Push-Ups", "equipment": "bodyweight", "muscles": ["chest", "triceps"], "type": "compound", "difficulty": "advanced"},
        {"name": "Clap Push-Ups", "equipment": "bodyweight", "muscles": ["chest", "triceps"], "type": "power", "difficulty": "intermediate"},
        # Dip variations
        {"name": "Dips (Parallel Bars)", "equipment": "bodyweight", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Ring Dips", "equipment": "rings", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "advanced"},
        {"name": "Weighted Dips", "equipment": "bodyweight", "muscles": ["chest", "triceps", "front_delt"], "type": "compound", "difficulty": "advanced"},
        {"name": "Bench Dips", "equipment": "bodyweight", "muscles": ["triceps", "chest"], "type": "compound", "difficulty": "beginner"},
        # Kettlebell
        {"name": "Kettlebell Overhead Press", "equipment": "kettlebell", "muscles": ["front_delt", "triceps"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Kettlebell Push Press", "equipment": "kettlebell", "muscles": ["front_delt", "triceps", "legs"], "type": "power", "difficulty": "intermediate"},
    ],

    # ═══════════════════════════════════════════════════════════
    # COMPOUND PULL
    # ═══════════════════════════════════════════════════════════
    "compound_pull": [
        # Barbell
        {"name": "Barbell Bent-Over Row", "equipment": "barbell", "muscles": ["lats", "rhomboids", "biceps", "rear_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Pendlay Row", "equipment": "barbell", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "intermediate"},
        {"name": "T-Bar Row", "equipment": "barbell", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "intermediate"},
        # Dumbbell
        {"name": "Dumbbell Row", "equipment": "dumbbell", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Incline Dumbbell Row", "equipment": "dumbbell", "muscles": ["rhomboids", "rear_delt", "lats"], "type": "compound", "difficulty": "beginner"},
        {"name": "Kroc Row", "equipment": "dumbbell", "muscles": ["lats", "biceps", "traps"], "type": "compound", "difficulty": "intermediate"},
        # Cable
        {"name": "Seated Cable Row", "equipment": "cable", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Cable Face Pull", "equipment": "cable", "muscles": ["rear_delt", "rhomboids", "rotator_cuff"], "type": "compound", "difficulty": "beginner"},
        # Machine
        {"name": "Machine Row", "equipment": "machine", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Lat Pulldown", "equipment": "cable", "muscles": ["lats", "biceps", "rear_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Close-Grip Lat Pulldown", "equipment": "cable", "muscles": ["lats", "biceps"], "type": "compound", "difficulty": "beginner"},
        # Bodyweight
        {"name": "Pull-Ups", "equipment": "bodyweight", "muscles": ["lats", "biceps", "rear_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Chin-Ups", "equipment": "bodyweight", "muscles": ["biceps", "lats"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Wide-Grip Pull-Ups", "equipment": "bodyweight", "muscles": ["lats", "rear_delt"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Commando Pull-Ups", "equipment": "bodyweight", "muscles": ["lats", "biceps", "forearms"], "type": "compound", "difficulty": "advanced"},
        {"name": "Archer Pull-Ups", "equipment": "bodyweight", "muscles": ["lats", "biceps"], "type": "compound", "difficulty": "advanced"},
        {"name": "Weighted Pull-Ups", "equipment": "bodyweight", "muscles": ["lats", "biceps", "rear_delt"], "type": "compound", "difficulty": "advanced"},
        {"name": "Typewriter Pull-Ups", "equipment": "bodyweight", "muscles": ["lats", "biceps"], "type": "compound", "difficulty": "advanced"},
        {"name": "Inverted Rows", "equipment": "bodyweight", "muscles": ["rhomboids", "lats", "biceps", "rear_delt"], "type": "compound", "difficulty": "beginner"},
        {"name": "Australian Pull-Ups", "equipment": "bodyweight", "muscles": ["rhomboids", "lats", "biceps"], "type": "compound", "difficulty": "beginner"},
        # Ring
        {"name": "Ring Rows", "equipment": "rings", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Ring Pull-Ups", "equipment": "rings", "muscles": ["lats", "biceps", "forearms"], "type": "compound", "difficulty": "advanced"},
        # Kettlebell
        {"name": "Kettlebell Row", "equipment": "kettlebell", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Kettlebell Gorilla Row", "equipment": "kettlebell", "muscles": ["lats", "rhomboids", "core"], "type": "compound", "difficulty": "intermediate"},
        # Band
        {"name": "Band Pull-Apart", "equipment": "band", "muscles": ["rear_delt", "rhomboids"], "type": "compound", "difficulty": "beginner"},
        {"name": "Band Rows", "equipment": "band", "muscles": ["lats", "rhomboids", "biceps"], "type": "compound", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # SQUAT PATTERNS
    # ═══════════════════════════════════════════════════════════
    "squat_pattern": [
        # Barbell
        {"name": "Barbell Back Squat", "equipment": "barbell", "muscles": ["quads", "glutes", "core"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Front Squat", "equipment": "barbell", "muscles": ["quads", "core", "upper_back"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Zercher Squat", "equipment": "barbell", "muscles": ["quads", "glutes", "core", "biceps"], "type": "compound", "difficulty": "advanced"},
        {"name": "Pause Squat", "equipment": "barbell", "muscles": ["quads", "glutes", "core"], "type": "compound", "difficulty": "advanced"},
        # Dumbbell
        {"name": "Goblet Squat", "equipment": "dumbbell", "muscles": ["quads", "glutes", "core"], "type": "compound", "difficulty": "beginner"},
        {"name": "Dumbbell Squat", "equipment": "dumbbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        # Machine
        {"name": "Hack Squat", "equipment": "machine", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Leg Press", "equipment": "machine", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Smith Machine Squat", "equipment": "machine", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Pendulum Squat", "equipment": "machine", "muscles": ["quads"], "type": "compound", "difficulty": "beginner"},
        # Bodyweight
        {"name": "Bodyweight Squat", "equipment": "bodyweight", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Jump Squat", "equipment": "bodyweight", "muscles": ["quads", "glutes", "calves"], "type": "power", "difficulty": "beginner"},
        {"name": "Pistol Squat", "equipment": "bodyweight", "muscles": ["quads", "glutes", "core"], "type": "compound", "difficulty": "advanced"},
        {"name": "Shrimp Squat", "equipment": "bodyweight", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "advanced"},
        {"name": "Cossack Squat", "equipment": "bodyweight", "muscles": ["quads", "adductors", "glutes"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Sissy Squat", "equipment": "bodyweight", "muscles": ["quads"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Hindu Squat", "equipment": "bodyweight", "muscles": ["quads", "calves"], "type": "compound", "difficulty": "beginner"},
        {"name": "Bulgarian Split Squat (BW)", "equipment": "bodyweight", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "intermediate"},
        # Kettlebell
        {"name": "Kettlebell Goblet Squat", "equipment": "kettlebell", "muscles": ["quads", "glutes", "core"], "type": "compound", "difficulty": "beginner"},
        {"name": "Double Kettlebell Front Squat", "equipment": "kettlebell", "muscles": ["quads", "core"], "type": "compound", "difficulty": "intermediate"},
    ],

    # ═══════════════════════════════════════════════════════════
    # HINGE PATTERNS (Deadlifts, RDLs, etc.)
    # ═══════════════════════════════════════════════════════════
    "hinge_pattern": [
        # Barbell
        {"name": "Conventional Deadlift", "equipment": "barbell", "muscles": ["hamstrings", "glutes", "lower_back", "traps"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Sumo Deadlift", "equipment": "barbell", "muscles": ["glutes", "quads", "hamstrings", "adductors"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Romanian Deadlift", "equipment": "barbell", "muscles": ["hamstrings", "glutes", "lower_back"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Stiff-Leg Deadlift", "equipment": "barbell", "muscles": ["hamstrings", "glutes"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Trap Bar Deadlift", "equipment": "barbell", "muscles": ["quads", "hamstrings", "glutes", "traps"], "type": "compound", "difficulty": "beginner"},
        {"name": "Good Morning", "equipment": "barbell", "muscles": ["hamstrings", "glutes", "lower_back"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Barbell Hip Thrust", "equipment": "barbell", "muscles": ["glutes", "hamstrings"], "type": "compound", "difficulty": "beginner"},
        # Dumbbell
        {"name": "Dumbbell Romanian Deadlift", "equipment": "dumbbell", "muscles": ["hamstrings", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Single-Leg Dumbbell RDL", "equipment": "dumbbell", "muscles": ["hamstrings", "glutes", "core"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Dumbbell Hip Thrust", "equipment": "dumbbell", "muscles": ["glutes", "hamstrings"], "type": "compound", "difficulty": "beginner"},
        # Bodyweight
        {"name": "Nordic Curl", "equipment": "bodyweight", "muscles": ["hamstrings"], "type": "compound", "difficulty": "advanced"},
        {"name": "Glute Bridge", "equipment": "bodyweight", "muscles": ["glutes", "hamstrings"], "type": "compound", "difficulty": "beginner"},
        {"name": "Single-Leg Glute Bridge", "equipment": "bodyweight", "muscles": ["glutes", "hamstrings"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Reverse Hyperextension", "equipment": "bodyweight", "muscles": ["glutes", "hamstrings", "lower_back"], "type": "compound", "difficulty": "beginner"},
        {"name": "Back Extension", "equipment": "bodyweight", "muscles": ["lower_back", "glutes", "hamstrings"], "type": "compound", "difficulty": "beginner"},
        # Kettlebell
        {"name": "Kettlebell Swing", "equipment": "kettlebell", "muscles": ["glutes", "hamstrings", "core"], "type": "power", "difficulty": "beginner"},
        {"name": "Kettlebell Single-Leg Deadlift", "equipment": "kettlebell", "muscles": ["hamstrings", "glutes", "core"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Kettlebell Sumo Deadlift", "equipment": "kettlebell", "muscles": ["glutes", "quads", "adductors"], "type": "compound", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # LUNGE PATTERNS
    # ═══════════════════════════════════════════════════════════
    "lunge_pattern": [
        {"name": "Barbell Lunges", "equipment": "barbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Bulgarian Split Squat", "equipment": "dumbbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Walking Lunges", "equipment": "dumbbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Reverse Lunges", "equipment": "dumbbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Deficit Reverse Lunge", "equipment": "dumbbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "intermediate"},
        {"name": "Step-Ups", "equipment": "dumbbell", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Bodyweight Lunges", "equipment": "bodyweight", "muscles": ["quads", "glutes"], "type": "compound", "difficulty": "beginner"},
        {"name": "Jumping Lunges", "equipment": "bodyweight", "muscles": ["quads", "glutes", "calves"], "type": "power", "difficulty": "intermediate"},
        {"name": "Curtsy Lunges", "equipment": "bodyweight", "muscles": ["glutes", "adductors"], "type": "compound", "difficulty": "beginner"},
        {"name": "Lateral Lunges", "equipment": "bodyweight", "muscles": ["quads", "adductors", "glutes"], "type": "compound", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # ISOLATION — SHOULDERS
    # ═══════════════════════════════════════════════════════════
    "isolation_shoulder": [
        {"name": "Lateral Raise", "equipment": "dumbbell", "muscles": ["lateral_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Lateral Raise", "equipment": "cable", "muscles": ["lateral_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Front Raise", "equipment": "dumbbell", "muscles": ["front_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Reverse Pec Deck Fly", "equipment": "machine", "muscles": ["rear_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Dumbbell Rear Delt Fly", "equipment": "dumbbell", "muscles": ["rear_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Rear Delt Fly", "equipment": "cable", "muscles": ["rear_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Band Lateral Raise", "equipment": "band", "muscles": ["lateral_delt"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Prone Y-Raise", "equipment": "bodyweight", "muscles": ["rear_delt", "lower_traps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Band Face Pull", "equipment": "band", "muscles": ["rear_delt", "rhomboids"], "type": "isolation", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # ISOLATION — CHEST
    # ═══════════════════════════════════════════════════════════
    "isolation_chest": [
        {"name": "Dumbbell Fly", "equipment": "dumbbell", "muscles": ["chest"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Incline Dumbbell Fly", "equipment": "dumbbell", "muscles": ["upper_chest"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Fly", "equipment": "cable", "muscles": ["chest"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Crossover", "equipment": "cable", "muscles": ["chest"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Pec Deck Machine", "equipment": "machine", "muscles": ["chest"], "type": "isolation", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # ISOLATION — ARMS
    # ═══════════════════════════════════════════════════════════
    "isolation_arms": [
        # Biceps
        {"name": "Barbell Curl", "equipment": "barbell", "muscles": ["biceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Dumbbell Curl", "equipment": "dumbbell", "muscles": ["biceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Hammer Curl", "equipment": "dumbbell", "muscles": ["biceps", "forearms"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Incline Dumbbell Curl", "equipment": "dumbbell", "muscles": ["biceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Preacher Curl", "equipment": "barbell", "muscles": ["biceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Curl", "equipment": "cable", "muscles": ["biceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Concentration Curl", "equipment": "dumbbell", "muscles": ["biceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Spider Curl", "equipment": "dumbbell", "muscles": ["biceps"], "type": "isolation", "difficulty": "intermediate"},
        # Triceps
        {"name": "Skull Crushers", "equipment": "barbell", "muscles": ["triceps"], "type": "isolation", "difficulty": "intermediate"},
        {"name": "Tricep Pushdown", "equipment": "cable", "muscles": ["triceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Overhead Tricep Extension", "equipment": "dumbbell", "muscles": ["triceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Overhead Tricep Extension", "equipment": "cable", "muscles": ["triceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Kickbacks", "equipment": "dumbbell", "muscles": ["triceps"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Band Tricep Pushdown", "equipment": "band", "muscles": ["triceps"], "type": "isolation", "difficulty": "beginner"},
        # Forearms
        {"name": "Wrist Curls", "equipment": "dumbbell", "muscles": ["forearms"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Reverse Wrist Curls", "equipment": "dumbbell", "muscles": ["forearms"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Dead Hang", "equipment": "bodyweight", "muscles": ["forearms", "lats"], "type": "isolation", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # ISOLATION — LEGS
    # ═══════════════════════════════════════════════════════════
    "isolation_legs": [
        {"name": "Leg Extension", "equipment": "machine", "muscles": ["quads"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Leg Curl", "equipment": "machine", "muscles": ["hamstrings"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Seated Calf Raise", "equipment": "machine", "muscles": ["calves"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Standing Calf Raise", "equipment": "machine", "muscles": ["calves"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Bodyweight Calf Raise", "equipment": "bodyweight", "muscles": ["calves"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Hip Adductor Machine", "equipment": "machine", "muscles": ["adductors"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Hip Abductor Machine", "equipment": "machine", "muscles": ["glutes"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Cable Kickback", "equipment": "cable", "muscles": ["glutes"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Donkey Kicks", "equipment": "bodyweight", "muscles": ["glutes"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Fire Hydrants", "equipment": "bodyweight", "muscles": ["glutes"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Clamshells", "equipment": "bodyweight", "muscles": ["glutes"], "type": "isolation", "difficulty": "beginner"},
        {"name": "Banded Leg Curl", "equipment": "band", "muscles": ["hamstrings"], "type": "isolation", "difficulty": "beginner"},
    ],

    # ═══════════════════════════════════════════════════════════
    # CORE
    # ═══════════════════════════════════════════════════════════
    "core": [
        {"name": "Hanging Leg Raise", "equipment": "bodyweight", "muscles": ["abs", "hip_flexors"], "type": "core", "difficulty": "intermediate"},
        {"name": "Hanging Knee Raise", "equipment": "bodyweight", "muscles": ["abs"], "type": "core", "difficulty": "beginner"},
        {"name": "Toes-to-Bar", "equipment": "bodyweight", "muscles": ["abs", "hip_flexors"], "type": "core", "difficulty": "advanced"},
        {"name": "Ab Wheel Rollout", "equipment": "bodyweight", "muscles": ["abs", "core"], "type": "core", "difficulty": "intermediate"},
        {"name": "Plank", "equipment": "bodyweight", "muscles": ["core"], "type": "core", "difficulty": "beginner"},
        {"name": "Side Plank", "equipment": "bodyweight", "muscles": ["obliques", "core"], "type": "core", "difficulty": "beginner"},
        {"name": "Dead Bug", "equipment": "bodyweight", "muscles": ["core", "abs"], "type": "core", "difficulty": "beginner"},
        {"name": "Bird Dog", "equipment": "bodyweight", "muscles": ["core", "lower_back", "glutes"], "type": "core", "difficulty": "beginner"},
        {"name": "Hollow Body Hold", "equipment": "bodyweight", "muscles": ["abs", "core"], "type": "core", "difficulty": "intermediate"},
        {"name": "Bicycle Crunches", "equipment": "bodyweight", "muscles": ["abs", "obliques"], "type": "core", "difficulty": "beginner"},
        {"name": "Russian Twist", "equipment": "bodyweight", "muscles": ["obliques", "core"], "type": "core", "difficulty": "beginner"},
        {"name": "V-Ups", "equipment": "bodyweight", "muscles": ["abs"], "type": "core", "difficulty": "intermediate"},
        {"name": "Dragon Flag", "equipment": "bodyweight", "muscles": ["abs", "core"], "type": "core", "difficulty": "advanced"},
        {"name": "Pallof Press", "equipment": "cable", "muscles": ["core", "obliques"], "type": "core", "difficulty": "beginner"},
        {"name": "Cable Woodchop", "equipment": "cable", "muscles": ["obliques", "core"], "type": "core", "difficulty": "beginner"},
        {"name": "Windshield Wipers", "equipment": "bodyweight", "muscles": ["obliques", "abs"], "type": "core", "difficulty": "advanced"},
        {"name": "Body Saw", "equipment": "bodyweight", "muscles": ["core", "abs"], "type": "core", "difficulty": "intermediate"},
        {"name": "Copenhagen Plank", "equipment": "bodyweight", "muscles": ["adductors", "obliques", "core"], "type": "core", "difficulty": "advanced"},
    ],

    # ═══════════════════════════════════════════════════════════
    # CALISTHENICS SKILLS (Advanced bodyweight)
    # ═══════════════════════════════════════════════════════════
    "calisthenics_skill": [
        # Planche progressions
        {"name": "Planche Lean", "equipment": "bodyweight", "muscles": ["front_delt", "chest", "core", "wrists"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Frog Stand", "equipment": "bodyweight", "muscles": ["front_delt", "core", "wrists"], "type": "skill", "difficulty": "beginner"},
        {"name": "Tuck Planche", "equipment": "bodyweight", "muscles": ["front_delt", "chest", "core"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Advanced Tuck Planche", "equipment": "bodyweight", "muscles": ["front_delt", "chest", "core"], "type": "skill", "difficulty": "advanced"},
        {"name": "Straddle Planche", "equipment": "bodyweight", "muscles": ["front_delt", "chest", "core"], "type": "skill", "difficulty": "advanced"},
        {"name": "Full Planche", "equipment": "bodyweight", "muscles": ["front_delt", "chest", "core"], "type": "skill", "difficulty": "advanced"},
        {"name": "Planche Push-Up (Tuck)", "equipment": "bodyweight", "muscles": ["chest", "front_delt", "triceps", "core"], "type": "skill", "difficulty": "advanced"},
        # Front Lever progressions
        {"name": "Tuck Front Lever", "equipment": "bodyweight", "muscles": ["lats", "core", "rear_delt"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Advanced Tuck Front Lever", "equipment": "bodyweight", "muscles": ["lats", "core", "rear_delt"], "type": "skill", "difficulty": "advanced"},
        {"name": "Straddle Front Lever", "equipment": "bodyweight", "muscles": ["lats", "core"], "type": "skill", "difficulty": "advanced"},
        {"name": "Full Front Lever", "equipment": "bodyweight", "muscles": ["lats", "core", "rear_delt"], "type": "skill", "difficulty": "advanced"},
        {"name": "Front Lever Raise", "equipment": "bodyweight", "muscles": ["lats", "core"], "type": "skill", "difficulty": "advanced"},
        # Back Lever
        {"name": "Tuck Back Lever", "equipment": "bodyweight", "muscles": ["chest", "biceps", "core"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Full Back Lever", "equipment": "bodyweight", "muscles": ["chest", "biceps", "core"], "type": "skill", "difficulty": "advanced"},
        # Handstand
        {"name": "Wall Handstand Hold", "equipment": "bodyweight", "muscles": ["front_delt", "triceps", "core", "traps"], "type": "skill", "difficulty": "beginner"},
        {"name": "Chest-to-Wall Handstand", "equipment": "bodyweight", "muscles": ["front_delt", "triceps", "core"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Freestanding Handstand", "equipment": "bodyweight", "muscles": ["front_delt", "triceps", "core"], "type": "skill", "difficulty": "advanced"},
        {"name": "Handstand Walk", "equipment": "bodyweight", "muscles": ["front_delt", "core"], "type": "skill", "difficulty": "advanced"},
        {"name": "Press to Handstand", "equipment": "bodyweight", "muscles": ["front_delt", "core", "hamstrings"], "type": "skill", "difficulty": "advanced"},
        # Muscle Up
        {"name": "False Grip Hang", "equipment": "bodyweight", "muscles": ["forearms", "lats"], "type": "skill", "difficulty": "beginner"},
        {"name": "Muscle-Up Transition (Band)", "equipment": "bodyweight", "muscles": ["lats", "chest", "triceps"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Bar Muscle-Up", "equipment": "bodyweight", "muscles": ["lats", "chest", "triceps"], "type": "skill", "difficulty": "advanced"},
        {"name": "Ring Muscle-Up", "equipment": "rings", "muscles": ["lats", "chest", "triceps"], "type": "skill", "difficulty": "advanced"},
        # L-Sit / V-Sit
        {"name": "Tucked L-Sit", "equipment": "bodyweight", "muscles": ["abs", "hip_flexors", "triceps"], "type": "skill", "difficulty": "beginner"},
        {"name": "L-Sit (Parallettes)", "equipment": "parallettes", "muscles": ["abs", "hip_flexors", "triceps"], "type": "skill", "difficulty": "intermediate"},
        {"name": "L-Sit (Floor)", "equipment": "bodyweight", "muscles": ["abs", "hip_flexors", "triceps"], "type": "skill", "difficulty": "intermediate"},
        {"name": "V-Sit", "equipment": "bodyweight", "muscles": ["abs", "hip_flexors"], "type": "skill", "difficulty": "advanced"},
        {"name": "Manna", "equipment": "bodyweight", "muscles": ["abs", "hip_flexors", "triceps"], "type": "skill", "difficulty": "advanced"},
        # Flags
        {"name": "Human Flag (Tuck)", "equipment": "bodyweight", "muscles": ["obliques", "lats", "front_delt"], "type": "skill", "difficulty": "advanced"},
        {"name": "Human Flag", "equipment": "bodyweight", "muscles": ["obliques", "lats", "front_delt"], "type": "skill", "difficulty": "advanced"},
        {"name": "Dragon Flag", "equipment": "bodyweight", "muscles": ["abs", "core"], "type": "skill", "difficulty": "advanced"},
        # Ring skills
        {"name": "Ring Iron Cross (Assisted)", "equipment": "rings", "muscles": ["chest", "front_delt", "biceps"], "type": "skill", "difficulty": "advanced"},
        {"name": "Ring L-Sit", "equipment": "rings", "muscles": ["abs", "triceps", "front_delt"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Ring Support Hold", "equipment": "rings", "muscles": ["chest", "triceps", "core"], "type": "skill", "difficulty": "beginner"},
        # Other
        {"name": "Skin the Cat", "equipment": "bodyweight", "muscles": ["lats", "chest", "biceps", "core"], "type": "skill", "difficulty": "intermediate"},
        {"name": "Elbow Lever", "equipment": "bodyweight", "muscles": ["core", "front_delt", "wrists"], "type": "skill", "difficulty": "intermediate"},
    ],

    # ═══════════════════════════════════════════════════════════
    # POWER / OLYMPIC
    # ═══════════════════════════════════════════════════════════
    "power": [
        {"name": "Power Clean", "equipment": "barbell", "muscles": ["traps", "quads", "glutes", "hamstrings"], "type": "power", "difficulty": "advanced"},
        {"name": "Hang Clean", "equipment": "barbell", "muscles": ["traps", "quads", "glutes"], "type": "power", "difficulty": "intermediate"},
        {"name": "Clean & Jerk", "equipment": "barbell", "muscles": ["full_body"], "type": "power", "difficulty": "advanced"},
        {"name": "Snatch", "equipment": "barbell", "muscles": ["full_body"], "type": "power", "difficulty": "advanced"},
        {"name": "Hang Snatch", "equipment": "barbell", "muscles": ["traps", "front_delt", "quads"], "type": "power", "difficulty": "advanced"},
        {"name": "Kettlebell Clean", "equipment": "kettlebell", "muscles": ["glutes", "hamstrings", "forearms"], "type": "power", "difficulty": "intermediate"},
        {"name": "Kettlebell Snatch", "equipment": "kettlebell", "muscles": ["full_body"], "type": "power", "difficulty": "intermediate"},
        {"name": "Box Jump", "equipment": "bodyweight", "muscles": ["quads", "glutes", "calves"], "type": "power", "difficulty": "beginner"},
        {"name": "Broad Jump", "equipment": "bodyweight", "muscles": ["quads", "glutes"], "type": "power", "difficulty": "beginner"},
        {"name": "Medicine Ball Slam", "equipment": "bodyweight", "muscles": ["core", "lats", "front_delt"], "type": "power", "difficulty": "beginner"},
        {"name": "Explosive Push-Ups", "equipment": "bodyweight", "muscles": ["chest", "triceps"], "type": "power", "difficulty": "intermediate"},
    ],
}


# ═══════════════════════════════════════════════════════════
# EQUIPMENT MAPPING — which DB equipment tags are available
# ═══════════════════════════════════════════════════════════
EQUIPMENT_MAP = {
    "Full Gym": {"barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "rings", "parallettes"},
    "Dumbbells Only": {"dumbbell", "bodyweight", "band"},
    "Bodyweight": {"bodyweight", "parallettes"},
    "Kettlebells & Bands": {"kettlebell", "band", "bodyweight"},
    "Home Gym": {"dumbbell", "bodyweight", "kettlebell", "band", "rings", "parallettes"},
    "Calisthenics Park": {"bodyweight", "rings", "parallettes"},
}


def get_exercises_for_equipment(equipment: str) -> Dict[str, list]:
    """Filter the entire exercise DB to only include exercises available with the given equipment."""
    allowed = EQUIPMENT_MAP.get(equipment, EQUIPMENT_MAP["Full Gym"])
    filtered = {}
    for category, exercises in EXERCISES.items():
        matching = [ex for ex in exercises if ex["equipment"] in allowed]
        if matching:
            filtered[category] = matching
    return filtered


def get_exercises_by_muscle(muscle: str, equipment: str = "Full Gym") -> list:
    """Get all exercises targeting a specific muscle, filtered by equipment."""
    allowed = EQUIPMENT_MAP.get(equipment, EQUIPMENT_MAP["Full Gym"])
    results = []
    for exercises in EXERCISES.values():
        for ex in exercises:
            if muscle in ex["muscles"] and ex["equipment"] in allowed:
                results.append(ex)
    return results
