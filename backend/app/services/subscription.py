"""
Apparatus Pro: entitlements, free-tier AI quotas and Razorpay subscriptions.

Firestore (Admin SDK only; the rules block client writes):
  users/{uid}/private/entitlement  { pro, plan, status, provider, subscriptionId, currentPeriodEnd, couponCode, updatedAt }
  users/{uid}/private/usage        { day, month, counts: { <kind>: n } }
  users/{uid}/private/billing      { pendingSubscriptionId, pendingPlan, pendingCoupon, pendingShortUrl, pendingAt }
  coupons/{CODE}                   admin-managed; coupons/{CODE}/redemptions/{uid} server-written

Everything fails open: without Firestore or Razorpay keys nobody is limited.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import requests

from app.core.config import settings
from app.core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

RAZORPAY_API = "https://api.razorpay.com/v1"

# kind -> (free allowance, period). "ai_call" is one shared daily pool for the coach,
# recipes and meal plans; "lifetime" allowances never reset.
FREE_LIMITS: dict[str, tuple[int, str]] = {
    "ai_call": (3, "day"),
    "food_scan": (2, "day"),
    "workout_plan": (1, "lifetime"),
    # AI coach summary of a run/ride/walk/workout; the weekly report is Pro-only.
    "ai_summary": (1, "week"),
}

PLANS = {
    "monthly": {"setting": "RAZORPAY_PLAN_MONTHLY", "total_count": 120},
    "yearly": {"setting": "RAZORPAY_PLAN_YEARLY", "total_count": 10},
}

# Razorpay retries failed renewals ("pending") before halting; keep access meanwhile.
_ACTIVE_STATUSES = {"active", "authenticated", "pending"}
_GRACE_SEC = 3 * 24 * 3600

# Razorpay ids are interpolated into API paths, so only accept their exact shape.
SUBSCRIPTION_ID_RE = re.compile(r"^sub_[A-Za-z0-9]{6,40}$")
PAYMENT_ID_RE = re.compile(r"^pay_[A-Za-z0-9]{6,40}$")
COUPON_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,31}$")
_PENDING_REUSE_SEC = 30 * 60


def verified_email(user: dict) -> Optional[str]:
    """Only a verified email may unlock comped Pro (anyone can type an address into sign-up)."""
    return user.get("email") if user.get("email_verified") else None


def _private(uid: str, doc_id: str):
    db = get_firestore_client()
    if not db:
        return None
    return db.collection("users").document(uid).collection("private").document(doc_id)


def _comped(email: Optional[str]) -> bool:
    return bool(email) and email.strip().lower() in {e.lower() for e in settings.csv(settings.PRO_EMAILS)}


def _to_epoch(value) -> Optional[float]:
    if value is None:
        return None
    if hasattr(value, "timestamp"):
        return float(value.timestamp())
    if isinstance(value, (int, float)):
        return float(value)
    return None


def compute_pro(status: str, current_end: Optional[float], now: Optional[float] = None) -> bool:
    now = now or time.time()
    if status in _ACTIVE_STATUSES:
        return current_end is None or current_end + _GRACE_SEC > now
    # Cancelled at cycle end: the paid period still counts.
    if status == "cancelled":
        return current_end is not None and current_end > now
    # Coupon grants end exactly at their end date.
    if status == "granted":
        return current_end is not None and current_end > now
    return False


def get_entitlement(uid: str, email: Optional[str] = None) -> dict:
    if _comped(email):
        return {"pro": True, "plan": "comp", "status": "active", "currentPeriodEnd": None}
    ref = _private(uid, "entitlement")
    if not ref:
        return {"pro": False}
    try:
        snap = ref.get()
    except Exception as exc:
        logger.warning("Entitlement read failed for %s: %s", uid, exc)
        return {"pro": False}
    data = (snap.to_dict() or {}) if snap.exists else {}
    end = _to_epoch(data.get("currentPeriodEnd"))
    data["pro"] = compute_pro(data.get("status", ""), end) if data else False
    data["currentPeriodEnd"] = end
    data.pop("updatedAt", None)
    return data


def is_pro(uid: str, email: Optional[str] = None) -> bool:
    return bool(get_entitlement(uid, email).get("pro"))


# ─── Free-tier quotas ────────────────────────────────────────────

@dataclass
class QuotaResult:
    allowed: bool
    kind: str
    limit: int = 0
    used: int = 0
    period: str = "day"

    def detail(self) -> dict:
        noun = {"ai_call": "AI requests", "food_scan": "food scans", "ai_summary": "AI coach summary" if self.limit == 1 else "AI coach summaries",
                "workout_plan": "AI workout plan" if self.limit == 1 else "AI workout plans"}.get(self.kind, "AI requests")
        when = {"day": " today", "week": " this week", "month": " this month"}.get(self.period, "")
        return {
            "code": "pro_required",
            "kind": self.kind,
            "limit": self.limit,
            "period": self.period,
            "message": f"You've used your {self.limit} free {noun}{when}. Upgrade to {settings.APP_NAME} Pro for unlimited access.",
        }


def _period_keys() -> tuple[str, str, str]:
    now = datetime.now(timezone.utc)
    year, week, _ = now.isocalendar()
    return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m"), f"{year}-W{week:02d}"


def _fresh_counts(data: dict, day: str, month: str, week: str) -> dict:
    """Counts with every allowance whose period rolled over reset to zero."""
    current = {"day": day, "month": month, "week": week}
    return {k: v for k, v in dict(data.get("counts") or {}).items()
            if (p := FREE_LIMITS.get(k, (0, "day"))[1]) == "lifetime" or data.get(p) == current.get(p)}


def consume_quota(uid: str, email: Optional[str], kind: str) -> QuotaResult:
    """Counts one use of a limited AI feature; denies free users past their allowance."""
    limit, period = FREE_LIMITS.get(kind, (0, "day"))
    if not settings.billing_enabled or kind not in FREE_LIMITS:
        return QuotaResult(True, kind, limit, 0, period)
    if is_pro(uid, email):
        return QuotaResult(True, kind, limit, 0, period)
    ref = _private(uid, "usage")
    if not ref:
        return QuotaResult(True, kind, limit, 0, period)

    from google.cloud import firestore as gcf

    day, month, week = _period_keys()

    @gcf.transactional
    def _txn(transaction):
        snap = ref.get(transaction=transaction)
        data = (snap.to_dict() or {}) if snap.exists else {}
        counts = _fresh_counts(data, day, month, week)
        used = int(counts.get(kind, 0))
        if used >= limit:
            return QuotaResult(False, kind, limit, used, period)
        counts[kind] = used + 1
        transaction.set(ref, {"day": day, "month": month, "week": week, "counts": counts})
        return QuotaResult(True, kind, limit, used + 1, period)

    try:
        return _txn(get_firestore_client().transaction())
    except Exception as exc:
        logger.warning("Quota check failed for %s/%s: %s", uid, kind, exc)
        return QuotaResult(True, kind, limit, 0, period)


def refund_quota(uid: str, kind: str) -> None:
    """Gives a use back when the AI call itself failed."""
    if not settings.billing_enabled:
        return
    ref = _private(uid, "usage")
    if not ref:
        return
    try:
        from google.cloud import firestore as gcf
        ref.update({f"counts.{kind}": gcf.Increment(-1)})
    except Exception:
        pass


async def enforce_quota(current_user: dict, kind: str) -> None:
    """Raises 402 with a machine-readable detail the app turns into the Pro paywall."""
    import asyncio
    from fastapi import HTTPException

    result = await asyncio.to_thread(consume_quota, current_user["uid"], verified_email(current_user), kind)
    if not result.allowed:
        raise HTTPException(status_code=402, detail=result.detail())


def usage_summary(uid: str) -> dict:
    ref = _private(uid, "usage")
    counts: dict = {}
    if ref:
        try:
            snap = ref.get()
            data = (snap.to_dict() or {}) if snap.exists else {}
            day, month, week = _period_keys()
            fresh = _fresh_counts(data, day, month, week)
            for kind in FREE_LIMITS:
                counts[kind] = int(fresh.get(kind, 0))
        except Exception:
            pass
    return {kind: {"used": counts.get(kind, 0), "limit": limit, "period": period} for kind, (limit, period) in FREE_LIMITS.items()}


# ─── Razorpay ────────────────────────────────────────────────────

def _rzp(method: str, path: str, **kwargs) -> dict:
    resp = requests.request(
        method, f"{RAZORPAY_API}{path}",
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
        timeout=15, **kwargs,
    )
    if resp.status_code >= 400:
        logger.error("Razorpay %s %s -> %s %s", method, path, resp.status_code, resp.text[:300])
        raise RuntimeError("Payment provider error")
    return resp.json()


def plan_id(plan: str) -> str:
    cfg = PLANS.get(plan)
    return getattr(settings, cfg["setting"], "") if cfg else ""


def create_subscription(uid: str, plan: str, coupon: Optional[dict] = None) -> dict:
    pid = plan_id(plan)
    if not pid:
        raise ValueError("Unknown plan")
    code = coupon["code"] if coupon else ""
    billing_ref = _private(uid, "billing")

    # Reuse the unpaid checkout from a moment ago instead of opening a second one
    # (two paid subscriptions would double-charge the user).
    if billing_ref:
        snap = billing_ref.get()
        pending = (snap.to_dict() or {}) if snap.exists else {}
        if (pending.get("pendingPlan") == plan and pending.get("pendingCoupon", "") == code
                and time.time() - float(pending.get("pendingAt") or 0) < _PENDING_REUSE_SEC
                and SUBSCRIPTION_ID_RE.match(str(pending.get("pendingSubscriptionId", "")))):
            try:
                existing = fetch_subscription(pending["pendingSubscriptionId"])
                if existing.get("status") == "created":
                    return {"subscription_id": existing["id"], "short_url": existing.get("short_url"), "key_id": settings.RAZORPAY_KEY_ID}
            except Exception:
                pass

    body = {
        "plan_id": pid,
        "total_count": PLANS[plan]["total_count"],
        "quantity": 1,
        "customer_notify": 1,
        "notes": {"uid": uid, "plan": plan, **({"coupon": code} if code else {})},
    }
    if coupon and coupon.get("offerId"):
        body["offer_id"] = coupon["offerId"]
    sub = _rzp("POST", "/subscriptions", json=body)
    if billing_ref:
        billing_ref.set({
            "pendingSubscriptionId": sub["id"], "pendingPlan": plan, "pendingCoupon": code,
            "pendingShortUrl": sub.get("short_url"), "pendingAt": time.time(),
        })
    return {"subscription_id": sub["id"], "short_url": sub.get("short_url"), "key_id": settings.RAZORPAY_KEY_ID}


def fetch_subscription(subscription_id: str) -> dict:
    if not SUBSCRIPTION_ID_RE.match(subscription_id or ""):
        raise ValueError("Invalid subscription id")
    return _rzp("GET", f"/subscriptions/{subscription_id}")


def cancel_subscription(subscription_id: str) -> dict:
    if not SUBSCRIPTION_ID_RE.match(subscription_id or ""):
        raise ValueError("Invalid subscription id")
    return _rzp("POST", f"/subscriptions/{subscription_id}/cancel", json={"cancel_at_cycle_end": 1})


def verify_checkout_signature(payment_id: str, subscription_id: str, signature: str) -> bool:
    if not settings.RAZORPAY_KEY_SECRET or not PAYMENT_ID_RE.match(payment_id or "") or not SUBSCRIPTION_ID_RE.match(subscription_id or ""):
        return False
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(), f"{payment_id}|{subscription_id}".encode(), hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def save_subscription(sub: dict, expected_uid: Optional[str] = None) -> Optional[dict]:
    """Writes the entitlement from a Razorpay subscription entity (source of truth: Razorpay)."""
    notes = sub.get("notes") or {}
    uid = notes.get("uid") if isinstance(notes, dict) else None
    if not uid or (expected_uid and uid != expected_uid):
        logger.warning("Subscription %s has no/mismatched uid", sub.get("id"))
        return None
    # Only our own plans can grant Pro (defence in depth against foreign subscription ids).
    if sub.get("plan_id") not in {plan_id(p) for p in PLANS if plan_id(p)}:
        logger.warning("Subscription %s is on an unknown plan", sub.get("id"))
        return None
    ref = _private(uid, "entitlement")
    if not ref:
        return None
    status = str(sub.get("status", ""))
    end = sub.get("current_end")
    end_dt = datetime.fromtimestamp(end, tz=timezone.utc) if end else None
    plan = notes.get("plan") or next((p for p in PLANS if plan_id(p) == sub.get("plan_id")), "monthly")
    pro = compute_pro(status, float(end) if end else None)
    # Late events for an old subscription must not revoke a newer active one.
    existing = ref.get()
    current = (existing.to_dict() or {}) if existing.exists else {}
    if current.get("subscriptionId") != sub.get("id") and current.get("pro") and not pro:
        return current
    from google.cloud import firestore as gcf
    entitlement = {
        "pro": pro,
        "plan": plan,
        "status": status,
        "provider": "razorpay",
        "subscriptionId": sub.get("id"),
        "currentPeriodEnd": end_dt,
        "updatedAt": gcf.SERVER_TIMESTAMP,
    }
    ref.set(entitlement, merge=True)
    _set_badge(uid, pro)
    code = notes.get("coupon")
    if pro and isinstance(code, str) and COUPON_RE.match(code):
        _record_redemption(code, uid, "discount")
    billing_ref = _private(uid, "billing")
    if pro and billing_ref:
        billing_ref.set({"pendingSubscriptionId": None, "pendingAt": 0}, merge=True)
    return entitlement


def _set_badge(uid: str, pro: bool) -> None:
    try:
        # Public badge on the profile; the rules stop clients from setting it themselves.
        get_firestore_client().collection("users").document(uid).set({"proBadge": pro}, merge=True)
    except Exception as exc:
        logger.warning("Pro badge update failed for %s: %s", uid, exc)


# ─── Coupons ──────────────────────────────────────────────────────────────
# coupons/{CODE}: { type: 'free'|'discount', days, offerId, plan: 'any'|'monthly'|'yearly',
#                   label, maxRedemptions (0 = unlimited), redeemedCount, expiresAt, active }

class CouponError(Exception):
    """User-facing reason a coupon can't be used."""


