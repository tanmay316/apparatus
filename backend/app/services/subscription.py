"""
Pro: entitlements, free-tier AI quotas and coupons. Purchases come from Google Play (services/play_billing.py).

Firestore (Admin SDK only; the rules block client writes):
  users/{uid}/private/entitlement  { pro, plan, status, provider, subscriptionId, currentPeriodEnd, couponCode, updatedAt }
  users/{uid}/private/usage        { day, month, counts: { <kind>: n } }
  coupons/{CODE}                   admin-managed; coupons/{CODE}/redemptions/{uid} server-written

Everything fails open: without Firestore or Play credentials nobody is limited.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

# kind -> (free allowance, period). "ai_call" is one shared daily pool for the coach,
# recipes and meal plans; "lifetime" allowances never reset.
FREE_LIMITS: dict[str, tuple[int, str]] = {
    "ai_call": (3, "day"),
    "food_scan": (2, "day"),
    "workout_plan": (1, "lifetime"),
    # AI coach summary of a run/ride/walk/workout; the weekly report is Pro-only.
    "ai_summary": (1, "week"),
}

PLANS = ("monthly", "yearly")

# Pro is "unlimited" for people, but a daily fair-use cap stops one account (or a leaked token)
# from running up LLM bills. Counted separately as "pro_<kind>" and reset daily.
PRO_DAILY_LIMITS: dict[str, int] = {
    "ai_call": 150,
    "food_scan": 40,
    "workout_plan": 10,
    "ai_summary": 40,
}

# "active"/"grace" keep a short window past the period end in case a renewal notice is late.
_ACTIVE_STATUSES = {"active", "grace"}
_GRACE_SEC = 3 * 24 * 3600

COUPON_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,31}$")
# Play Console base plan ids: lowercase letters, digits and hyphens.
BASE_PLAN_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


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
    if data.get("provider") == "coupon" and data.get("couponCode"):
        # Safety net for the coupon watcher: a disabled/deleted/shortened coupon ends the grant.
        data = _apply_coupon(uid, ref, data, _coupon_state(str(data["couponCode"])))
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
    pro: bool = False

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
    if not settings.pro_enforced or kind not in FREE_LIMITS:
        return QuotaResult(True, kind, limit, 0, period)
    pro = is_pro(uid, email)
    if pro:
        if kind not in PRO_DAILY_LIMITS:
            return QuotaResult(True, kind, limit, 0, period, pro=True)
        limit, period = PRO_DAILY_LIMITS[kind], "day"
    counter = f"pro_{kind}" if pro else kind
    ref = _private(uid, "usage")
    if not ref:
        return QuotaResult(True, kind, limit, 0, period, pro=pro)

    from google.cloud import firestore as gcf

    day, month, week = _period_keys()

    @gcf.transactional
    def _txn(transaction):
        snap = ref.get(transaction=transaction)
        data = (snap.to_dict() or {}) if snap.exists else {}
        counts = _fresh_counts(data, day, month, week)
        used = int(counts.get(counter, 0))
        if used >= limit:
            return QuotaResult(False, kind, limit, used, period, pro=pro)
        counts[counter] = used + 1
        transaction.set(ref, {"day": day, "month": month, "week": week, "counts": counts})
        return QuotaResult(True, kind, limit, used + 1, period, pro=pro)

    try:
        return _txn(get_firestore_client().transaction())
    except Exception as exc:
        logger.warning("Quota check failed for %s/%s: %s", uid, kind, exc)
        return QuotaResult(True, kind, limit, 0, period, pro=pro)


def refund_quota(uid: str, kind: str) -> None:
    """Gives a use back when the AI call itself failed."""
    if not settings.pro_enforced:
        return
    ref = _private(uid, "usage")
    if not ref:
        return
    try:
        from google.cloud import firestore as gcf
        snap = ref.get()
        counts = ((snap.to_dict() or {}).get("counts") or {}) if snap.exists else {}
        # Pro uses are counted under pro_<kind>; refund whichever was charged, never below zero.
        key = f"pro_{kind}" if int(counts.get(f"pro_{kind}", 0)) > 0 and is_pro(uid) else kind
        if int(counts.get(key, 0)) > 0:
            ref.update({f"counts.{key}": gcf.Increment(-1)})
    except Exception:
        pass


async def enforce_quota(current_user: dict, kind: str) -> None:
    """Raises 402 with a machine-readable detail the app turns into the Pro paywall."""
    import asyncio
    from fastapi import HTTPException

    result = await asyncio.to_thread(consume_quota, current_user["uid"], verified_email(current_user), kind)
    if not result.allowed:
        if result.pro:
            raise HTTPException(status_code=429, detail="You've reached today's fair-use limit for this feature. It resets tomorrow.")
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


def _set_badge(uid: str, pro: bool) -> None:
    try:
        # Public badge on the profile; the rules stop clients from setting it themselves.
        get_firestore_client().collection("users").document(uid).set({"proBadge": pro}, merge=True)
    except Exception as exc:
        logger.warning("Pro badge update failed for %s: %s", uid, exc)


# ─── Coupons ──────────────────────────────────────────────────────────────
# coupons/{CODE}: { type, label, maxRedemptions (0 = unlimited), redeemedCount, expiresAt, active }
#   type 'free':     Pro until expiresAt for everyone who redeems (legacy codes without a date: `days`).
#                    Disabling or deleting the code ends that Pro; re-enabling restores it.
#   type 'discount': basePlanId -> a cheaper Play base plan (e.g. "monthly-49") that each redeeming
#                    account may buy once, for one billing period (auto-renew is switched off).

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


def _discount_plan(data: dict) -> Optional[str]:
    base = str(data.get("basePlanId") or "")
    return base if BASE_PLAN_RE.match(base) and base not in PLANS else None


def _check_coupon(data: dict, redeemed_by_user: bool, plan: Optional[str], consumed: bool = False) -> None:
    if not data or not data.get("active"):
        raise CouponError("That code isn't valid.")
    expires = _to_epoch(data.get("expiresAt"))
    if expires is not None and expires < time.time():
        raise CouponError("This code has expired.")
    kind = data.get("type")
    if kind == "free":
        if not (1 <= int(data.get("days") or 0) <= 3660):
            raise CouponError("That code isn't valid.")
    elif kind == "discount":
        if not _discount_plan(data):
            raise CouponError("That code isn't valid.")
        # Applied but not bought yet: buying the discounted plan is still allowed (once).
        if redeemed_by_user and not consumed:
            return
    else:
        raise CouponError("That code isn't valid.")
    if redeemed_by_user:
        raise CouponError("You've already used this code.")
    max_uses = int(data.get("maxRedemptions") or 0)
    if max_uses and int(data.get("redeemedCount") or 0) >= max_uses:
        raise CouponError("This code has been fully claimed.")


def load_coupon(code: str, uid: str, plan: Optional[str] = None) -> dict:
    code = normalize_coupon(code)
    ref = _coupon_ref(code)
    if not ref:
        raise CouponError("Coupons are not available right now.")
    snap = ref.get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    red = ref.collection("redemptions").document(uid).get() if data else None
    used = bool(red and red.exists)
    _check_coupon(data, used, plan, consumed=bool(used and (red.to_dict() or {}).get("purchaseTokenKey")))
    discount = data["type"] == "discount"
    fixed_end = None if discount else _to_epoch(data.get("expiresAt"))
    return {
        "code": code,
        "type": data["type"],
        "label": str(data.get("label") or "")[:120],
        "days": 0 if discount else (max(1, -(-int(fixed_end - time.time()) // 86400)) if fixed_end else int(data.get("days") or 0)),
        "until": fixed_end,
        "plan": (data.get("plan") if data.get("plan") in PLANS else "monthly") if discount else "any",
        "basePlanId": _discount_plan(data) if discount else None,
    }


def public_coupon(coupon: dict) -> dict:
    return {k: coupon[k] for k in ("code", "type", "label", "days", "until", "plan", "basePlanId")}


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


def redeem_coupon(uid: str, email: Optional[str], code: str) -> dict:
    """Free coupons grant Pro days; discount coupons reserve the discounted Play plan for this account.
    `email` must be the verified address (verified_email) so one person can't farm codes with throwaway sign-ups."""
    if not email:
        raise CouponError("Verify your email address to use coupon codes.")
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
        red_snap = red_ref.get(transaction=transaction) if data else None
        used = bool(red_snap and red_snap.exists)
        _check_coupon(data, used, None, consumed=bool(used and (red_snap.to_dict() or {}).get("purchaseTokenKey")))
        if data["type"] == "discount":
            base_plan = _discount_plan(data)
            if not used:
                transaction.set(red_ref, {"uid": uid, "type": "discount", "basePlanId": base_plan, "at": gcf.SERVER_TIMESTAMP})
                transaction.update(ref, {"redeemedCount": gcf.Increment(1)})
            return {"type": "discount", "basePlanId": base_plan}
        ent_snap = ent_ref.get(transaction=transaction)
        ent = (ent_snap.to_dict() or {}) if ent_snap.exists else {}
        fixed_end = _to_epoch(data.get("expiresAt"))
        if fixed_end is not None:
            # The coupon's date is the final day of Pro for everyone, whenever they redeem.
            end = fixed_end
        else:
            start = time.time()
            if ent.get("provider") == "coupon" and compute_pro(ent.get("status", ""), _to_epoch(ent.get("currentPeriodEnd"))):
                start = max(start, _to_epoch(ent.get("currentPeriodEnd")) or 0)
            end = start + int(data["days"]) * 86400
        if ent.get("provider") == "coupon" and compute_pro(ent.get("status", ""), _to_epoch(ent.get("currentPeriodEnd"))):
            end = max(end, _to_epoch(ent.get("currentPeriodEnd")) or 0)
        entitlement = {
            "pro": True, "plan": "coupon", "status": "granted", "provider": "coupon",
            "couponCode": code, "subscriptionId": None,
            "currentPeriodEnd": datetime.fromtimestamp(end, tz=timezone.utc),
            "updatedAt": gcf.SERVER_TIMESTAMP,
        }
        transaction.set(ent_ref, entitlement)
        transaction.set(red_ref, {"uid": uid, "type": "free", "until": datetime.fromtimestamp(end, tz=timezone.utc), "at": gcf.SERVER_TIMESTAMP})
        transaction.update(ref, {"redeemedCount": gcf.Increment(1)})
        return {"type": "free", "days": max(1, round((end - time.time()) / 86400)), "until": end}

    result = _txn(get_firestore_client().transaction())
    if result["type"] == "free":
        _set_badge(uid, True)
    return result


