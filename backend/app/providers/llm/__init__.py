"""
LLM Provider Registry with automatic fallback.
Order: Nvidia → Gemini → OpenRouter
"""
from typing import List, Optional
import logging

from app.providers.llm.base import BaseLLMProvider, LLMResponse, ChatMessage
from app.providers.llm.nvidia import NvidiaLLMProvider
from app.providers.llm.gemini import GeminiLLMProvider
from app.providers.llm.openrouter import OpenRouterLLMProvider

logger = logging.getLogger(__name__)


def get_llm_providers(
    nvidia_key: str = "",
    gemini_key: str = "",
    openrouter_key: str = "",
) -> List[BaseLLMProvider]:
    """Build an ordered list of available LLM providers."""
    providers: List[BaseLLMProvider] = []
    if nvidia_key:
        providers.append(NvidiaLLMProvider(api_key=nvidia_key))
    if gemini_key:
        providers.append(GeminiLLMProvider(api_key=gemini_key))
    if openrouter_key:
        providers.append(OpenRouterLLMProvider(api_key=openrouter_key))
    return providers


async def chat_with_fallback(
    messages: List[ChatMessage],
    providers: List[BaseLLMProvider],
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    json_mode: bool = False,
) -> LLMResponse:
    """Try each LLM provider in order until one succeeds."""
    last_error = "No LLM providers configured"
    for provider in providers:
        try:
            logger.info(f"Trying LLM provider: {provider.provider_name}")
            result = await provider.chat(
                messages, system_prompt, temperature, max_tokens, json_mode
            )
            if not result.content.startswith("Error:"):
                return result
            last_error = result.content
        except Exception as e:
            last_error = f"{provider.provider_name}: {str(e)}"
            logger.warning(f"LLM provider {provider.provider_name} failed: {e}")
            continue

    return LLMResponse(content=f"All LLM providers failed: {last_error}", provider_used="none")
