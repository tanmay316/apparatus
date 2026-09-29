from typing import Collection, Iterable

from app.engine.models import ExerciseMetadata, MovementPattern, ExerciseCategory
from app.engine.fatigue_manager import FatigueManager
from app.engine.weekly_volume import VolumeTracker, canonical_muscle
from app.engine.programming import injury_penalty

_BODYWEIGHT = ("bodyweight", "rings", "parallettes")
_BODYWEIGHT_STAPLES = {
    "Pull-Ups", "Chin-Ups", "Weighted Pull-Ups", "Weighted Dips", "Push-Ups", "Inverted Rows",
    "Ring Rows", "Ring Push-Ups", "Ring Dips", "Hanging Leg Raise",
}


def exercise_level(ex: ExerciseMetadata) -> int:
    """1 beginner, 2 intermediate, 3 advanced - derived from technical/systemic demand."""
    if ex.difficulty == "beginner":
        return 1
    if ex.difficulty == "advanced":
        return 3
    if ex.equipment in _BODYWEIGHT:
        joint = max(ex.shoulder_load, ex.elbow_load, ex.knee_load, ex.spine_load)
        return 3 if ex.cns_load >= 8 or joint >= 9 else 2 if ex.cns_load >= 6 or joint >= 7 else 1
    return 3 if ex.cns_load >= 9 else 2 if ex.cns_load >= 6 else 1


def score_exercise(
    ex: ExerciseMetadata,
    target_pattern: MovementPattern,
    target_category: ExerciseCategory,
    user_goal: str,
    user_experience: str,
    fatigue_mgr: FatigueManager,
    vol_tracker: VolumeTracker,
    previously_used: Collection[str],
    *,
    week_used: Collection[str] = (),
    template_prev: Collection[str] = (),
    priority: Collection[str] = (),
    preferred: Collection[str] = (),
    familiar: Collection[str] = (),
    injuries: Iterable[str] = (),
    calisthenics_bias: bool = False,
) -> int:
    """
    Scores an exercise based on how well it fits the current need.
    Higher score means a better fit; 0 means never pick it.
    """
    score = 100
    
    # 1. Base Multipliers (Dealbreakers)
    if ex.movement_pattern != target_pattern:
        return 0
    if ex.category != target_category:
        score -= 20  # Soft penalty to allow fallbacks (e.g., if no Machine Compound is available)
        if ex.category == ExerciseCategory.ISOLATION and target_category in (
                ExerciseCategory.PRIMARY_COMPOUND, ExerciseCategory.SECONDARY_COMPOUND):
            score -= 25  # an isolation is a last resort for a main-lift slot
    if ex.name in previously_used:
        return 0
        
    # 2. Goal Match
    if user_goal == "hypertrophy":
        score += ex.hypertrophy_score
    elif user_goal == "strength":
        score += ex.strength_score
    elif user_goal == "calisthenics":
        score += ex.calisthenics_score
    else:
        # Endurance / fat loss: effective but lower systemic cost, so density stays high.
        score += ex.hypertrophy_score // 2 + (10 - ex.cns_load) * 4
    if calisthenics_bias and user_goal != "calisthenics":
        score += ex.calisthenics_score // 4
        
    # 3. Experience Match (graded: beginners feel a harder lift more than intermediates)
    user_level = {"beginner": 1, "intermediate": 2, "advanced": 3}.get(user_experience, 2)
    gap = exercise_level(ex) - user_level
    if gap > 0:
        score -= gap * (35 if user_level == 1 else 15)
    elif gap < 0:
        score -= 5 * -gap
    # Advanced calisthenics moves are a poor stand-in for loaded lifts in a gym plan.
    if (not calisthenics_bias and ex.equipment in _BODYWEIGHT and ex.cns_load >= 6
            and ex.name not in _BODYWEIGHT_STAPLES):
        score -= 30
        
    # 4. Fatigue Cost
    score -= fatigue_mgr.get_fatigue_penalty(ex)
    score -= injury_penalty(ex, injuries)
    
    # 5. Volume Landmarks (MRV / MEV) - one adjustment per exercise, so listing
    # more muscles doesn't inflate the score.
    adjustments = []
    for muscle in {canonical_muscle(m) for m in ex.primary_muscles}:
        if muscle in vol_tracker.targets:
            current_vol = vol_tracker.current[muscle]
            target_vol = vol_tracker.targets[muscle]
            if current_vol > target_vol * 1.2:
                adjustments.append(-40)  # past MRV: junk volume
            elif current_vol >= target_vol:
                adjustments.append(-15)
            elif current_vol < target_vol * 0.5:
                adjustments.append(20)  # below MEV
            else:
                adjustments.append(0)
    if adjustments:
        score += max(adjustments) if max(adjustments) > 0 else min(adjustments)

    # 6. User priorities, requested lifts, and familiarity
    if priority and any(m in priority for m in ex.primary_muscles):
        score += 25
    if ex.name in preferred:
        score += 60
    if ex.name.lower() in familiar:
        score += 8

    # 7. Variety: A/B rotation between repeats of the same day and across the week.
    # Strength plans keep their main lifts (frequency beats variety there), except heavy hinges.
    repeat_ok = (user_goal == "strength" and target_category == ExerciseCategory.PRIMARY_COMPOUND
                 and ex.movement_pattern != MovementPattern.HINGE)
    if ex.name in template_prev and not repeat_ok:
        score -= 45
    elif ex.name in week_used and not repeat_ok:
        score -= 15
                
    # 8. Biomechanical Variation Bonus
    # Reward unilateral movements if they match the goal
    if ex.unilateral and user_goal in ["hypertrophy", "athletic"]:
        score += 5
    
    return max(0, int(score))
