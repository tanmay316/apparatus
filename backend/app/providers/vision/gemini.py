"""
Gemini Vision Provider.
Uses Google's Gemini models for food detection and OCR.
"""
import time
import json
from typing import List, Optional

from google import genai
from google.genai import types as genai_types

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
  "raw_description": "A plate of chicken curry with rice and naan",
  "detected_foods": [
    {
      "name": "chicken curry",
      "confidence": 0.95,
      "estimated_weight_grams": 200,
      "category": "protein",
      "calories": 320,
      "protein": 28,
      "carbs": 10,
      "fat": 18,
      "fiber": 2
    }
  ]
}"""

LABEL_EXTRACTION_PROMPT = """Extract ALL text visible on this food label or packaging.
Include: product name, serving size, calories, protein, carbs, fat, fiber, sugar, sodium, ingredients list.
Return the extracted text as a single string, preserving structure."""

PORTION_REFINEMENT_PROMPT = """You are a portion estimation expert. Given these detected food items and the original image, 
refine the weight estimates. Use visual cues like plate size (standard dinner plate = 26cm), 
utensil comparison, and food density.

Current detections: {detections}

Return updated JSON array with refined estimated_weight_grams for each item:
[{{"name": "...", "confidence": ..., "estimated_weight_grams": ..., "category": "..."}}]"""


class GeminiVisionProvider(BaseVisionProvider):
    """Gemini-based vision provider for food detection."""

    provider_name = "gemini"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.client = genai.Client(api_key=self.api_key)
        self.model = "gemini-2.0-flash"

    async def detect_food(self, image_base64: str, mime_type: str = "image/jpeg") -> VisionResult:
        start = time.time()
        try:
            import base64
            image_bytes = base64.b64decode(image_base64)

            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    genai_types.Content(parts=[
                        genai_types.Part.from_text(text=FOOD_DETECTION_PROMPT),
                        genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ])
                ],
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            raw_text = response.text.strip()
            # Strip markdown code fences if present
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[1]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3].strip()

            data = json.loads(raw_text)
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
            import base64
            image_bytes = base64.b64decode(image_base64)

            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    genai_types.Content(parts=[
                        genai_types.Part.from_text(text=LABEL_EXTRACTION_PROMPT),
                        genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ])
                ],
                config=genai_types.GenerateContentConfig(temperature=0.1),
            )
            return response.text.strip()
        except Exception:
            return None

    async def estimate_portions(self, image_base64: str, detected_foods: List[DetectedFood], mime_type: str = "image/jpeg") -> List[DetectedFood]:
        try:
            import base64
            image_bytes = base64.b64decode(image_base64)
            detections_str = json.dumps([f.model_dump() for f in detected_foods])

            response = self.client.models.generate_content(
                model=self.model,
                contents=[
                    genai_types.Content(parts=[
                        genai_types.Part.from_text(
                            text=PORTION_REFINEMENT_PROMPT.format(detections=detections_str)
                        ),
                        genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    ])
                ],
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            raw_text = response.text.strip()
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[1]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3].strip()

            data = json.loads(raw_text)
            return [DetectedFood(**f) for f in data]
        except Exception:
            return detected_foods

    async def health_check(self) -> bool:
        return bool(self.api_key)
