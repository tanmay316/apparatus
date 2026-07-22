"""
Graph State — shared state for the NutritionGraph.
"""
from typing import List, Optional, Any
from pydantic import BaseModel, Field


class GraphState(BaseModel):
    """
    State object that flows through the entire NutritionGraph.
    Every node reads/writes to this state.
    """
    # ─── Auth & User Context ──────────────────────────
    user_id: str = ""
    user_email: str = ""
    user_profile: dict = Field(default_factory=dict)
    user_goals: dict = Field(default_factory=dict)
    user_preferences: dict = Field(default_factory=dict)

    # ─── Input ────────────────────────────────────────
    intent: str = ""  # scan, chat, recipe, plan, insights
    user_message: str = ""
    uploaded_images: List[str] = Field(default_factory=list)  # base64 strings
    image_mime_type: str = "image/jpeg"
    meal_type: str = "snack"

    # ─── Memory ───────────────────────────────────────
    chat_history: List[dict] = Field(default_factory=list)
    meal_history: List[dict] = Field(default_factory=list)

    # ─── Agent Outputs ────────────────────────────────
    vision_result: Optional[dict] = None
    nutrition_result: Optional[dict] = None
    recipe_result: Optional[dict] = None
    meal_plan: Optional[dict] = None
    chat_response: str = ""
    chat_reasoning: Optional[str] = None
    insights_result: Optional[dict] = None

    # ─── Final ────────────────────────────────────────
    response: dict = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)

    # ─── Provider Keys ────────────────────────────────
    groq_key: str = ""
    nvidia_key: str = ""
    gemini_key: str = ""
    openrouter_key: str = ""

    class Config:
        arbitrary_types_allowed = True
