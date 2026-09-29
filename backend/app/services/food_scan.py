"""
Food photo pipeline: detect → nutrition tools → chat message with a trackable card.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.agents.nutrition.agent import NutritionAgent
from app.providers.llm import get_llm_providers
from app.providers.vision import detect_food_with_fallback, get_vision_providers
from app.providers.vision.base import VisionResult
from app.repositories.chat_repository import ChatRepository
from app.repositories.image_repository import ImageRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

DEFAULT_GOALS = {"calorie_goal": 2000.0, "protein_goal": 140.0, "carb_goal": 250.0, "fat_goal": 65.0, "fitness_goal": "maintain"}


def user_goals(db: Session, uid: str) -> dict:
    goals = UserRepository(db).get_goals(uid)
    if not goals or not goals.calorie_goal:
        return dict(DEFAULT_GOALS, is_default=True)
    return {
        "calorie_goal": goals.calorie_goal,
        "protein_goal": goals.protein_goal,
        "carb_goal": goals.carb_goal,
        "fat_goal": goals.fat_goal,
        "fitness_goal": goals.fitness_goal,
        "is_default": False,
    }


def summarize_meal(nutrition: dict, vision: Optional[dict] = None) -> str:
    """Short markdown summary shown above the nutrition card."""
    inner = nutrition.get("nutrition", {}) if nutrition else {}
    items = inner.get("items", [])
    names = ", ".join(f"{i.get('name')} (~{round(i.get('weight_grams') or 0)} g)" for i in items[:6])
    score = (nutrition or {}).get("health_score", {})
    lines = [
        f"**Detected:** {names}" if names else "",
        f"**≈ {round(inner.get('total_calories', 0))} kcal** · {round(inner.get('total_protein', 0))} g protein · "
        f"{round(inner.get('total_carbs', 0))} g carbs · {round(inner.get('total_fat', 0))} g fat",
    ]
    if score.get("grade"):
        lines.append(f"Meal grade **{score['grade']}** ({score.get('score', 0)}/100).")
    unsure = [f.get("name") for f in (vision or {}).get("detected_foods", []) if (f.get("confidence") or 1) < 0.7]
    if unsure:
        lines.append(f"I'm not sure about **{', '.join(unsure)}**; tell me what it is and I'll correct the numbers.")
    lines.append("Estimates depend on portion and cooking fat. Tap **Track meal** to add it to today.")
    return "\n\n".join(l for l in lines if l)


async def nutrition_for_foods(detected_foods, keys: dict, goals: dict) -> dict:
    llm = get_llm_providers(keys.get("groq_key", ""), keys.get("nvidia_key", ""), keys.get("gemini_key", ""), keys.get("openrouter_key", ""))
    result = await NutritionAgent().run(
        detected_foods=detected_foods,
        llm_providers=llm,
        calorie_goal=goals.get("calorie_goal", 2000),
        protein_goal=goals.get("protein_goal", 140),
        carb_goal=goals.get("carb_goal", 250),
        fat_goal=goals.get("fat_goal", 65),
    )
    return result.model_dump()


async def scan_food(
    db: Session,
    uid: str,
    keys: dict,
    image_base64: str,
    mime_type: str,
    meal_type: str,
    note: str = "",
    session_id: Optional[int] = None,
) -> dict:
    image_repo = ImageRepository(db)
    image = image_repo.save_image(uid, image_base64, mime_type)

    # Same photo + same note → reuse the earlier detection (and skip a slow vision call).
    cache_key = hashlib.sha256(f"{note.strip().lower()}|{image_base64}".encode()).hexdigest()
    vision: Optional[VisionResult] = None
    cached = image_repo.get_cached_vision(cache_key)
    if cached and cached.result:
        try:
            vision = VisionResult(**cached.result)
            vision.provider_used = f"cache ({cached.provider})"
        except Exception:
            vision = None
    if vision is None:
        providers = get_vision_providers(keys.get("groq_key", ""), keys.get("nvidia_key", ""), keys.get("gemini_key", ""), keys.get("openrouter_key", ""))
        vision = await detect_food_with_fallback(image_base64, providers, mime_type, user_note=note)
        if vision.detected_foods:
            try:
                image_repo.save_vision_cache(cache_key, vision.model_dump(), vision.provider_used)
            except Exception:
                db.rollback()
                image = image_repo.save_image(uid, image_base64, mime_type)
    image_repo.update_vision_result(image.id, vision.model_dump(), vision.provider_used, vision.latency_ms)

    goals = user_goals(db, uid)
    nutrition = None
    errors = []
    if vision.detected_foods:
        status = "ok"
        nutrition = await nutrition_for_foods(vision.detected_foods, keys, goals)
        message = summarize_meal(nutrition, vision.model_dump())
        if goals.get("is_default"):
            message += "\n\n_Scored against default targets. Add your body metrics for personal goals._"
    elif not vision.is_food:
        status = "not_food"
        reason = vision.raw_description.strip()
        message = "I couldn't find any food in that photo." + (f" {reason}" if reason and len(reason) < 200 else "") + \
            "\n\nTry a clear, well-lit photo of the plate from above, or just tell me what you ate."
    else:
        status = "failed"
        errors.append(vision.raw_description[:300])
        message = "The food scanner didn't respond in time. Please try again in a moment, or describe the meal in text and I'll estimate it."

    response = {
        "success": status == "ok",
        "status": status,
        "message": message,
        "vision": vision.model_dump(exclude={"provider_used", "latency_ms"}),
        "nutrition": nutrition,
        "errors": errors,
        "image_id": image.id,
    }

    chat_repo = ChatRepository(db)
    session = chat_repo.get_session(session_id) if session_id else None
    if not session or session.user_id != uid:
        session = chat_repo.create_session(uid, title="Food scan")
    user_text = note.strip() or f"[Photo] Analyze my {meal_type}"
    chat_repo.add_message(session.id, "user", user_text, metadata={"image_id": image.id, "is_image": True})
    card = {k: response[k] for k in ("success", "status", "vision", "nutrition", "image_id")} if status == "ok" else None
    assistant = chat_repo.add_message(session.id, "assistant", message, metadata={"nutrition_data": card} if card else None)
    db.commit()

    logger.info("Food scan uid=%s status=%s provider=%s items=%d", uid, status, vision.provider_used, len(vision.detected_foods))
    response["session_id"] = session.id
    response["assistant_message_id"] = f"msg-{assistant.id}"
    return response
