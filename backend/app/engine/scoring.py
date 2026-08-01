from typing import List, Dict, Any
from app.engine.models import ExerciseMetadata, MovementPattern, ExerciseCategory
from app.engine.fatigue_manager import FatigueManager

def score_exercise(
    ex: ExerciseMetadata,
    target_pattern: MovementPattern,
    target_category: ExerciseCategory,
    user_goal: str,
    user_experience: str,
    fatigue_mgr: FatigueManager,
    previously_used: set
) -> int:
    """
    Scores an exercise based on how well it fits the current need.
    Higher score means a better fit.
    """
    score = 100
    
    # 1. Base Multipliers (Dealbreakers)
    if ex.movement_pattern != target_pattern:
        return 0
    if ex.category != target_category:
        return 0
    if ex.name in previously_used:
        return 0
        
    # 2. Goal Match
    if user_goal == "hypertrophy":
        score += ex.hypertrophy_score
    elif user_goal == "strength":
        score += ex.strength_score
    elif user_goal == "calisthenics":
        score += ex.calisthenics_score
        
    # 3. Experience Match
    diff_map = {"beginner": 1, "intermediate": 2, "advanced": 3}
    user_diff = diff_map.get(user_experience, 2)
    ex_diff = diff_map.get(ex.difficulty, 2)
    
    if ex_diff > user_diff:
        score -= 50  # Too hard
    elif ex_diff < user_diff:
        score -= 10  # Too easy, but acceptable
        
    # 4. Fatigue Cost
    penalty = fatigue_mgr.get_fatigue_penalty(ex)
    score -= penalty
    
    return max(0, score)
