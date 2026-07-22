"""
LLM Provider Registry with automatic fallback.
Order: Nvidia → Gemini → OpenRouter
"""
from typing import List, Optional
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
    max_tokens: int = 2048,
    json_mode: bool = False,
) -> LLMResponse:
    """Try each LLM provider in order until one succeeds, with 0ms response caching for repeated queries."""
    cache_key = None
    if len(messages) <= 2 and not json_mode and temperature <= 0.8:
        cache_key = _compute_cache_key(messages, system_prompt, json_mode)
        cached = _llm_cache.get(cache_key)
        if cached:
            ts, cached_res = cached
            if time.time() - ts < CACHE_TTL_SECONDS:
                logger.info(f"⚡ Returning cached LLM response for query (0ms latency)")
                return cached_res

    last_error = "No LLM providers configured"
    for provider in providers:
        try:
            logger.info(f"Trying LLM provider: {provider.provider_name}")
            result = await provider.chat(
                messages, system_prompt, temperature, max_tokens, json_mode
            )
            
            if not result.content.startswith("Error:"):
                if cache_key:
                    _llm_cache[cache_key] = (time.time(), result)
                # Extract and print detailed usage/rate limits
                print(f"\n" + "="*50)
                print(f"🤖 LLM CALL SUCCESS (Cached)")
                print(f"Provider & Model : {result.provider_used}")
                print(f"Tokens Used      : {result.tokens_used}")
                print(f"Latency          : {result.latency_ms / 1000:.2f}s")
                print("="*50 + "\n")
                return result
            last_error = result.content
        except Exception as e:
            last_error = f"{provider.provider_name}: {str(e)}"
            print(f"\n❌ [LLM CALL FAILED] {provider.provider_name} -> {str(e)}\n")
            logger.warning(f"LLM provider {provider.provider_name} failed: {e}")
            continue

    return LLMResponse(content=f"All LLM providers failed: {last_error}", provider_used="none")
