"""
Pro subscriptions through Google Play Billing.

The app buys the "pro" subscription (base plan "monthly" or "yearly") with the user's hashed uid as
the obfuscated account id, then sends the purchase token here. We read the subscription from the
Play Developer API (never trust the client), bind the token to that one account, acknowledge it and
write users/{uid}/private/entitlement. Renewals, cancellations and refunds arrive as Real-time
developer notifications (Pub/Sub push) and are also re-checked lazily from /billing/status.

Firestore (Admin SDK only):
  play_purchases/{sha256(token)}  { uid, token, productId, plan, status, linkedTokenKey, updatedAt }
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import threading
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import requests

from app.core.config import settings
from app.core.firebase import get_firestore_client
from app.services import subscription as subs

logger = logging.getLogger(__name__)

API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
TOKEN_RE = re.compile(r"^[A-Za-z0-9._:-]{20,1000}$")
# Re-check a subscription with Google at most this often when the app asks for its status.
REFRESH_SEC = 6 * 3600

STATES = {
    "SUBSCRIPTION_STATE_ACTIVE": "active",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD": "grace",
    "SUBSCRIPTION_STATE_ON_HOLD": "on_hold",
    "SUBSCRIPTION_STATE_PAUSED": "paused",
    "SUBSCRIPTION_STATE_CANCELED": "cancelled",
    "SUBSCRIPTION_STATE_EXPIRED": "expired",
    "SUBSCRIPTION_STATE_PENDING": "pending_payment",
    "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED": "expired",
}


class PlayError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def account_id(uid: str) -> str:
    """Obfuscated account id the app passes to Play; must match the frontend (sha256 of 'pro:' + uid)."""
    return hashlib.sha256(f"pro:{uid}".encode()).hexdigest()


def token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


_lock = threading.Lock()
_creds = None


def _access_token() -> str:
    global _creds
    raw = (settings.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or "").strip()
    if not raw:
        raise PlayError(503, "Subscriptions are not available right now.")
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    with _lock:
        if _creds is None:
            info = json.loads(raw if raw.startswith("{") else base64.b64decode(raw).decode())
            _creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
        if not _creds.valid:
            _creds.refresh(Request())
        return _creds.token


def _api(method: str, path: str, body: Optional[dict] = None) -> dict:
    url = f"{API}/{quote(settings.GOOGLE_PLAY_PACKAGE, safe='')}{path}"
    resp = requests.request(method, url, headers={"Authorization": f"Bearer {_access_token()}"}, json=body, timeout=15)
    if resp.status_code in (400, 404, 410):
        logger.warning("Play %s %s -> %s %s", method, path.split("/tokens/")[0], resp.status_code, resp.text[:200])
        raise PlayError(400, "This purchase could not be verified.")
    if resp.status_code >= 400:
        logger.error("Play %s -> %s %s", method, resp.status_code, resp.text[:300])
        raise PlayError(502, "Google Play isn't reachable right now. Pro will unlock shortly.")
    return resp.json() if resp.content else {}


def fetch(token: str) -> dict:
    return _api("GET", f"/purchases/subscriptionsv2/tokens/{quote(token, safe='')}")


def acknowledge(token: str) -> None:
    product = quote(settings.GOOGLE_PLAY_PRO_PRODUCT_ID, safe="")
    _api("POST", f"/purchases/subscriptions/{product}/tokens/{quote(token, safe='')}:acknowledge", {})


def cancel(token: str) -> None:
    """Stops auto-renewal (the user keeps access until the paid period ends)."""
    product = quote(settings.GOOGLE_PLAY_PRO_PRODUCT_ID, safe="")
    _api("POST", f"/purchases/subscriptions/{product}/tokens/{quote(token, safe='')}:cancel", {})


def _epoch(value) -> Optional[float]:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def parse(sub: dict) -> dict:
    """The parts of a SubscriptionPurchaseV2 we act on. Raises if it isn't our Pro product."""
    line = next((li for li in sub.get("lineItems") or [] if li.get("productId") == settings.GOOGLE_PLAY_PRO_PRODUCT_ID), None)
    if not line:
        raise PlayError(400, "This purchase isn't for Pro.")
    base_plan = str((line.get("offerDetails") or {}).get("basePlanId") or "")
    return {
        "status": STATES.get(str(sub.get("subscriptionState")), "expired"),
        "plan": base_plan if base_plan in subs.PLANS else "monthly",
        "end": _epoch(line.get("expiryTime")),
        "acknowledged": sub.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        "account": str(((sub.get("externalAccountIdentifiers") or {}).get("obfuscatedExternalAccountId")) or ""),
        "linked": str(sub.get("linkedPurchaseToken") or ""),
        "test": "testPurchase" in sub,
    }


