"""
Nutrition & coaching API.

- /food/analyze : photo → vision (hedged provider fallback) → nutrition tools → chat message + trackable card
- /chat         : Astra coach agent (tool-using loop over nutrition + training data)
- /food/log     : persist a card the user chose to track
"""
import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.agents.coach import training
from app.agents.coach.agent import run_coach, stream_coach
from app.agents.coach.tools import ToolContext, generate_meal_plan as build_meal_plan
from app.core.guardrails import check_rate_limit, validate_chat_message, validate_image
from app.core.security import get_current_user
from app.database.models import ChatMessage as ChatMessageRow, ChatSession
from app.db.session import SessionLocal, get_db
from app.middleware.api_keys import resolve_api_keys
from app.providers.llm import get_llm_providers
from app.repositories.chat_repository import ChatRepository
from app.repositories.image_repository import ImageRepository, cleanup_old_images_job
from app.repositories.user_repository import UserRepository
from app.schemas.nutrition import (
    ChatRequest, ChatResponse, FoodAnalyzeRequest, FoodAnalyzeResponse, MealPlanRequest,
    RecipeGenerateRequest, TodayNutritionResponse,
)
from app.services.food_scan import scan_food, user_goals
from app.core.config import settings
from app.repositories.meal_repository import MealRepository
from app.services import nutrition_compare
from app.services.meal_service import MealService
from app.services.subscription import enforce_quota, is_pro, refund_quota, verified_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nutrition", tags=["nutrition"])

MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack", "snacks")


def _llm(keys: dict):
    return get_llm_providers(keys.get("groq_key", ""), keys.get("nvidia_key", ""), keys.get("gemini_key", ""), keys.get("openrouter_key", ""))


def _prefs(db: Session, uid: str) -> dict:
    prefs = UserRepository(db).get_preferences(uid)
    if not prefs:
        return {}
    return {"dietary_restrictions": prefs.dietary_restrictions or [], "allergies": prefs.allergies or []}


# ─── POST /food/analyze ──────────────────────────────────────────

@router.post("/food/analyze", response_model=FoodAnalyzeResponse)
async def analyze_food(
    req: FoodAnalyzeRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["uid"]
    rate = check_rate_limit(uid, limit=12, window_seconds=60)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)
    verdict = validate_image(req.image_base64, req.mime_type)
    if not verdict.allowed:
        raise HTTPException(status_code=400, detail=verdict.message)
    meal_type = req.meal_type.lower() if req.meal_type.lower() in MEAL_TYPES else "snack"
    await enforce_quota(current_user, "food_scan")

    keys = await resolve_api_keys(current_user)
    UserRepository(db).get_or_create_user(uid, current_user.get("email", ""))
    background_tasks.add_task(cleanup_old_images_job, 7)

    result = await scan_food(db, uid, keys, req.image_base64, req.mime_type, meal_type, req.note, req.session_id)
    # Only our own failures are refunded; "not food" still used a vision call.
    if result.get("status") == "failed":
        refund_quota(uid, "food_scan")
    return FoodAnalyzeResponse(**result)


# ─── POST /food/log ──────────────────────────────────────────────

class LogMealRequest(BaseModel):
    meal_type: str = Field("snack", max_length=20)
    vision_data: dict
    message_id: Optional[str] = Field(None, max_length=40)
    image_id: Optional[int] = None


def _mark_message_logged(db: Session, uid: str, message_id: Optional[str]) -> None:
    raw = str(message_id or "").replace("msg-", "")
    if not raw.isdigit():
        return
    row = (
        db.query(ChatMessageRow)
        .join(ChatSession, ChatSession.id == ChatMessageRow.session_id)
        .filter(ChatMessageRow.id == int(raw), ChatSession.user_id == uid)
        .first()
    )
    if row:
        meta = dict(row.metadata_ or {})
        meta["logged"] = True
        row.metadata_ = meta
        flag_modified(row, "metadata_")


