"""
LLM provider registry with ordered fallback.

Order comes from LLM_PROVIDER_ORDER / VISION_PROVIDER_ORDER; each provider also
walks its own list of candidate models (see app.providers.registry).
"""
from typing import AsyncIterator, List, Optional
import asyncio
import hashlib
import logging
import time

from app.core.config import settings
from app.providers.llm.base import BaseLLMProvider, LLMResponse, ChatMessage
from app.providers.llm.openai_compat import OpenAICompatProvider
from app.providers.llm.gemini import GeminiProvider

logger = logging.getLogger(__name__)

# Short-lived cache for identical single-turn prompts (e.g. repeated recipe asks).
_llm_cache = {}
CACHE_TTL_SECONDS = 1800


def _compute_cache_key(messages: List[ChatMessage], system_prompt: Optional[str], json_mode: bool) -> str:
    msg_str = "|".join(f"{m.role}:{m.content.strip().lower()}" for m in messages)
    raw = f"{msg_str}__sys:{(system_prompt or '').strip().lower()}__json:{json_mode}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def clear_llm_cache():
    _llm_cache.clear()


def build_providers(
    groq_key: str = "",
    nvidia_key: str = "",
    gemini_key: str = "",
    openrouter_key: str = "",
    order: Optional[str] = None,
) -> List[BaseLLMProvider]:
    """Providers with a usable key, in configured order. Request keys win over env keys."""
    s = settings
    keys = {
        "groq": (groq_key or s.GROQ_API_KEY or "").strip(),
        "nvidia": (nvidia_key or s.NVIDIA_API_KEY or "").strip(),
        "gemini": (gemini_key or s.GEMINI_API_KEY or "").strip(),
        "openrouter": (openrouter_key or s.OPENROUTER_API_KEY or "").strip(),
    }
    models = {
        "groq": (s.csv(s.GROQ_CHAT_MODELS), s.csv(s.GROQ_VISION_MODELS)),
        "nvidia": (s.csv(s.NVIDIA_CHAT_MODELS), s.csv(s.NVIDIA_VISION_MODELS)),
        "gemini": (s.csv(s.GEMINI_CHAT_MODELS), s.csv(s.GEMINI_VISION_MODELS)),
        "openrouter": (s.csv(s.OPENROUTER_CHAT_MODELS), s.csv(s.OPENROUTER_VISION_MODELS)),
    }
    providers: List[BaseLLMProvider] = []
    for name in s.csv(order or s.LLM_PROVIDER_ORDER):
        key = keys.get(name)
        if not key or name not in models:
            continue
        chat_models, vision_models = models[name]
        if name == "gemini":
            providers.append(GeminiProvider(key, chat_models, vision_models))
        else:
            providers.append(OpenAICompatProvider(name, key, chat_models, vision_models))
    return providers


def get_llm_providers(groq_key: str = "", nvidia_key: str = "", gemini_key: str = "", openrouter_key: str = "") -> List[BaseLLMProvider]:
    return build_providers(groq_key, nvidia_key, gemini_key, openrouter_key)


def failed(response: LLMResponse) -> bool:
    return response.provider_used == "none"


async def chat_with_fallback(
    messages: List[ChatMessage],
    providers: List[BaseLLMProvider],
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    json_mode: bool = False,
    total_timeout: float = 45.0,
) -> LLMResponse:
    """Try each provider in order until one answers, within an overall time budget."""
    cache_key = None
    if len(messages) <= 2 and not json_mode and temperature <= 0.8:
        cache_key = _compute_cache_key(messages, system_prompt, json_mode)
        cached = _llm_cache.get(cache_key)
        if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    deadline = time.monotonic() + total_timeout
    last_error = "No LLM providers configured"
    for provider in providers:
        remaining = deadline - time.monotonic()
        if remaining <= 1.0:
            last_error = f"time budget spent before {provider.provider_name}"
            break
        try:
            result = await asyncio.wait_for(
                provider.chat(messages, system_prompt, temperature, max_tokens, json_mode),
                timeout=remaining,
            )
            if result.content and not result.content.startswith("Error:"):
                if cache_key:
                    _llm_cache[cache_key] = (time.time(), result)
                logger.info("LLM ok provider=%s tokens=%s latency_ms=%.0f", result.provider_used, result.tokens_used, result.latency_ms)
                return result
            last_error = result.content
        except asyncio.TimeoutError:
            last_error = f"{provider.provider_name}: timed out"
        except Exception as exc:
            last_error = str(exc)
        logger.warning("LLM provider %s failed: %s", provider.provider_name, last_error[:300])

    logger.error("All LLM providers failed: %s", last_error[:300])
    return LLMResponse(content=f"All LLM providers failed: {last_error}", provider_used="none")


async def stream_with_fallback(
    messages: List[ChatMessage],
    providers: List[BaseLLMProvider],
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    total_timeout: float = 45.0,
    first_token_timeout: float = 25.0,
    meta: Optional[dict] = None,
) -> AsyncIterator[str]:
    """Yields reply text as it is generated. Providers are tried in order until one produces a first
    token; after that we stay with it (a mid-stream failure ends the reply early)."""
    deadline = time.monotonic() + total_timeout
    for provider in providers:
        remaining = deadline - time.monotonic()
        if remaining <= 1.0:
            break
        stream_fn = getattr(provider, "stream_chat", None)
        try:
            if stream_fn is None:
                result = await asyncio.wait_for(provider.chat(messages, system_prompt, temperature, max_tokens, False), timeout=remaining)
                if result.content and not result.content.startswith("Error:"):
                    if meta is not None:
                        meta["provider"] = result.provider_used
                    yield result.content
                    return
                continue
            agen = stream_fn(messages, system_prompt, temperature, max_tokens)
            try:
                first = await asyncio.wait_for(agen.__anext__(), timeout=min(remaining, first_token_timeout))
            except StopAsyncIteration:
                continue
            if meta is not None:
                meta["provider"] = provider.provider_name
            yield first
            try:
                while True:
                    left = deadline - time.monotonic()
                    if left <= 0:
                        logger.warning("LLM stream from %s cut at the time budget", provider.provider_name)
                        break
                    try:
                        chunk = await asyncio.wait_for(agen.__anext__(), timeout=max(left, 1.0))
                    except StopAsyncIteration:
                        break
                    yield chunk
            except Exception as exc:
                logger.warning("LLM stream from %s ended early: %s", provider.provider_name, str(exc)[:200])
            finally:
                await agen.aclose()
            return
        except asyncio.TimeoutError:
            logger.warning("LLM stream provider %s: no first token in time", provider.provider_name)
        except Exception as exc:
            logger.warning("LLM stream provider %s failed: %s", provider.provider_name, str(exc)[:300])
    logger.error("All LLM providers failed to stream")
