from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum

class MovementPattern(str, Enum):
    HORIZONTAL_PUSH = "horizontal_push"
    VERTICAL_PUSH = "vertical_push"
    HORIZONTAL_PULL = "horizontal_pull"
    VERTICAL_PULL = "vertical_pull"
    SQUAT = "squat"
    HINGE = "hinge"
    LUNGE = "lunge"
    FLY = "fly"
    ROTATION = "rotation"
    CORE = "core"
    CARRY = "carry"
    CALF = "calf"
    ISOLATION = "isolation" # general isolation

class ExerciseCategory(str, Enum):
    PRIMARY_COMPOUND = "primary_compound"
    SECONDARY_COMPOUND = "secondary_compound"
    MACHINE_COMPOUND = "machine_compound"
    ISOLATION = "isolation"
    CORRECTIVE = "corrective"
    CORE = "core"
    CONDITIONING = "conditioning"
    SKILL = "skill"

class ExerciseMetadata(BaseModel):
    name: str
    equipment: str
    movement_pattern: MovementPattern
    category: ExerciseCategory
    primary_muscles: List[str]
    secondary_muscles: List[str] = []
    
    # Loads (0-10 scale)
    cns_load: int = 0
    spine_load: int = 0
    shoulder_load: int = 0
    elbow_load: int = 0
    knee_load: int = 0
    hip_load: int = 0
    grip_load: int = 0
    
    # Mechanics
    unilateral: bool = False
    bilateral: bool = True
    push_pull: str = "push" # push, pull, legs, core
    plane_of_motion: str = "sagittal" # sagittal, frontal, transverse
    
    # Goal Matching (0-100 scale)
    hypertrophy_score: int = 50
    strength_score: int = 50
    athletic_score: int = 50
    calisthenics_score: int = 0
    
    # General
    difficulty: str = "intermediate"
    contraindications: List[str] = []
    alternatives: List[str] = []
    
    # For JSON serialization
    def dict(self, *args, **kwargs):
        d = super().dict(*args, **kwargs)
        return d
