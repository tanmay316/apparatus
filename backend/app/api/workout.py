"""
Apparatus AI — Workout Plan Generator Endpoint
3-Step Hybrid Pipeline:
  Step 1: LLM produces a coaching blueprint (split, priorities, requested/avoided lifts)
  Step 2: Python workout engine assembles the plan deterministically
          (equipment + injury filtering, goal-specific prescriptions, A/B variation)
  Step 3: LLM reviews the assembled plan; its delta is validated before it is applied
The user's logged training (read with their own token) grounds both LLM steps.
"""
import logging
import json
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.workout import WorkoutPlanRequest, WorkoutPlanResponse
from app.core.security import get_current_user
from app.core.guardrails import check_rate_limit
from app.middleware.api_keys import resolve_api_keys
from app.providers.llm import get_llm_providers, chat_with_fallback
from app.providers.llm.base import ChatMessage
from app.engine.workout_engine import assemble_plan, apply_llm_review_delta
from app.data.exercise_db import EXERCISES
from app.agents.coach.training import fetch_training_data, within_days, _completed_sets, best_set_text

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
  "title": "Short catchy plan title (max 6 words)",
  "description": "1-2 sentences on the program philosophy, written to the user",
  "split_type": "one of: full_body, upper_lower, push_pull_legs, phat",
  "skills": ["calisthenics skills the user asked for, e.g. planche, front_lever, handstand, muscle_up, l_sit, pistol_squat"],
  "priority_muscles": ["muscles the user wants to bring up, e.g. chest, back, shoulders, arms, glutes, legs"],
  "include_exercises": ["specific exercises the user explicitly asked for"],
  "avoid_exercises": ["exercises the user dislikes or should avoid (from their instructions or injuries)"],
  "progression": "One sentence: exactly how to progress week to week for THIS user"
}

SPLIT SELECTION RULES:
• 1-2 days → full_body
• 3 days → full_body (beginners always), push_pull_legs only for intermediate/advanced who want it
• 4 days → upper_lower (full_body if the user prefers it)
• 5 days → phat (upper, lower, push, pull, legs)
• 6 days → push_pull_legs (twice through)

COACHING RULES:
• Match the split to the user's goal, experience and recovery - never pick one at random.
• Read the custom instructions VERY carefully. They are the user's top priority.
• Use the training history when given: keep lifts the user already performs well where they fit, and if they
  train far less often than requested, say so kindly in the description and keep the plan realistic.
• Injuries: list exercises that load the injured area in "avoid_exercises".
• Leave arrays empty when nothing applies. Never invent requests the user did not make."""


# ═══════════════════════════════════════════════════════════
# STEP 3 PROMPT — Final Review & Polish
# ═══════════════════════════════════════════════════════════
REVIEW_SYSTEM_PROMPT = """You are Apparatus AI, a science-based elite performance coach (Dr. Mike Israetel, Greg Nuckols, NSCA CSCS).

Your job is to REVIEW and PERFECT an assembled workout plan before it goes to the user.
You are given the user's request, the plan from our deterministic engine (sets, rest, estimated minutes per day)
and the ONLY exercises you may use (already filtered for their equipment and injuries).

Review rules:
1. Biomechanics: replace an exercise only if a listed alternative is clearly better for the target muscle and experience level.
2. Time: each day's strength + skill work must fit the Session Duration. Add an effective exercise when a day is well
   under the budget; remove the least effective one when it is over. Keep at least 3 strength exercises per day.
3. Custom requests: if the user's instructions name exercises or muscles the plan ignores, fix that.
4. Fatigue: avoid heavy spinal loading on back-to-back days and duplicate movements within a day.
5. Weekly balance: every major muscle (chest, back, shoulders, arms, quads, hamstrings, glutes, core) should be trained
   at least twice a week on 3+ day plans, unless the user asked otherwise.
6. Use EXACT names from the Allowed Exercises list. Never add an exercise already in that day.
7. At most 8 changes. If the plan is already good, approve it - do not change things for the sake of it.

OUTPUT STRICTLY VALID JSON:
{
  "approved": boolean,
  "issues": ["short list of real issues found"],
  "suggested_changes": [
    {
      "action": "add" | "remove" | "replace",
      "day_number": integer,
      "section": "strength" | "skillWork",
      "target_exercise": "exact name to replace or remove (omit for add)",
      "exercise_name": "exact Allowed Exercises name to add or swap in (omit for remove)"
    }
  ]
}"""


def _history(data: dict) -> tuple[str, list[str]]:
    """Compact summary of the user's logged strength training + their most-used exercise names."""
    workouts = [w for w in data.get("workouts") or [] if isinstance(w, dict)]
    if not workouts:
        return "", []
    recent = [w for w in workouts if within_days(w.get("date"), 27)]
    counts: Counter = Counter()
    latest_best: dict = {}
    for w in workouts[:40]:
        for e in w.get("exercises") or []:
            if not isinstance(e, dict) or not e.get("name"):
                continue
            counts[e["name"]] += 1
            sets = _completed_sets(e)
            if sets and e["name"] not in latest_best:
                latest_best[e["name"]] = best_set_text(sets)
    top = [name for name, _ in counts.most_common(15)]
    lines = [
        f"Last 4 weeks: {len(recent)} strength sessions (~{len(recent) / 4:.1f} per week).",
        "Most-used exercises: " + (", ".join(top) or "none logged"),
    ]
    bests = [f"{n} {latest_best[n]}" for n in top[:6] if n in latest_best]
    if bests:
        lines.append("Recent best sets: " + "; ".join(bests))
    return "\n".join(lines), top


