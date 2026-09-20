"""
LLM Provider Registry with automatic fallback.
Order: Nvidia → Gemini → OpenRouter
"""
from typing import List, Optional
import asyncio
import logging

from app.providers.llm.base import BaseLLMProvider, LLMResponse, ChatMessage
from app.providers.llm.groq import GroqLLMProvider
from app.providers.llm.nvidia import NvidiaLLMProvider
from app.providers.llm.gemini import GeminiLLMProvider
from app.providers.llm.openrouter import OpenRouterLLMProvider

import hashlib
import time

logger = logging.getLogger(__name__)

# In-memory TTL cache for identical LLM queries (30 minutes TTL)
_llm_cache = {}
CACHE_TTL_SECONDS = 1800


def _compute_cache_key(messages: List[ChatMessage], system_prompt: Optional[str], json_mode: bool) -> str:
    msg_str = "|".join(f"{m.role}:{m.content.strip().lower()}" for m in messages)
    sys_str = (system_prompt or "").strip().lower()
    raw = f"{msg_str}__sys:{sys_str}__json:{json_mode}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def clear_llm_cache():
    """Invalidate all cached LLM responses when new user data or meals arrive."""
    global _llm_cache
    _llm_cache.clear()
    logger.info("Cleared LLM response cache.")


def get_llm_providers(
    groq_key: str = "",
    nvidia_key: str = "",
    gemini_key: str = "",
    openrouter_key: str = "",
) -> List[BaseLLMProvider]:
    """Build an ordered list of available LLM providers with automatic environment key fallbacks."""
    from app.core.config import settings

    grk = groq_key or settings.GROQ_API_KEY
    nk = nvidia_key or settings.NVIDIA_API_KEY
    gk = gemini_key or settings.GEMINI_API_KEY
    ok = openrouter_key or settings.OPENROUTER_API_KEY

    providers: List[BaseLLMProvider] = []
    # Priority Order: Groq -> NVIDIA -> Gemini -> OpenRouter
    if grk and grk.strip():
        providers.append(GroqLLMProvider(api_key=grk.strip()))
    if nk and nk.strip():
        providers.append(NvidiaLLMProvider(api_key=nk.strip()))
    if gk and gk.strip():
        providers.append(GeminiLLMProvider(api_key=gk.strip()))
    if ok and ok.strip():
        providers.append(OpenRouterLLMProvider(api_key=ok.strip()))
    return providers


async def chat_with_fallback(
    messages: List[ChatMessage],
    providers: List[BaseLLMProvider],
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    json_mode: bool = False,
    total_timeout: float = 45.0,
) -> LLMResponse:
    """Try each LLM provider in order until one succeeds, with 0ms response caching for repeated queries."""
    cache_key = None
    if len(messages) <= 2 and not json_mode and temperature <= 0.8:
        cache_key = _compute_cache_key(messages, system_prompt, json_mode)
        cached = _llm_cache.get(cache_key)
        if cached:
            ts, cached_res = cached
            if time.time() - ts < CACHE_TTL_SECONDS:
                logger.info("Returning cached LLM response (0ms latency)")
                return cached_res

    deadline = time.monotonic() + total_timeout
    last_error = "No LLM providers configured"
    for provider in providers:
        # A slow chain must not outlive the client's patience; stop trying once
        # the overall budget is spent rather than walking every provider.
        remaining = deadline - time.monotonic()
        if remaining <= 1.0:
            last_error = f"Timed out after {total_timeout:.0f}s before {provider.provider_name}"
            logger.warning(last_error)
            break

        try:
            logger.info("Trying LLM provider: %s", provider.provider_name)
            result = await asyncio.wait_for(
                provider.chat(messages, system_prompt, temperature, max_tokens, json_mode),
                timeout=remaining,
            )

            if not result.content.startswith("Error:"):
                if cache_key:
                    _llm_cache[cache_key] = (time.time(), result)
                logger.info(
                    "LLM ok provider=%s tokens=%s latency_ms=%s",
                    result.provider_used, result.tokens_used, result.latency_ms,
                )
                return result

            last_error = result.content
            logger.warning("LLM provider %s failed: %s", provider.provider_name, last_error)

        except asyncio.TimeoutError:
            last_error = f"{provider.provider_name}: timed out"
            logger.warning("LLM provider %s timed out", provider.provider_name)
            continue
        except Exception as e:
            error_msg = str(e)
            if hasattr(e, "response") and hasattr(e.response, "text"):
                error_msg += f" - Body: {e.response.text}"
            last_error = f"{provider.provider_name}: {error_msg}"
            logger.warning("LLM provider %s raised: %s", provider.provider_name, error_msg)
            continue

    logger.error("All LLM providers failed: %s", last_error)
    return LLMResponse(content=f"All LLM providers failed: {last_error}", provider_used="none")
