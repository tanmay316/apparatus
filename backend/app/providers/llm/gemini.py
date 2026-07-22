"""
Gemini LLM Provider.
"""
import time
import json
from typing import List, Optional

from google import genai
from google.genai import types as genai_types

from app.providers.llm.base import BaseLLMProvider, LLMResponse, ChatMessage
from app.core.config import settings


class GeminiLLMProvider(BaseLLMProvider):
    provider_name = "gemini"

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.0-flash"):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = model

    async def chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> LLMResponse:
        if not self.client:
            return LLMResponse(content="Error: Gemini API key not provided", provider_used=self.provider_name)
        start = time.time()
        try:
            contents = []
            if system_prompt:
                contents.append(genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text=f"[System Instructions]: {system_prompt}")]
                ))
                contents.append(genai_types.Content(
                    role="model",
                    parts=[genai_types.Part.from_text(text="Understood. I will follow these instructions.")]
                ))

            for msg in messages:
                role = "model" if msg.role == "assistant" else "user"
                contents.append(genai_types.Content(
                    role=role,
                    parts=[genai_types.Part.from_text(text=msg.content)]
                ))

            config = genai_types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            )
            if json_mode:
                config.response_mime_type = "application/json"

            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )

            latency = (time.time() - start) * 1000
            return LLMResponse(
                content=response.text.strip(),
                provider_used=self.provider_name,
                model_used=self.model,
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.time() - start) * 1000
            return LLMResponse(
                content=f"Error: {str(e)}",
                provider_used=self.provider_name,
                model_used=self.model,
                latency_ms=latency,
            )

    async def analyze(self, prompt: str, data: str, json_mode: bool = True) -> LLMResponse:
        messages = [ChatMessage(role="user", content=f"{prompt}\n\nData:\n{data}")]
        return await self.chat(messages, json_mode=json_mode, temperature=0.1)

    async def health_check(self) -> bool:
        return bool(self.api_key)
