"""
Groq LLM Provider — ultra-fast open-source LLM inference.
"""
import time
import json
from typing import List, Optional
import httpx

from app.providers.llm.base import BaseLLMProvider, LLMResponse, ChatMessage
from app.core.config import settings


class GroqLLMProvider(BaseLLMProvider):
    provider_name = "groq"

    def __init__(self, api_key: Optional[str] = None, model: str = "llama-3.3-70b-versatile"):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1"
        self.model = model

    async def chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> LLMResponse:
        if not self.api_key:
            return LLMResponse(content="Error: Groq API key not provided", provider_used=self.provider_name)

        start = time.time()
        model_to_use = self.model
        try:
            api_messages = []
            if system_prompt:
                api_messages.append({"role": "system", "content": system_prompt})
            for msg in messages:
                api_messages.append({"role": msg.role, "content": msg.content})

            payload = {
                "model": model_to_use,
                "messages": api_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}

            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
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
                provider_used=f"groq ({model_to_use})",
                model_used=model_to_use,
                tokens_used=tokens,
                latency_ms=latency,
            )
        except Exception as e:
            # Fallback to llama-3.3-70b-versatile if requested model fails/404s
            if model_to_use != "llama-3.3-70b-versatile":
                try:
                    fallback_model = "llama-3.3-70b-versatile"
                    payload["model"] = fallback_model
                    async with httpx.AsyncClient(timeout=30.0) as client:
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
                        provider_used=f"groq ({fallback_model})",
                        model_used=fallback_model,
                        tokens_used=tokens,
                        latency_ms=latency,
                    )
                except Exception as fallback_err:
                    return LLMResponse(
                        content=f"Error: {fallback_err}",
                        provider_used=self.provider_name,
                        model_used=model_to_use,
                        latency_ms=(time.time() - start) * 1000,
                    )

            return LLMResponse(
                content=f"Error: {str(e)}",
                provider_used=self.provider_name,
                model_used=model_to_use,
                latency_ms=(time.time() - start) * 1000,
            )

    async def analyze(self, prompt: str, data: str, json_mode: bool = True) -> LLMResponse:
        messages = [ChatMessage(role="user", content=f"{prompt}\n\nData:\n{data}")]
        return await self.chat(messages, json_mode=json_mode, temperature=0.1)

    async def health_check(self) -> bool:
        return bool(self.api_key)
