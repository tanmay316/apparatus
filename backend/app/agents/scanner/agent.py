"""
Scanner Agent.
Responsibilities: Food image recognition, OCR, barcode, serving estimation, confidence scores.
NEVER calculates nutrition. Only detects what food is in the image.
"""
from typing import List, Optional
from pydantic import BaseModel

from app.providers.vision.base import BaseVisionProvider, VisionResult, DetectedFood
from app.providers.vision import detect_food_with_fallback


class ScannerOutput(BaseModel):
    """Output from the Scanner Agent."""
    detected_foods: List[DetectedFood] = []
    raw_description: str = ""
    label_text: Optional[str] = None
    is_food: bool = True
    plate_count: int = 1
    provider_used: str = ""
    latency_ms: float = 0.0


class ScannerAgent:
    """
    Scanner Agent — detects food from images.
    NEVER calculates nutrition. Only identifies and estimates portions.
    """

    async def run(
        self,
        image_base64: str,
        providers: List[BaseVisionProvider],
        mime_type: str = "image/jpeg",
    ) -> ScannerOutput:
        """
        Execute the scanner pipeline:
        1. Run vision detection with provider fallback
        2. Optionally refine portions
        3. Return detected foods with confidence
        """
        # Step 1: Detect food with fallback
        vision_result = await detect_food_with_fallback(image_base64, providers, mime_type)

        # Step 2: If we got results, try to refine portion estimates
        if vision_result.detected_foods and len(providers) > 0:
            try:
                provider = next(
                    (p for p in providers if p.provider_name == vision_result.provider_used),
                    providers[0]
                )
                refined = await provider.estimate_portions(
                    image_base64, vision_result.detected_foods, mime_type
                )
                vision_result.detected_foods = refined
            except Exception:
                pass  # Keep original estimates

        return ScannerOutput(
            detected_foods=vision_result.detected_foods,
            raw_description=vision_result.raw_description,
            is_food=vision_result.is_food,
            plate_count=vision_result.plate_count,
            provider_used=vision_result.provider_used,
            latency_ms=vision_result.latency_ms,
        )

    async def scan_label(
        self,
        image_base64: str,
        providers: List[BaseVisionProvider],
        mime_type: str = "image/jpeg",
    ) -> Optional[str]:
        """Extract text from a food label using OCR."""
        for provider in providers:
            try:
                text = await provider.extract_label(image_base64, mime_type)
                if text:
                    return text
            except Exception:
                continue
        return None
