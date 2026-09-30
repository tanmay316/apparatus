"""
Subscription logic tests (no network, no Firestore).
Run: cd backend; ./venv/Scripts/python tests/test_subscription.py
"""
import hashlib
import hmac
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.services import subscription as subs  # noqa: E402

failed = 0


def check(name, ok):
    global failed
    if not ok:
        failed += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}")


now = time.time()
check("active with future end is pro", subs.compute_pro("active", now + 86400, now))
check("active in grace window is pro", subs.compute_pro("active", now - 86400, now))
check("active long expired is not pro", not subs.compute_pro("active", now - 10 * 86400, now))
check("cancelled keeps paid period", subs.compute_pro("cancelled", now + 3600, now))
check("cancelled after period is not pro", not subs.compute_pro("cancelled", now - 1, now))
check("halted is not pro", not subs.compute_pro("halted", now + 86400, now))
check("created (unpaid) is not pro", not subs.compute_pro("created", None, now))

settings.RAZORPAY_KEY_SECRET = "secret_test"
sig = hmac.new(b"secret_test", b"pay_ABC1234|sub_XYZ7890", hashlib.sha256).hexdigest()
check("checkout signature valid", subs.verify_checkout_signature("pay_ABC1234", "sub_XYZ7890", sig))
check("checkout signature tampered", not subs.verify_checkout_signature("pay_ABC9999", "sub_XYZ7890", sig))

settings.RAZORPAY_WEBHOOK_SECRET = "whsec"
body = b'{"event":"subscription.activated"}'
wsig = hmac.new(b"whsec", body, hashlib.sha256).hexdigest()
check("webhook signature valid", subs.verify_webhook_signature(body, wsig))
check("webhook signature wrong body", not subs.verify_webhook_signature(body + b" ", wsig))

settings.PRO_EMAILS = "vip@example.com"
check("comped email is pro", subs.get_entitlement("u1", "VIP@example.com")["pro"])

# Quotas are off while billing is not configured.
settings.RAZORPAY_KEY_ID = ""
check("no billing -> unlimited", subs.consume_quota("u1", "a@b.c", "coach_chat").allowed)

detail = subs.QuotaResult(False, "food_scan", 3, 3, "day").detail()
check("402 detail is machine readable", detail["code"] == "pro_required" and detail["kind"] == "food_scan")
check("free tier: 3 shared AI calls/day", subs.FREE_LIMITS["ai_call"] == (3, "day"))
check("free tier: 2 food scans/day", subs.FREE_LIMITS["food_scan"] == (2, "day"))
check("free tier: 1 workout plan ever", subs.FREE_LIMITS["workout_plan"] == (1, "lifetime"))
life = subs.QuotaResult(False, "workout_plan", 1, 1, "lifetime").detail()["message"]
check("lifetime message wording", life.startswith("You've used your 1 free AI workout plan.") and "today" not in life)

# ─── Security hardening ───
check("unverified email never gets comped Pro", subs.verified_email({"email": "vip@example.com", "email_verified": False}) is None)
check("verified email passes through", subs.verified_email({"email": "vip@example.com", "email_verified": True}) == "vip@example.com")
check("checkout rejects malformed ids", not subs.verify_checkout_signature("pay_1/../x", "sub_1", sig))
for bad in ("sub_abc/../../payments", "sub_", "SUB_123456", "sub_123456?x=1"):
    try:
        subs.fetch_subscription(bad)
        check(f"fetch rejects {bad!r}", False)
    except ValueError:
        check(f"fetch rejects {bad!r}", True)
check("coupon grant active before end", subs.compute_pro("granted", now + 60, now))
check("coupon grant has no grace", not subs.compute_pro("granted", now - 60, now))

# ─── Coupons ───
def coupon_error(data, used=False, plan=None):
    try:
        subs._check_coupon(data, used, plan)
        return None
    except subs.CouponError as exc:
        return str(exc)

free = {"type": "free", "days": 30, "active": True, "maxRedemptions": 10, "redeemedCount": 0}
check("valid free coupon", coupon_error(free) is None)
check("inactive coupon", coupon_error({**free, "active": False}) == "That code isn't valid.")
check("exhausted coupon", "fully claimed" in (coupon_error({**free, "redeemedCount": 10}) or ""))
check("unlimited coupon (max 0)", coupon_error({**free, "maxRedemptions": 0, "redeemedCount": 999}) is None)
check("expired coupon", "expired" in (coupon_error({**free, "expiresAt": now - 1}) or ""))
check("one redemption per user", "already used" in (coupon_error(free, used=True) or ""))
check("free coupon needs sane days", coupon_error({**free, "days": 0}) is not None)
disc = {"type": "discount", "offerId": "offer_ABC123", "plan": "yearly", "active": True}
check("valid discount coupon", coupon_error(disc, plan="yearly") is None)
check("discount plan restriction", "yearly plan" in (coupon_error(disc, plan="monthly") or ""))
check("discount needs a Razorpay offer", coupon_error({**disc, "offerId": "hack"}) is not None)
check("unknown coupon type", coupon_error({**free, "type": "lifetime"}) is not None)
for code, ok in (("free30", True), ("  WELCOME-2026 ", True), ("ab", False), ("../x", False), ("A" * 40, False)):
    try:
        subs.normalize_coupon(code)
        check(f"normalize {code!r}", ok)
    except subs.CouponError:
        check(f"normalize {code!r}", not ok)

sys.exit(1 if failed else 0)
