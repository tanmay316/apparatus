"""
Pydantic schemas for API requests/responses.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


# ─── Requests ─────────────────────────────────────────────

class FoodAnalyzeRequest(BaseModel):
    image_base64: str = Field(..., max_length=8_000_000)
    mime_type: str = Field("image/jpeg", max_length=64)
    meal_type: str = Field("snack", max_length=20)  # breakfast, lunch, dinner, snack
    session_id: Optional[int] = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[int] = None

class RecipeGenerateRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    cuisine: Optional[str] = Field(None, max_length=60)

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
    image_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    reasoning: Optional[str] = None
    session_id: int
    tokens_used: int = 0
    nutritionData: Optional[dict] = None

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
