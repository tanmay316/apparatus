import logging
import json
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.workout import WorkoutPlanRequest, WorkoutPlanResponse
from app.core.security import get_current_user
from app.middleware.api_keys import resolve_api_keys
from app.providers.llm import get_llm_providers, chat_with_fallback
from app.providers.llm.base import ChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workout", tags=["workout"])

@router.post("/generate", response_model=WorkoutPlanResponse)
async def generate_workout_plan(
    req: WorkoutPlanRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a highly customized AI workout plan.
    Requires the user to have valid LLM API keys configured via settings or environment.
    """
    keys = await resolve_api_keys(current_user)
    providers = get_llm_providers(
        groq_key=keys.get("groq_key", ""),
        nvidia_key=keys.get("nvidia_key", ""),
        gemini_key=keys.get("gemini_key", ""),
        openrouter_key=keys.get("openrouter_key", "")
    )

    if not providers:
        raise HTTPException(
            status_code=500,
            detail="No AI providers configured. Please configure an API key (Groq, Gemini, etc.)"
        )

    system_prompt = f"""
    You are Apparatus AI, an elite strength and conditioning coach.
    Create a highly optimized workout plan tailored exactly to the user's requirements.
    
    CRITICAL INSTRUCTIONS:
    1. Output strictly valid JSON matching the exact schema requested. No markdown blocks, no conversational text.
    2. WARM-UPS & COOL-DOWNS: Must be highly specific to the main strength exercises for that specific day. Do NOT output generic universal warmups for every day. If it's a Heavy Squat day, warmup the hips, knees, and core.
    3. SKILL WORK: If the user requests calisthenics or specific skill goals (like handstand, muscle up, front lever), add them to the 'skillWork' array for relevant days.
    4. EXERCISES: Provide reps/sets in a clear format (e.g., '3 x 10'). Give tempo (e.g., '2010') and rest (e.g., '90s').
    
    JSON SCHEMA TO MATCH:
    {{
      "title": "Short catchy title",
      "description": "Brief description of the program",
      "days": [
        {{
          "dayNumber": 1,
          "title": "Day 1 - Push",
          "time": "45-60 min",
          "warmup": [{{ "name": "", "sets": "", "tempo": "", "rest": "", "cues": [], "yt": "" }}],
          "skillWork": [],
          "strength": [{{ "name": "", "sets": "", "tempo": "", "rest": "", "cues": [], "yt": "" }}],
          "cooldown": []
        }}
      ]
    }}
    """

    user_prompt = f"""
    Goal: {req.goal}
    Days per week: {req.days}
    Equipment available: {req.equipment}
    Custom Instructions: {req.customInfo}
    
    Generate the {req.days}-day workout plan JSON now.
    """

    messages = [ChatMessage(role="user", content=user_prompt)]

    try:
        response = await chat_with_fallback(
            messages=messages,
            providers=providers,
            system_prompt=system_prompt,
            temperature=0.7,
            max_tokens=4000,
            json_mode=True
        )
        
        if response.content.startswith("Error:"):
            raise HTTPException(status_code=500, detail=response.content)
            
        # Parse the JSON response
        try:
            # Strip markdown JSON blocks if present
            content = response.content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            
            plan_data = json.loads(content.strip())
            return WorkoutPlanResponse(**plan_data)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse LLM response as JSON: {response.content}")
            raise HTTPException(status_code=500, detail="AI returned invalid JSON format.")
            
    except Exception as e:
        logger.error(f"Workout generation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