# Coupon docs change rarely; a short cache keeps /billing/status from reading one on every call.
_COUPON_CACHE: dict[str, tuple[float, Optional[dict]]] = {}
_COUPON_TTL = 60


def _coupon_state(code: str, fresh: bool = False) -> Optional[dict]:
    """The coupon doc (None if deleted), cached briefly."""
    hit = _COUPON_CACHE.get(code)
    if hit and not fresh and hit[0] > time.time():
        return hit[1]
    ref = _coupon_ref(code)
    if not ref:
        return {"active": True}  # fail open like the rest of billing
    snap = ref.get()
    data = (snap.to_dict() or {}) if snap.exists else None
    _COUPON_CACHE[code] = (time.time() + _COUPON_TTL, data)
    return data


def _apply_coupon(uid: str, ent_ref, ent: dict, coupon: Optional[dict], until: Optional[float] = None) -> dict:
    """Brings a coupon grant in line with its coupon: revoked while the code is off or deleted,
    restored when it is switched back on, and never past the coupon's end date."""
    status = ent.get("status")
    end = _to_epoch(ent.get("currentPeriodEnd"))
    live = bool(coupon) and bool(coupon.get("active")) and coupon.get("type") == "free"
    if not live:
        new_status, new_end = ("revoked" if status == "granted" else status), end
    else:
        coupon_end = _to_epoch(coupon.get("expiresAt"))
        base = until if until is not None else end
        new_end = min(x for x in (base, coupon_end) if x is not None) if (base is not None or coupon_end is not None) else None
        new_status = "granted" if status in ("granted", "revoked") else status
    if new_status == status and new_end == end:
        return ent
    update = {"status": new_status, "pro": compute_pro(new_status or "", new_end)}
    if new_end is not None:
        update["currentPeriodEnd"] = datetime.fromtimestamp(new_end, tz=timezone.utc)
    try:
        from google.cloud import firestore as gcf
        ent_ref.set({**update, "updatedAt": gcf.SERVER_TIMESTAMP}, merge=True)
        _set_badge(uid, update["pro"])
    except Exception as exc:
        logger.warning("Coupon grant update failed for %s: %s", uid, exc)
    return {**ent, **update}


