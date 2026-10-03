"""/insights — AI coach summaries for sessions (1 free a week) and the weekly report (Pro)."""
import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.guardrails import check_rate_limit
from app.core.security import get_current_user
from app.middleware.api_keys import resolve_api_keys
from app.providers.llm import get_llm_providers
from app.services import ai_insights as ai
from app.services.subscription import enforce_quota, is_pro, refund_quota, verified_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/insights", tags=["insights"])


class SummaryRequest(BaseModel):
    kind: str = Field(..., pattern="^(cardio|workout|weekly)$")
    key: str = Field(..., pattern=r"^[A-Za-z0-9_-]{1,64}$")
    facts: dict[str, Any]


def _public(summary: dict, cached: bool) -> dict:
    return {
        "headline": summary.get("headline", ""),
        "points": summary.get("points", []),
        "action": summary.get("action", ""),
        "source": summary.get("source", "ai"),
        "createdAt": summary.get("createdAt"),
        "cached": cached,
    }


@router.post("/summary")
async def summary(req: SummaryRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    rate = check_rate_limit(f"{uid}:ai-summary", limit=10, window_seconds=600)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)

    doc_id = f"{req.kind}_{req.key}"
    cached = await asyncio.to_thread(ai.get_cached, uid, doc_id)
    if cached:
        return _public(cached, True)

    try:
        facts = ai.clean_facts(req.facts)
    except ai.FactsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if req.kind == "weekly":
        if settings.billing_enabled and not await asyncio.to_thread(is_pro, uid, verified_email(current_user)):
            raise HTTPException(status_code=402, detail={
                "code": "pro_required", "kind": "ai_weekly", "limit": 0, "period": "week",
                "message": f"The weekly AI coach report is part of {settings.APP_NAME} Pro.",
            })
    else:
        await enforce_quota(current_user, "ai_summary")

    keys = await resolve_api_keys(current_user)
    providers = get_llm_providers(keys.get("groq_key", ""), keys.get("nvidia_key", ""), keys.get("gemini_key", ""), keys.get("openrouter_key", ""))
    result = await ai.generate_summary(req.kind, facts, providers) if providers else None
    if not result:
        # Don't charge for (or cache) the rule-based fallback, so a real summary can be made later.
        if req.kind != "weekly":
            refund_quota(uid, "ai_summary")
        return _public({**ai.fallback_summary(facts), "source": "fallback"}, False)

    await asyncio.to_thread(ai.save_cached, uid, doc_id, req.kind, req.key, result)
    return _public({**result, "source": "ai"}, False)