def normalize_coupon(code: str) -> str:
    code = (code or "").strip().upper()
    if not COUPON_RE.match(code):
        raise CouponError("That code isn't valid.")
    return code


def _coupon_ref(code: str):
    db = get_firestore_client()
    return db.collection("coupons").document(code) if db else None


def _check_coupon(data: dict, redeemed_by_user: bool, plan: Optional[str]) -> None:
    if not data or not data.get("active"):
        raise CouponError("That code isn't valid.")
    expires = _to_epoch(data.get("expiresAt"))
    if expires is not None and expires < time.time():
        raise CouponError("This code has expired.")
    max_uses = int(data.get("maxRedemptions") or 0)
    if max_uses and int(data.get("redeemedCount") or 0) >= max_uses:
        raise CouponError("This code has been fully claimed.")
    if redeemed_by_user:
        raise CouponError("You've already used this code.")
    kind = data.get("type")
    if kind == "free" and not (1 <= int(data.get("days") or 0) <= 3660):
        raise CouponError("That code isn't valid.")
    if kind == "discount" and not str(data.get("offerId") or "").startswith("offer_"):
        raise CouponError("That code isn't valid.")
    if kind not in ("free", "discount"):
        raise CouponError("That code isn't valid.")
    only = data.get("plan") or "any"
    if kind == "discount" and plan and only in PLANS and plan != only:
        raise CouponError(f"This code only works with the {only} plan.")


