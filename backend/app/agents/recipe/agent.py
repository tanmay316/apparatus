"""
Recipe Agent.
Responsibilities: Generate recipes, recipe optimization, healthy alternatives, 
ingredient substitution, cooking instructions.
"""
import json
from typing import List, Optional
from pydantic import BaseModel

from app.providers.llm.base import BaseLLMProvider, ChatMessage
from app.providers.llm import chat_with_fallback


class RecipeOutput(BaseModel):
    title: str
    description: str = ""
    cuisine: str = ""
    diet_type: str = ""
    ingredients: List[dict] = []
    instructions: List[str] = []
    prep_time_min: int = 0
    cook_time_min: int = 0
    servings: int = 1
    calories_per_serving: float = 0
    protein_per_serving: float = 0
    carbs_per_serving: float = 0
    fat_per_serving: float = 0


RECIPE_SYSTEM_PROMPT = """You are an expert chef and nutritionist for the Apparatus fitness app.
Generate detailed, practical recipes optimized for fitness goals.

Rules:
- All measurements in metric (grams, ml)
- Include accurate nutrition estimates per serving
- Support Indian, Western, Mediterranean, Asian cuisines
- Optimize for the user's fitness goal when specified
- Return ONLY valid JSON"""


class RecipeAgent:
    """
    Recipe Agent — generates and optimizes recipes.
    NEVER detects food or calculates exact nutrition (uses estimates from knowledge).
    """

    async def generate_recipe(
        self,
        query: str,
        llm_providers: List[BaseLLMProvider],
        dietary_restrictions: List[str] = [],
        goal: str = "build_muscle",
        calorie_target: Optional[float] = None,
        protein_target: Optional[float] = None,
    ) -> Optional[RecipeOutput]:
        """Generate a recipe based on user request."""
        constraints = []
        if dietary_restrictions:
            constraints.append(f"Dietary restrictions: {', '.join(dietary_restrictions)}")
        if goal:
            constraints.append(f"Fitness goal: {goal}")
        if calorie_target:
            constraints.append(f"Target calories per serving: ~{calorie_target:.0f} kcal")
        if protein_target:
            constraints.append(f"Target protein per serving: ~{protein_target:.0f}g")

        constraint_str = "\n".join(f"- {c}" for c in constraints) if constraints else "None"

        prompt = f"""Generate a recipe for: "{query}"

Constraints:
{constraint_str}

Return JSON:
{{
  "title": "Recipe Name",
  "description": "Brief description",
  "cuisine": "cuisine type",
  "diet_type": "e.g. vegetarian, keto, etc.",
  "ingredients": [{{"item": "ingredient", "amount": "100g"}}],
  "instructions": ["Step 1...", "Step 2..."],
  "prep_time_min": 10,
  "cook_time_min": 20,
  "servings": 2,
  "calories_per_serving": 450,
  "protein_per_serving": 35,
  "carbs_per_serving": 40,
  "fat_per_serving": 15
}}"""

        messages = [ChatMessage(role="user", content=prompt)]
        response = await chat_with_fallback(
            messages, llm_providers,
            system_prompt=RECIPE_SYSTEM_PROMPT,
            temperature=0.7,
            json_mode=True,
        )

        try:
            text = response.content.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3].strip()
            data = json.loads(text)
            return RecipeOutput(**data)
        except Exception:
            return None

    async def suggest_alternatives(
        self,
        food_name: str,
        llm_providers: List[BaseLLMProvider],
        goal: str = "build_muscle",
    ) -> List[dict]:
        """Suggest healthier alternatives for a food."""
        prompt = f"""Suggest 3 healthier alternatives to "{food_name}" for someone whose goal is {goal}.
Return JSON array: [{{"name": "food", "benefit": "why it's better", "calories_per_100g": 150, "protein_per_100g": 20}}]"""

        messages = [ChatMessage(role="user", content=prompt)]
        response = await chat_with_fallback(
            messages, llm_providers,
            system_prompt="You are a concise nutrition expert. Return only valid JSON.",
            temperature=0.5,
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
            return []
