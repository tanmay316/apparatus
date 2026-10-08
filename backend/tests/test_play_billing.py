"""
Google Play Pro flow against the Firestore emulator (Play API faked).
Run: npx firebase emulators:exec --only firestore --project demo-apparatus "backend\\venv\\Scripts\\python.exe backend\\tests\\test_play_billing.py"
"""
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")

from google.auth.credentials import AnonymousCredentials  # noqa: E402
from google.cloud import firestore  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services import play_billing as play  # noqa: E402
from app.services import subscription as subs  # noqa: E402

failed = 0


def check(name, ok):
    global failed
    if not ok:
        failed += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}")


def raises(fn, status=None):
    try:
        fn()
        return False
    except play.PlayError as exc:
        return status is None or exc.status == status


def _ok(fn):
    try:
        fn()
        return True
    except subs.CouponError:
        return False


db = firestore.Client(project="demo-apparatus", credentials=AnonymousCredentials())
for mod in (play, subs):
    mod.get_firestore_client = lambda: db
settings.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = "{}"
settings.GOOGLE_PLAY_PRO_PRODUCT_ID = "pro"
for coll in ("play_purchases", "users", "coupons"):
    for d in db.collection(coll).stream():
        for sub in d.reference.collections():
            for x in sub.stream():
                x.reference.delete()
        d.reference.delete()

now = time.time()
iso = lambda t: datetime.fromtimestamp(t, tz=timezone.utc).isoformat().replace("+00:00", "Z")  # noqa: E731
purchases: dict[str, dict] = {}
acks: list[str] = []
cancels: list[str] = []
revokes: list[str] = []


def fake_api(method, path, body=None):
    token = path.split("/tokens/")[1].split(":")[0]
    if method == "GET":
        if token not in purchases:
            raise play.PlayError(400, "This purchase could not be verified.")
        return purchases[token]
    if path.endswith(":acknowledge"):
        acks.append(token)
        purchases[token]["acknowledgementState"] = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
    if path.endswith(":cancel"):
        cancels.append(token)
    if path.endswith(":revoke"):
        revokes.append(token)
        purchases[token]["subscriptionState"] = "SUBSCRIPTION_STATE_EXPIRED"
    return {}


play._api = fake_api


def make(token, uid, state="SUBSCRIPTION_STATE_ACTIVE", plan="monthly", end=None, linked=None):
    purchases[token] = {
        "subscriptionState": state,
        "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING",
        "externalAccountIdentifiers": {"obfuscatedExternalAccountId": play.account_id(uid)},
        "lineItems": [{"productId": "pro", "expiryTime": iso(end or now + 30 * 86400), "offerDetails": {"basePlanId": plan}}],
        **({"linkedPurchaseToken": linked} if linked else {}),
    }


def ent(uid):
    return subs.get_entitlement(uid)


T1 = "tok_alice_monthly_0000000000000"
make(T1, "alice")
check("verify grants Pro", play.verify_purchase("alice", T1)["pro"] and ent("alice")["pro"])
check("plan and provider recorded", ent("alice")["plan"] == "monthly" and ent("alice")["provider"] == "google_play")
check("server acknowledges the purchase", acks == [T1])
check("pro badge set", (db.collection("users").document("alice").get().to_dict() or {}).get("proBadge") is True)
check("re-verifying is idempotent", play.verify_purchase("alice", T1)["pro"] and acks == [T1])
check("someone else can't claim the token", raises(lambda: play.verify_purchase("mallory", T1), 403))
check("mallory stays free", not ent("mallory").get("pro"))
check("unknown token rejected", raises(lambda: play.verify_purchase("alice", "tok_does_not_exist_000000000"), 400))
check("malformed token rejected", raises(lambda: play.verify_purchase("alice", "x/../y"), 400))

# Purchase made for a different app account (obfuscated id mismatch)
T2 = "tok_bob_but_sent_by_eve_000000"
make(T2, "bob")
check("account id mismatch rejected", raises(lambda: play.verify_purchase("eve", T2), 403))

# Notifications: cancel → keeps period; expire → loses Pro
envelope = lambda token: {"message": {"data": base64.b64encode(json.dumps({  # noqa: E731
    "packageName": settings.GOOGLE_PLAY_PACKAGE, "subscriptionNotification": {"purchaseToken": token, "notificationType": 3}}).encode()).decode()}}
