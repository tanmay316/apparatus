"""
Meal Repository — SQL only, no business logic.
"""
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.database.models import MealLog, MealItem, NutritionSummary


class MealRepository:

    def __init__(self, db: Session):
        self.db = db

    def create_meal(self, user_id: str, meal_type: str, image_id: Optional[int] = None) -> MealLog:
        meal = MealLog(user_id=user_id, meal_type=meal_type, image_id=image_id)
        self.db.add(meal)
        self.db.flush()
        return meal

    def add_meal_items(self, meal_id: int, items: List[dict]) -> List[MealItem]:
        meal_items = []
        for item_data in items:
            mi = MealItem(meal_id=meal_id, **item_data)
            self.db.add(mi)
            meal_items.append(mi)
        self.db.flush()
        return meal_items

    def update_meal_totals(
        self, meal_id: int, calories: float, protein: float,
        carbs: float, fat: float, fiber: float,
        health_score: int, health_grade: str, suggestions: list
    ):
        meal = self.db.query(MealLog).filter(MealLog.id == meal_id).first()
        if meal:
            meal.total_calories = calories
            meal.total_protein = protein
            meal.total_carbs = carbs
            meal.total_fat = fat
            meal.total_fiber = fiber
            meal.health_score = health_score
            meal.health_grade = health_grade
            meal.ai_suggestions = suggestions
            self.db.flush()

    def update_meal_type(self, meal_id: int, user_id: str, new_type: str) -> bool:
        meal = self.db.query(MealLog).filter(MealLog.id == meal_id, MealLog.user_id == user_id).first()
        if meal:
            meal.meal_type = new_type
            self.db.flush()
            return True
        return False

    def get_meal(self, meal_id: int) -> Optional[MealLog]:
        return self.db.query(MealLog).filter(MealLog.id == meal_id).first()

    def get_user_meals_today(self, user_id: str) -> List[MealLog]:
        today = date.today().isoformat()
        return (
            self.db.query(MealLog)
            .filter(
                and_(
                    MealLog.user_id == user_id,
                    func.date(MealLog.logged_at) == today,
                )
            )
            .order_by(MealLog.logged_at.desc())
            .all()
        )

    def get_user_meals_range(self, user_id: str, start_date: str, end_date: str) -> List[MealLog]:
        return (
            self.db.query(MealLog)
            .filter(
                and_(
                    MealLog.user_id == user_id,
                    func.date(MealLog.logged_at) >= start_date,
                    func.date(MealLog.logged_at) <= end_date,
                )
            )
            .order_by(MealLog.logged_at.desc())
            .all()
        )

    def get_recent_meals(self, user_id: str, limit: int = 10) -> List[MealLog]:
        return (
            self.db.query(MealLog)
            .filter(MealLog.user_id == user_id)
            .order_by(MealLog.logged_at.desc())
            .limit(limit)
            .all()
        )

    def upsert_daily_summary(self, user_id: str, date_str: str):
        """Recalculate and upsert daily nutrition summary."""
        meals = (
            self.db.query(MealLog)
            .filter(
                and_(
                    MealLog.user_id == user_id,
                    func.date(MealLog.logged_at) == date_str,
                )
            )
            .all()
        )

        total_cal = sum(m.total_calories or 0 for m in meals)
        total_pro = sum(m.total_protein or 0 for m in meals)
        total_carb = sum(m.total_carbs or 0 for m in meals)
        total_fat = sum(m.total_fat or 0 for m in meals)
        total_fiber = sum(m.total_fiber or 0 for m in meals)
        scores = [m.health_score for m in meals if m.health_score is not None]
        avg_score = sum(scores) / len(scores) if scores else None

        summary = (
            self.db.query(NutritionSummary)
            .filter(
                and_(
                    NutritionSummary.user_id == user_id,
                    NutritionSummary.date == date_str,
                )
            )
            .first()
        )

        if summary:
            summary.total_calories = total_cal
            summary.total_protein = total_pro
            summary.total_carbs = total_carb
            summary.total_fat = total_fat
            summary.total_fiber = total_fiber
            summary.meal_count = len(meals)
            summary.avg_health_score = avg_score
        else:
            summary = NutritionSummary(
                user_id=user_id,
                date=date_str,
                total_calories=total_cal,
                total_protein=total_pro,
                total_carbs=total_carb,
                total_fat=total_fat,
                total_fiber=total_fiber,
                meal_count=len(meals),
                avg_health_score=avg_score,
            )
            self.db.add(summary)

        self.db.flush()
        return summary

    def delete_meal(self, meal_id: int):
        self.db.query(MealItem).filter(MealItem.meal_id == meal_id).delete()
        self.db.query(MealLog).filter(MealLog.id == meal_id).delete()
        self.db.flush()
