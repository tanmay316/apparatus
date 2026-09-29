"""
Food detection with provider fallback and hedging.

The first provider starts immediately; if it hasn't answered after
VISION_HEDGE_AFTER seconds (or fails), the next one starts in parallel and the
first usable answer wins. A single "not food" verdict is double-checked by the
next provider when time allows, because free models sometimes miss real meals.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import List, Optional

from app.core.config import settings
from app.providers import registry
from app.providers.llm import build_providers
from app.providers.vision.base import DetectedFood, VisionResult
from app.providers.vision.prompt import build_food_prompt

logger = logging.getLogger(__name__)

MAX_ITEMS = 15


def get_vision_providers(groq_key: str = "", nvidia_key: str = "", gemini_key: str = "", openrouter_key: str = "") -> list:
    return build_providers(groq_key, nvidia_key, gemini_key, openrouter_key, order=settings.VISION_PROVIDER_ORDER)


def _num(value, lo: float = 0.0, hi: float = 10_000.0) -> Optional[float]:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v:  # NaN
        return None
    return max(lo, min(hi, v))


def parse_vision_payload(data, provider: str, latency_ms: float) -> VisionResult:
    """Validates a model's JSON into a VisionResult, dropping malformed items."""
    if isinstance(data, list):
        data = {"detected_foods": data}
    if not isinstance(data, dict):
        raise ValueError("vision reply is not an object")
    foods: List[DetectedFood] = []
    for raw in (data.get("detected_foods") or [])[:MAX_ITEMS]:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()[:80]
        if not name:
            continue
        protein = _num(raw.get("protein"), 0, 400)
        carbs = _num(raw.get("carbs"), 0, 800)
        fat = _num(raw.get("fat"), 0, 400)
        calories = _num(raw.get("calories"), 0, 6000)
        if not calories and any(v for v in (protein, carbs, fat)):
            calories = round((protein or 0) * 4 + (carbs or 0) * 4 + (fat or 0) * 9, 1)
        foods.append(DetectedFood(
            name=name,
            confidence=_num(raw.get("confidence"), 0, 1) or 0.7,
            estimated_weight_grams=_num(raw.get("estimated_weight_grams") or raw.get("weight_grams"), 1, 2000),
            category=(str(raw["category"])[:40] if raw.get("category") else None),
            calories=calories,
            protein=protein,
            carbs=carbs,
            fat=fat,
            fiber=_num(raw.get("fiber"), 0, 150),
        ))
    is_food = bool(data.get("is_food", bool(foods))) or bool(foods)
    return VisionResult(
        detected_foods=foods,
        raw_description=str(data.get("raw_description") or data.get("reason") or "")[:600],
        is_food=is_food,
        plate_count=int(_num(data.get("plate_count"), 1, 20) or 1),
        provider_used=provider,
        latency_ms=latency_ms,
    )


async def _detect_one(provider, prompt: str, image_base64: str, mime_type: str) -> VisionResult:
    start = time.time()
    response = await provider.vision(prompt, image_base64, mime_type)
    data = registry.extract_json(response.content)
    return parse_vision_payload(data, response.provider_used or provider.provider_name, (time.time() - start) * 1000)


async def detect_food_with_fallback(
    image_base64: str,
    providers: list,
    mime_type: str = "image/jpeg",
    user_note: str = "",
    budget: Optional[float] = None,
    hedge_after: Optional[float] = None,
) -> VisionResult:
    budget = budget or settings.VISION_TOTAL_BUDGET
    hedge_after = hedge_after or settings.VISION_HEDGE_AFTER
    prompt = build_food_prompt(user_note)
    loop = asyncio.get_running_loop()
    deadline = loop.time() + budget
    queue = [p for p in providers if hasattr(p, "vision")]
    pending: dict = {}
    errors: List[str] = []
    not_food: Optional[VisionResult] = None

    def launch() -> None:
        provider = queue.pop(0)
        task = asyncio.create_task(_detect_one(provider, prompt, image_base64, mime_type))
        pending[task] = provider.provider_name

    if not queue:
        return VisionResult(detected_foods=[], raw_description="No vision provider is configured.", is_food=False, provider_used="none")

    launch()
    try:
        while pending:
            remaining = deadline - loop.time()
            if remaining <= 0:
                errors.append("time budget spent")
                break
            wait_for = min(hedge_after, remaining) if queue else remaining
            done, _ = await asyncio.wait(list(pending), timeout=wait_for, return_when=asyncio.FIRST_COMPLETED)
            if not done:
                if queue and deadline - loop.time() > 8:
                    logger.info("Vision hedging: starting %s", queue[0].provider_name)
                    launch()
                continue
            for task in done:
                name = pending.pop(task)
                try:
                    result = task.result()
                except Exception as exc:
                    errors.append(f"{name}: {str(exc)[:160]}")
                    logger.warning("Vision provider %s failed: %s", name, str(exc)[:200])
                    if queue and not pending:
                        launch()
                    continue
                if result.detected_foods:
                    logger.info("Vision ok via %s: %d items in %.0fms", result.provider_used, len(result.detected_foods), result.latency_ms)
                    return result
                if not result.is_food:
                    if not_food is not None:
                        return not_food
                    not_food = result
                    if queue and deadline - loop.time() > 10:
                        launch()
                        continue
                    if not pending:
                        return not_food
                else:
                    errors.append(f"{name}: no items")
                    if queue and not pending:
                        launch()
    finally:
        for task in pending:
            task.cancel()

    if not_food is not None:
        return not_food
    logger.error("All vision providers failed: %s", "; ".join(errors)[:500])
    return VisionResult(
        detected_foods=[],
        raw_description="All vision providers failed: " + "; ".join(errors)[:300],
        is_food=True,
        provider_used="none",
    )
