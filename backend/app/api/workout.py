"""
Apparatus AI — Workout Plan Generator Endpoint
3-Step Hybrid Pipeline:
  Step 1: LLM produces a coaching blueprint (split, focus, volume decisions)
  Step 2: Python workout engine assembles the plan deterministically
  Step 3: LLM reviews the assembled plan and makes final adjustments
"""
import logging
import json
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.workout import WorkoutPlanRequest, WorkoutPlanResponse
from app.core.security import get_current_user
from app.middleware.api_keys import resolve_api_keys
from app.providers.llm import get_llm_providers, chat_with_fallback
from app.providers.llm.base import ChatMessage
from app.engine.workout_engine import assemble_plan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workout", tags=["workout"])


# ═══════════════════════════════════════════════════════════
# STEP 1 PROMPT — Coaching Blueprint (small, fast output)
# ═══════════════════════════════════════════════════════════
BLUEPRINT_SYSTEM_PROMPT = """You are Apparatus AI, an elite performance coaching system.

Your knowledge combines:
• NSCA CSCS guidelines & ACSM resistance training recommendations
• Renaissance Periodization hypertrophy principles (Dr. Mike Israetel)
• Scientific Principles of Strength Training (Greg Nuckols, Eric Helms)
• Modern calisthenics programming (Overcoming Gravity, FitnessFAQs)
• Exercise biomechanics & progressive overload
• Fatigue management & recovery science

You are NOT generating the workout plan itself. You are making COACHING DECISIONS.
A Python workout engine will assemble the actual plan from your decisions.

OUTPUT STRICTLY VALID JSON matching this schema (no markdown, no commentary):
{
  "title": "Short catchy plan title",
  "description": "Brief 1-sentence description of the program philosophy",
  "split_type": "one of: full_body, upper_lower, push_pull_legs, ppl_ul, ppl_ppl",
  "skills": ["list of calisthenics skills if requested, e.g. planche, front_lever, handstand"],
  "days": [
    {
      "title": "Day 1 - Focus Area",
      "primary_muscles": ["chest", "triceps"],
      "notes": "Optional coaching note for this day"
    }
  ]
}

SPLIT SELECTION RULES:
• 2 days → full_body
• 3 days → push_pull_legs OR full_body (prefer PPL for intermediate+)
• 4 days → upper_lower
• 5 days → ppl_ul
• 6 days → ppl_ppl

COACHING RULES:
• Never randomly assign splits. Match the split to the user's goal, experience, and recovery.
• If user mentions calisthenics skills (planche, front lever, handstand, muscle-up, L-sit, frog, etc.), add them to the "skills" array.
• Read the custom instructions VERY carefully. They are the user's top priority.
• The "days" array MUST contain EXACTLY the number of days the user requested.
• Each day must have a descriptive title (e.g. "Day 1 - Push (Chest & Shoulders)")."""


# ═══════════════════════════════════════════════════════════
# STEP 3 PROMPT — Final Review & Polish
# ═══════════════════════════════════════════════════════════
REVIEW_SYSTEM_PROMPT = """You are Apparatus AI, an elite coach reviewing a workout plan before it goes to the user.

You are given the user's original request and the assembled workout plan.
Your job is to REVIEW and MODIFY the plan if needed.

Rules:
1. Check exercise selection makes sense for the user's goals and experience.
2. If the user's CUSTOM INSTRUCTIONS mention specific exercises, body parts, or skills that are MISSING from the plan, ADD them.
3. If any exercise is clearly wrong for the equipment level, REPLACE it.
4. If warmup/cooldown doesn't match the day's focus, FIX it.
5. Ensure variety — no exact same exercise appearing on multiple days unless it's a skill.
6. Keep the EXACT SAME JSON structure. Do NOT change the schema.
7. Output the COMPLETE modified plan as valid JSON. No commentary.
8. If the plan is already good, return it as-is. Do not modify for the sake of modifying.

Output strictly valid JSON matching WorkoutPlanResponse schema."""


