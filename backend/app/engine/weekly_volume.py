from typing import Dict

def get_weekly_volume_targets(goal: str, experience: str) -> Dict[str, int]:
    """
    Returns the target number of weekly sets per muscle group.
    Based on Renaissance Periodization volume landmarks.
    """
    # Base targets for intermediate
    targets = {
        "chest": 12,
        "back": 14,
        "quads": 12,
        "hamstrings": 10,
        "glutes": 8,
        "front_delt": 6,  # Gets work from chest
        "lateral_delt": 10,
        "rear_delt": 8,
        "biceps": 10,
        "triceps": 10,
        "calves": 10,
        "core": 10
    }
    
    # Adjust for experience
    multiplier = 1.0
    if experience == "beginner":
        multiplier = 0.7
    elif experience == "advanced":
        multiplier = 1.3
        
    # Adjust for goal
    if goal == "strength":
        multiplier *= 0.8  # Lower volume, higher intensity
    elif goal == "hypertrophy":
        multiplier *= 1.1  # Higher volume
        
    return {k: int(v * multiplier) for k, v in targets.items()}

class VolumeTracker:
    def __init__(self, goal: str, experience: str):
        self.targets = get_weekly_volume_targets(goal, experience)
        self.current = {k: 0 for k in self.targets.keys()}
        
    def add_sets(self, muscles: list[str], sets: int):
        for m in muscles:
            if m in self.current:
                self.current[m] += sets
                
    def needs_volume(self, muscle: str) -> bool:
        if muscle not in self.targets:
            return False
        return self.current[muscle] < self.targets[muscle]