def load_coupon(code: str, uid: str, plan: Optional[str] = None) -> dict:
    code = normalize_coupon(code)
    ref = _coupon_ref(code)
    if not ref:
        raise CouponError("Coupons are not available right now.")
    snap = ref.get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    used = ref.collection("redemptions").document(uid).get().exists if data else False
    _check_coupon(data, used, plan)
    return {
        "code": code,
        "type": data["type"],
        "label": str(data.get("label") or "")[:120],
        "days": int(data.get("days") or 0),
        "plan": data.get("plan") or "any",
        "offerId": data.get("offerId") if data["type"] == "discount" else None,
    }


def public_coupon(coupon: dict) -> dict:
    return {k: coupon[k] for k in ("code", "type", "label", "days", "plan")}


def _record_redemption(code: str, uid: str, kind: str) -> None:
    """Idempotent: one redemption per user per code."""
    ref = _coupon_ref(code)
    if not ref:
        return
    from google.cloud import firestore as gcf
    red_ref = ref.collection("redemptions").document(uid)

    @gcf.transactional
    def _txn(transaction):
        if red_ref.get(transaction=transaction).exists:
            return
        transaction.set(red_ref, {"uid": uid, "type": kind, "at": gcf.SERVER_TIMESTAMP})
        transaction.update(ref, {"redeemedCount": gcf.Increment(1)})

    try:
        _txn(get_firestore_client().transaction())
    except Exception as exc:
        logger.warning("Coupon redemption record failed for %s/%s: %s", code, uid, exc)