def save(uid: str, token: str, sub: dict) -> dict:
    """Binds the token to `uid` (first verified owner wins) and writes the entitlement."""
    info = parse(sub)
    if info["account"] and info["account"] != account_id(uid):
        raise PlayError(403, "This purchase belongs to a different account.")
    db = get_firestore_client()
    if not db:
        raise PlayError(503, "Subscriptions are not available right now.")
    key = token_key(token)
    owner_ref = db.collection("play_purchases").document(key)
    from google.cloud import firestore as gcf

    @gcf.transactional
    def _bind(transaction):
        snap = owner_ref.get(transaction=transaction)
        owner = (snap.to_dict() or {}).get("uid") if snap.exists else None
        if owner and owner != uid:
            raise PlayError(403, "This purchase belongs to a different account.")
        transaction.set(owner_ref, {
            "uid": uid, "token": token, "productId": settings.GOOGLE_PLAY_PRO_PRODUCT_ID, "plan": info["plan"],
            "status": info["status"], "linkedTokenKey": token_key(info["linked"]) if info["linked"] else None,
            "test": info["test"], "updatedAt": gcf.SERVER_TIMESTAMP,
        }, merge=True)

    _bind(db.transaction())

    pro = subs.compute_pro(info["status"], info["end"])
    ent_ref = subs._private(uid, "entitlement")
    existing = ent_ref.get()
    current = (existing.to_dict() or {}) if existing.exists else {}
    # A stale notice about an older purchase must not revoke a newer active one,
    # and an ended Play purchase must not cut short a free coupon grant that is still running.
    if current.get("pro") and not pro and (
        current.get("provider") == "coupon"
        or (current.get("provider") == "google_play" and current.get("subscriptionId") not in (None, key))
    ):
        return current
    entitlement = {
        "pro": pro,
        "plan": info["plan"],
        "status": info["status"],
        "provider": "google_play",
        "subscriptionId": key,
        "couponCode": None,
        "currentPeriodEnd": datetime.fromtimestamp(info["end"], tz=timezone.utc) if info["end"] else None,
        "checkedAt": time.time(),
        "updatedAt": gcf.SERVER_TIMESTAMP,
    }
    ent_ref.set(entitlement, merge=True)
    subs._set_badge(uid, pro)
    if pro and not info["acknowledged"]:
        try:
            acknowledge(token)
        except PlayError as exc:
            # The app acknowledges too; Play refunds only if nobody does within 3 days.
            logger.warning("Acknowledge failed for %s: %s", uid, exc.message)
    return entitlement


def verify_purchase(uid: str, token: str) -> dict:
    if not TOKEN_RE.match(token or ""):
        raise PlayError(400, "This purchase could not be verified.")
    return save(uid, token, fetch(token))


def refresh_if_stale(uid: str) -> None:
    """Re-checks the user's Play subscription when it may have renewed or lapsed since we last looked."""
    if not settings.billing_enabled:
        return
    ref = subs._private(uid, "entitlement")
    if not ref:
        return
    try:
        snap = ref.get()
        data = (snap.to_dict() or {}) if snap.exists else {}
        if data.get("provider") != "google_play" or not data.get("subscriptionId"):
            return
        end = subs._to_epoch(data.get("currentPeriodEnd"))
        if time.time() - float(data.get("checkedAt") or 0) < REFRESH_SEC and not (end and end < time.time()):
            return
        owner = get_firestore_client().collection("play_purchases").document(data["subscriptionId"]).get()
        token = (owner.to_dict() or {}).get("token") if owner.exists else None
        if token:
            save(uid, token, fetch(token))
    except PlayError as exc:
        logger.warning("Play refresh failed for %s: %s", uid, exc.message)
    except Exception:
        logger.exception("Play refresh failed for %s", uid)


def verify_push(authorization: str) -> bool:
    """Pub/Sub push requests carry a Google-signed OIDC token for the configured service account."""
    audience = settings.GOOGLE_PLAY_RTDN_AUDIENCE
    expected = settings.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT
    if not audience or not expected or not authorization.startswith("Bearer "):
        return False
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import id_token
        claims = id_token.verify_oauth2_token(authorization[7:], Request(), audience=audience)
    except Exception:
        return False
    return claims.get("email") == expected and bool(claims.get("email_verified"))


def handle_notification(envelope: dict) -> None:
    """Real-time developer notification: re-read the subscription and update its owner's entitlement."""
    try:
        data = json.loads(base64.b64decode((envelope.get("message") or {}).get("data") or "").decode() or "{}")
    except (ValueError, UnicodeDecodeError):
        return
    if data.get("packageName") and data["packageName"] != settings.GOOGLE_PLAY_PACKAGE:
        return
    note = data.get("subscriptionNotification") or {}
    token = str(note.get("purchaseToken") or "")
    if not TOKEN_RE.match(token):
        return
    db = get_firestore_client()
    if not db:
        return
    owner = db.collection("play_purchases").document(token_key(token)).get()
    uid = (owner.to_dict() or {}).get("uid") if owner.exists else None
    sub = fetch(token)
    if not uid:
        # A plan change creates a new token; it inherits the owner of the purchase it replaces.
        linked = str(sub.get("linkedPurchaseToken") or "")
        prev = db.collection("play_purchases").document(token_key(linked)).get() if linked else None
        uid = (prev.to_dict() or {}).get("uid") if prev and prev.exists else None
    if not uid:
        logger.info("Play notification for an unknown purchase; the app will verify it")
        return
    save(uid, token, sub)