def sync_coupon_grants(code: str) -> int:
    """Re-applies a coupon to every account that redeemed it (after it was disabled, enabled,
    deleted or its date changed). Returns how many entitlements changed."""
    code = normalize_coupon(code)
    ref = _coupon_ref(code)
    if not ref:
        return 0
    coupon = _coupon_state(code, fresh=True)
    changed = 0
    for red in ref.collection("redemptions").stream():
        rdata = red.to_dict() or {}
        if rdata.get("type") != "free":
            continue
        ent_ref = _private(red.id, "entitlement")
        snap = ent_ref.get() if ent_ref else None
        ent = (snap.to_dict() or {}) if snap and snap.exists else {}
        if ent.get("provider") != "coupon" or ent.get("couponCode") != code:
            continue
        after = _apply_coupon(red.id, ent_ref, ent, coupon, _to_epoch(rdata.get("until")))
        changed += after is not ent
    return changed


_coupon_watch = None


def start_coupon_watch() -> None:
    """Applies admin changes to coupons (on/off, delete, date) to everyone who redeemed them."""
    global _coupon_watch
    db = get_firestore_client()
    if not db:
        return

    def on_snapshot(_docs, changes, _read_time):
        for change in changes:
            # The first snapshot reports every coupon as ADDED: that fixes grants made before this existed.
            try:
                sync_coupon_grants(change.document.id)
            except Exception as exc:
                logger.warning("Coupon sync failed for %s: %s", change.document.id, exc)

    _coupon_watch = db.collection("coupons").on_snapshot(on_snapshot)