@router.post("/food/log")
async def log_food(
    req: LogMealRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["uid"]
    nutrition_dict = req.vision_data.get("nutrition") or {}
    inner = nutrition_dict.get("nutrition") or {}
    items = [it for it in (inner.get("items") or []) if isinstance(it, dict)][:50]
    if not items:
        raise HTTPException(status_code=400, detail="There's nothing to track in this result.")

    image_id = req.image_id
    if image_id is not None:
        img = ImageRepository(db).get_image(image_id)
        if not img or img.user_id != uid:
            image_id = None

    meal_type = req.meal_type.lower() if req.meal_type.lower() in MEAL_TYPES else "snack"
    try:
        from app.repositories.meal_repository import MealRepository
        UserRepository(db).get_or_create_user(uid, current_user.get("email", ""))
        meal_repo = MealRepository(db)
        meal = meal_repo.create_meal(user_id=uid, meal_type=meal_type, image_id=image_id)

        allowed = {"food_name", "weight_grams", "calories", "protein", "carbs", "fat", "fiber", "confidence", "category"}
        mapped = []
        for it in items:
            item = dict(it)
            if "name" in item and "food_name" not in item:
                item["food_name"] = item.pop("name")
            mapped.append({k: v for k, v in item.items() if k in allowed})
        meal_repo.add_meal_items(meal.id, mapped)

        def total(key: str) -> float:
            value = inner.get(f"total_{key}")
            return float(value) if isinstance(value, (int, float)) else sum(float(i.get(key) or 0) for i in items)

        score = nutrition_dict.get("health_score") or {}
        meal_repo.update_meal_totals(
            meal_id=meal.id,
            calories=total("calories"), protein=total("protein"), carbs=total("carbs"),
            fat=total("fat"), fiber=total("fiber"),
            health_score=score.get("score", 0), health_grade=score.get("grade", "C"),
            suggestions=score.get("suggestions", []),
        )
        meal_repo.upsert_daily_summary(uid, date.today().isoformat())
        _mark_message_logged(db, uid, req.message_id)
        db.commit()
        return {"success": True, "meal_id": meal.id}
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist meal for %s: %s", uid, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not save this meal. Please try again.")


# ─── GET /images/{image_id} ──────────────────────────────────────

@router.get("/images/{image_id}")
async def get_image(
    image_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    img = ImageRepository(db).get_image(image_id)
    if not img or img.user_id != current_user["uid"]:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"id": img.id, "base64_data": img.base64_data, "mime_type": img.mime_type}


# ─── Profile ─────────────────────────────────────────────────────

class NutritionProfileUpdate(BaseModel):
    weight_kg: Optional[float] = Field(None, ge=20, le=400)
    height_cm: Optional[float] = Field(None, ge=90, le=260)
    age: Optional[int] = Field(None, ge=10, le=110)
    gender: Optional[str] = Field(None, max_length=20)
    activity_level: Optional[str] = Field(None, max_length=20)
    fitness_goal: Optional[str] = Field(None, max_length=30)
    # Targets chosen in the app's plan screen; when absent they are calculated.
    calorie_goal: Optional[float] = Field(None, ge=800, le=8000)
    protein_goal: Optional[float] = Field(None, ge=0, le=600)
    carb_goal: Optional[float] = Field(None, ge=0, le=1200)
    fat_goal: Optional[float] = Field(None, ge=0, le=400)
    fiber_goal: Optional[float] = Field(None, ge=0, le=150)
    diet: Optional[str] = Field(None, pattern="^(classic|pescatarian|vegetarian|vegan)$")


DIET_WORDS = {"pescatarian", "vegetarian", "vegan"}


