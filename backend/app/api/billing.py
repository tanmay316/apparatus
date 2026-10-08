"""
/billing — Pro via Google Play subscriptions, plus free-Pro coupons.

Flow: the Android app buys the Play subscription, then POSTs the purchase token to /play/verify.
The server reads the purchase from Google, binds it to the account and writes
users/{uid}/private/entitlement. Play notifications (/play/rtdn) keep it current.
The /webhook route is only for marketplace payments (Razorpay payment links, off by default).
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.guardrails import check_rate_limit
from app.core.security import get_current_user
from app.services import market
from app.services import play_billing as play
from app.services import subscription as subs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])

MAX_WEBHOOK_BYTES = 256 * 1024


class PlayVerifyRequest(BaseModel):
    purchase_token: str = Field(..., min_length=20, max_length=1000)


class CouponRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)


def _limit(uid: str, key: str, limit: int, window: int) -> None:
    rate = check_rate_limit(f"{uid}:{key}", limit=limit, window_seconds=window)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)


@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    await asyncio.to_thread(play.refresh_if_stale, uid)
    entitlement, usage = await asyncio.gather(
        asyncio.to_thread(subs.get_entitlement, uid, subs.verified_email(current_user)),
        asyncio.to_thread(subs.usage_summary, uid),
    )
    for private in ("couponCode", "checkedAt"):
        entitlement.pop(private, None)
    return {
        "enabled": settings.pro_enforced,
        "purchasable": settings.billing_enabled,
        "plans": list(subs.PLANS) if settings.billing_enabled else [],
        "play": {"productId": settings.GOOGLE_PLAY_PRO_PRODUCT_ID, "package": settings.GOOGLE_PLAY_PACKAGE},
        "entitlement": entitlement,
        "usage": usage,
    }


@router.post("/play/verify")
async def play_verify(req: PlayVerifyRequest, current_user: dict = Depends(get_current_user)):
    if not settings.billing_enabled:
        raise HTTPException(status_code=503, detail="Subscriptions are not available right now.")
    uid = current_user["uid"]
    _limit(uid, "play-verify", 20, 600)
    try:
        entitlement = await asyncio.to_thread(play.verify_purchase, uid, req.purchase_token)
    except play.PlayError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)
    except Exception:
        logger.exception("Play verify failed for %s", uid)
        raise HTTPException(status_code=502, detail="Purchase received. Pro will unlock in a moment.")
    return {"ok": True, "pro": bool(entitlement.get("pro"))}


@router.post("/play/rtdn")
async def play_notification(request: Request):
    """Google Play real-time developer notifications via a Pub/Sub push subscription."""
    if not play.verify_push(request.headers.get("Authorization", "")):
        raise HTTPException(status_code=401, detail="Unauthorized")
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large")
    try:
        envelope = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    try:
        await asyncio.to_thread(play.handle_notification, envelope)
    except play.PlayError as exc:
        # Non-2xx makes Pub/Sub retry later, which is what we want if Google was unreachable.
        if exc.status >= 500:
            raise HTTPException(status_code=503, detail="Retry later")
    return {"ok": True}


@router.post("/coupon/check")
async def check_coupon(req: CouponRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    # Tight limit so codes can't be brute-forced.
    _limit(uid, "coupon", 10, 600)
    try:
        coupon = await asyncio.to_thread(subs.load_coupon, req.code, uid)
    except subs.CouponError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return subs.public_coupon(coupon)


@router.post("/coupon/redeem")
async def redeem_coupon(req: CouponRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    _limit(uid, "coupon", 10, 600)
    try:
        result = await asyncio.to_thread(subs.redeem_coupon, uid, subs.verified_email(current_user), req.code)
    except subs.CouponError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Coupon redeem failed for %s", uid)
        raise HTTPException(status_code=502, detail="Could not redeem right now. Please try again.")
    return {"ok": True, **result}


@router.post("/webhook")
async def webhook(request: Request):
    """Razorpay → server for marketplace payment links. Authenticated by the HMAC signature."""
    declared = request.headers.get("content-length", "0")
    if not declared.isdigit() or int(declared) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large")
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BYTES or not market.verify_webhook_signature(body, request.headers.get("X-Razorpay-Signature", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")
    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    if str(event.get("event", "")).startswith("payment_link."):
        await asyncio.to_thread(market.handle_webhook, event)
    return {"ok": True}
