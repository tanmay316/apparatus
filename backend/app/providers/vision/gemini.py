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
from app.providers.vision.prompt import FOOD_DETECTION_PROMPT
from app.core.config import settings

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
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        self.model = "gemini-3.1-flash-lite"

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
