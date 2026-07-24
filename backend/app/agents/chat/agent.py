"""
Chat Agent.
Responsibilities: Nutrition Q&A, diet advice, food comparisons, educational responses.
Uses retrieval when required.
"""
import json
from typing import List, Optional
from pydantic import BaseModel

from app.providers.llm.base import BaseLLMProvider, ChatMessage, LLMResponse
from app.providers.llm import chat_with_fallback


CHAT_SYSTEM_PROMPT = """You are Astra AI, a world-class AI nutrition assistant for the Apparatus fitness app. 

Your personality:
- Expert yet approachable — like a knowledgeable friend, not a textbook
- Concise and actionable — avoid long paragraphs
- Use bullet points and formatting for clarity
- Always evidence-based but practical

Your capabilities:
- Answer nutrition and diet questions
- Compare foods and recommend alternatives
- Explain macros, micronutrients, meal timing
- Give diet advice tailored to fitness goals
- Suggest meals and food combinations

Rules:
- NEVER give medical advice or diagnose conditions
- NEVER prescribe specific supplements without context
- Always caveat recommendations with "consult a healthcare provider" for medical concerns
- Use metric units (grams, kcal) by default
- Be culturally aware — support Indian, Western, Mediterranean, Asian cuisines

PROFILE DATA COLLECTION:
- To calculate accurate TDEE, calories, and macros, you need the user's weight, height, age, gender, and activity level.
- IMPORTANT: If the user ALREADY HAS a daily calorie goal and protein goal set in their "User context", DO NOT ask for their weight, height, age, gender, or activity level unless they explicitly ask you to recalculate their macros.
- ONLY IF they are completely missing their calorie goals, OR they explicitly ask to recalculate their macros, should you ask for their missing physical details.
- When the user provides these missing details, you MUST save them by including a JSON block anywhere in your response exactly like this:
```json
{
  "_update_profile": {
    "weight_kg": 75,
    "height_cm": 180,
    "age": 30,
    "gender": "male",
    "activity_level": "moderate"
  }
}
```
- Activity levels are: sedentary, light, moderate, active, very_active.
"""


class ChatOutput(BaseModel):
    response: str
    reasoning: Optional[str] = None
    tokens_used: int = 0
    provider_used: str = ""


class ChatAgent:
    """
    Chat Agent - handles nutrition Q&A and diet advice.
    Uses LLM for reasoning, tools for any calculations.
    """

    async def run(
        self,
        user_message: str,
        chat_history: List[dict],
        llm_providers: List[BaseLLMProvider],
        user_context: Optional[dict] = None,
    ) -> ChatOutput:
        """
        Process a chat message with context.
        """
        # Build messages from history
        messages = []
        for msg in chat_history[-14:]:  # Last 14 messages (short-term memory)
            messages.append(ChatMessage(role=msg["role"], content=msg["content"]))

        # Add user context to system prompt if available
        system = CHAT_SYSTEM_PROMPT
        if user_context:
            context_parts = []
            if user_context.get("goal"):
                context_parts.append(f"User's goal: {user_context['goal']}")
            if user_context.get("calorie_goal"):
                context_parts.append(f"Daily calorie goal: {user_context['calorie_goal']} kcal")
            if user_context.get("protein_goal"):
                context_parts.append(f"Daily protein goal: {user_context['protein_goal']}g")
            if user_context.get("dietary_restrictions"):
                context_parts.append(f"Dietary restrictions: {', '.join(user_context['dietary_restrictions'])}")
            if user_context.get("allergies"):
                context_parts.append(f"Allergies: {', '.join(user_context['allergies'])}")
            if user_context.get("weight_kg"):
                context_parts.append(f"Weight: {user_context['weight_kg']} kg")
            if user_context.get("height_cm"):
                context_parts.append(f"Height: {user_context['height_cm']} cm")
            if user_context.get("age"):
                context_parts.append(f"Age: {user_context['age']}")
            if user_context.get("gender"):
                context_parts.append(f"Gender: {user_context['gender']}")
            if user_context.get("activity_level"):
                context_parts.append(f"Activity Level: {user_context['activity_level']}")
            if user_context.get("today_nutrition"):
                n = user_context["today_nutrition"]
                context_parts.append(
                    f"Today so far: {n.get('total_calories', 0):.0f} kcal, "
                    f"{n.get('total_protein', 0):.0f}g protein, "
                    f"{n.get('meal_count', 0)} meals logged"
                )
            if context_parts:
                system += "\n\nUser context:\n" + "\n".join(f"- {c}" for c in context_parts)

        messages.append(ChatMessage(role="user", content=user_message))

        response = await chat_with_fallback(
            messages, llm_providers,
            system_prompt=system,
            temperature=0.7,
            max_tokens=1024,
        )

        import logging
        logger = logging.getLogger(__name__)
        print(f"\n[LLM USAGE] Provider: {response.provider_used} | Tokens Used: {response.tokens_used}")
        logger.info(f"LLM Provider Used: {response.provider_used}, Tokens Used: {response.tokens_used}")

        return ChatOutput(
            response=response.content,
            reasoning=response.reasoning,
            tokens_used=response.tokens_used,
            provider_used=response.provider_used,
        )
