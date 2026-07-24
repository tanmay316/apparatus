"""
Groq Vision Provider.
Uses Groq API endpoints (OpenAI compatible) for food detection with Llama 3.2 Vision models.
"""
import time
import json
from typing import List, Optional
import httpx

from app.providers.vision.base import BaseVisionProvider, VisionResult, DetectedFood
from app.core.config import settings
from app.providers.vision.prompt import FOOD_DETECTION_PROMPT


class GroqVisionProvider(BaseVisionProvider):
    """Groq-based vision provider for food detection."""

    provider_name = "groq"

    def __init__(self, api_key: Optional[str] = None, model: str = "qwen/qwen3.6-27b"):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.base_url = "https://api.groq.com/openai/v1"
        self.model = model

    async def _call_groq(self, prompt: str, image_base64: str, mime_type: str = "image/jpeg") -> str:
        """Make a request to Groq API endpoint."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 2048,
            "temperature": 0.1,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as err:
            # Fallback to llama-3.2-90b-vision-preview if 11b fails
            if self.model != "llama-3.2-90b-vision-preview":
                payload["model"] = "llama-3.2-90b-vision-preview"
                async with httpx.AsyncClient(timeout=35.0) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data["choices"][0]["message"]["content"]
            raise err

    async def detect_food(self, image_base64: str, mime_type: str = "image/jpeg") -> VisionResult:
        start = time.time()
        try:
            raw_text = await self._call_groq(FOOD_DETECTION_PROMPT, image_base64, mime_type)

            text = raw_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3].strip()

            data = json.loads(text)
            latency = (time.time() - start) * 1000

            foods = [DetectedFood(**f) for f in data.get("detected_foods", [])]

            return VisionResult(
                detected_foods=foods,
                raw_description=data.get("raw_description", ""),
                is_food=data.get("is_food", True),
                plate_count=data.get("plate_count", 1),
                provider_used=self.provider_name,
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.time() - start) * 1000
            return VisionResult(
                detected_foods=[],
                raw_description=f"Error: {str(e)}",
                is_food=False,
                provider_used=self.provider_name,
                latency_ms=latency,
            )

    async def extract_label(self, image_base64: str, mime_type: str = "image/jpeg") -> Optional[str]:
        try:
            prompt = "Extract ALL text visible on this food label or packaging. Include product name, serving size, calories, protein, carbs, fat, fiber, sugar, sodium, ingredients."
            return await self._call_groq(prompt, image_base64, mime_type)
        except Exception:
            return None

    async def estimate_portions(self, image_base64: str, detected_foods: List[DetectedFood], mime_type: str = "image/jpeg") -> List[DetectedFood]:
        try:
            detections_str = json.dumps([f.model_dump() for f in detected_foods])
            prompt = f"""Refine portion/weight estimates for these detected foods using visual cues.
Current detections: {detections_str}
Return ONLY a JSON array with updated estimated_weight_grams."""

            raw_text = await self._call_groq(prompt, image_base64, mime_type)
            text = raw_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3].strip()
            data = json.loads(text)
            return [DetectedFood(**f) for f in data]
        except Exception:
            return detected_foods

    async def health_check(self) -> bool:
        return bool(self.api_key)
