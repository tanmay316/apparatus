"""
Gemini provider (chat + vision) on the async google-genai client.

The previous version called the blocking client from async code, which froze the
whole event loop for the duration of every Gemini request.
"""
from __future__ import annotations

import base64
import logging
import time
from typing import AsyncIterator, List, Optional

from google import genai
from google.genai import types as genai_types

from app.core.config import settings
from app.providers import registry
from app.providers.llm.base import BaseLLMProvider, ChatMessage, LLMResponse
from app.providers.llm.openai_compat import ProviderError

logger = logging.getLogger(__name__)


class GeminiProvider(BaseLLMProvider):
    provider_name = "gemini"

    def __init__(self, api_key: str, chat_models: List[str], vision_models: List[str]):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        self.chat_models = chat_models
        self.vision_models = vision_models

    def _config(self, system_prompt: Optional[str], temperature: float, max_tokens: Optional[int], json_mode: bool):
        return genai_types.GenerateContentConfig(
            system_instruction=system_prompt or None,
            temperature=temperature,
            max_output_tokens=max_tokens or None,
            response_mime_type="application/json" if json_mode else None,
            # No tools are registered; AFC only adds overhead and warnings.
            automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(disable=True),
        )

    async def _generate(self, contents, config, kind: str, timeout: float) -> LLMResponse:
        import asyncio

        models = [m for m in (self.vision_models if kind == "vision" else self.chat_models) if not registry.is_dead("gemini", m)]
        if not models:
            raise ProviderError("gemini: no model available")
        start = time.time()
        last_error = ""
        for model in models:
            try:
                response = await asyncio.wait_for(
                    self.client.aio.models.generate_content(model=model, contents=contents, config=config),
                    timeout=timeout,
                )
                text = (response.text or "").strip()
                if not text:
                    last_error = f"{model}: empty or blocked reply"
                    continue
                content, reasoning = registry.strip_reasoning(text)
                usage = getattr(response, "usage_metadata", None)
                return LLMResponse(
                    content=content,
                    reasoning=reasoning,
                    provider_used=f"gemini ({model})",
                    model_used=model,
                    tokens_used=getattr(usage, "total_token_count", 0) or 0,
                    latency_ms=(time.time() - start) * 1000,
                )
            except asyncio.TimeoutError:
                last_error = f"{model}: timed out"
            except Exception as exc:
                code = getattr(exc, "code", None)
                message = str(exc)
                if registry.is_model_gone_error(code if isinstance(code, int) else None, message):
                    registry.mark_dead("gemini", model, message)
                last_error = f"{model}: {message[:200]}"
            logger.info("gemini model failed: %s", last_error)
        raise ProviderError(f"gemini: {last_error}")

    async def chat(self, messages: List[ChatMessage], system_prompt: Optional[str] = None, temperature: float = 0.7,
                   max_tokens: Optional[int] = None, json_mode: bool = False) -> LLMResponse:
        contents = [
            genai_types.Content(
                role="model" if m.role == "assistant" else "user",
                parts=[genai_types.Part.from_text(text=m.content)],
            )
            for m in messages if m.role != "system"
        ]
        return await self._generate(contents, self._config(system_prompt, temperature, max_tokens, json_mode), "chat",
                                     settings.LLM_CALL_TIMEOUT)

    async def stream_chat(self, messages: List[ChatMessage], system_prompt: Optional[str] = None,
                          temperature: float = 0.7, max_tokens: Optional[int] = None) -> AsyncIterator[str]:
        contents = [
            genai_types.Content(
                role="model" if m.role == "assistant" else "user",
                parts=[genai_types.Part.from_text(text=m.content)],
            )
            for m in messages if m.role != "system"
        ]
        config = self._config(system_prompt, temperature, max_tokens, False)
        models = [m for m in self.chat_models if not registry.is_dead("gemini", m)]
        last_error = "no model available"
        for model in models:
            strip = registry.ThinkStripper()
            started = False
            try:
                stream = await self.client.aio.models.generate_content_stream(model=model, contents=contents, config=config)
                async for chunk in stream:
                    try:
                        piece = chunk.text or ""
                    except Exception:
                        piece = ""
                    text = strip.feed(piece) if piece else ""
                    if text:
                        started = True
                        yield text
                tail = strip.flush()
                if tail:
                    started = True
                    yield tail
                if started:
                    return
                last_error = f"{model}: empty or blocked reply"
            except Exception as exc:
                if started:
                    return
                code = getattr(exc, "code", None)
                message = str(exc)
                if registry.is_model_gone_error(code if isinstance(code, int) else None, message):
                    registry.mark_dead("gemini", model, message)
                last_error = f"{model}: {message[:200]}"
            logger.info("gemini stream failed: %s", last_error)
        raise ProviderError(f"gemini: {last_error}")

    async def vision(self, prompt: str, image_base64: str, mime_type: str = "image/jpeg",
                     json_mode: bool = True, max_tokens: int = 2048) -> LLMResponse:
        contents = [genai_types.Content(role="user", parts=[
            genai_types.Part.from_text(text=prompt),
            genai_types.Part.from_bytes(data=base64.b64decode(image_base64), mime_type=mime_type),
        ])]
        return await self._generate(contents, self._config(None, 0.1, max_tokens, json_mode), "vision",
                                    settings.VISION_CALL_TIMEOUT)

    async def analyze(self, prompt: str, data: str, json_mode: bool = True) -> LLMResponse:
        return await self.chat([ChatMessage(role="user", content=f"{prompt}\n\nData:\n{data}")], json_mode=json_mode, temperature=0.1)

    async def health_check(self) -> bool:
        return bool(self.api_key)