@router.post("/generate", response_model=WorkoutPlanResponse)
async def generate_workout_plan(
    req: WorkoutPlanRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a highly customized AI workout plan using a 3-step hybrid pipeline.
    Step 1: LLM coaching blueprint → Step 2: Engine assembly → Step 3: LLM review
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
            detail="No AI providers configured. Please configure an API key."
        )

    # ── STEP 1: LLM Coaching Blueprint ──────────────────────
    logger.info("Step 1: Generating coaching blueprint via LLM...")
    
    user_context = f"""User Profile:
- Goal: {req.goal}
- Days per week: {req.days}
- Equipment: {req.equipment}
- Experience Level: {req.experience or 'intermediate'}
- Training Style: {req.trainingStyle or 'general'}
- Session Duration: {req.sessionDuration} minutes
- Gender: {req.gender or 'not specified'}
- Age: {req.age or 'not specified'}
- Weight: {req.weight or 'not specified'} kg
- Injuries/Limitations: {req.injuries or 'none'}
- Fitness Goal (from profile): {req.fitnessGoal or req.goal}

CUSTOM INSTRUCTIONS (HIGH PRIORITY — must be incorporated):
{req.customInfo or 'None provided'}

Generate the coaching blueprint JSON for a {req.days}-day program. The "days" array must have EXACTLY {req.days} entries."""

    blueprint_messages = [ChatMessage(role="user", content=user_context)]

    try:
        blueprint_response = await chat_with_fallback(
            messages=blueprint_messages,
            providers=providers,
            system_prompt=BLUEPRINT_SYSTEM_PROMPT,
            temperature=0.7,
            json_mode=True
        )
        
        blueprint = _parse_json(blueprint_response.content)
        if not blueprint:
            logger.warning("Blueprint LLM returned invalid JSON, using defaults.")
            blueprint = _default_blueprint(req)
        
        logger.info(f"Blueprint: split={blueprint.get('split_type')}, skills={blueprint.get('skills', [])}")
        
    except Exception as e:
        logger.error(f"Step 1 failed: {e}, using default blueprint")
        blueprint = _default_blueprint(req)

    # ── STEP 2: Deterministic Engine Assembly ───────────────
    logger.info("Step 2: Assembling plan from exercise database...")
    
    user_request = {
        "goal": req.goal,
        "days": req.days,
        "equipment": req.equipment,
        "experience": req.experience or "intermediate",
        "customInfo": req.customInfo,
        "sessionDuration": req.sessionDuration,
    }
    
    assembled_plan = assemble_plan(blueprint, user_request)
    logger.info(f"Assembled plan: {len(assembled_plan['days'])} days, title='{assembled_plan['title']}'")

    # ── STEP 3: LLM Review & Final Polish ───────────────────
    logger.info("Step 3: LLM reviewing assembled plan...")
    
    review_prompt = f"""Original User Request:
- Goal: {req.goal}
- Days: {req.days}
- Equipment: {req.equipment}
- Experience: {req.experience or 'intermediate'}
- Custom Instructions: {req.customInfo or 'None'}
- Injuries: {req.injuries or 'None'}

Assembled Workout Plan:
{json.dumps(assembled_plan, indent=2)}

Review this plan and output the final version as JSON. Fix any issues or return it as-is if it's good."""

    review_messages = [ChatMessage(role="user", content=review_prompt)]

    try:
        review_response = await chat_with_fallback(
            messages=review_messages,
            providers=providers,
            system_prompt=REVIEW_SYSTEM_PROMPT,
            temperature=0.3,  # Lower temp for precision
            json_mode=True
        )
        
        final_plan = _parse_json(review_response.content)
        if final_plan and "days" in final_plan and len(final_plan["days"]) == req.days:
            logger.info("Step 3: LLM review applied successfully.")
            return WorkoutPlanResponse(**final_plan)
        else:
            logger.warning("Step 3: LLM review returned invalid data, using engine output.")
            return WorkoutPlanResponse(**assembled_plan)
            
    except Exception as e:
        logger.warning(f"Step 3 failed: {e}, using engine output as final.")
        return WorkoutPlanResponse(**assembled_plan)


def _parse_json(content: str) -> dict | None:
    """Safely parse JSON from LLM output, stripping markdown fences if present."""
    try:
        text = content.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        return None


def _default_blueprint(req: WorkoutPlanRequest) -> dict:
    """Fallback blueprint when LLM Step 1 fails."""
    from app.data.skill_progressions import detect_skills_from_text
    
    split_map = {2: "full_body", 3: "push_pull_legs", 4: "upper_lower", 5: "ppl_ul", 6: "ppl_ppl"}
    split = split_map.get(req.days, "upper_lower")
    skills = detect_skills_from_text(req.customInfo or "")
    
    return {
        "title": f"{req.goal} Program",
        "description": f"A {req.days}-day {req.goal.lower()} program for {req.equipment}.",
        "split_type": split,
        "skills": skills,
        "days": [{"title": f"Day {i+1}", "primary_muscles": [], "notes": ""} for i in range(req.days)],
    }
