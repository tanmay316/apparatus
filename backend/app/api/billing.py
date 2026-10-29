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
from app.services import pro_pricing
from app.services import subscription as subs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])

MAX_WEBHOOK_BYTES = 256 * 1024


class PlayVerifyRequest(BaseModel):
    purchase_token: str = Field(..., min_length=20, max_length=1000)


class CouponRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)


class PlanPrice(BaseModel):
    price: int = Field(..., ge=pro_pricing.MIN_INR, le=pro_pricing.MAX_INR)
    mrp: int = Field(..., ge=pro_pricing.MIN_INR, le=pro_pricing.MAX_INR)
    enabled: bool = True


class PricingRequest(BaseModel):
    plans: dict[str, PlanPrice]
    label: str = Field("", max_length=60)
    # Also change the price Google Play charges (off = only the prices shown in the app).
    sync_play: bool = True


def _limit(uid: str, key: str, limit: int, window: int) -> None:
    rate = check_rate_limit(f"{uid}:{key}", limit=limit, window_seconds=window)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)


@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    if settings.billing_enabled:
        await asyncio.to_thread(play.remember_account, uid)
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


@router.post("/coupon/sync")
async def sync_coupon(req: CouponRequest, current_user: dict = Depends(get_current_user)):
    """Admin: apply a coupon's on/off state, deletion or end date to everyone who redeemed it."""
    if not market.is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admins only.")
    try:
        changed = await asyncio.to_thread(subs.sync_coupon_grants, req.code)
    except subs.CouponError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "changed": changed}


def _require_admin(user: dict) -> None:
    if not market.is_admin(user):
        raise HTTPException(status_code=403, detail="Admins only.")


@router.get("/admin/pricing")
async def get_pricing(current_user: dict = Depends(get_current_user)):
    """Admin: the configured Pro prices and what Google Play actually charges in India right now."""
    _require_admin(current_user)
    config = await asyncio.to_thread(pro_pricing.load)
    play_prices, play_error = None, None
    if settings.billing_enabled:
        try:
            play_prices = await asyncio.to_thread(play.play_plan_prices)
        except play.PlayError as exc:
            play_error = exc.message
    else:
        play_error = "Google Play isn't connected on the server (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)."
    return {"config": config, "play": play_prices, "playError": play_error}


@router.post("/admin/pricing")
async def set_pricing(req: PricingRequest, current_user: dict = Depends(get_current_user)):
    """Admin: change Pro prices. Google Play is updated first so the app never shows a price Play doesn't charge."""
    _require_admin(current_user)
    _limit(current_user["uid"], "admin-pricing", 10, 600)
    try:
        config = pro_pricing.validate({k: v.model_dump() for k, v in req.plans.items()}, req.label)
    except pro_pricing.PricingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    results = None
    if req.sync_play:
        if not settings.billing_enabled:
            raise HTTPException(status_code=400, detail="Google Play isn't connected on the server. Untick \"Update Google Play\" or set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.")
        try:
            results = await asyncio.to_thread(play.set_play_prices, pro_pricing.enabled_prices(config))
        except play.PlayError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.message)
    await asyncio.to_thread(pro_pricing.save, config, current_user["uid"])
    return {"ok": True, "config": config, "play": results}


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
