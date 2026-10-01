"""
OpenAI-compatible provider used for Groq, NVIDIA NIM and OpenRouter.

One implementation covers chat and vision for all three, including model
discovery and automatic skipping of retired or rate-limited models.
"""
from __future__ import annotations

import json
import logging
import time
from typing import AsyncIterator, List, Optional

import httpx

from app.core.config import settings
from app.providers import registry
from app.providers.llm.base import BaseLLMProvider, ChatMessage, LLMResponse

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    pass


BASE_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "nvidia": "https://integrate.api.nvidia.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}


class OpenAICompatProvider(BaseLLMProvider):
    def __init__(self, name: str, api_key: str, chat_models: List[str], vision_models: List[str]):
        self.provider_name = name
        self.api_key = api_key
        self.base_url = BASE_URLS[name]
        self.chat_models = chat_models
        self.vision_models = vision_models

    @property
    def headers(self) -> dict:
        h = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if self.provider_name == "openrouter":
            h.update({"HTTP-Referer": "https://apparatus.fitness", "X-Title": "Apparatus"})
        return h

    async def _models(self, kind: str) -> List[str]:
        candidates = self.vision_models if kind == "vision" else self.chat_models
        discovered = await registry.discover(self.provider_name, self.base_url, self.headers)
        return registry.choose_models(self.provider_name, candidates, discovered, kind)

    async def _complete(self, api_messages: list, kind: str, temperature: float, max_tokens: Optional[int],
                        json_mode: bool, timeout: float) -> LLMResponse:
        models = await self._models(kind)
        if not models:
            raise ProviderError(f"{self.provider_name}: no {kind} model available")
        start = time.time()
        last_error = ""
        for model in models:
            payload = {"model": model, "messages": api_messages, "temperature": temperature}
            if max_tokens:
                payload["max_tokens"] = max_tokens
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        resp = await client.post(f"{self.base_url}/chat/completions", headers=self.headers, json=payload)
                    if resp.status_code >= 400:
                        body = resp.text[:600]
                        if registry.is_model_gone_error(resp.status_code, body):
                            registry.mark_dead(self.provider_name, model, body)
                            last_error = f"{model}: gone"
                            break
                        # Some models reject response_format; retry once without it.
                        if resp.status_code == 400 and json_mode and attempt == 0 and "response_format" in payload:
                            payload.pop("response_format", None)
                            continue
                        last_error = f"{model}: HTTP {resp.status_code} {body[:200]}"
                        break
                    data = resp.json()
                    choice = (data.get("choices") or [{}])[0]
                    message = choice.get("message") or {}
                    raw = message.get("content") or ""
                    if isinstance(raw, list):
                        raw = "".join(p.get("text", "") for p in raw if isinstance(p, dict))
                    content, think = registry.strip_reasoning(raw)
                    reasoning = message.get("reasoning_content") or message.get("reasoning") or think
                    if not content.strip():
                        last_error = f"{model}: empty reply"
                        break
                    return LLMResponse(
                        content=content.strip(),
                        reasoning=reasoning if isinstance(reasoning, str) else None,
                        provider_used=f"{self.provider_name} ({model})",
                        model_used=model,
                        tokens_used=(data.get("usage") or {}).get("total_tokens", 0) or 0,
                        latency_ms=(time.time() - start) * 1000,
                    )
                except httpx.TimeoutException:
                    last_error = f"{model}: timed out"
                    break
                except httpx.HTTPError as exc:
                    last_error = f"{model}: {type(exc).__name__}"
                    break
            logger.info("%s model %s failed: %s", self.provider_name, model, last_error[:200])
        raise ProviderError(f"{self.provider_name}: {last_error or 'failed'}")

    async def chat(self, messages: List[ChatMessage], system_prompt: Optional[str] = None, temperature: float = 0.7,
                   max_tokens: Optional[int] = None, json_mode: bool = False) -> LLMResponse:
        api_messages = [{"role": "system", "content": system_prompt}] if system_prompt else []
        api_messages += [{"role": m.role, "content": m.content} for m in messages]
        return await self._complete(api_messages, "chat", temperature, max_tokens, json_mode, settings.LLM_CALL_TIMEOUT)

    async def stream_chat(self, messages: List[ChatMessage], system_prompt: Optional[str] = None,
                          temperature: float = 0.7, max_tokens: Optional[int] = None) -> AsyncIterator[str]:
        """Yields reply text as the model generates it (SSE). Falls through models until one starts."""
        api_messages = [{"role": "system", "content": system_prompt}] if system_prompt else []
        api_messages += [{"role": m.role, "content": m.content} for m in messages]
        models = await self._models("chat")
        if not models:
            raise ProviderError(f"{self.provider_name}: no chat model available")
        last_error = ""
        for model in models:
            payload = {"model": model, "messages": api_messages, "temperature": temperature, "stream": True}
            if max_tokens:
                payload["max_tokens"] = max_tokens
            strip = registry.ThinkStripper()
            started = False
            try:
                timeout = httpx.Timeout(settings.LLM_CALL_TIMEOUT, connect=10.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", f"{self.base_url}/chat/completions", headers=self.headers, json=payload) as resp:
                        if resp.status_code >= 400:
                            body = (await resp.aread()).decode("utf-8", "ignore")[:600]
                            if registry.is_model_gone_error(resp.status_code, body):
                                registry.mark_dead(self.provider_name, model, body)
                            last_error = f"{model}: HTTP {resp.status_code} {body[:200]}"
                            logger.info("%s stream %s failed: %s", self.provider_name, model, last_error)
                            continue
                        async for line in resp.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                obj = json.loads(data)
                            except ValueError:
                                continue
                            delta = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
                            text = strip.feed(delta) if isinstance(delta, str) and delta else ""
                            if text:
                                started = True
                                yield text
                tail = strip.flush()
                if tail:
                    started = True
                    yield tail
                if started:
                    return
                last_error = f"{model}: empty reply"
            except httpx.HTTPError as exc:
                if started:
                    return
                last_error = f"{model}: {type(exc).__name__}"
            logger.info("%s stream %s failed: %s", self.provider_name, model, last_error[:200])
        raise ProviderError(f"{self.provider_name}: {last_error or 'stream failed'}")

    async def vision(self, prompt: str, image_base64: str, mime_type: str = "image/jpeg",
                     json_mode: bool = True, max_tokens: int = 2048) -> LLMResponse:
        api_messages = [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_base64}"}},
            ],
        }]
        return await self._complete(api_messages, "vision", 0.1, max_tokens, json_mode, settings.VISION_CALL_TIMEOUT)

    async def analyze(self, prompt: str, data: str, json_mode: bool = True) -> LLMResponse:
        return await self.chat([ChatMessage(role="user", content=f"{prompt}\n\nData:\n{data}")], json_mode=json_mode, temperature=0.1)

    async def health_check(self) -> bool:
        return bool(self.api_key)
