"""
OpenRouter LLM Provider.
Unified gateway to multiple LLM models.
"""
import time
import json
from typing import List, Optional

import httpx

from app.providers.llm.base import BaseLLMProvider, LLMResponse, ChatMessage
from app.core.config import settings


class OpenRouterLLMProvider(BaseLLMProvider):
    provider_name = "openrouter"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.base_url = "https://openrouter.ai/api/v1"
        self.model = "google/gemini-2.0-flash-001"

    async def chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> LLMResponse:
        start = time.time()
        try:
            api_messages = []
            if system_prompt:
                api_messages.append({"role": "system", "content": system_prompt})
            for msg in messages:
                api_messages.append({"role": msg.role, "content": msg.content})

            payload = {
                "model": self.model,
                "messages": api_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://apparatus.fitness",
                "X-Title": "Apparatus Nutrition",
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

            latency = (time.time() - start) * 1000
            content = data["choices"][0]["message"]["content"]
            tokens = data.get("usage", {}).get("total_tokens", 0)

            return LLMResponse(
                content=content.strip(),
                provider_used=self.provider_name,
                model_used=self.model,
                tokens_used=tokens,
                latency_ms=latency,
            )
        except Exception as e:
            return LLMResponse(
                content=f"Error: {str(e)}",
                provider_used=self.provider_name,
                model_used=self.model,
                latency_ms=(time.time() - start) * 1000,
            )

    async def analyze(self, prompt: str, data: str, json_mode: bool = True) -> LLMResponse:
        messages = [ChatMessage(role="user", content=f"{prompt}\n\nData:\n{data}")]
        return await self.chat(messages, json_mode=json_mode, temperature=0.1)

    async def health_check(self) -> bool:
        return bool(self.api_key)