@router.post("/generate", response_model=WorkoutPlanResponse)
async def generate_workout_plan(
    req: WorkoutPlanRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a highly customized AI workout plan using a 3-step hybrid pipeline.
    Step 1: LLM coaching blueprint → Step 2: Engine assembly → Step 3: LLM delta review
    """
    rate = check_rate_limit(f"{current_user['uid']}:workout", limit=5, window_seconds=600)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)
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

    # ── Training history (user's own token, so Firestore rules still apply) ──
    history_text, familiar = "", []
    try:
        history_text, familiar = _history(await fetch_training_data(current_user["uid"], current_user.get("_token")))
    except Exception as e:
        logger.warning("Training history unavailable for plan generation: %s", type(e).__name__)

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

TRAINING HISTORY (logged in the app):
{history_text or 'No workouts logged yet.'}

CUSTOM INSTRUCTIONS (HIGH PRIORITY — must be incorporated):
{req.customInfo or 'None provided'}

Generate the coaching blueprint JSON for a {req.days}-day program."""

    blueprint_messages = [ChatMessage(role="user", content=user_context)]

    try:
        blueprint_response = await chat_with_fallback(
            messages=blueprint_messages,
            providers=providers,
            system_prompt=BLUEPRINT_SYSTEM_PROMPT,
            temperature=0.5,
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
        "injuries": req.injuries,
        "trainingStyle": req.trainingStyle,
        "fitnessGoal": req.fitnessGoal,
        "familiarExercises": familiar,
    }
    
    assembled_plan = assemble_plan(blueprint, user_request)
    meta = assembled_plan.pop("_meta")
    logger.info(f"Assembled plan: {len(assembled_plan['days'])} days, split={meta['split']}, goal={meta['goal']}, injuries={meta['injuries']}")

    # ── STEP 3: LLM Delta Review ───────────────────
    # The LLM outputs a delta patch instead of the full JSON to save tokens and prevent truncation.
    logger.info("Step 3: LLM reviewing assembled plan for delta changes...")

    by_name = {ex.name: ex for ex in EXERCISES}
    allowed_lines = [
        f"{n} ({by_name[n].movement_pattern.value.replace('_', ' ')}; {', '.join(by_name[n].primary_muscles)})"
        for n in meta["pool"] if n in by_name
    ]
    simplified_plan = [
        {
            "day_number": day["dayNumber"],
            "title": day["title"],
            "estimated_minutes": day["time"],
            "skillWork": [f"{ex['name']} {ex['sets']}" for ex in day.get("skillWork", [])],
            "strength": [f"{ex['name']} {ex['sets']}, rest {ex['rest']}" for ex in day.get("strength", [])],
        }
        for day in assembled_plan.get("days", [])
    ]

    review_prompt = f"""Original User Request:
- Goal: {req.goal} (programmed as: {meta['goal'].replace('_', ' ')})
- Fitness Goal (from profile): {req.fitnessGoal or req.goal}
- Training Style: {req.trainingStyle or 'general'}
- Days: {req.days} (split: {meta['split'].replace('_', ' ')})
- Equipment: {req.equipment}
- Experience: {meta['experience']}
- Session Duration: {meta['budget']} minutes for skill + strength work (warm-up and cool-down are extra)
- Custom Instructions: {req.customInfo or 'None'}
- Injuries: {req.injuries or 'None'}

Training history:
{history_text or 'No workouts logged yet.'}

Allowed Exercises (name; pattern; muscles):
{chr(10).join(allowed_lines)}

Assembled Workout Plan:
{json.dumps(simplified_plan, indent=1)}

Review this plan and output the JSON delta."""

    review_messages = [ChatMessage(role="user", content=review_prompt)]

    try:
        review_response = await chat_with_fallback(
            messages=review_messages,
            providers=providers,
            system_prompt=REVIEW_SYSTEM_PROMPT,
            temperature=0.2,
            json_mode=True
        )
        delta = _parse_json(review_response.content)
        if delta:
            logger.info(f"Step 3: approved={delta.get('approved')}, changes={len(delta.get('suggested_changes') or [])}")
            assembled_plan = apply_llm_review_delta(
                assembled_plan, delta, meta["goal"], meta["experience"],
                allowed_names=meta["pool"], budget_minutes=meta["budget"],
            )
        else:
            logger.warning("Step 3: LLM review returned invalid delta, using engine output.")
    except Exception as e:
        logger.warning(f"Step 3 failed: {e}, using engine output as final.")

    return WorkoutPlanResponse(**assembled_plan)


def _parse_json(content: str) -> dict | None:
    """Parses the first JSON object in LLM output (tolerates fences and surrounding prose)."""
    text = (content or "").strip()
    start = text.find("{")
    if start < 0:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(text[start:])
    except (json.JSONDecodeError, ValueError):
        end = text.rfind("}")
        try:
            value = json.loads(text[start:end + 1]) if end > start else None
        except (json.JSONDecodeError, ValueError):
            return None
    return value if isinstance(value, dict) else None


def _default_blueprint(req: WorkoutPlanRequest) -> dict:
    """Fallback blueprint when LLM Step 1 fails; the engine picks the split and skills itself."""
    return {
        "title": f"{req.goal} Program"[:80],
        "description": "",
        "split_type": "",
        "skills": [],
        "priority_muscles": [],
        "include_exercises": [],
        "avoid_exercises": [],
    }
