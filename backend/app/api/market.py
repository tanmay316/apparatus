"""
/market — checkout for paid tickets, paid clans, coach plans and sponsorships.
See app/services/market.py for the money flow.
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.guardrails import check_rate_limit
from app.core.security import get_current_user
from app.services import market

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/market", tags=["market"])


class CheckoutRequest(BaseModel):
    kind: str = Field(..., pattern="^(event|challenge|clan|plan)$")
    item_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{1,128}$")
    return_to: str = Field("app", pattern="^(app|web)$")


class QuoteRequest(BaseModel):
    amount_inr: int = Field(..., ge=100, le=1_000_000)


def _limit(uid: str, key: str, limit: int, window: int) -> None:
    rate = check_rate_limit(f"{uid}:market:{key}", limit=limit, window_seconds=window)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)


async def _call(fn, *args, **kwargs):
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except market.MarketError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Market call %s failed", getattr(fn, "__name__", fn))
        raise HTTPException(status_code=502, detail="Something went wrong with the payment. Please try again.")


def _require_admin(user: dict) -> None:
    if not market.is_admin(user):
        raise HTTPException(status_code=403, detail="Admins only.")


@router.get("/config")
async def market_config():
    return market.public_config()


@router.post("/checkout")
async def checkout(req: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    _limit(current_user["uid"], "checkout", 8, 600)
    return await _call(market.create_checkout, current_user, req.kind, req.item_id, req.return_to)


@router.post("/orders/{order_id}/refresh")
async def refresh(order_id: str, current_user: dict = Depends(get_current_user)):
    _limit(current_user["uid"], "refresh", 60, 600)
    return await _call(market.refresh_order, order_id, current_user["uid"], market.is_admin(current_user))


@router.post("/admin/sponsorships/{sponsorship_id}/quote")
async def quote(sponsorship_id: str, req: QuoteRequest, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    return await _call(market.quote_sponsorship, sponsorship_id, req.amount_inr)


@router.post("/admin/orders/{order_id}/transfer")
async def retry_transfer(order_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    if not market.ORDER_ID_RE.match(order_id):
        raise HTTPException(status_code=404, detail="Order not found.")
    db = market.get_firestore_client()
    if not db:
        raise HTTPException(status_code=503, detail="Payments are not available right now.")
    return await _call(market.transfer_seller_share, db, order_id, True)