purchases[T1]["subscriptionState"] = "SUBSCRIPTION_STATE_CANCELED"
play.handle_notification(envelope(T1))
check("cancelled keeps Pro until period end", ent("alice")["pro"] and ent("alice")["status"] == "cancelled")
purchases[T1]["subscriptionState"] = "SUBSCRIPTION_STATE_EXPIRED"
purchases[T1]["lineItems"][0]["expiryTime"] = iso(now - 10 * 86400)
play.handle_notification(envelope(T1))
check("expired removes Pro", not ent("alice")["pro"])
check("pro badge cleared", (db.collection("users").document("alice").get().to_dict() or {}).get("proBadge") is False)
check("notification for another app ignored", play.handle_notification({"message": {"data": base64.b64encode(json.dumps({
    "packageName": "com.evil.app", "subscriptionNotification": {"purchaseToken": T1}}).encode()).decode()}}) is None)
check("garbage notification ignored", play.handle_notification({"message": {"data": "!!!"}}) is None)

# Plan change: new token linked to the old one inherits the owner via notification
T3 = "tok_alice_yearly_upgrade_00000"
make(T3, "alice", plan="yearly", linked=T1)
play.handle_notification(envelope(T3))
check("upgrade token inherits owner", ent("alice")["pro"] and ent("alice")["plan"] == "yearly")
make(T1, "alice", state="SUBSCRIPTION_STATE_EXPIRED", end=now - 86400)
play.handle_notification(envelope(T1))
check("late notice about the old token doesn't revoke the new plan", ent("alice")["pro"] and ent("alice")["plan"] == "yearly")

# Lazy refresh when the period has passed
db.collection("users").document("alice").collection("private").document("entitlement").update({
    "currentPeriodEnd": datetime.fromtimestamp(now - 60, tz=timezone.utc), "checkedAt": now})
purchases[T3]["lineItems"][0]["expiryTime"] = iso(now + 365 * 86400)
play.refresh_if_stale("alice")
check("refresh picks up a renewal", ent("alice")["pro"] and ent("alice")["currentPeriodEnd"] > now + 300 * 86400)

# Free coupon grant isn't cut short by an expired Play purchase
db.collection("users").document("carol").collection("private").document("entitlement").set({
    "pro": True, "plan": "coupon", "status": "granted", "provider": "coupon",
    "currentPeriodEnd": datetime.fromtimestamp(now + 10 * 86400, tz=timezone.utc)})
T4 = "tok_carol_old_expired_00000000"
make(T4, "carol", state="SUBSCRIPTION_STATE_EXPIRED", end=now - 86400)
play.verify_purchase("carol", T4)
check("expired purchase keeps running coupon grant", ent("carol")["pro"] and ent("carol")["provider"] == "coupon")

# Pending payment doesn't unlock
T5 = "tok_dan_pending_payment_000000"
make(T5, "dan", state="SUBSCRIPTION_STATE_PENDING")
check("pending payment is not Pro", not play.verify_purchase("dan", T5)["pro"])
check("pending purchase not acknowledged", T5 not in acks)

# Discount coupons: a cheaper base plan only for accounts that redeemed the code
db.collection("coupons").document("HALF").set({
    "type": "discount", "basePlanId": "monthly-49", "plan": "monthly", "label": "Half price",
    "active": True, "maxRedemptions": 1, "redeemedCount": 0})
T6 = "tok_frank_discount_no_coupon_00"
make(T6, "frank", plan="monthly-49")
check("discount plan without coupon is refused", raises(lambda: play.verify_purchase("frank", T6), 403))
check("...and refunded", T6 in revokes and not ent("frank").get("pro"))
check("unverified email can't redeem", not _ok(lambda: subs.redeem_coupon("erin", None, "HALF")))
res = subs.redeem_coupon("erin", "erin@example.com", "HALF")
check("redeeming a discount reserves the plan", res == {"type": "discount", "basePlanId": "monthly-49"})
check("reserving doesn't grant Pro by itself", not ent("erin").get("pro"))
check("redeeming again is fine (retry purchase)", subs.redeem_coupon("erin", "erin@example.com", "HALF")["basePlanId"] == "monthly-49")
check("single-use code is now claimed for others", not _ok(lambda: subs.redeem_coupon("gina", "gina@example.com", "HALF")))
T7 = "tok_erin_discount_with_coupon_0"
make(T7, "erin", plan="monthly-49")
check("discount plan with coupon grants Pro", play.verify_purchase("erin", T7)["pro"] and T7 not in revokes)
check("someone else can't claim erin's discount token", raises(lambda: play.verify_purchase("frank", T7), 403) and T7 not in revokes)

sys.exit(1 if failed else 0)
