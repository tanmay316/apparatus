"""
OpenRouter Vision Provider.
Uses OpenRouter as a unified gateway to multiple vision models.
"""
import time
import json
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
  "raw_description": "...",
  "detected_foods": [{"name": "...", "confidence": 0.95, "estimated_weight_grams": 150, "category": "protein", "calories": 250, "protein": 20, "carbs": 15, "fat": 10, "fiber": 2}]
}"""


class OpenRouterVisionProvider(BaseVisionProvider):
    """OpenRouter-based vision provider — the final fallback."""

    provider_name = "openrouter"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.base_url = "https://openrouter.ai/api/v1"
        self.model = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"

    async def _call(self, prompt: str, image_base64: str, mime_type: str = "image/jpeg") -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://apparatus.fitness",
            "X-Title": "Apparatus Nutrition",
        }
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_base64}"}},
                    ],
                }
            ],
            "max_tokens": 2048,
            "temperature": 0.1,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def detect_food(self, image_base64: str, mime_type: str = "image/jpeg") -> VisionResult:
        start = time.time()
        try:
            raw = await self._call(FOOD_DETECTION_PROMPT, image_base64, mime_type)
            text = raw.strip()
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
            return VisionResult(
                detected_foods=[], raw_description=f"Error: {e}",
                is_food=False, provider_used=self.provider_name,
                latency_ms=(time.time() - start) * 1000,
            )

    async def extract_label(self, image_base64: str, mime_type: str = "image/jpeg") -> Optional[str]:
        try:
            return await self._call("Extract ALL text from this food label/packaging.", image_base64, mime_type)
        except Exception:
            return None

    async def estimate_portions(self, image_base64: str, detected_foods: List[DetectedFood], mime_type: str = "image/jpeg") -> List[DetectedFood]:
        try:
            detections_str = json.dumps([f.model_dump() for f in detected_foods])
            prompt = f"Refine portion estimates for: {detections_str}. Return JSON array."
            raw = await self._call(prompt, image_base64, mime_type)
            text = raw.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3].strip()
            return [DetectedFood(**f) for f in json.loads(text)]
        except Exception:
            return detected_foods

    async def health_check(self) -> bool:
        return bool(self.api_key)
