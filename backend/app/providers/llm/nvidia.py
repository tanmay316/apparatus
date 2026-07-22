import time
import json
from typing import List, Optional
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from app.providers.llm.base import BaseLLMProvider, ChatMessage, LLMResponse


class NvidiaLLMProvider(BaseLLMProvider):
    """Nvidia LLM Provider using ChatNVIDIA with automatic fallback to meta/llama-3.3-70b-instruct."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "thinkingmachines/inkling"):
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
        
        lc_messages = []
        if system_prompt:
            lc_messages.append(SystemMessage(content=system_prompt))
            
        for msg in messages:
            if msg.role == "user":
                lc_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                lc_messages.append(AIMessage(content=msg.content))

        import asyncio
        import logging
        logger = logging.getLogger(__name__)
        model_to_use = self.model
        try:
            llm = ChatNVIDIA(
                model=model_to_use,
                api_key=self.api_key,
                temperature=temperature,
                top_p=1,
                max_completion_tokens=max_tokens,
                timeout=180,
            )

            import asyncio
            response = await asyncio.wait_for(llm.ainvoke(lc_messages), timeout=185.0)
        except Exception as err:
            err_str = str(err)
            if any(k in err_str.lower() for k in ["404", "not found", "410", "unknown error", "gone", "timeout"]):
                try:
                    model_to_use = "meta/llama-3.2-11b-vision-instruct"
                    llm = ChatNVIDIA(
                        model=model_to_use,
                        api_key=self.api_key,
                        temperature=temperature,
                        top_p=1,
                        max_completion_tokens=max_tokens,
                        timeout=180,
                    )
                    response = await asyncio.wait_for(llm.ainvoke(lc_messages), timeout=185.0)
                except Exception as fallback_err:
                    return LLMResponse(
                        content=f"Error: {fallback_err}",
                        provider_used=self.provider_name,
                    )
            else:
                return LLMResponse(
                    content=f"Error: {err_str}",
                    provider_used=self.provider_name,
                )

        content = str(response.content)
        reasoning = None

        logger.info(f"NVIDIA Response type: {type(response)}")
        if hasattr(response, "additional_kwargs"):
            logger.info(f"NVIDIA additional_kwargs: {response.additional_kwargs}")
        if hasattr(response, "response_metadata"):
            logger.info(f"NVIDIA response_metadata: {response.response_metadata}")

        # Extract reasoning_content if present in additional_kwargs (e.g. Kimi-k2.6)
        if hasattr(response, "additional_kwargs") and response.additional_kwargs:
            r_content = response.additional_kwargs.get("reasoning_content")
            if r_content:
                reasoning = str(r_content)
                if not content:
                    content = reasoning
                    
        # DeepSeek R1 via NVIDIA NIM sometimes returns reasoning in message content inside `<think>` tags
        if not reasoning and "<think>" in content and "</think>" in content:
            import re
            match = re.search(r"<think>(.*?)</think>", content, re.DOTALL)
            if match:
                reasoning = match.group(1).strip()
                content = content.replace(match.group(0), "").strip()

        return LLMResponse(
            content=content,
            reasoning=reasoning,
            tokens_used=getattr(response, "response_metadata", {}).get("token_usage", {}).get("total_tokens", 0),
            provider_used=f"nvidia ({model_to_use})",
            latency_ms=(time.time() - start_time) * 1000,
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
