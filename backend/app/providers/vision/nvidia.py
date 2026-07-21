"""
Nvidia Vision Provider.
Uses Nvidia NIM endpoints (compatible with OpenAI API) for food detection.
"""
import time
import json
import base64
from typing import List, Optional

import httpx

from app.providers.vision.base import BaseVisionProvider, VisionResult, DetectedFood
from app.core.config import settings


FOOD_DETECTION_PROMPT = """You are an expert food and nutrition recognition system. Analyze this image and identify every food item visible, including cooked foods, complex dishes, and mixed plates.

For each food item, provide:
- name: The specific food name (e.g., "butter chicken", "paneer tikka", "grilled chicken breast")
- confidence: Your confidence from 0.0 to 1.0
- estimated_weight_grams: Estimated weight in grams based on visual portion size
- category: One of [protein, grain, vegetable, fruit, dairy, fat, beverage, condiment, dessert, snack, other]
- calories: Total estimated calories for this portion
- protein: Total estimated protein in grams
- carbs: Total estimated carbohydrates in grams
- fat: Total estimated fat in grams
- fiber: Total estimated fiber in grams

Also determine:
- is_food: Whether the image contains food at all (true/false)
- plate_count: How many distinct plates/servings are visible
- raw_description: A brief natural-language description of the entire meal

Respond ONLY with valid JSON in this exact format:
{
  "is_food": true,
  "plate_count": 1,
  "raw_description": "A plate of grilled chicken with rice and steamed broccoli",
  "detected_foods": [
    {
      "name": "grilled chicken breast",
      "confidence": 0.95,
      "estimated_weight_grams": 150,
      "category": "protein",
      "calories": 250,
      "protein": 30,
      "carbs": 0,
      "fat": 5,
      "fiber": 0
    }
  ]
}"""


class NvidiaVisionProvider(BaseVisionProvider):
    """Nvidia NIM-based vision provider for food detection."""

    provider_name = "nvidia"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.NVIDIA_API_KEY
        self.base_url = "https://integrate.api.nvidia.com/v1"
        self.model = "nvidia/llama-3.2-nv-vision-instruct"

    async def _call_nvidia(self, prompt: str, image_base64: str, mime_type: str = "image/jpeg") -> str:
        """Make a request to Nvidia NIM endpoint."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Nvidia NIM uses OpenAI-compatible format
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

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def detect_food(self, image_base64: str, mime_type: str = "image/jpeg") -> VisionResult:
        start = time.time()
        try:
            raw_text = await self._call_nvidia(FOOD_DETECTION_PROMPT, image_base64, mime_type)

            # Strip markdown code fences if present
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
            return await self._call_nvidia(prompt, image_base64, mime_type)
        except Exception:
            return None

    async def estimate_portions(self, image_base64: str, detected_foods: List[DetectedFood], mime_type: str = "image/jpeg") -> List[DetectedFood]:
        try:
            detections_str = json.dumps([f.model_dump() for f in detected_foods])
            prompt = f"""Refine portion/weight estimates for these detected foods using visual cues.
Current detections: {detections_str}
Return ONLY a JSON array with updated estimated_weight_grams."""

            raw_text = await self._call_nvidia(prompt, image_base64, mime_type)
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
