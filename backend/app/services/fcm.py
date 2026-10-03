import re
import time
import threading
from datetime import datetime, timezone
from app.core.config import settings
from app.core.firebase import get_firestore_client, get_messaging_client

# Keep track of when the server started to avoid sending notifications for old messages
server_start_time = time.time()

# A push is only useful while the event is fresh. Listener reconnects / catch-up after a
# cold start or network stall re-deliver older docs as ADDED; those must not be pushed.
MAX_PUSH_AGE_SEC = 10 * 60


def _claim_push(doc_id: str, is_app_notification: bool) -> bool:
    """Atomically records that this doc was pushed, so every backend instance / restart sends it once."""
    db = get_firestore_client()
    if not db:
        return False
    try:
        from google.api_core.exceptions import AlreadyExists
        from firebase_admin import firestore
        prefix = "a" if is_app_notification else "n"
        db.collection("push_receipts").document(f"{prefix}_{doc_id}").create({
            "at": firestore.SERVER_TIMESTAMP,
            # Firestore TTL policy on push_receipts.expireAt can clean these up.
            "expireAt": datetime.fromtimestamp(time.time() + 7 * 24 * 3600, tz=timezone.utc),
        })
        return True
    except AlreadyExists:
        return False
    except Exception as e:
        # Receipt store unavailable: still deliver, the age check prevents stale replays.
        print(f"push receipt failed for {doc_id}: {e}")
        return True

# Notification docs are written by other users, so only in-app paths may be forwarded.
_SAFE_LINK = re.compile(r"^/(?![/\\])[^\s\\]{0,299}$")


def _safe_link(link) -> str:
    return link if isinstance(link, str) and _SAFE_LINK.match(link) else ""


def _clip(value, limit: int) -> str:
    return str(value or "")[:limit]


def _parse_timestamp(val) -> float | None:
    if val is None:
        return None
    # 1. Datetime object or Google DatetimeWithNanoseconds
    if hasattr(val, "timestamp") and callable(val.timestamp):
        try:
            return float(val.timestamp())
        except Exception:
            pass
    # 2. Firestore map/dict representation (e.g. {'_seconds': 123, '_nanoseconds': 0})
    if isinstance(val, dict):
        sec = val.get("seconds")
        if sec is None:
            sec = val.get("_seconds")
        if sec is not None:
            try:
                nanos = val.get("nanoseconds") or val.get("_nanoseconds") or 0
                return float(sec) + (float(nanos) / 1e9)
            except Exception:
                pass
        millis = val.get("toMillis") or val.get("_millis")
        if millis is not None:
            try:
                return float(millis) / 1000.0
            except Exception:
                pass
    # 3. Numeric timestamp (seconds or milliseconds)
    if isinstance(val, (int, float)):
        return float(val) / 1000.0 if val > 1e11 else float(val)
    # 4. ISO formatted string
    if isinstance(val, str):
        try:
            s = val.strip()
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            return datetime.fromisoformat(s).timestamp()
        except Exception:
            pass
    return None


def _sender_display_name(sender_id) -> str:
    """Look the sender up instead of trusting the senderName field on the doc."""
    if not isinstance(sender_id, str) or not sender_id:
        return ""
    db = get_firestore_client()
    if not db:
        return ""
    try:
        snap = db.collection("users").document(sender_id).get()
        return _clip((snap.to_dict() or {}).get("displayName", ""), 60) if snap.exists else ""
    except Exception:
        return ""

def process_notification(doc_data, doc_id, is_app_notification=False, is_initial_load=False):
    # Check if the notification was created before the server started
    created_at = doc_data.get("createdAt")
    created_time = _parse_timestamp(created_at)

    if created_time is not None:
        # If the notification was created before the server booted (minus a 30s buffer), ignore it
        if created_time < (server_start_time - 30):
            return
        if time.time() - created_time > MAX_PUSH_AGE_SEC:
            return
    elif is_initial_load:
        # On initial snapshot replay, if we cannot verify it is recent, do not send push
        return

    receiver_id = doc_data.get("userId") if is_app_notification else doc_data.get("receiverId")
    if not receiver_id:
        return
    if doc_data.get("read") is True:
        return
    if not _claim_push(doc_id, is_app_notification):
        return

    if is_app_notification:
        title = _clip(doc_data.get("title") or settings.APP_NAME, 150)
        body = _clip(doc_data.get("body") or "You have a new alert", 500)
        link = _safe_link(doc_data.get("link", ""))
        extra_type = _clip(doc_data.get("type", "alert"), 40)
        clan_id = ""
    else:
        sender_id = doc_data.get("senderId", "")
        # Self-addressed docs are the app's own reminders/achievements.
        sender_name = "" if sender_id == receiver_id else _sender_display_name(sender_id)
        title = f"New message from {sender_name}" if sender_name else settings.APP_NAME
        body = _clip(doc_data.get("message") or "You have a new notification", 500)
        extra = doc_data.get("extra") or {}
        if not isinstance(extra, dict):
            extra = {}
        link = _safe_link(extra.get("link", ""))
        clan_id = _clip(extra.get("clanId", ""), 128)
        extra_type = _clip(doc_data.get("type", "general"), 40)

    send_push_notification(receiver_id, title, body, {
        "link": link,
        "clanId": clan_id,
        "type": extra_type
    }, channel_id="clan_chat_messages" if extra_type == "clan_message" else "general_notifications")


