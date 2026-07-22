"""
Nutrition API Endpoints.
All AI features route through the NutritionGraph orchestrator.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import get_current_user
from app.middleware.api_keys import resolve_api_keys
from app.graph.state import GraphState
from app.graph.nutrition_graph import orchestrator
from app.services.meal_service import MealService
from app.repositories.user_repository import UserRepository
from app.repositories.chat_repository import ChatRepository
from app.schemas.nutrition import (
    FoodAnalyzeRequest, ChatRequest, RecipeGenerateRequest,
    MealPlanRequest, FoodAnalyzeResponse, ChatResponse,
    TodayNutritionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nutrition", tags=["nutrition"])


def _build_state(user: dict, keys: dict, **kwargs) -> GraphState:
    """Build a GraphState from the authenticated user and resolved keys."""
    return GraphState(
        user_id=user.get("uid", ""),
        user_email=user.get("email", ""),
        groq_key=keys.get("groq_key", ""),
        nvidia_key=keys.get("nvidia_key", ""),
        gemini_key=keys.get("gemini_key", ""),
        openrouter_key=keys.get("openrouter_key", ""),
        **kwargs,
    )


# ─── POST /food/analyze ──────────────────────────────────────────

@router.post("/food/analyze", response_model=FoodAnalyzeResponse)
async def analyze_food(
    req: FoodAnalyzeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze a food image.
    Pipeline: Scanner Agent → Nutrition Agent → Health Score → Save Meal.
    """
    uid = current_user["uid"]
    keys = await resolve_api_keys(current_user)

    # Load user goals from DB
    user_repo = UserRepository(db)
    user_repo.get_or_create_user(uid, current_user.get("email", ""))
    goals = user_repo.get_goals(uid)
    prefs = user_repo.get_preferences(uid)

    user_goals = {}
    if goals:
        user_goals = {
            "calorie_goal": goals.calorie_goal,
            "protein_goal": goals.protein_goal,
            "carb_goal": goals.carb_goal,
            "fat_goal": goals.fat_goal,
            "fitness_goal": goals.fitness_goal,
        }

    user_prefs = {}
    if prefs:
        user_prefs = {
            "dietary_restrictions": prefs.dietary_restrictions or [],
            "allergies": prefs.allergies or [],
        }

    state = _build_state(
        current_user, keys,
        uploaded_images=[req.image_base64],
        image_mime_type=req.mime_type,
        meal_type=req.meal_type,
        user_goals=user_goals,
        user_preferences=user_prefs,
    )

    # Run the graph
    result_state = await orchestrator.run(state)



    return FoodAnalyzeResponse(
        success=result_state.response.get("success", False),
        vision=result_state.response.get("vision"),
        nutrition=result_state.response.get("nutrition"),
        errors=result_state.response.get("errors", []),
    )


# ─── POST /food/log ──────────────────────────────────────────────

from pydantic import BaseModel
class LogMealRequest(BaseModel):
    meal_type: str = "snack"
    vision_data: dict

