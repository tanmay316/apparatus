"""
TDEE and Macro Calculator Tool
"""
from typing import Dict

def calculate_tdee_and_macros(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: str = "male",
    activity_level: str = "moderate",
    fitness_goal: str = "build_muscle"
) -> Dict[str, float]:
    """
    Calculates TDEE and daily macro targets based strictly on the Mifflin-St Jeor equation.
    
    Formula:
    - Men:   BMR = 10 * W + 6.25 * H - 5 * A + 5
    - Women: BMR = 10 * W + 6.25 * H - 5 * A - 161
    where W = weight (kg), H = height (cm), A = age (years).
    """
    weight_kg = float(weight_kg) if weight_kg else 70.0
    height_cm = float(height_cm) if height_cm else 170.0
    age = int(age) if age else 30
    gender_clean = gender.lower().strip() if gender else "male"
    
    # 1. Mifflin-St Jeor BMR
    if gender_clean in ["female", "f", "woman", "women"]:
        bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
    else:
        bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        
    # 2. Activity Multipliers
    multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9
    }
    
    activity_clean = activity_level.lower().strip() if activity_level else "moderate"
    multiplier = multipliers.get(activity_clean, 1.55)
    
    # 3. Total Daily Energy Expenditure (Maintenance Calories)
    tdee = bmr * multiplier
    
    # 4. Fitness Goal Calorie Adjustment (-500 kcal for 1 lb/week loss)
    goal_clean = fitness_goal.lower().strip() if fitness_goal else "maintain"
    
    if any(k in goal_clean for k in ["lose", "fat", "cut"]):
        target_calories = tdee - 500.0
    elif any(k in goal_clean for k in ["build", "muscle", "bulk", "gain"]):
        target_calories = tdee + 300.0
    elif "recomp" in goal_clean:
        target_calories = tdee - 200.0
    else:
        target_calories = tdee
        
    # Safety calorie floors
    if gender_clean in ["female", "f", "woman", "women"] and target_calories < 1200:
        target_calories = 1200.0
    elif gender_clean not in ["female", "f", "woman", "women"] and target_calories < 1500:
        target_calories = 1500.0
        
    # 5. Macro Distribution
    protein = weight_kg * 2.2  # ~1g per lb bodyweight (~2.2g per kg)
    fat = (target_calories * 0.25) / 9.0  # 25% of total calories from fat
    
    protein_cals = protein * 4.0
    fat_cals = fat * 9.0
    remaining_cals = target_calories - protein_cals - fat_cals
    
    carbs = remaining_cals / 4.0 if remaining_cals > 0 else 50.0
    fiber = (target_calories / 1000.0) * 14.0
    
    return {
        "bmr": round(bmr, 1),
        "tdee": round(tdee, 1),
        "calories": round(target_calories, 0),
        "protein": round(protein, 0),
        "carbs": round(carbs, 0),
        "fat": round(fat, 0),
        "fiber": round(fiber, 0)
    }
