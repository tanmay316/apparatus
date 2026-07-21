"""
Base Vision Provider Interface.
All vision providers must implement this interface.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel


class DetectedFood(BaseModel):
    """A single food item detected by vision."""
    name: str
    confidence: float  # 0.0 - 1.0
    estimated_weight_grams: Optional[float] = None
    bounding_box: Optional[dict] = None  # {x, y, w, h} normalized
    category: Optional[str] = None  # e.g. "protein", "grain", "vegetable"
    calories: Optional[float] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None


class VisionResult(BaseModel):
    """Result from a vision provider's food detection."""
    detected_foods: List[DetectedFood] = []
    raw_description: str = ""
    label_text: Optional[str] = None  # OCR / barcode extracted text
    plate_count: int = 1
    is_food: bool = True
    provider_used: str = ""
    latency_ms: float = 0.0


class BaseVisionProvider(ABC):
    """Abstract base class for all vision providers."""

    provider_name: str = "base"

    @abstractmethod
    async def detect_food(self, image_base64: str, mime_type: str = "image/jpeg") -> VisionResult:
        """Detect food items from an image."""
        ...

    @abstractmethod
    async def extract_label(self, image_base64: str, mime_type: str = "image/jpeg") -> Optional[str]:
        """Extract text from a food label or barcode using OCR."""
        ...

    @abstractmethod
    async def estimate_portions(self, image_base64: str, detected_foods: List[DetectedFood], mime_type: str = "image/jpeg") -> List[DetectedFood]:
        """Refine portion/weight estimates for detected foods."""
        ...

    async def health_check(self) -> bool:
        """Check if the provider is available."""
        return True
