import time
import json
from typing import List, Optional
from langchain_nvidia_ai_endpoints import ChatNVIDIA

from app.providers.llm.base import BaseLLMProvider, ChatMessage, LLMResponse


class NvidiaLLMProvider(BaseLLMProvider):
    """Nvidia LLM Provider using langchain-nvidia-ai-endpoints."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Meta Llama 3 70B Instruct is usually a fast, high-quality default on NIM
        self.model = "meta/llama3-70b-instruct"
        self.provider_name = "nvidia"

    async def chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> LLMResponse:
        start_time = time.time()
        
        try:
            llm = ChatNVIDIA(
                nvidia_api_key=self.api_key,
                model=self.model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            # Build standard Langchain messages
            from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
            
            lc_messages = []
            if system_prompt:
                lc_messages.append(SystemMessage(content=system_prompt))
                
            for msg in messages:
                if msg.role == "user":
                    lc_messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    lc_messages.append(AIMessage(content=msg.content))

            # Langchain invoke
            response = await llm.ainvoke(lc_messages)
            content = str(response.content)

            return LLMResponse(
                content=content,
                tokens_used=response.response_metadata.get("token_usage", {}).get("total_tokens", 0),
                provider_used=self.provider_name,
                latency_ms=(time.time() - start_time) * 1000,
            )
            
        except Exception as e:
            return LLMResponse(
                content=f"Error: {str(e)}",
                provider_used=self.provider_name,
            )
