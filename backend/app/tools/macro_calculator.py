"""
Macro Calculator Tool.
All nutrition math happens here — LLMs never calculate numbers.
"""
from typing import List, Optional
from pydantic import BaseModel


NUTRITION_DB = {
    # Proteins
    "chicken breast": {"calories": 165, "protein": 31.0, "carbs": 0.0, "fat": 3.6, "fiber": 0.0},
    "grilled chicken breast": {"calories": 165, "protein": 31.0, "carbs": 0.0, "fat": 3.6, "fiber": 0.0},
    "chicken thigh": {"calories": 209, "protein": 26.0, "carbs": 0.0, "fat": 10.9, "fiber": 0.0},
    "salmon": {"calories": 208, "protein": 20.4, "carbs": 0.0, "fat": 13.4, "fiber": 0.0},
    "tuna": {"calories": 132, "protein": 29.0, "carbs": 0.0, "fat": 1.0, "fiber": 0.0},
    "shrimp": {"calories": 99, "protein": 24.0, "carbs": 0.2, "fat": 0.3, "fiber": 0.0},
    "egg": {"calories": 155, "protein": 12.6, "carbs": 1.1, "fat": 10.6, "fiber": 0.0},
    "boiled egg": {"calories": 155, "protein": 12.6, "carbs": 1.1, "fat": 10.6, "fiber": 0.0},
    "scrambled eggs": {"calories": 149, "protein": 10.0, "carbs": 1.6, "fat": 11.0, "fiber": 0.0},
    "paneer": {"calories": 296, "protein": 18.3, "carbs": 1.2, "fat": 22.5, "fiber": 0.0},
    "tofu": {"calories": 76, "protein": 8.1, "carbs": 1.9, "fat": 4.8, "fiber": 0.3},
    "lentils": {"calories": 116, "protein": 9.0, "carbs": 20.1, "fat": 0.4, "fiber": 7.9},
    "dal": {"calories": 116, "protein": 9.0, "carbs": 20.1, "fat": 0.4, "fiber": 7.9},
    "chickpeas": {"calories": 164, "protein": 8.9, "carbs": 27.4, "fat": 2.6, "fiber": 7.6},
    "rajma": {"calories": 127, "protein": 8.7, "carbs": 22.8, "fat": 0.5, "fiber": 6.4},
    "whey protein": {"calories": 400, "protein": 80.0, "carbs": 8.0, "fat": 7.0, "fiber": 0.0},
    "greek yogurt": {"calories": 59, "protein": 10.3, "carbs": 3.6, "fat": 0.4, "fiber": 0.0},
    "cottage cheese": {"calories": 98, "protein": 11.1, "carbs": 3.4, "fat": 4.3, "fiber": 0.0},
    "beef": {"calories": 250, "protein": 26.0, "carbs": 0.0, "fat": 15.0, "fiber": 0.0},

    # Grains
    "white rice": {"calories": 130, "protein": 2.7, "carbs": 28.2, "fat": 0.3, "fiber": 0.4},
    "brown rice": {"calories": 123, "protein": 2.7, "carbs": 25.6, "fat": 1.0, "fiber": 1.8},
    "roti": {"calories": 297, "protein": 9.7, "carbs": 56.4, "fat": 3.7, "fiber": 6.7},
    "chapati": {"calories": 297, "protein": 9.7, "carbs": 56.4, "fat": 3.7, "fiber": 6.7},
    "bread": {"calories": 265, "protein": 9.0, "carbs": 49.0, "fat": 3.2, "fiber": 2.7},
    "whole wheat bread": {"calories": 247, "protein": 13.0, "carbs": 41.0, "fat": 4.2, "fiber": 6.8},
    "oats": {"calories": 389, "protein": 16.9, "carbs": 66.3, "fat": 6.9, "fiber": 10.6},
    "oatmeal": {"calories": 71, "protein": 2.5, "carbs": 12.0, "fat": 1.5, "fiber": 1.7},
    "pasta": {"calories": 131, "protein": 5.0, "carbs": 25.0, "fat": 1.1, "fiber": 1.8},
    "quinoa": {"calories": 120, "protein": 4.4, "carbs": 21.3, "fat": 1.9, "fiber": 2.8},
    "potato": {"calories": 77, "protein": 2.0, "carbs": 17.6, "fat": 0.1, "fiber": 2.2},
    "sweet potato": {"calories": 86, "protein": 1.6, "carbs": 20.1, "fat": 0.1, "fiber": 3.0},

    # Vegetables
    "broccoli": {"calories": 34, "protein": 2.8, "carbs": 6.6, "fat": 0.4, "fiber": 2.6},
    "spinach": {"calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4, "fiber": 2.2},
    "tomato": {"calories": 18, "protein": 0.9, "carbs": 3.9, "fat": 0.2, "fiber": 1.2},
    "carrot": {"calories": 41, "protein": 0.9, "carbs": 9.6, "fat": 0.2, "fiber": 2.8},
    "cucumber": {"calories": 15, "protein": 0.7, "carbs": 3.6, "fat": 0.1, "fiber": 0.5},
    "bell pepper": {"calories": 31, "protein": 1.0, "carbs": 6.0, "fat": 0.3, "fiber": 2.1},
    "onion": {"calories": 40, "protein": 1.1, "carbs": 9.3, "fat": 0.1, "fiber": 1.7},
    "mushroom": {"calories": 22, "protein": 3.1, "carbs": 3.3, "fat": 0.3, "fiber": 1.0},
    "cauliflower": {"calories": 25, "protein": 1.9, "carbs": 5.0, "fat": 0.3, "fiber": 2.0},

    # Fruits
    "banana": {"calories": 89, "protein": 1.1, "carbs": 22.8, "fat": 0.3, "fiber": 2.6},
    "apple": {"calories": 52, "protein": 0.3, "carbs": 13.8, "fat": 0.2, "fiber": 2.4},
    "orange": {"calories": 47, "protein": 0.9, "carbs": 11.8, "fat": 0.1, "fiber": 2.4},
    "mango": {"calories": 60, "protein": 0.8, "carbs": 15.0, "fat": 0.4, "fiber": 1.6},
    "grapes": {"calories": 69, "protein": 0.7, "carbs": 18.1, "fat": 0.2, "fiber": 0.9},
    "watermelon": {"calories": 30, "protein": 0.6, "carbs": 7.6, "fat": 0.2, "fiber": 0.4},

    # Dairy
    "whole milk": {"calories": 61, "protein": 3.2, "carbs": 4.8, "fat": 3.3, "fiber": 0.0},
    "toned milk": {"calories": 58, "protein": 3.1, "carbs": 4.8, "fat": 3.0, "fiber": 0.0},
    "skim milk": {"calories": 35, "protein": 3.4, "carbs": 5.0, "fat": 0.1, "fiber": 0.0},
    "curd": {"calories": 61, "protein": 3.5, "carbs": 4.7, "fat": 3.3, "fiber": 0.0},
    "cheese": {"calories": 402, "protein": 25.0, "carbs": 1.3, "fat": 33.0, "fiber": 0.0},
    "butter": {"calories": 717, "protein": 0.9, "carbs": 0.1, "fat": 81.0, "fiber": 0.0},

    # Nuts & fats
    "almonds": {"calories": 579, "protein": 21.2, "carbs": 21.6, "fat": 49.9, "fiber": 12.5},
    "peanuts": {"calories": 567, "protein": 25.8, "carbs": 16.1, "fat": 49.2, "fiber": 8.5},
    "walnuts": {"calories": 654, "protein": 15.2, "carbs": 13.7, "fat": 65.2, "fiber": 6.7},
    "cashews": {"calories": 553, "protein": 18.2, "carbs": 30.2, "fat": 43.9, "fiber": 3.3},
    "peanut butter": {"calories": 588, "protein": 25.1, "carbs": 20.0, "fat": 50.4, "fiber": 6.0},
    "olive oil": {"calories": 884, "protein": 0.0, "carbs": 0.0, "fat": 100.0, "fiber": 0.0},
    "ghee": {"calories": 884, "protein": 0.0, "carbs": 0.0, "fat": 100.0, "fiber": 0.0},
}

class FoodNutrition(BaseModel):
    """Nutrition data for a single food item."""
    name: str
    weight_grams: float
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: float


class MealNutrition(BaseModel):
    """Aggregated nutrition for an entire meal."""
    items: List[FoodNutrition]
    total_calories: float = 0.0
    total_protein: float = 0.0
    total_carbs: float = 0.0
    total_fat: float = 0.0
    total_fiber: float = 0.0


def lookup_food(name: str) -> Optional[dict]:
    """Lookup nutrition data for a food item (per 100g). Case-insensitive fuzzy match."""
    name_lower = name.lower().strip()

    # Exact match
    if name_lower in NUTRITION_DB:
        return NUTRITION_DB[name_lower]

    # Partial match — find the best candidate
    best_match = None
    best_score = 0
    for key in NUTRITION_DB:
        # Check if the key is contained in the food name or vice versa
        if key in name_lower or name_lower in key:
            score = len(key)
            if score > best_score:
                best_score = score
                best_match = key

    if best_match:
        return NUTRITION_DB[best_match]

    return None


def calculate_food_nutrition(item: any, default_weight: float = 100.0) -> FoodNutrition:
    """
    Calculate nutrition for a food item.
    Accepts DetectedFood object, dict, or tuple of (name, weight_grams).
    Prioritizes Vision AI/LLM-estimated macros when available.
    """
    # 1. If item is DetectedFood or dict with pre-calculated macros from Vision AI
    if hasattr(item, "name"):
        name = item.name
        weight_grams = item.estimated_weight_grams or default_weight
        if getattr(item, "calories", None) is not None:
            return FoodNutrition(
                name=name,
                weight_grams=weight_grams,
                calories=round(float(item.calories), 1),
                protein=round(float(item.protein or 0), 1),
                carbs=round(float(item.carbs or 0), 1),
                fat=round(float(item.fat or 0), 1),
                fiber=round(float(item.fiber or 0), 1),
            )
    elif isinstance(item, dict):
        name = item.get("name", "Unknown Food")
        weight_grams = item.get("estimated_weight_grams") or item.get("weight_grams") or default_weight
        if item.get("calories") is not None:
            return FoodNutrition(
                name=name,
                weight_grams=weight_grams,
                calories=round(float(item["calories"]), 1),
                protein=round(float(item.get("protein", 0)), 1),
                carbs=round(float(item.get("carbs", 0)), 1),
                fat=round(float(item.get("fat", 0)), 1),
                fiber=round(float(item.get("fiber", 0)), 1),
            )
    elif isinstance(item, (list, tuple)):
        name = item[0]
        weight_grams = item[1] if len(item) > 1 else default_weight
    else:
        name = str(item)
        weight_grams = default_weight

    # 2. Lookup in NUTRITION_DB static reference
    data = lookup_food(name)
    if data:
        factor = weight_grams / 100.0
        return FoodNutrition(
            name=name,
            weight_grams=weight_grams,
            calories=round(data["calories"] * factor, 1),
            protein=round(data["protein"] * factor, 1),
            carbs=round(data["carbs"] * factor, 1),
            fat=round(data["fat"] * factor, 1),
            fiber=round(data["fiber"] * factor, 1),
        )

    # 3. Fallback for cooked/unknown dish: estimate based on typical meal density (~1.4 kcal/g)
    factor = weight_grams / 100.0
    return FoodNutrition(
        name=name,
        weight_grams=weight_grams,
        calories=round(140.0 * factor, 1),
        protein=round(6.0 * factor, 1),
        carbs=round(18.0 * factor, 1),
        fat=round(5.0 * factor, 1),
        fiber=round(1.5 * factor, 1),
    )


def calculate_meal_nutrition(items: List[any]) -> MealNutrition:
    """
    Calculate total nutrition for a meal.
    items: List of (food_name, weight_grams) tuples, DetectedFood objects, or dicts.
    """
    food_items = []
    for item in items:
        food_items.append(calculate_food_nutrition(item))

    total = MealNutrition(items=food_items)
    for item in food_items:
        total.total_calories += item.calories
        total.total_protein += item.protein
        total.total_carbs += item.carbs
        total.total_fat += item.fat
        total.total_fiber += item.fiber

    total.total_calories = round(total.total_calories, 1)
    total.total_protein = round(total.total_protein, 1)
    total.total_carbs = round(total.total_carbs, 1)
    total.total_fat = round(total.total_fat, 1)
    total.total_fiber = round(total.total_fiber, 1)

    return total
