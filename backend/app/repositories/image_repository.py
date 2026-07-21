"""
Image Repository — SQL only.
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database.models import ScannedImage, VisionCache


class ImageRepository:

    def __init__(self, db: Session):
        self.db = db

    def save_image(self, user_id: str, base64_data: str, mime_type: str = "image/jpeg", source: str = "camera") -> ScannedImage:
        img = ScannedImage(
            user_id=user_id,
            base64_data=base64_data,
            mime_type=mime_type,
            source=source,
        )
        self.db.add(img)
        self.db.flush()
        return img

    def update_vision_result(self, image_id: int, result: dict, provider: str, latency: float):
        img = self.db.query(ScannedImage).filter(ScannedImage.id == image_id).first()
        if img:
            img.vision_result = result
            img.provider_used = provider
            img.vision_latency_ms = latency
            self.db.flush()

    def get_image(self, image_id: int) -> Optional[ScannedImage]:
        return self.db.query(ScannedImage).filter(ScannedImage.id == image_id).first()

    def get_cached_vision(self, image_hash: str) -> Optional[VisionCache]:
        return self.db.query(VisionCache).filter(VisionCache.image_hash == image_hash).first()

    def save_vision_cache(self, image_hash: str, result: dict, provider: str):
        cache = VisionCache(image_hash=image_hash, result=result, provider=provider)
        self.db.add(cache)
        self.db.flush()
        return cache
