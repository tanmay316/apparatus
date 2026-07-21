"""
Base LLM Provider Interface.
All LLM providers must implement this interface.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str  # "system", "user", "assistant"
    content: str


class LLMResponse(BaseModel):
    content: str
    provider_used: str = ""
    model_used: str = ""
    tokens_used: int = 0
    latency_ms: float = 0.0


class BaseLLMProvider(ABC):
    """Abstract base class for all LLM providers."""

    provider_name: str = "base"

    @abstractmethod
    async def chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> LLMResponse:
        """Send a chat completion request."""
        ...

    @abstractmethod
    async def analyze(
        self,
        prompt: str,
        data: str,
        json_mode: bool = True,
    ) -> LLMResponse:
        """Analyze structured data and return a response."""
        ...

    async def health_check(self) -> bool:
        return True