def redeem_free_coupon(uid: str, email: Optional[str], code: str) -> dict:
    """Grants Pro for the coupon's days (stacks on an earlier coupon grant)."""
    code = normalize_coupon(code)
    ref = _coupon_ref(code)
    ent_ref = _private(uid, "entitlement")
    if not ref or not ent_ref:
        raise CouponError("Coupons are not available right now.")
    current = get_entitlement(uid, email)
    if current.get("pro") and current.get("provider") != "coupon":
        raise CouponError(f"You already have {settings.APP_NAME} Pro.")

    from google.cloud import firestore as gcf
    red_ref = ref.collection("redemptions").document(uid)

    @gcf.transactional
    def _txn(transaction):
        snap = ref.get(transaction=transaction)
        data = (snap.to_dict() or {}) if snap.exists else {}
        used = red_ref.get(transaction=transaction).exists if data else False
        _check_coupon(data, used, None)
        if data["type"] != "free":
            raise CouponError("This code gives a discount. Pick a plan to use it at checkout.")
        ent_snap = ent_ref.get(transaction=transaction)
        ent = (ent_snap.to_dict() or {}) if ent_snap.exists else {}
        start = time.time()
        if ent.get("provider") == "coupon":
            start = max(start, _to_epoch(ent.get("currentPeriodEnd")) or 0)
        end = start + int(data["days"]) * 86400
        entitlement = {
            "pro": True, "plan": "coupon", "status": "granted", "provider": "coupon",
            "couponCode": code, "subscriptionId": None,
            "currentPeriodEnd": datetime.fromtimestamp(end, tz=timezone.utc),
            "updatedAt": gcf.SERVER_TIMESTAMP,
        }
        transaction.set(ent_ref, entitlement)
        transaction.set(red_ref, {"uid": uid, "type": "free", "at": gcf.SERVER_TIMESTAMP})
        transaction.update(ref, {"redeemedCount": gcf.Increment(1)})
        return {"days": int(data["days"]), "until": end}

    result = _txn(get_firestore_client().transaction())
    _set_badge(uid, True)
    return result
