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

    def delete_old_images(self, days: int = 7) -> int:
        """Deletes old scans that no meal log references (logged meals keep their photo)."""
        from datetime import datetime, timedelta, timezone
        from app.database.models import MealLog

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        referenced = self.db.query(MealLog.image_id).filter(MealLog.image_id.isnot(None))
        deleted = (
            self.db.query(ScannedImage)
            .filter(ScannedImage.created_at < cutoff, ScannedImage.id.notin_(referenced))
            .delete(synchronize_session=False)
        )
        self.db.flush()
        return deleted


_last_cleanup = 0.0


def cleanup_old_images_job(days: int = 7) -> None:
    """Background job with its own session; runs at most once an hour."""
    import logging
    import time
    from app.db.session import SessionLocal

    global _last_cleanup
    if time.time() - _last_cleanup < 3600:
        return
    _last_cleanup = time.time()
    db = SessionLocal()
    try:
        deleted = ImageRepository(db).delete_old_images(days)
        db.commit()
        if deleted:
            logging.getLogger(__name__).info("Deleted %d old scanned images", deleted)
    except Exception as exc:
        db.rollback()
        logging.getLogger(__name__).warning("Image cleanup failed: %s", exc)
    finally:
        db.close()