@router.post("/food/log")
async def log_food(
    req: LogMealRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually log an analyzed meal to the database."""
    uid = current_user["uid"]
    
    user_repo = UserRepository(db)
    goals = user_repo.get_goals(uid)
    calorie_goal = goals.calorie_goal if goals else 2000.0
    protein_goal = goals.protein_goal if goals else 140.0

    try:
        from app.providers.vision.base import VisionResult, DetectedFood
        vision = VisionResult(
            detected_foods=[DetectedFood(**f) for f in req.vision_data.get("detected_foods", [])],
            raw_description=req.vision_data.get("raw_description", ""),
            is_food=req.vision_data.get("is_food", True),
            plate_count=req.vision_data.get("plate_count", 1),
            provider_used=req.vision_data.get("provider_used", ""),
            latency_ms=req.vision_data.get("latency_ms", 0),
        )
        from app.repositories.meal_repository import MealRepository
        meal_repo = MealRepository(db)
        meal = meal_repo.save_meal_log(uid, req.meal_type, vision, calorie_goal, protein_goal)
        db.commit()

        from app.providers.llm import clear_llm_cache
        clear_llm_cache()

        return {"success": True, "meal_id": meal.id}
    except Exception as e:
        logger.error(f"Failed to persist meal manually: {e}")
        return {"success": False, "error": str(e)}


class NutritionProfileUpdate(BaseModel):
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    fitness_goal: Optional[str] = None

@router.get("/profile")
async def get_nutrition_profile(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["uid"]
    user_repo = UserRepository(db)
    goals = user_repo.get_goals(uid)
    if not goals:
        return {}
    return {
        "weight_kg": goals.weight_kg,
        "height_cm": goals.height_cm,
        "age": goals.age,
        "gender": goals.gender,
        "activity_level": goals.activity_level,
        "fitness_goal": goals.fitness_goal,
        "calorie_goal": goals.calorie_goal,
        "protein_goal": goals.protein_goal,
        "carb_goal": goals.carb_goal,
        "fat_goal": goals.fat_goal,
        "fiber_goal": goals.fiber_goal,
    }

@router.post("/profile")
async def update_nutrition_profile(
    req: NutritionProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["uid"]
    email = current_user.get("email", "")
    user_repo = UserRepository(db)
    user_repo.get_or_create_user(uid, email)
    
    # Calculate TDEE
    from app.tools.tdee_calculator import calculate_tdee_and_macros
    macros = calculate_tdee_and_macros(
        weight_kg=req.weight_kg,
        height_cm=req.height_cm,
        age=req.age,
        gender=req.gender,
        activity_level=req.activity_level,
        fitness_goal=req.fitness_goal
    )
    
    update_payload = {
        "weight_kg": req.weight_kg,
        "height_cm": req.height_cm,
        "age": req.age,
        "gender": req.gender,
        "activity_level": req.activity_level,
        "fitness_goal": req.fitness_goal,
        "calorie_goal": macros["calories"],
        "protein_goal": macros["protein"],
        "carb_goal": macros["carbs"],
        "fat_goal": macros["fat"],
        "fiber_goal": macros["fiber"]
    }
    
    user_repo.upsert_goals(uid, update_payload)
    db.commit()
    
    return update_payload


# ─── POST /chat ──────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chat with the AI nutrition assistant."""
    uid = current_user["uid"]
    keys = await resolve_api_keys(current_user)

    # Chat history from DB
    chat_repo = ChatRepository(db)
    if req.session_id:
        session = chat_repo.get_session(req.session_id)
        if not session:
            title = req.message[:35] if req.message else "New Chat"
            session = chat_repo.create_session(uid, title=title)
    else:
        title = req.message[:35] if req.message else "New Chat"
        session = chat_repo.create_session(uid, title=title)

    if session.title == "New Chat" and req.message:
        session.title = req.message[:35]

    # Load recent messages
    messages = chat_repo.get_recent_messages(session.id, limit=15)
    history = [{"role": m.role, "content": m.content} for m in messages]

    # Save user message
    chat_repo.add_message(session.id, "user", req.message)

    # Load user context
    user_repo = UserRepository(db)
    user_repo.get_or_create_user(uid, current_user.get("email", ""))
    goals = user_repo.get_goals(uid)
    prefs = user_repo.get_preferences(uid)

    user_goals = {}
    if goals:
        user_goals = {
            "calorie_goal": goals.calorie_goal,
            "protein_goal": goals.protein_goal,
            "fitness_goal": goals.fitness_goal,
            "weight_kg": goals.weight_kg,
            "height_cm": goals.height_cm,
            "age": goals.age,
            "gender": goals.gender,
            "activity_level": goals.activity_level,
        }

    user_prefs = {}
    if prefs:
        user_prefs = {
            "dietary_restrictions": prefs.dietary_restrictions or [],
            "allergies": prefs.allergies or [],
        }

    state = _build_state(
        current_user, keys,
        user_message=req.message,
        chat_history=history,
        user_goals=user_goals,
        user_preferences=user_prefs,
    )

    result_state = await orchestrator.run(state)

    # Save assistant response and check for profile update
    assistant_msg = result_state.chat_response or result_state.response.get("chat", "")
    
    # Check if AI collected profile data
    if "_update_profile" in assistant_msg:
        import re, json
        from app.tools.tdee_calculator import calculate_tdee_and_macros
        
        # Try to extract the JSON block
        match = re.search(r"```json\s*(\{.*?\})\s*```", assistant_msg, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(1))
                if "_update_profile" in data:
                    prof_data = data["_update_profile"]
                    
                    # Calculate TDEE
                    macros = calculate_tdee_and_macros(
                        weight_kg=prof_data.get("weight_kg"),
                        height_cm=prof_data.get("height_cm"),
                        age=prof_data.get("age"),
                        gender=prof_data.get("gender"),
                        activity_level=prof_data.get("activity_level"),
                        fitness_goal=goals.fitness_goal if goals else "maintain"
                    )
                    
                    # Merge and save to goals
                    update_payload = {
                        "weight_kg": prof_data.get("weight_kg"),
                        "height_cm": prof_data.get("height_cm"),
                        "age": prof_data.get("age"),
                        "gender": prof_data.get("gender"),
                        "activity_level": prof_data.get("activity_level"),
                        "calorie_goal": macros["calories"],
                        "protein_goal": macros["protein"],
                        "carb_goal": macros["carbs"],
                        "fat_goal": macros["fat"],
                        "fiber_goal": macros["fiber"]
                    }
                    user_repo.upsert_goals(uid, update_payload)
                    
                    # Strip the JSON block from the message
                    assistant_msg = assistant_msg[:match.start()] + assistant_msg[match.end():]
            except Exception as e:
                logger.error(f"Failed to parse profile update: {e}")

    chat_repo.add_message(session.id, "assistant", assistant_msg.strip())
    db.commit()

    return ChatResponse(
        response=assistant_msg.strip(),
        reasoning=result_state.response.get("reasoning"),
        session_id=session.id,
    )


# ─── GET /chat/sessions ──────────────────────────────────────────

@router.get("/chat/sessions")
async def get_chat_sessions(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all past chat sessions for current user."""
    uid = current_user["uid"]
    chat_repo = ChatRepository(db)
    sessions = chat_repo.get_user_sessions(uid, limit=30)
    return [
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in sessions
    ]


# ─── GET /chat/sessions/{session_id}/messages ────────────────────

@router.get("/chat/sessions/{session_id}/messages")
async def get_chat_session_messages(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all messages for a specific session in strict chronological order."""
    uid = current_user["uid"]
    chat_repo = ChatRepository(db)
    session = chat_repo.get_session(session_id)
    if not session or session.user_id != uid:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = chat_repo.get_recent_messages(session_id, limit=500)
    return [
        {
            "id": f"msg-{m.id}",
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


# ─── DELETE /chat/sessions/{session_id} ──────────────────────────

@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a chat session idempotently."""
    uid = current_user["uid"]
    chat_repo = ChatRepository(db)
    session = chat_repo.get_session(session_id)
    if session:
        if session.user_id == uid:
            chat_repo.delete_session(session_id)
            db.commit()
    return {"success": True}


# ─── POST /recipe/generate ───────────────────────────────────────

@router.post("/recipe/generate")
async def generate_recipe(
    req: RecipeGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a recipe using the Recipe Agent."""
    uid = current_user["uid"]
    keys = await resolve_api_keys(current_user)

    user_repo = UserRepository(db)
    user_repo.get_or_create_user(uid)
    goals = user_repo.get_goals(uid)
    prefs = user_repo.get_preferences(uid)

    user_goals = {}
    if goals:
        user_goals = {
            "calorie_goal": goals.calorie_goal,
            "protein_goal": goals.protein_goal,
            "fitness_goal": goals.fitness_goal,
        }

    user_prefs = {}
    if prefs:
        user_prefs = {
            "dietary_restrictions": prefs.dietary_restrictions or [],
        }

    state = _build_state(
        current_user, keys,
        user_message=req.query,
        intent="recipe",
        user_goals=user_goals,
        user_preferences=user_prefs,
    )

    # Force recipe intent
    from app.agents.recipe.agent import RecipeAgent
    from app.providers.llm import get_llm_providers

    recipe_agent = RecipeAgent()
    llm_providers = get_llm_providers(keys.get("groq_key", ""), keys.get("nvidia_key", ""), keys.get("gemini_key", ""), keys.get("openrouter_key", ""))

    result = await recipe_agent.generate_recipe(
        query=req.query,
        llm_providers=llm_providers,
        dietary_restrictions=user_prefs.get("dietary_restrictions", []),
        goal=user_goals.get("fitness_goal", "build_muscle"),
        calorie_target=user_goals.get("calorie_goal"),
        protein_target=user_goals.get("protein_goal"),
    )

    if result:
        return {"success": True, "recipe": result.model_dump()}
    return {"success": False, "error": "Could not generate recipe"}


# ─── POST /meal-plan/generate ────────────────────────────────────

@router.post("/meal-plan/generate")
async def generate_meal_plan(
    req: MealPlanRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a meal plan."""
    uid = current_user["uid"]
    keys = await resolve_api_keys(current_user)

    user_repo = UserRepository(db)
    user_repo.get_or_create_user(uid)
    goals = user_repo.get_goals(uid)
    prefs = user_repo.get_preferences(uid)

    user_goals = {}
    if goals:
        user_goals = {
            "calorie_goal": goals.calorie_goal,
            "protein_goal": goals.protein_goal,
            "fitness_goal": goals.fitness_goal,
        }

    user_prefs = {}
    if prefs:
        user_prefs = {
            "dietary_restrictions": prefs.dietary_restrictions or [],
        }

    state = _build_state(
        current_user, keys,
        user_message=f"Generate a {req.plan_type} meal plan",
        user_goals=user_goals,
        user_preferences=user_prefs,
    )

    # Override intent to plan
    state.intent = "plan"
    from app.graph.nutrition_graph import NutritionGraphOrchestrator
    orch = NutritionGraphOrchestrator()
    state = await orch._run_plan(state)

    if state.meal_plan:
        return {"success": True, "meal_plan": state.meal_plan}
    return {"success": False, "error": "Could not generate meal plan"}


# ─── GET /nutrition/today ─────────────────────────────────────────

@router.get("/today", response_model=TodayNutritionResponse)
async def get_today_nutrition(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get today's nutrition summary and goals."""
    uid = current_user["uid"]
    meal_svc = MealService(db)
    summary = meal_svc.get_today_summary(uid)
    
    user_repo = UserRepository(db)
    goals = user_repo.get_goals(uid)
    goals_dict = {
        "calories": goals.calorie_goal if goals else 2000,
        "protein": goals.protein_goal if goals else 140,
        "carbs": goals.carb_goal if goals else 250,
        "fat": goals.fat_goal if goals else 65,
        "fiber": goals.fiber_goal if goals else 30,
    }
    summary["goals"] = goals_dict
    
    return TodayNutritionResponse(**summary)


# ─── GET /nutrition/history ───────────────────────────────────────

@router.get("/history")
async def get_nutrition_history(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get nutrition history."""
    uid = current_user["uid"]
    meal_svc = MealService(db)
    return {"history": meal_svc.get_history(uid, days)}
