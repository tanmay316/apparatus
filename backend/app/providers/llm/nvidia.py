import time
import json
from typing import List, Optional
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from app.providers.llm.base import BaseLLMProvider, ChatMessage, LLMResponse


class NvidiaLLMProvider(BaseLLMProvider):
    """Nvidia LLM Provider using ChatNVIDIA and moonshotai/kimi-k2.6 model."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "moonshotai/kimi-k2.6"):
        from app.core.config import settings
        self.api_key = api_key or settings.NVIDIA_API_KEY or "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"
        self.model = model
        self.provider_name = "nvidia"

    async def chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: float = 1.0,
        max_tokens: int = 16384,
        json_mode: bool = False,
    ) -> LLMResponse:
        start_time = time.time()
        
        try:
            llm = ChatNVIDIA(
                model=self.model,
                api_key=self.api_key,
                temperature=temperature,
                top_p=1,
                max_completion_tokens=max_tokens,
            )

            lc_messages = []
            if system_prompt:
                lc_messages.append(SystemMessage(content=system_prompt))
                
            for msg in messages:
                if msg.role == "user":
                    lc_messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    lc_messages.append(AIMessage(content=msg.content))

            response = await llm.ainvoke(lc_messages)
            content = str(response.content)

            # Extract reasoning_content if present in additional_kwargs
            if hasattr(response, "additional_kwargs") and response.additional_kwargs:
                reasoning = response.additional_kwargs.get("reasoning_content")
                if reasoning and not content:
                    content = str(reasoning)

            return LLMResponse(
                content=content,
                tokens_used=getattr(response, "response_metadata", {}).get("token_usage", {}).get("total_tokens", 0),
                provider_used=f"nvidia ({self.model})",
                latency_ms=(time.time() - start_time) * 1000,
            )
            
        except Exception as e:
            return LLMResponse(
                content=f"Error: {str(e)}",
                provider_used=self.provider_name,
            )

    async def analyze(
        self,
        prompt: str,
        data: str,
        json_mode: bool = True,
    ) -> LLMResponse:
        messages = [
            ChatMessage(role="user", content=f"{prompt}\n\nData:\n{data}")
        ]
        return await self.chat(messages=messages, json_mode=json_mode)
