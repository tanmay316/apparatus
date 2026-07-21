"""
Intent Router — classifies user intent for the orchestrator.
"""
from typing import List
from app.providers.llm.base import BaseLLMProvider, ChatMessage
from app.providers.llm import chat_with_fallback
import json


INTENT_CLASSES = [
    "scan",        # Food image analysis
    "chat",        # General nutrition Q&A
    "recipe",      # Recipe generation / search
    "plan",        # Meal plan generation
    "insights",    # Analytics / reports
    "log",         # Manual meal logging
]


async def classify_intent(
    user_message: str,
    has_image: bool,
    llm_providers: List[BaseLLMProvider],
) -> List[str]:
    """
    Classify user intent. Supports multi-intent.
    Returns a list of intent strings.
    """
    # Fast path: if there's an image, it's a scan
    if has_image:
        # Check if message also asks for something else
        msg_lower = user_message.lower() if user_message else ""
        intents = ["scan"]
        if any(w in msg_lower for w in ["recipe", "cook", "make", "prepare"]):
            intents.append("recipe")
        if any(w in msg_lower for w in ["healthier", "alternative", "swap", "suggest"]):
            intents.append("recipe")
        if any(w in msg_lower for w in ["plan", "weekly", "daily", "schedule"]):
            intents.append("plan")
        return intents

    # No image — use keyword matching first (fast, no API call)
    msg_lower = user_message.lower()

    # Recipe keywords
    if any(w in msg_lower for w in ["recipe", "cook", "make me", "prepare", "how to make"]):
        return ["recipe"]

    # Plan keywords
    if any(w in msg_lower for w in ["meal plan", "weekly plan", "daily plan", "diet plan"]):
        return ["plan"]

    # Insights keywords
    if any(w in msg_lower for w in ["report", "insight", "trend", "analytics", "summary", "progress", "streak"]):
        return ["insights"]

    # Log keywords
    if any(w in msg_lower for w in ["i ate", "i had", "log meal", "add meal", "track"]):
        return ["log"]

    # Default to chat for everything else
    return ["chat"]
