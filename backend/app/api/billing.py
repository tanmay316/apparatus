"""
/billing — Apparatus Pro via Razorpay subscriptions, plus coupons.

Flow: app calls /subscribe → opens Razorpay Checkout (web) or the hosted short_url (APK)
→ /verify (checkout handler) and the webhook both write users/{uid}/private/entitlement.
Prices live only in Razorpay plans/offers on the server; the client only picks a plan name.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.guardrails import check_rate_limit
from app.core.security import get_current_user
from app.services import subscription as subs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])

MAX_WEBHOOK_BYTES = 256 * 1024


class SubscribeRequest(BaseModel):
    plan: str = Field("yearly", pattern="^(monthly|yearly)$")
    coupon: Optional[str] = Field(None, max_length=32)


class VerifyRequest(BaseModel):
    razorpay_payment_id: str = Field(..., pattern=r"^pay_[A-Za-z0-9]{6,40}$")
    razorpay_subscription_id: str = Field(..., pattern=r"^sub_[A-Za-z0-9]{6,40}$")
    razorpay_signature: str = Field(..., pattern=r"^[a-f0-9]{64}$")


class CouponRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)
    plan: Optional[str] = Field(None, pattern="^(monthly|yearly)$")


def _limit(uid: str, key: str, limit: int, window: int) -> None:
    rate = check_rate_limit(f"{uid}:{key}", limit=limit, window_seconds=window)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)


@router.get("/status")
async def billing_status(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    entitlement, usage = await asyncio.gather(
        asyncio.to_thread(subs.get_entitlement, uid, subs.verified_email(current_user)),
        asyncio.to_thread(subs.usage_summary, uid),
    )
    entitlement.pop("couponCode", None)
    return {
        "enabled": settings.billing_enabled,
        "plans": [p for p in subs.PLANS if subs.plan_id(p)],
        "entitlement": entitlement,
        "usage": usage,
    }


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest, current_user: dict = Depends(get_current_user)):
    if not settings.billing_enabled:
        raise HTTPException(status_code=503, detail="Subscriptions are not available yet.")
    uid = current_user["uid"]
    _limit(uid, "subscribe", 5, 600)
    if await asyncio.to_thread(subs.is_pro, uid, subs.verified_email(current_user)):
        raise HTTPException(status_code=409, detail="You already have Apparatus Pro.")
    coupon = None
    if req.coupon:
        try:
            coupon = await asyncio.to_thread(subs.load_coupon, req.coupon, uid, req.plan)
        except subs.CouponError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if coupon["type"] != "discount":
            raise HTTPException(status_code=400, detail="This code gives free Pro. Redeem it instead of paying.")
    try:
        return await asyncio.to_thread(subs.create_subscription, uid, req.plan, coupon)
    except ValueError:
        raise HTTPException(status_code=400, detail="That plan is not available.")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not start checkout. Please try again.")


@router.post("/verify")
async def verify(req: VerifyRequest, current_user: dict = Depends(get_current_user)):
    if not settings.billing_enabled:
        raise HTTPException(status_code=503, detail="Subscriptions are not available yet.")
    _limit(current_user["uid"], "verify", 10, 600)
    if not subs.verify_checkout_signature(req.razorpay_payment_id, req.razorpay_subscription_id, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment could not be verified.")
    try:
        sub = await asyncio.to_thread(subs.fetch_subscription, req.razorpay_subscription_id)
    except Exception:
        raise HTTPException(status_code=502, detail="Payment received; activation will finish shortly.")
    entitlement = await asyncio.to_thread(subs.save_subscription, sub, current_user["uid"])
    if not entitlement:
        raise HTTPException(status_code=400, detail="This payment could not be linked to your account.")
    return {"ok": True, "pro": entitlement.get("pro", False)}


@router.post("/cancel")
async def cancel(current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    _limit(uid, "cancel", 5, 600)
    entitlement = await asyncio.to_thread(subs.get_entitlement, uid, None)
    sub_id = entitlement.get("subscriptionId")
    if not sub_id or entitlement.get("provider") != "razorpay":
        raise HTTPException(status_code=400, detail="No active subscription to cancel.")
    try:
        sub = await asyncio.to_thread(subs.cancel_subscription, sub_id)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not cancel right now. Please try again.")
    await asyncio.to_thread(subs.save_subscription, sub, uid)
    return {"ok": True}


@router.post("/coupon/check")
async def check_coupon(req: CouponRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    # Tight limit so codes can't be brute-forced.
    _limit(uid, "coupon", 10, 600)
    try:
        coupon = await asyncio.to_thread(subs.load_coupon, req.code, uid, req.plan)
    except subs.CouponError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return subs.public_coupon(coupon)


@router.post("/coupon/redeem")
async def redeem_coupon(req: CouponRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["uid"]
    _limit(uid, "coupon", 10, 600)
    try:
        result = await asyncio.to_thread(subs.redeem_free_coupon, uid, subs.verified_email(current_user), req.code)
    except subs.CouponError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Coupon redeem failed for %s", uid)
        raise HTTPException(status_code=502, detail="Could not redeem right now. Please try again.")
    return {"ok": True, **result}


@router.post("/webhook")
async def webhook(request: Request):
    """Razorpay → server. Authenticated by the HMAC signature, not a user token."""
    declared = request.headers.get("content-length", "0")
    if not declared.isdigit() or int(declared) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large")
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BYTES or not subs.verify_webhook_signature(body, request.headers.get("X-Razorpay-Signature", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")
    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    name = str(event.get("event", ""))
    entity = (((event.get("payload") or {}).get("subscription") or {}).get("entity")) or None
    sub_id = str((entity or {}).get("id", ""))
    if name.startswith("subscription.") and subs.SUBSCRIPTION_ID_RE.match(sub_id):
        try:
            # Re-fetch so a replayed or reordered event can never set a stale state.
            fresh = await asyncio.to_thread(subs.fetch_subscription, sub_id)
        except Exception:
            logger.warning("Webhook re-fetch failed for %s; using the signed payload", sub_id)
            fresh = entity
        await asyncio.to_thread(subs.save_subscription, fresh)
    return {"ok": True}
