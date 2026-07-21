"""
Health Score Engine Tool.
Calculates a health score (0-100) based on macro balance, fiber, and meal quality.
"""
from typing import List, Optional
from pydantic import BaseModel

from app.tools.macro_calculator import MealNutrition


class HealthScoreResult(BaseModel):
    score: int  # 0-100
    grade: str  # A+, A, B+, B, C, D, F
    breakdown: dict  # individual component scores
    suggestions: List[str]


def calculate_health_score(
    nutrition: MealNutrition,
    user_calorie_goal: float = 2000.0,
    user_protein_goal: float = 140.0,
    user_carb_goal: float = 250.0,
    user_fat_goal: float = 65.0,
    user_fiber_goal: float = 30.0,
) -> HealthScoreResult:
    """
    Calculate a health score for a meal based on nutritional quality.
    This is a deterministic calculation — no AI involved.
    """
    suggestions = []

    # ── 1. Protein Score (0-25) ──
    protein_ratio = nutrition.total_protein / max(user_protein_goal * 0.3, 1)
    protein_score = min(25, int(protein_ratio * 25))
    if nutrition.total_protein < user_protein_goal * 0.2:
        suggestions.append("Add more protein to this meal (chicken, eggs, paneer, tofu, dal)")
    elif nutrition.total_protein > user_protein_goal * 0.5:
        suggestions.append("Great protein intake! Well above your per-meal target.")

    # ── 2. Calorie Balance Score (0-25) ──
    per_meal_cal = user_calorie_goal / 3
    cal_diff = abs(nutrition.total_calories - per_meal_cal)
    cal_ratio = max(0, 1 - (cal_diff / per_meal_cal))
    calorie_score = int(cal_ratio * 25)
    if nutrition.total_calories > per_meal_cal * 1.5:
        suggestions.append("This meal is calorie-heavy. Consider lighter portions or skipping a snack later.")
    elif nutrition.total_calories < per_meal_cal * 0.5:
        suggestions.append("This meal is quite light. You may need to eat more later.")

    # ── 3. Macro Balance Score (0-25) ──
    total_cals = max(nutrition.total_calories, 1)
    protein_pct = (nutrition.total_protein * 4 / total_cals) * 100
    carb_pct = (nutrition.total_carbs * 4 / total_cals) * 100
    fat_pct = (nutrition.total_fat * 9 / total_cals) * 100

    # Ideal ranges: protein 25-35%, carbs 40-55%, fat 20-30%
    balance_score = 25
    if protein_pct < 15:
        balance_score -= 8
        suggestions.append("Protein is low relative to total calories. Aim for 25-35% protein.")
    elif protein_pct > 50:
        balance_score -= 5
    if carb_pct > 65:
        balance_score -= 7
        suggestions.append("Carb-heavy meal. Balance with more protein or healthy fats.")
    if fat_pct > 45:
        balance_score -= 7
        suggestions.append("High fat meal. Consider leaner options.")

    balance_score = max(0, balance_score)

    # ── 4. Fiber & Quality Score (0-25) ──
    fiber_ratio = nutrition.total_fiber / max(user_fiber_goal * 0.3, 1)
    fiber_score = min(15, int(fiber_ratio * 15))
    if nutrition.total_fiber < 3:
        suggestions.append("Low fiber. Add vegetables, whole grains, or fruits.")

    # Variety bonus
    variety_score = min(10, len(nutrition.items) * 2)
    quality_score = fiber_score + variety_score

    # ── Total ──
    total = protein_score + calorie_score + balance_score + quality_score
    total = min(100, max(0, total))

    # Grade
    if total >= 90:
        grade = "A+"
    elif total >= 80:
        grade = "A"
    elif total >= 70:
        grade = "B+"
    elif total >= 60:
        grade = "B"
    elif total >= 50:
        grade = "C"
    elif total >= 35:
        grade = "D"
    else:
        grade = "F"

    if not suggestions:
        suggestions.append("Well-balanced meal! Keep it up.")

    return HealthScoreResult(
        score=total,
        grade=grade,
        breakdown={
            "protein_score": protein_score,
            "calorie_balance_score": calorie_score,
            "macro_balance_score": balance_score,
            "quality_score": quality_score,
        },
        suggestions=suggestions,
    )
