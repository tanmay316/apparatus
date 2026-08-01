from typing import Dict, Any, List
from app.engine.models import ExerciseMetadata, MovementPattern

class FatigueManager:
    """Tracks fatigue accumulation across the week to prevent overtraining."""
    
    def __init__(self):
        # Accumulators
        self.cns_fatigue = 0
        self.joint_fatigue = {
            "spine": 0,
            "shoulder": 0,
            "elbow": 0,
            "knee": 0,
            "hip": 0,
            "grip": 0
        }
        self.skills_trained_this_week = {}  # skill_name -> count
        
    def can_train_skill(self, skill_name: str, max_frequency: int = 2) -> bool:
        """Check if a CNS-heavy skill has been trained too often this week."""
        count = self.skills_trained_this_week.get(skill_name, 0)
        return count < max_frequency
        
    def register_skill_session(self, skill_name: str):
        self.skills_trained_this_week[skill_name] = self.skills_trained_this_week.get(skill_name, 0) + 1
        
    def add_exercise_fatigue(self, ex: ExerciseMetadata):
        """Add the fatigue loads from an exercise."""
        self.cns_fatigue += ex.cns_load
        self.joint_fatigue["spine"] += ex.spine_load
        self.joint_fatigue["shoulder"] += ex.shoulder_load
        self.joint_fatigue["elbow"] += ex.elbow_load
        self.joint_fatigue["knee"] += ex.knee_load
        self.joint_fatigue["hip"] += ex.hip_load
        self.joint_fatigue["grip"] += ex.grip_load

    def get_fatigue_penalty(self, ex: ExerciseMetadata) -> int:
        """Calculate a penalty score based on current accumulated fatigue."""
        penalty = 0
        # High CNS penalty if already loaded
        if self.cns_fatigue > 20 and ex.cns_load > 6:
            penalty += 15
        
        # Joint penalties
        if self.joint_fatigue["spine"] > 15 and ex.spine_load > 5:
            penalty += 20
        if self.joint_fatigue["shoulder"] > 15 and ex.shoulder_load > 5:
            penalty += 10
        if self.joint_fatigue["knee"] > 15 and ex.knee_load > 5:
            penalty += 15
            
        return penalty