@router.get("/profile")
async def get_nutrition_profile(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goals = UserRepository(db).get_goals(current_user["uid"])
    if not goals:
        return {}
    return {
        "weight_kg": goals.weight_kg, "height_cm": goals.height_cm, "age": goals.age, "gender": goals.gender,
        "activity_level": goals.activity_level, "fitness_goal": goals.fitness_goal,
        "calorie_goal": goals.calorie_goal, "protein_goal": goals.protein_goal, "carb_goal": goals.carb_goal,
        "fat_goal": goals.fat_goal, "fiber_goal": goals.fiber_goal,
    }


@router.post("/profile")
async def update_nutrition_profile(
    req: NutritionProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.tools.tdee_calculator import calculate_tdee_and_macros
    uid = current_user["uid"]
    user_repo = UserRepository(db)
    user_repo.get_or_create_user(uid, current_user.get("email", ""))
    macros = calculate_tdee_and_macros(
        weight_kg=req.weight_kg, height_cm=req.height_cm, age=req.age, gender=req.gender,
        activity_level=req.activity_level, fitness_goal=req.fitness_goal,
    )
    payload = {
        "weight_kg": req.weight_kg, "height_cm": req.height_cm, "age": req.age, "gender": req.gender,
        "activity_level": req.activity_level, "fitness_goal": req.fitness_goal,
        "calorie_goal": req.calorie_goal or macros["calories"],
        "protein_goal": req.protein_goal if req.protein_goal is not None else macros["protein"],
        "carb_goal": req.carb_goal if req.carb_goal is not None else macros["carbs"],
        "fat_goal": req.fat_goal if req.fat_goal is not None else macros["fat"],
        "fiber_goal": req.fiber_goal if req.fiber_goal is not None else macros["fiber"],
    }
    user_repo.upsert_goals(uid, payload)
    if req.diet:
        prefs = user_repo.get_preferences(uid)
        kept = [d for d in (prefs.dietary_restrictions or [] if prefs else []) if str(d).lower() not in DIET_WORDS]
        user_repo.upsert_preferences(uid, {"dietary_restrictions": kept + ([req.diet] if req.diet != "classic" else [])})
    db.commit()
    return payload


# ─── POST /chat ──────────────────────────────────────────────────

def _context_text(db: Session, uid: str, goals: dict, prefs: dict, training_data: dict, today: str) -> str:
    g = UserRepository(db).get_goals(uid)
    lines = []
    if goals.get("is_default"):
        lines.append("Body profile: NOT SET (targets below are defaults). If they ask for personal targets, ask for "
                     "weight, height, age, gender, activity level and goal, then call update_body_profile.")
    else:
        body = ", ".join(f"{label} {v}" for label, v in (
            ("weight", f"{g.weight_kg} kg" if g and g.weight_kg else None), ("height", f"{g.height_cm} cm" if g and g.height_cm else None),
            ("age", g.age if g else None), ("gender", g.gender if g else None), ("activity", g.activity_level if g else None),
        ) if v)
        lines.append(f"Body: {body or 'partially set'}; goal: {goals.get('fitness_goal')}")
    lines.append(f"Daily targets: {round(goals.get('calorie_goal') or 0)} kcal, {round(goals.get('protein_goal') or 0)} g protein, "
                 f"{round(goals.get('carb_goal') or 0)} g carbs, {round(goals.get('fat_goal') or 0)} g fat")
    if prefs.get("dietary_restrictions"):
        lines.append("Diet: " + ", ".join(prefs["dietary_restrictions"]))
    if prefs.get("allergies"):
        lines.append("Allergies: " + ", ".join(prefs["allergies"]))
    try:
        s = MealService(db).get_today_summary(uid)
        lines.append(f"Eaten today: {round(s['total_calories'])} kcal, {round(s['total_protein'])} g protein in {s['meal_count']} logged meals")
    except Exception:
        db.rollback()
    lines.append(training.training_snapshot(training_data, today))
    return "\n".join(f"- {l}" for l in lines if l)


async def _start_chat(req: ChatRequest, current_user: dict, db: Session):
    """Checks + session bookkeeping shared by /chat and /chat/stream. Returns (session_id, history) or a ChatResponse."""
    uid = current_user["uid"]
    rate = check_rate_limit(uid, limit=20, window_seconds=60)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)

    verdict = validate_chat_message(req.message)
    if not verdict.allowed:
        logger.info("Chat blocked for %s: %s", uid, verdict.reason)
        if verdict.reason in ("off_topic", "injection"):
            return ChatResponse(response=verdict.message, session_id=req.session_id or 0)
        raise HTTPException(status_code=400, detail=verdict.message)

    await enforce_quota(current_user, "ai_call")
    UserRepository(db).get_or_create_user(uid, current_user.get("email", ""))

    chat_repo = ChatRepository(db)
    session = chat_repo.get_session(req.session_id) if req.session_id else None
    if not session or session.user_id != uid:
        session = chat_repo.create_session(uid, title=req.message[:40])
    elif session.title in ("New Chat", "Food scan") and req.message:
        session.title = req.message[:40]

    history = [{"role": m.role, "content": m.content} for m in chat_repo.get_recent_messages(session.id, limit=14)]
    chat_repo.add_message(session.id, "user", req.message)
    db.commit()
    return session.id, history


async def _coach_context(db: Session, current_user: dict, keys: dict):
    uid = current_user["uid"]
    today = date.today().isoformat()
    goals = user_goals(db, uid)
    prefs = _prefs(db, uid)
    ctx = ToolContext(db=db, uid=uid, token=current_user.get("_token"), keys=keys, llm=_llm(keys), goals=goals, prefs=prefs, today=today)
    training_data = await ctx.training_data()
    return ctx, _context_text(db, uid, goals, prefs, training_data, today)


def _save_reply(db: Session, session_id: int, result) -> ChatResponse:
    card = result.nutrition_card
    metadata = {"tools": result.tools_used}
    if card:
        metadata["nutrition_data"] = card
    if result.reasoning:
        metadata["reasoning"] = result.reasoning
    assistant = ChatRepository(db).add_message(session_id, "assistant", result.answer, metadata=metadata)
    db.commit()
    return ChatResponse(
        response=result.answer,
        reasoning=result.reasoning,
        session_id=session_id,
        nutritionData=card,
        message_id=f"msg-{assistant.id}",
        tools_used=result.tools_used,
        profile_updated=result.profile_updated,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    started = await _start_chat(req, current_user, db)
    if isinstance(started, ChatResponse):
        return started
    session_id, history = started
    keys = await resolve_api_keys(current_user)
    ctx, context = await _coach_context(db, current_user, keys)

    try:
        result = await asyncio.wait_for(run_coach(ctx, req.message, history, context), timeout=90)
    except Exception as exc:
        db.rollback()
        logger.error("Coach failed for %s: %s", current_user["uid"], exc, exc_info=True)
        from app.agents.coach.agent import CoachResult
        from app.core.guardrails import FALLBACK_REPLY
        result = CoachResult(answer=FALLBACK_REPLY)
        refund_quota(current_user["uid"], "ai_call")

    return _save_reply(db, session_id, result)


def _line(event: dict) -> bytes:
    return (json.dumps(event, default=str) + "\n").encode("utf-8")


@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Same as /chat, but streams NDJSON events: session → status* → delta* → (replace) → done."""
    started = await _start_chat(req, current_user, db)
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    if isinstance(started, ChatResponse):
        blocked = started.model_dump()

        async def refused():
            yield _line({"type": "delta", "text": blocked["response"]})
            yield _line({"type": "done", **blocked})
        return StreamingResponse(refused(), media_type="application/x-ndjson", headers=headers)

    session_id, history = started
    keys = await resolve_api_keys(current_user)
    uid = current_user["uid"]

    async def events():
        # The request-scoped session may be closed once the response starts, so use our own.
        sdb = SessionLocal()
        try:
            yield _line({"type": "session", "session_id": session_id})
            yield _line({"type": "status", "text": "Thinking"})
            ctx, context = await _coach_context(sdb, current_user, keys)
            result = None
            try:
                async for event in stream_coach(ctx, req.message, history, context):
                    if event["type"] == "done":
                        result = event["result"]
                    else:
                        yield _line(event)
            except Exception as exc:
                sdb.rollback()
                logger.error("Coach stream failed for %s: %s", uid, exc, exc_info=True)
            if result is None:
                from app.agents.coach.agent import CoachResult
                from app.core.guardrails import FALLBACK_REPLY
                result = CoachResult(answer=FALLBACK_REPLY)
                refund_quota(uid, "ai_call")
                yield _line({"type": "replace", "text": FALLBACK_REPLY})
            saved = _save_reply(sdb, session_id, result)
            yield _line({"type": "done", **saved.model_dump()})
        finally:
            sdb.close()

    return StreamingResponse(events(), media_type="application/x-ndjson", headers=headers)


# ─── Chat sessions ───────────────────────────────────────────────

@router.get("/chat/sessions")
async def get_chat_sessions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = ChatRepository(db).get_user_sessions(current_user["uid"], limit=30)
    return [
        {
            "id": s.id, "title": s.title,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in sessions
    ]


@router.get("/chat/sessions/{session_id}/messages")
async def get_chat_session_messages(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat_repo = ChatRepository(db)
    session = chat_repo.get_session(session_id)
    if not session or session.user_id != current_user["uid"]:
        raise HTTPException(status_code=404, detail="Session not found")
    return [
        {
            "id": f"msg-{m.id}", "role": m.role, "content": m.content, "metadata_": m.metadata_,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in chat_repo.get_recent_messages(session_id, limit=500)
    ]


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat_repo = ChatRepository(db)
    session = chat_repo.get_session(session_id)
    if session and session.user_id == current_user["uid"]:
        chat_repo.delete_session(session_id)
        db.commit()
    return {"success": True}


# ─── Recipe & meal plan ──────────────────────────────────────────

@router.post("/recipe/generate")
async def generate_recipe(
    req: RecipeGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.agents.recipe.agent import RecipeAgent
    uid = current_user["uid"]
    rate = check_rate_limit(f"{uid}:recipe", limit=8, window_seconds=60)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)
    await enforce_quota(current_user, "ai_call")
    keys = await resolve_api_keys(current_user)
    UserRepository(db).get_or_create_user(uid)
    goals = user_goals(db, uid)
    result = await RecipeAgent().generate_recipe(
        query=req.query, llm_providers=_llm(keys),
        dietary_restrictions=_prefs(db, uid).get("dietary_restrictions", []),
        goal=goals.get("fitness_goal") or "maintain",
        calorie_target=goals.get("calorie_goal"), protein_target=goals.get("protein_goal"),
    )
    if result:
        return {"success": True, "recipe": result.model_dump()}
    refund_quota(uid, "ai_call")
    return {"success": False, "error": "Could not generate recipe"}


@router.post("/meal-plan/generate")
async def generate_meal_plan(
    req: MealPlanRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["uid"]
    rate = check_rate_limit(f"{uid}:mealplan", limit=5, window_seconds=60)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)
    if req.plan_type not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="Invalid plan type")
    await enforce_quota(current_user, "ai_call")
    keys = await resolve_api_keys(current_user)
    UserRepository(db).get_or_create_user(uid)
    plan = await build_meal_plan(_llm(keys), user_goals(db, uid), _prefs(db, uid), f"{req.plan_type} plan")
    if plan:
        return {"success": True, "meal_plan": plan}
    refund_quota(uid, "ai_call")
    return {"success": False, "error": "Could not generate meal plan"}


# ─── Today / history ─────────────────────────────────────────────

@router.get("/today", response_model=TodayNutritionResponse)
async def get_today_nutrition(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["uid"]
    summary = MealService(db).get_today_summary(uid)
    goals = UserRepository(db).get_goals(uid)
    summary["goals"] = {
        "calories": goals.calorie_goal if goals else 2000,
        "protein": goals.protein_goal if goals else 140,
        "carbs": goals.carb_goal if goals else 250,
        "fat": goals.fat_goal if goals else 65,
        "fiber": goals.fiber_goal if goals else 30,
    }
    return TodayNutritionResponse(**summary)


@router.get("/history")
async def get_nutrition_history(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    days = max(1, min(days, 730))
    return {"history": MealService(db).get_history(current_user["uid"], days)}


def _compare_summary(db: Session, uid: str, days: int, tz: int) -> dict:
    today = nutrition_compare.local_day(datetime.now(timezone.utc), tz)
    # One extra day either side covers the UTC date shift of the user's time zone.
    start = (today - timedelta(days=days)).isoformat()
    end = (today + timedelta(days=1)).isoformat()
    repo = MealRepository(db)
    meals = repo.get_user_meals_range(uid, start, end)
    goals = nutrition_compare.nutrition_goals(uid)
    if not goals:
        g = UserRepository(db).get_goals(uid)
        goals = {"calories": g.calorie_goal, "protein": g.protein_goal} if g else {}
    summary = nutrition_compare.summarize(meals, goals, days, today, tz)
    if summary["lastLogged"] is None:
        # Stopped logging: still say when the last meal was.
        last = repo.get_recent_meals(uid, 1)
        day = nutrition_compare.local_day(last[0].logged_at, tz) if last else None
        summary["lastLogged"] = day.isoformat() if day else None
    return summary


@router.get("/compare/{target_uid}")
async def compare_nutrition(
    target_uid: str,
    days: int = 30,
    tz: int = 0,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pro: your nutrition next to a followed athlete's (aggregates only, and only if they opted in)."""
    uid = current_user["uid"]
    if not nutrition_compare.UID_RE.match(target_uid) or target_uid == uid:
        raise HTTPException(status_code=400, detail="Invalid athlete")
    rate = check_rate_limit(f"{uid}:nutrition-compare", limit=30, window_seconds=600)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)
    if settings.billing_enabled and not await asyncio.to_thread(is_pro, uid, verified_email(current_user)):
        raise HTTPException(status_code=402, detail={
            "code": "pro_required", "kind": "compare", "limit": 0, "period": "day",
            "message": f"Comparing with athletes you follow is part of {settings.APP_NAME} Pro.",
        })
    days = nutrition_compare.clamp_days(days)
    tz = max(-14 * 60, min(14 * 60, int(tz)))
    me = _compare_summary(db, uid, days, tz)
    status = await asyncio.to_thread(nutrition_compare.access_status, uid, target_uid)
    them = _compare_summary(db, target_uid, days, tz) if status == "ok" else None
    return {"days": days, "status": status, "me": me, "them": them}


class UpdateMealTypeRequest(BaseModel):
    meal_type: str


@router.patch("/meals/{meal_id}/type")
async def update_meal_type(
    meal_id: int,
    req: UpdateMealTypeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.repositories.meal_repository import MealRepository
    if req.meal_type.lower() not in MEAL_TYPES:
        raise HTTPException(status_code=400, detail="Invalid meal type")
    if not MealRepository(db).update_meal_type(meal_id, current_user["uid"], req.meal_type.lower()):
        raise HTTPException(status_code=404, detail="Meal not found or unauthorized")
    return {"success": True}


class MealItemIn(BaseModel):
    food_name: str = Field(..., min_length=1, max_length=120)
    weight_grams: float = Field(0, ge=0, le=5000)
    calories: float = Field(..., ge=0, le=10000)
    protein: float = Field(0, ge=0, le=1000)
    carbs: float = Field(0, ge=0, le=1000)
    fat: float = Field(0, ge=0, le=1000)
    fiber: float = Field(0, ge=0, le=500)


class UpdateMealRequest(BaseModel):
    items: list[MealItemIn] = Field(..., min_length=1, max_length=50)
    meal_type: Optional[str] = Field(None, max_length=20)


def _owned_meal(db: Session, meal_id: int, uid: str):
    from app.database.models import MealLog
    meal = db.query(MealLog).filter(MealLog.id == meal_id, MealLog.user_id == uid).first()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    return meal


@router.patch("/meals/{meal_id}")
async def update_meal(
    meal_id: int,
    req: UpdateMealRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace a meal's items (portion / servings fixes) and recompute its totals."""
    from app.database.models import MealItem
    from app.repositories.meal_repository import MealRepository
    uid = current_user["uid"]
    meal = _owned_meal(db, meal_id, uid)
    if req.meal_type and req.meal_type.lower() in MEAL_TYPES:
        meal.meal_type = req.meal_type.lower()
    repo = MealRepository(db)
    db.query(MealItem).filter(MealItem.meal_id == meal.id).delete()
    repo.add_meal_items(meal.id, [it.model_dump() for it in req.items])
    total = lambda key: round(sum(getattr(it, key) for it in req.items), 1)
    meal.total_calories = total("calories")
    meal.total_protein = total("protein")
    meal.total_carbs = total("carbs")
    meal.total_fat = total("fat")
    meal.total_fiber = total("fiber")
    if meal.logged_at:
        repo.upsert_daily_summary(uid, meal.logged_at.date().isoformat())
    db.commit()
    return {"success": True}


@router.delete("/meals/{meal_id}")
async def delete_meal(
    meal_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.repositories.meal_repository import MealRepository
    uid = current_user["uid"]
    meal = _owned_meal(db, meal_id, uid)
    day = meal.logged_at.date().isoformat() if meal.logged_at else None
    repo = MealRepository(db)
    repo.delete_meal(meal.id)
    if day:
        repo.upsert_daily_summary(uid, day)
    db.commit()
    return {"success": True}
