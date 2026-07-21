"""
Meal Service — business logic for meal logging.
Agents call this service. Service calls repositories.
"""
from typing import List, Optional
from datetime import date
from sqlalchemy.orm import Session

from app.repositories.meal_repository import MealRepository
from app.repositories.image_repository import ImageRepository
from app.tools.macro_calculator import calculate_meal_nutrition, MealNutrition
from app.tools.health_score import calculate_health_score, HealthScoreResult
from app.providers.vision.base import VisionResult


class MealService:

    def __init__(self, db: Session):
        self.db = db
        self.meal_repo = MealRepository(db)
        self.image_repo = ImageRepository(db)

    def log_meal_from_vision(
        self,
        user_id: str,
        vision_result: VisionResult,
        meal_type: str = "snack",
        image_id: Optional[int] = None,
        calorie_goal: float = 2000.0,
        protein_goal: float = 140.0,
    ) -> dict:
        """
        Full pipeline: vision result → macro calculation → health score → persist.
        """
        # 1. Create meal entry
        meal = self.meal_repo.create_meal(user_id, meal_type, image_id)

        # 2. Calculate nutrition using tools (not AI)
        food_tuples = [
            (f.name, f.estimated_weight_grams or 100.0)
            for f in vision_result.detected_foods
        ]
        nutrition = calculate_meal_nutrition(food_tuples)

        # 3. Calculate health score using tools
        health = calculate_health_score(
            nutrition,
            user_calorie_goal=calorie_goal,
            user_protein_goal=protein_goal,
        )

        # 4. Persist meal items
        item_dicts = []
        for food_item in nutrition.items:
            item_dicts.append({
                "food_name": food_item.name,
                "weight_grams": food_item.weight_grams,
                "calories": food_item.calories,
                "protein": food_item.protein,
                "carbs": food_item.carbs,
                "fat": food_item.fat,
                "fiber": food_item.fiber,
            })

        # Add confidence from vision
        for i, detected in enumerate(vision_result.detected_foods):
            if i < len(item_dicts):
                item_dicts[i]["confidence"] = detected.confidence
                item_dicts[i]["category"] = detected.category

        self.meal_repo.add_meal_items(meal.id, item_dicts)

        # 5. Update totals
        self.meal_repo.update_meal_totals(
            meal.id,
            nutrition.total_calories,
            nutrition.total_protein,
            nutrition.total_carbs,
            nutrition.total_fat,
            nutrition.total_fiber,
            health.score,
            health.grade,
            health.suggestions,
        )

        # 6. Update daily summary
        today_str = date.today().isoformat()
        self.meal_repo.upsert_daily_summary(user_id, today_str)

        self.db.commit()

        return {
            "meal_id": meal.id,
            "nutrition": nutrition.model_dump(),
            "health_score": health.model_dump(),
            "vision": {
                "provider": vision_result.provider_used,
                "latency_ms": vision_result.latency_ms,
                "description": vision_result.raw_description,
            },
        }

    def get_today_summary(self, user_id: str) -> dict:
        today_str = date.today().isoformat()
        meals = self.meal_repo.get_user_meals_today(user_id)
        
        # Get user goals
        from app.repositories.user_repository import UserRepository
        user_repo = UserRepository(self.meal_repo.db)
        goals = user_repo.get_goals(user_id)
        
        goals_dict = None
        if goals:
            goals_dict = {
                "calories": goals.calorie_goal or 2200,
                "protein": goals.protein_goal or 140,
                "carbs": goals.carb_goal or 250,
                "fat": goals.fat_goal or 65,
                "fiber": goals.fiber_goal or 30,
            }

        total_cal = sum(m.total_calories or 0 for m in meals)
        total_pro = sum(m.total_protein or 0 for m in meals)
        total_carb = sum(m.total_carbs or 0 for m in meals)
        total_fat = sum(m.total_fat or 0 for m in meals)
        total_fiber = sum(m.total_fiber or 0 for m in meals)

        return {
            "date": today_str,
            "meal_count": len(meals),
            "total_calories": round(total_cal, 1),
            "total_protein": round(total_pro, 1),
            "total_carbs": round(total_carb, 1),
            "total_fat": round(total_fat, 1),
            "total_fiber": round(total_fiber, 1),
            "goals": goals_dict,
            "meals": [
                {
                    "id": m.id,
                    "meal_type": m.meal_type,
                    "calories": m.total_calories,
                    "protein": m.total_protein,
                    "health_score": m.health_score,
                    "health_grade": m.health_grade,
                    "logged_at": str(m.logged_at),
                }
                for m in meals
            ],
        }

    def get_history(self, user_id: str, days: int = 7) -> List[dict]:
        from datetime import timedelta
        end = date.today()
        start = end - timedelta(days=days)
        meals = self.meal_repo.get_user_meals_range(
            user_id, start.isoformat(), end.isoformat()
        )
        return [
            {
                "id": m.id,
                "meal_type": m.meal_type,
                "calories": m.total_calories,
                "protein": m.total_protein,
                "carbs": m.total_carbs,
                "fat": m.total_fat,
                "health_score": m.health_score,
                "logged_at": str(m.logged_at),
            }
            for m in meals
        ]
