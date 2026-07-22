"""
Vision Provider Registry with automatic fallback support.
Order: Nvidia → Gemini → OpenRouter
"""
from typing import List, Optional
import logging

from app.providers.vision.base import BaseVisionProvider, VisionResult, DetectedFood
from app.providers.vision.groq import GroqVisionProvider
from app.providers.vision.nvidia import NvidiaVisionProvider
from app.providers.vision.gemini import GeminiVisionProvider
from app.providers.vision.openrouter import OpenRouterVisionProvider

logger = logging.getLogger(__name__)


def get_vision_providers(
    groq_key: str = "",
    nvidia_key: str = "",
    gemini_key: str = "",
    openrouter_key: str = "",
) -> List[BaseVisionProvider]:
    """Build an ordered list of available vision providers."""
    providers: List[BaseVisionProvider] = []
    if groq_key and groq_key.strip():
        providers.append(GroqVisionProvider(api_key=groq_key.strip()))
    if nvidia_key and nvidia_key.strip():
        providers.append(NvidiaVisionProvider(api_key=nvidia_key.strip()))
    if gemini_key and gemini_key.strip():
        providers.append(GeminiVisionProvider(api_key=gemini_key.strip()))
    if openrouter_key and openrouter_key.strip():
        providers.append(OpenRouterVisionProvider(api_key=openrouter_key.strip()))
    return providers


async def detect_food_with_fallback(
    image_base64: str,
    providers: List[BaseVisionProvider],
    mime_type: str = "image/jpeg",
) -> VisionResult:
    """Try each provider in order until one succeeds."""
    last_error = "No vision providers configured"
    for provider in providers:
        try:
            logger.info(f"Trying vision provider: {provider.provider_name}")
            result = await provider.detect_food(image_base64, mime_type)
            if result.detected_foods or result.is_food:
                logger.info(
                    f"Vision success with {provider.provider_name} "
                    f"({len(result.detected_foods)} foods, {result.latency_ms:.0f}ms)"
                )
                return result
            last_error = f"{provider.provider_name}: no foods detected"
        except Exception as e:
            last_error = f"{provider.provider_name}: {str(e)}"
            logger.warning(f"Vision provider {provider.provider_name} failed: {e}")
            continue

    logger.error(f"All vision providers failed. Last error: {last_error}")
    return VisionResult(
        detected_foods=[],
        raw_description=f"All providers failed: {last_error}",
        is_food=False,
        provider_used="none",
    )
