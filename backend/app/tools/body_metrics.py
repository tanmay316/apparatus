"""
Body composition calculators.
BMI, BMR, TDEE, body fat estimation, protein requirements.
"""
import math
from typing import Optional
from pydantic import BaseModel


class BodyMetrics(BaseModel):
    bmi: float
    bmi_category: str
    bmr: float  # Basal Metabolic Rate (kcal/day)
    tdee: float  # Total Daily Energy Expenditure
    estimated_body_fat: Optional[float] = None
    protein_requirement_grams: float
    calorie_goal: float
    protein_goal: float
    carb_goal: float
    fat_goal: float


def calculate_bmi(weight_kg: float, height_cm: float) -> tuple:
    """Calculate BMI and return (bmi_value, category)."""
    height_m = height_cm / 100
    bmi = round(weight_kg / (height_m ** 2), 1)
    if bmi < 18.5:
        cat = "Underweight"
    elif bmi < 25:
        cat = "Normal"
    elif bmi < 30:
        cat = "Overweight"
    else:
        cat = "Obese"
    return bmi, cat


def calculate_bmr(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """Mifflin-St Jeor equation."""
    if gender.lower() in ("male", "m"):
        return round(10 * weight_kg + 6.25 * height_cm - 5 * age + 5, 1)
    else:
        return round(10 * weight_kg + 6.25 * height_cm - 5 * age - 161, 1)


def calculate_tdee(bmr: float, activity_level: str = "moderate") -> float:
    """Calculate TDEE from BMR and activity level."""
    multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    mult = multipliers.get(activity_level.lower(), 1.55)
    return round(bmr * mult, 1)


def estimate_body_fat(bmi: float, age: int, gender: str) -> float:
    """Rough body fat estimate using BMI-based formula."""
    if gender.lower() in ("male", "m"):
        bf = 1.20 * bmi + 0.23 * age - 16.2
    else:
        bf = 1.20 * bmi + 0.23 * age - 5.4
    return round(max(5, min(60, bf)), 1)


def calculate_protein_requirement(
    weight_kg: float, goal: str = "build_muscle", activity_level: str = "moderate"
) -> float:
    """Calculate daily protein requirement in grams."""
    multipliers = {
        "lose_fat": 2.0,
        "build_muscle": 2.2,
        "maintain": 1.6,
        "general_health": 1.2,
        "endurance": 1.4,
    }
    mult = multipliers.get(goal.lower().replace(" ", "_"), 1.6)
    return round(weight_kg * mult, 1)


def calculate_full_metrics(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: str,
    activity_level: str = "moderate",
    goal: str = "build_muscle",
) -> BodyMetrics:
    """Calculate all body metrics and macro goals."""
    bmi, bmi_cat = calculate_bmi(weight_kg, height_cm)
    bmr = calculate_bmr(weight_kg, height_cm, age, gender)
    tdee = calculate_tdee(bmr, activity_level)
    bf = estimate_body_fat(bmi, age, gender)
    protein_req = calculate_protein_requirement(weight_kg, goal, activity_level)

    # Calorie adjustment based on goal (Mifflin-St Jeor recommendation: -500 kcal for 1lb/week weight loss)
    if "lose" in goal.lower() or "fat" in goal.lower() or "cut" in goal.lower():
        cal_goal = round(tdee - 500, 0)
    elif "build" in goal.lower() or "muscle" in goal.lower() or "bulk" in goal.lower():
        cal_goal = round(tdee + 300, 0)
    else:
        cal_goal = round(tdee, 0)

    protein_cals = protein_req * 4
    fat_goal = round(cal_goal * 0.25 / 9, 1)  # 25% from fat
    fat_cals = fat_goal * 9
    carb_goal = round((cal_goal - protein_cals - fat_cals) / 4, 1)

    return BodyMetrics(
        bmi=bmi,
        bmi_category=bmi_cat,
        bmr=bmr,
        tdee=tdee,
        estimated_body_fat=bf,
        protein_requirement_grams=protein_req,
        calorie_goal=cal_goal,
        protein_goal=protein_req,
        carb_goal=max(0, carb_goal),
        fat_goal=fat_goal,
    )