def coupon_allows_plan(uid: str, base_plan: str) -> bool:
    """Whether this account redeemed a discount coupon for `base_plan` (needed to keep a purchase of it)."""
    db = get_firestore_client()
    if not db or not BASE_PLAN_RE.match(base_plan or ""):
        return False
    for snap in db.collection("coupons").where("basePlanId", "==", base_plan).limit(50).stream():
        if snap.reference.collection("redemptions").document(uid).get().exists:
            return True
    return False


def claim_discount(uid: str, base_plan: str, purchase_key: str) -> bool:
    """Discount coupons are one-time: the first purchase of the discounted plan uses up the
    redemption, so another purchase of it (a second month, a re-buy) is refused."""
    db = get_firestore_client()
    if not db or not BASE_PLAN_RE.match(base_plan or ""):
        return False
    from google.cloud import firestore as gcf
    for snap in db.collection("coupons").where("basePlanId", "==", base_plan).limit(50).stream():
        coupon = snap.to_dict() or {}
        red_ref = snap.reference.collection("redemptions").document(uid)

        @gcf.transactional
        def _txn(transaction):
            red = red_ref.get(transaction=transaction)
            if not red.exists:
                return False
            used = (red.to_dict() or {}).get("purchaseTokenKey")
            if used:
                return used == purchase_key
            if not coupon.get("active"):
                return False
            transaction.update(red_ref, {"purchaseTokenKey": purchase_key, "usedAt": gcf.SERVER_TIMESTAMP})
            return True

        if _txn(db.transaction()):
            return True
    return False
