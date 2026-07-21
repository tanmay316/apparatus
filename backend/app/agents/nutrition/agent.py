"""
Nutrition Agent.
Responsibilities: Calories, macros, health score, meal quality, recommendations, healthy swaps.
NEVER detects food from images — receives detected foods from Scanner Agent.
Uses TOOLS for all calculations — never calculates numbers itself.
"""
from typing import List, Optional
from pydantic import BaseModel

from app.providers.vision.base import DetectedFood
from app.tools.macro_calculator import (
    calculate_meal_nutrition, calculate_food_nutrition,
    MealNutrition, FoodNutrition, lookup_food
)
from app.tools.health_score import calculate_health_score, HealthScoreResult
from app.providers.llm.base import BaseLLMProvider, ChatMessage


class NutritionAnalysis(BaseModel):
    """Complete nutrition analysis output."""
    nutrition: dict  # MealNutrition serialized
    health_score: dict  # HealthScoreResult serialized
    recommendations: List[str] = []
    healthy_swaps: List[dict] = []
    hydration_suggestion: str = ""


class NutritionAgent:
    """
    Nutrition Agent — analyzes nutrition, NEVER detects food.
    All math done through tools. LLM used only for recommendations.
    """

    async def run(
        self,
        detected_foods: List[DetectedFood],
        llm_providers: List[BaseLLMProvider],
        calorie_goal: float = 2000.0,
        protein_goal: float = 140.0,
        carb_goal: float = 250.0,
        fat_goal: float = 65.0,
    ) -> NutritionAnalysis:
        """
        Execute nutrition analysis pipeline:
        1. Calculate macros using tools
        2. Calculate health score using tools
        3. Use LLM for smart recommendations (optional)
        """
        # Step 1: Calculate meal nutrition (preserves Vision AI / LLM estimated macros for cooked foods)
        nutrition = calculate_meal_nutrition(detected_foods)

        # Step 2: Calculate health score using tools (deterministic)
        health = calculate_health_score(
            nutrition,
            user_calorie_goal=calorie_goal,
            user_protein_goal=protein_goal,
        )

        # Step 3: Generate smart recommendations using LLM (optional)
        recommendations = health.suggestions.copy()
        healthy_swaps = []
        hydration = "Drink at least 2-3 glasses of water with this meal."

        if llm_providers:
            try:
                swap_recs = await self._generate_recommendations(
                    nutrition, health, detected_foods, llm_providers
                )
                if swap_recs:
                    recommendations.extend(swap_recs.get("extra_tips", []))
                    healthy_swaps = swap_recs.get("swaps", [])
                    hydration = swap_recs.get("hydration", hydration)
            except Exception:
                pass  # Tool-based suggestions are always available as fallback

        return NutritionAnalysis(
            nutrition=nutrition.model_dump(),
            health_score=health.model_dump(),
            recommendations=recommendations,
            healthy_swaps=healthy_swaps,
            hydration_suggestion=hydration,
        )

    async def _generate_recommendations(
        self,
        nutrition: MealNutrition,
        health: HealthScoreResult,
        detected_foods: List[DetectedFood],
        llm_providers: List[BaseLLMProvider],
    ) -> Optional[dict]:
        """Use LLM to generate contextual recommendations."""
        import json
        from app.providers.llm import chat_with_fallback

        foods_str = ", ".join(f.name for f in detected_foods)
        prompt = f"""Based on this meal analysis, provide brief, actionable recommendations.

Meal: {foods_str}
Total: {nutrition.total_calories:.0f} kcal, {nutrition.total_protein:.0f}g protein, {nutrition.total_carbs:.0f}g carbs, {nutrition.total_fat:.0f}g fat
Health Score: {health.score}/100 ({health.grade})

Return JSON:
{{
  "extra_tips": ["tip1", "tip2"],
  "swaps": [{{"original": "food", "swap": "healthier option", "benefit": "why"}}],
  "hydration": "water recommendation for this meal"
}}"""

        messages = [ChatMessage(role="user", content=prompt)]
        response = await chat_with_fallback(
            messages, llm_providers,
            system_prompt="You are a concise nutrition advisor. Return only valid JSON.",
            temperature=0.3,
            json_mode=True,
        )

        try:
            text = response.content.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3].strip()
            return json.loads(text)
        except Exception:
            return None
