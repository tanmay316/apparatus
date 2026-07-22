"""
Pydantic schemas for API requests/responses.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


# ─── Requests ─────────────────────────────────────────────

class FoodAnalyzeRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
    meal_type: str = "snack"  # breakfast, lunch, dinner, snack

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[int] = None

class RecipeGenerateRequest(BaseModel):
    query: str
    cuisine: Optional[str] = None

class MealPlanRequest(BaseModel):
    plan_type: str = "daily"  # daily, weekly

class ManualLogRequest(BaseModel):
    meal_type: str = "snack"
    items: List[dict] = []  # [{"name": "chicken", "weight_grams": 150}]


# ─── Responses ────────────────────────────────────────────

class HealthScoreResponse(BaseModel):
    score: int
    grade: str
    breakdown: dict
    suggestions: List[str]

class NutritionItemResponse(BaseModel):
    name: str
    weight_grams: float
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: float

class FoodAnalyzeResponse(BaseModel):
    success: bool = True
    vision: Optional[dict] = None
    nutrition: Optional[dict] = None
    errors: List[str] = []
    session_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    reasoning: Optional[str] = None
    session_id: int
    tokens_used: int = 0

class TodayNutritionResponse(BaseModel):
    date: str
    meal_count: int
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    total_fiber: float
    meals: List[dict] = []
    goals: Optional[dict] = None
