"""
Image Service — business logic for image handling.
"""
import hashlib
from typing import Optional
from sqlalchemy.orm import Session

from app.repositories.image_repository import ImageRepository
from app.providers.vision.base import VisionResult
from app.providers.vision import detect_food_with_fallback, get_vision_providers


class ImageService:

    def __init__(self, db: Session):
        self.db = db
        self.image_repo = ImageRepository(db)

    def save_and_analyze(
        self,
        user_id: str,
        base64_data: str,
        mime_type: str = "image/jpeg",
        source: str = "camera",
        nvidia_key: str = "",
        gemini_key: str = "",
        openrouter_key: str = "",
    ) -> tuple:
        """
        Save image to DB and run vision analysis.
        Returns (image_id, VisionResult).
        """
        # 1. Save image
        img = self.image_repo.save_image(user_id, base64_data, mime_type, source)

        # 2. Check cache
        img_hash = hashlib.md5(base64_data[:1000].encode()).hexdigest()
        cached = self.image_repo.get_cached_vision(img_hash)
        if cached:
            from app.providers.vision.base import VisionResult, DetectedFood
            result = VisionResult(**cached.result)
            self.image_repo.update_vision_result(img.id, cached.result, cached.provider, 0)
            self.db.commit()
            return img.id, result

        return img.id, img_hash

    async def run_vision(
        self,
        image_id: int,
        base64_data: str,
        img_hash: str,
        mime_type: str = "image/jpeg",
        nvidia_key: str = "",
        gemini_key: str = "",
        openrouter_key: str = "",
    ) -> VisionResult:
        """Run vision analysis with fallback chain."""
        providers = get_vision_providers(nvidia_key, gemini_key, openrouter_key)
        result = await detect_food_with_fallback(base64_data, providers, mime_type)

        # Cache the result
        result_dict = result.model_dump()
        self.image_repo.update_vision_result(
            image_id, result_dict, result.provider_used, result.latency_ms
        )
        if result.detected_foods:
            self.image_repo.save_vision_cache(img_hash, result_dict, result.provider_used)

        self.db.commit()
        return result
