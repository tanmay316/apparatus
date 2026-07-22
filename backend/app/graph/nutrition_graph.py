"""
NutritionGraph — the single LangGraph orchestrator.

Flow:
Entry → Load User Context → Intent Router → Agent Node → Validation → 
Persistence → Response Formatter → END

The orchestrator NEVER:
- Calculates nutrition
- Generates recipes
- Analyzes food
- Writes SQL

It ONLY:
- Classifies intent
- Loads required memory
- Selects agent
- Runs graph
- Merges outputs
- Returns final response
"""
import logging
from typing import Any

from app.graph.state import GraphState
from app.graph.router import classify_intent

# Agents
from app.agents.scanner.agent import ScannerAgent
from app.agents.nutrition.agent import NutritionAgent
from app.agents.chat.agent import ChatAgent
from app.agents.recipe.agent import RecipeAgent

# Providers
from app.providers.vision import get_vision_providers
from app.providers.llm import get_llm_providers
from app.providers.vision.base import DetectedFood

logger = logging.getLogger(__name__)


class NutritionGraphOrchestrator:
    """
    The single orchestrator that coordinates all agents.
    Implements the LangGraph-style flow without the langgraph library dependency
    for simpler deployment on Railway free tier.
    """

    def __init__(self):
        self.scanner = ScannerAgent()
        self.nutrition = NutritionAgent()
        self.chat = ChatAgent()
        self.recipe = RecipeAgent()

    async def run(self, state: GraphState) -> GraphState:
        """Execute the full graph pipeline."""
        try:
            # ── Node 1: Load User Context ──
            state = await self._load_user_context(state)

            # ── Node 2: Intent Router ──
            has_image = len(state.uploaded_images) > 0
            intents = await classify_intent(
                state.user_message,
                has_image,
                get_llm_providers(state.groq_key, state.nvidia_key, state.gemini_key, state.openrouter_key),
            )
            state.intent = intents[0] if intents else "chat"
            logger.info(f"Classified intents: {intents}")

            # ── Node 3: Execute Agent(s) ──
            for intent in intents:
                state = await self._execute_agent(state, intent)

            # ── Node 4: Validation ──
            state = self._validate(state)

            # ── Node 5: Response Formatter ──
            state = self._format_response(state, intents)

        except Exception as e:
            logger.error(f"Graph execution error: {e}", exc_info=True)
            state.errors.append(str(e))
            state.response = {
                "success": False,
                "error": str(e),
                "intent": state.intent,
            }

        return state

    async def _load_user_context(self, state: GraphState) -> GraphState:
        """Load user goals and preferences into state."""
        # This will be populated by the API layer from the DB
        # The orchestrator just passes it through
        return state

    async def _execute_agent(self, state: GraphState, intent: str) -> GraphState:
        """Route to the correct agent based on intent."""

        if intent == "scan":
            state = await self._run_scanner(state)
            # After scanning, always run nutrition analysis
            state = await self._run_nutrition(state)

        elif intent == "chat":
            state = await self._run_chat(state)

        elif intent == "recipe":
            state = await self._run_recipe(state)

        elif intent == "plan":
            state = await self._run_plan(state)

        elif intent == "insights":
            state = await self._run_insights(state)

        return state

    async def _run_scanner(self, state: GraphState) -> GraphState:
        """Execute Scanner Agent."""
        if not state.uploaded_images:
            state.errors.append("No image provided for scanning")
            return state

        vision_providers = get_vision_providers(
            state.groq_key, state.nvidia_key, state.gemini_key, state.openrouter_key
        )

        result = await self.scanner.run(
            image_base64=state.uploaded_images[0],
            providers=vision_providers,
            mime_type=state.image_mime_type,
        )

        state.vision_result = result.model_dump()
        logger.info(
            f"Scanner: {len(result.detected_foods)} foods detected "
            f"via {result.provider_used} ({result.latency_ms:.0f}ms)"
        )
        return state

    async def _run_nutrition(self, state: GraphState) -> GraphState:
        """Execute Nutrition Agent using scanner output."""
        if not state.vision_result or not state.vision_result.get("detected_foods"):
            return state

        detected_foods = [
            DetectedFood(**f) for f in state.vision_result["detected_foods"]
        ]

        llm_providers = get_llm_providers(state.groq_key, state.nvidia_key, state.gemini_key, state.openrouter_key)

        goals = state.user_goals
        result = await self.nutrition.run(
            detected_foods=detected_foods,
            llm_providers=llm_providers,
            calorie_goal=goals.get("calorie_goal", 2000),
            protein_goal=goals.get("protein_goal", 140),
            carb_goal=goals.get("carb_goal", 250),
            fat_goal=goals.get("fat_goal", 65),
        )

        state.nutrition_result = result.model_dump()
        return state

    async def _run_chat(self, state: GraphState) -> GraphState:
        """Execute Chat Agent."""
        llm_providers = get_llm_providers(state.groq_key, state.nvidia_key, state.gemini_key, state.openrouter_key)

        user_context = {
            "goal": state.user_goals.get("fitness_goal", ""),
            "calorie_goal": state.user_goals.get("calorie_goal", 2000),
            "protein_goal": state.user_goals.get("protein_goal", 140),
            "weight_kg": state.user_goals.get("weight_kg"),
            "height_cm": state.user_goals.get("height_cm"),
            "age": state.user_goals.get("age"),
            "gender": state.user_goals.get("gender"),
            "activity_level": state.user_goals.get("activity_level"),
            "dietary_restrictions": state.user_preferences.get("dietary_restrictions", []),
            "allergies": state.user_preferences.get("allergies", []),
        }

        result = await self.chat.run(
            user_message=state.user_message,
            chat_history=state.chat_history,
            llm_providers=llm_providers,
            user_context=user_context,
        )

        state.chat_response = result.response
        state.chat_reasoning = result.reasoning
        return state

    async def _run_recipe(self, state: GraphState) -> GraphState:
        """Execute Recipe Agent."""
        llm_providers = get_llm_providers(state.groq_key, state.nvidia_key, state.gemini_key, state.openrouter_key)

        query = state.user_message
        if not query and state.vision_result:
            # Generate recipe based on scanned food
            foods = [f["name"] for f in state.vision_result.get("detected_foods", [])]
            query = f"Create a healthier version using: {', '.join(foods)}"

        result = await self.recipe.generate_recipe(
            query=query,
            llm_providers=llm_providers,
            dietary_restrictions=state.user_preferences.get("dietary_restrictions", []),
            goal=state.user_goals.get("fitness_goal", "build_muscle"),
            calorie_target=state.user_goals.get("calorie_goal"),
            protein_target=state.user_goals.get("protein_goal"),
        )

        if result:
            state.recipe_result = result.model_dump()
        return state

    async def _run_plan(self, state: GraphState) -> GraphState:
        """Execute Planner Agent (simplified for now)."""
        llm_providers = get_llm_providers(state.groq_key, state.nvidia_key, state.gemini_key, state.openrouter_key)
        from app.providers.llm import chat_with_fallback
        from app.providers.llm.base import ChatMessage
        import json

        goals = state.user_goals
        prompt = f"""Create a simple daily meal plan.
Goals: {goals.get('calorie_goal', 2000)} kcal, {goals.get('protein_goal', 140)}g protein
Goal: {goals.get('fitness_goal', 'build_muscle')}
Restrictions: {state.user_preferences.get('dietary_restrictions', [])}

Return JSON: {{
  "plan_name": "...",
  "meals": [
    {{"meal_type": "breakfast", "suggestion": "...", "estimated_calories": 500, "estimated_protein": 30}},
    ...
  ],
  "total_calories": 2000,
  "total_protein": 140,
  "tips": ["tip1"]
}}"""

        messages = [ChatMessage(role="user", content=prompt)]
        response = await chat_with_fallback(
            messages, llm_providers,
            system_prompt="You are a meal planning expert. Return only valid JSON.",
            temperature=0.7,
            json_mode=True,
        )

        try:
            text = response.content.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3].strip()
            state.meal_plan = json.loads(text)
        except Exception:
            state.errors.append("Failed to generate meal plan")

        return state

    async def _run_insights(self, state: GraphState) -> GraphState:
        """Execute Insights Agent (reads from meal history)."""
        history = state.meal_history
        if not history:
            state.insights_result = {
                "summary": "No meals logged yet. Start tracking to see insights!",
                "trends": {},
            }
            return state

        total_meals = len(history)
        avg_cal = sum(m.get("calories", 0) for m in history) / max(total_meals, 1)
        avg_pro = sum(m.get("protein", 0) for m in history) / max(total_meals, 1)
        avg_score = sum(m.get("health_score", 0) for m in history if m.get("health_score")) / max(
            sum(1 for m in history if m.get("health_score")), 1
        )

        state.insights_result = {
            "summary": f"{total_meals} meals logged, avg {avg_cal:.0f} kcal per meal",
            "trends": {
                "avg_calories_per_meal": round(avg_cal, 1),
                "avg_protein_per_meal": round(avg_pro, 1),
                "avg_health_score": round(avg_score, 1),
                "total_meals": total_meals,
            },
        }
        return state

    def _validate(self, state: GraphState) -> GraphState:
        """Validate agent outputs."""
        if state.nutrition_result:
            nutrition = state.nutrition_result.get("nutrition", {})
            cal = nutrition.get("total_calories", 0)
            if cal > 10000:
                state.errors.append(f"Unusually high calorie count: {cal}")
            if cal < 0:
                state.errors.append("Negative calorie count detected")
        return state

    def _format_response(self, state: GraphState, intents: list) -> GraphState:
        """Format the final response."""
        response = {
            "success": len(state.errors) == 0,
            "intent": intents,
        }

        if state.vision_result:
            response["vision"] = state.vision_result

        if state.nutrition_result:
            response["nutrition"] = state.nutrition_result

        if state.chat_response:
            response["chat"] = state.chat_response
            if state.chat_reasoning:
                response["reasoning"] = state.chat_reasoning

        if state.recipe_result:
            response["recipe"] = state.recipe_result

        if state.meal_plan:
            response["meal_plan"] = state.meal_plan

        if state.insights_result:
            response["insights"] = state.insights_result

        if state.errors:
            response["errors"] = state.errors

        state.response = response
        return state


# Singleton instance
orchestrator = NutritionGraphOrchestrator()
