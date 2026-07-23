"""
Nutrition API Endpoints.
All AI features route through the NutritionGraph orchestrator.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text

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
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Analyze a food image.
    Pipeline: Scanner Agent → Nutrition Agent → Health Score → Save Meal.
    """
    uid = current_user["uid"]
    keys = await resolve_api_keys(current_user)

    # Save image to db immediately and schedule cleanup
    from app.repositories.image_repository import ImageRepository
    image_repo = ImageRepository(db)
    scanned_image = image_repo.save_image(uid, req.image_base64, req.mime_type)
    
    background_tasks.add_task(image_repo.delete_old_images, days=7)

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

    response_data = {
        "success": result_state.response.get("success", False),
        "vision": result_state.response.get("vision"),
        "nutrition": result_state.response.get("nutrition"),
        "errors": result_state.response.get("errors", []),
        "image_id": scanned_image.id,
    }
    
    provider_used = response_data["vision"].get("provider_used", "Unknown") if response_data.get("vision") else "Unknown"
    logger.info(f"Food analysis complete. Provider used: {provider_used}")

    if req.session_id:
        chat_repo = ChatRepository(db)
        session = chat_repo.get_session(req.session_id)
        if not session:
            session = chat_repo.create_session(uid, title="Food Analysis")
            
        chat_repo.add_message(session.id, "user", f"[Image Uploaded] Please analyze this {req.meal_type}.")
        
        # Save assistant message with metadata
        assistant_msg = chat_repo.add_message(
            session.id, 
            "assistant", 
            "Here's the analysis of your food:" if response_data["success"] else "I couldn't analyze that food. Please try again.",
        )
        assistant_msg.metadata_ = {"nutrition_data": response_data}
        db.commit()
        response_data["session_id"] = session.id

    return FoodAnalyzeResponse(**response_data)


# ─── POST /food/log ──────────────────────────────────────────────

from pydantic import BaseModel
class LogMealRequest(BaseModel):
    meal_type: str = "snack"
    vision_data: dict
    message_id: Optional[str] = None
    image_id: Optional[int] = None

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
        from app.repositories.meal_repository import MealRepository
        meal_repo = MealRepository(db)
        
        # req.vision_data contains the full FoodAnalyzeResponse from frontend
        vision_dict = req.vision_data.get("vision", {})
        nutrition_dict = req.vision_data.get("nutrition", {})
        
        # 1. Create the MealLog
        meal = meal_repo.create_meal(user_id=uid, meal_type=req.meal_type, image_id=req.image_id)
        
        # 2. Add meal items
        nutrition_inner = nutrition_dict.get("nutrition", {})
        items = nutrition_inner.get("items", [])
        
        if items:
            mapped_items = []
            for it in items:
                mapped = it.copy()
                if "name" in mapped and "food_name" not in mapped:
                    mapped["food_name"] = mapped.pop("name")
                mapped_items.append(mapped)
            meal_repo.add_meal_items(meal.id, mapped_items)
            
        # 3. Update totals
        score_data = nutrition_dict.get("health_score", {})
        meal_repo.update_meal_totals(
            meal_id=meal.id,
            calories=nutrition_inner.get("total_calories", 0.0),
            protein=nutrition_inner.get("total_protein", 0.0),
            carbs=nutrition_inner.get("total_carbs", 0.0),
            fat=nutrition_inner.get("total_fat", 0.0),
            fiber=nutrition_inner.get("total_fiber", 0.0),
            health_score=score_data.get("score", 0),
            health_grade=score_data.get("grade", "C"),
            suggestions=score_data.get("suggestions", []),
        )
        
        # 4. Upsert daily summary
        from datetime import date
        meal_repo.upsert_daily_summary(uid, date.today().isoformat())
        
        # 5. Mark the chat message as logged if message_id is provided
        if req.message_id:
            chat_repo = ChatRepository(db)
            # Remove the 'msg-' prefix if it exists
            db_msg_id = int(req.message_id.replace("msg-", "")) if str(req.message_id).startswith("msg-") else None
            if db_msg_id:
                msg = chat_repo.get_message(db_msg_id) # Need to implement this or just do query directly
                pass # Wait, let's just do it directly on db
                db.execute(
                    text("UPDATE chat_messages SET metadata = json_insert(metadata, '$.logged', true) WHERE id = :mid"),
                    {"mid": db_msg_id}
                )

        db.commit()

        from app.providers.llm import clear_llm_cache
        clear_llm_cache()

        return {"success": True, "meal_id": meal.id}
    except Exception as e:
        logger.error(f"Failed to persist meal manually: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── GET /images/{image_id} ──────────────────────────────────────

@router.get("/images/{image_id}")
async def get_image(
    image_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.repositories.image_repository import ImageRepository
    image_repo = ImageRepository(db)
    img = image_repo.get_image(image_id)
    
    if not img or img.user_id != current_user["uid"]:
        raise HTTPException(status_code=404, detail="Image not found")
        
    return {
        "id": img.id,
        "base64_data": img.base64_data,
        "mime_type": img.mime_type
    }


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

    try:
        result_state = await orchestrator.run(state)
        
        if result_state.chat_response:
            assistant_msg = result_state.chat_response
        elif result_state.response.get("chat"):
            assistant_msg = result_state.response["chat"]
        elif result_state.recipe_result:
            r = result_state.recipe_result
            md = f"### {r.get('title', 'Recipe')}\n\n"
            md += f"**Prep Time:** {r.get('prep_time_min', '?')} mins\n"
            md += f"**Macros:** {r.get('calories_per_serving', 0)} kcal | {r.get('protein_per_serving', 0)}g P | {r.get('carbs_per_serving', 0)}g C | {r.get('fat_per_serving', 0)}g F\n\n"
            md += "**Ingredients:**\n"
            for ing in r.get("ingredients", []):
                # Handle both dict and string ingredients for robustness
                if isinstance(ing, dict):
                    md += f"- {ing.get('amount', '')} {ing.get('item', '')}\n"
                else:
                    md += f"- {ing}\n"
            md += "\n**Instructions:**\n"
            for i, step in enumerate(r.get("instructions", []), 1):
                md += f"{i}. {step}\n"
            assistant_msg = md.strip()
        elif result_state.meal_plan:
            p = result_state.meal_plan
            md = f"### {p.get('plan_name', 'Meal Plan')}\n\n"
            for meal in p.get("meals", []):
                md += f"**{str(meal.get('meal_type')).title()}:** {meal.get('suggestion')}\n"
                md += f"*~{meal.get('estimated_calories', 0)} kcal, {meal.get('estimated_protein', 0)}g protein*\n\n"
            tips = p.get("tips", [])
            if tips:
                md += "**Tips:**\n"
                for tip in tips:
                    md += f"- {tip}\n"
            assistant_msg = md.strip()
        else:
            assistant_msg = "I couldn't generate a response."
    except Exception as e:
        logger.error(f"Error during AI chat generation: {e}")
        assistant_msg = "I'm sorry, I encountered an error while processing your request. Please try again."
    
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

    reasoning_text = None
    try:
        reasoning_text = result_state.response.get("reasoning")
    except Exception:
        pass

    return ChatResponse(
        response=assistant_msg.strip(),
        reasoning=reasoning_text,
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
            "metadata_": m.metadata_,
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