def send_push_notification(user_id: str, title: str, body: str, data_payload: dict, channel_id: str = "general_notifications"):
    db = get_firestore_client()
    messaging = get_messaging_client()
    if not db or not messaging:
        return

    try:
        user_ref = db.collection("users").document(user_id)
        user_snap = user_ref.get()
        if not user_snap.exists:
            return

        user_data = user_snap.to_dict()
        tokens = []

        # Tokens now live in the owner-only users/{uid}/private/push doc;
        # the profile fields are legacy and get cleared by the app on sign-in.
        push_ref = user_ref.collection("private").document("push")
        push_snap = push_ref.get()
        private_tokens = (push_snap.to_dict() or {}).get("fcmTokens") if push_snap.exists else None
        if isinstance(private_tokens, list):
            tokens.extend(t for t in private_tokens if isinstance(t, str))

        fcm_tokens = user_data.get("fcmTokens")
        if fcm_tokens and isinstance(fcm_tokens, list):
            tokens.extend(t for t in fcm_tokens if isinstance(t, str))
        
        fcm_token = user_data.get("fcmToken")
        if fcm_token and isinstance(fcm_token, str):
            tokens.append(fcm_token)

        # Remove duplicates
        unique_tokens = list(set(tokens))
        if not unique_tokens:
            return

        # Ensure all data payload values are strings (FCM requirement)
        str_data_payload = {k: str(v) for k, v in data_payload.items()}

        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            # Without an explicit Android channel + high priority, some OEMs (and Android's
            # default low-importance channel) will silently drop or delay the notification
            # when the app is backgrounded/killed, which is why delivery was inconsistent
            # across devices even though the payload included a top-level "notification" field.
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id=channel_id,
                    priority="high",
                ),
            ),
            # iOS: without an explicit sound/priority APNs delivers silently or late.
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10", "apns-push-type": "alert"},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default"),
                ),
            ),
            data=str_data_payload,
            tokens=unique_tokens,
        )

        response = messaging.send_each_for_multicast(message)
        
        # Clean up stale tokens
        if response.failure_count > 0:
            failed_tokens = []
            for idx, resp in enumerate(response.responses):
                if not resp.success:
                    exc = resp.exception
                    # Admin SDK reports stale tokens as UnregisteredError / SenderIdMismatchError;
                    # malformed ones (e.g. raw APNs tokens) as INVALID_ARGUMENT naming the token.
                    stale = isinstance(exc, (messaging.UnregisteredError, messaging.SenderIdMismatchError)) or (
                        getattr(exc, "code", None) == "INVALID_ARGUMENT" and "registration token" in str(exc).lower()
                    )
                    if stale:
                        failed_tokens.append(unique_tokens[idx])
            
            if failed_tokens:
                from firebase_admin import firestore
                if push_snap.exists:
                    push_ref.update({
                        "fcmTokens": firestore.firestore.ArrayRemove(failed_tokens)
                    })
                if user_data.get("fcmTokens"):
                    user_ref.update({
                        "fcmTokens": firestore.firestore.ArrayRemove(failed_tokens)
                    })

    except Exception as e:
        print(f"Error sending FCM notification: {e}")


def on_snapshot_factory(is_app_notification):
    is_initial = True
    
    def on_snapshot(col_snapshot, changes, read_time):
        nonlocal is_initial
        if is_initial:
            is_initial = False
            # Still process the initial snapshot but `process_notification` will filter out old ones
            for doc in col_snapshot:
                process_notification(doc.to_dict(), doc.id, is_app_notification, is_initial_load=True)
            return

        for change in changes:
            if change.type.name == 'ADDED':
                process_notification(change.document.to_dict(), change.document.id, is_app_notification, is_initial_load=False)

    return on_snapshot


def start_fcm_listener():
    db = get_firestore_client()
    if not db:
        print("Skipping FCM listener (Firebase not initialized).")
        return

    print("Starting FCM listeners for 'notifications' and 'app_notifications'...")
    
    # Keep references to watches so they don't get garbage collected
    global _notifications_watch, _app_notifications_watch
    
    try:
        _notifications_watch = db.collection("notifications").on_snapshot(on_snapshot_factory(False))
        _app_notifications_watch = db.collection("app_notifications").on_snapshot(on_snapshot_factory(True))
    except Exception as e:
        print(f"Failed to start FCM listeners: {e}")
