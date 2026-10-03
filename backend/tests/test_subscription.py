"""
Subscription logic tests (no network, no Firestore).
Run: cd backend; ./venv/Scripts/python tests/test_subscription.py
"""
import os
import sys
import time
from datetime import datetime, timezone

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
check("Play grace period is pro", subs.compute_pro("grace", now + 3600, now))
check("cancelled keeps paid period", subs.compute_pro("cancelled", now + 3600, now))
check("cancelled after period is not pro", not subs.compute_pro("cancelled", now - 1, now))
check("on hold is not pro", not subs.compute_pro("on_hold", now + 86400, now))
check("pending payment is not pro", not subs.compute_pro("pending_payment", now + 86400, now))
check("expired is not pro", not subs.compute_pro("expired", now + 86400, now))

# ─── Google Play ───
from app.services import play_billing as play  # noqa: E402

settings.GOOGLE_PLAY_PRO_PRODUCT_ID = "pro"
end_iso = datetime.fromtimestamp(now + 30 * 86400, tz=timezone.utc).isoformat().replace("+00:00", "Z")
sub = {
    "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
    "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING",
    "externalAccountIdentifiers": {"obfuscatedExternalAccountId": play.account_id("u1")},
    "lineItems": [{"productId": "pro", "expiryTime": end_iso, "offerDetails": {"basePlanId": "yearly"}}],
}
info = play.parse(sub)
check("parse reads state, plan and expiry", info["status"] == "active" and info["plan"] == "yearly" and abs(info["end"] - (now + 30 * 86400)) < 2)
check("parse sees unacknowledged purchase", info["acknowledged"] is False)
check("account id is a 64-char hash, not the uid", len(play.account_id("u1")) == 64 and "u1" not in play.account_id("u1"))
check("unknown Play state counts as expired", play.parse({**sub, "subscriptionState": "WHAT"})["status"] == "expired")
try:
    play.parse({**sub, "lineItems": [{"productId": "other", "expiryTime": end_iso}]})
    check("other products never grant Pro", False)
except play.PlayError:
    check("other products never grant Pro", True)
for bad in ("short", "tok en with spaces" * 3, "../../purchases" + "x" * 20, "a" * 2000):
    check(f"token shape rejected: {bad[:20]!r}", not play.TOKEN_RE.match(bad))
settings.GOOGLE_PLAY_RTDN_AUDIENCE = ""
check("push endpoint closed until configured", not play.verify_push("Bearer abc"))
settings.GOOGLE_PLAY_RTDN_AUDIENCE, settings.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT = "https://x.test/rtdn", "rtdn@x.iam.gserviceaccount.com"
check("push rejects a forged token", not play.verify_push("Bearer not-a-jwt"))
check("push needs a bearer token", not play.verify_push(""))

settings.PRO_EMAILS = "vip@example.com"
check("comped email is pro", subs.get_entitlement("u1", "VIP@example.com")["pro"])

# Quotas are off while billing is not configured.
settings.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = ""
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
check("discount coupons are no longer ours (Play promo codes)", coupon_error({"type": "discount", "offerId": "offer_ABC123", "active": True}) is not None)
check("unknown coupon type", coupon_error({**free, "type": "lifetime"}) is not None)
for code, ok in (("free30", True), ("  WELCOME-2026 ", True), ("ab", False), ("../x", False), ("A" * 40, False)):
    try:
        subs.normalize_coupon(code)
        check(f"normalize {code!r}", ok)
    except subs.CouponError:
        check(f"normalize {code!r}", not ok)

sys.exit(1 if failed else 0)
