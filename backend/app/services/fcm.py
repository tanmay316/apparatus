import re
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from app.core.config import settings
from app.core.firebase import get_firestore_client, get_messaging_client

# Keep track of when the server started to avoid sending notifications for old messages
server_start_time = time.time()

# A push is only useful while the event is fresh. Listener reconnects / catch-up after a
# cold start or network stall re-deliver older docs as ADDED; those must not be pushed.
MAX_PUSH_AGE_SEC = 10 * 60

# Pushes run off the listener thread: a slow FCM/Firestore call must not delay every later push
# (busy clans used to queue up until pushes were older than MAX_PUSH_AGE_SEC and got dropped).
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="push")

# Listeners only watch recent docs (not the whole collection) and are re-opened periodically so
# the watched window stays small.
LISTEN_LOOKBACK_SEC = 60
LISTEN_RENEW_SEC = 3 * 3600


class _TTLCache:
    def __init__(self, ttl: float, max_items: int = 5000):
        self.ttl, self.max_items, self._data, self._lock = ttl, max_items, {}, threading.Lock()

    def get(self, key):
        with self._lock:
            hit = self._data.get(key)
            if hit and hit[0] > time.time():
                return hit[1]
            self._data.pop(key, None)
            return None

    def set(self, key, value):
        with self._lock:
            if len(self._data) >= self.max_items:
                self._data.clear()
            self._data[key] = (time.time() + self.ttl, value)

    def drop(self, key):
        with self._lock:
            self._data.pop(key, None)


_names = _TTLCache(600)
_tokens = _TTLCache(300)
_clan_members = _TTLCache(60)
_clan_names = _TTLCache(600)


def _claim_push(doc_id: str, is_app_notification: bool, prefix: str | None = None) -> bool:
    """Atomically records that this doc was pushed, so every backend instance / restart sends it once."""
    db = get_firestore_client()
    if not db:
        return False
    try:
        from google.api_core.exceptions import AlreadyExists
        from firebase_admin import firestore
        prefix = prefix or ("a" if is_app_notification else "n")
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
    cached = _names.get(sender_id)
    if cached is not None:
        return cached
    db = get_firestore_client()
    if not db:
        return ""
    try:
        snap = db.collection("users").document(sender_id).get()
        name = _clip((snap.to_dict() or {}).get("displayName", ""), 60) if snap.exists else ""
        _names.set(sender_id, name)
        return name
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
        if extra_type == "live_cheer":
            title = f"🔥 {sender_name or 'Someone'} cheered you on"
        elif extra_type == "clan_message" and extra.get("kind") == "mention":
            title = f"{sender_name or 'Someone'} mentioned you"

    send_push_notification(receiver_id, title, body, {
        "link": link,
        "clanId": clan_id,
        "type": extra_type
    }, channel_id="clan_chat_messages" if extra_type == "clan_message" else "general_notifications",
        tag="live_cheer" if extra_type == "live_cheer" else None)


def send_push_notification(user_id: str, title: str, body: str, data_payload: dict, channel_id: str = "general_notifications", tag: str | None = None):
    db = get_firestore_client()
    messaging = get_messaging_client()
    if not db or not messaging:
        return

    try:
        unique_tokens = _user_tokens(user_id)
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
                    # Same tag = a newer cheer replaces the older one in the tray.
                    tag=tag,
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
        _remove_tokens(user_id, _stale_tokens(response, unique_tokens))

    except Exception as e:
        print(f"Error sending FCM notification: {e}")


def _user_tokens(user_id: str) -> list[str]:
    """FCM tokens of a user (private push doc + legacy profile fields), cached for a few minutes."""
    cached = _tokens.get(user_id)
    if cached is not None:
        return cached
    db = get_firestore_client()
    if not db:
        return []
    user_ref = db.collection("users").document(user_id)
    user_snap = user_ref.get()
    if not user_snap.exists:
        _tokens.set(user_id, [])
        return []
    user_data = user_snap.to_dict() or {}
    tokens = []
    # Tokens now live in the owner-only users/{uid}/private/push doc;
    # the profile fields are legacy and get cleared by the app on sign-in.
    push_snap = user_ref.collection("private").document("push").get()
    private_tokens = (push_snap.to_dict() or {}).get("fcmTokens") if push_snap.exists else None
    if isinstance(private_tokens, list):
        tokens.extend(t for t in private_tokens if isinstance(t, str))
    if isinstance(user_data.get("fcmTokens"), list):
        tokens.extend(t for t in user_data["fcmTokens"] if isinstance(t, str))
    if isinstance(user_data.get("fcmToken"), str):
        tokens.append(user_data["fcmToken"])
    unique = list(dict.fromkeys(tokens))
    _tokens.set(user_id, unique)
    return unique


def _stale_tokens(response, tokens: list[str]) -> list[str]:
    stale = []
    messaging = get_messaging_client()
    for idx, resp in enumerate(response.responses):
        if resp.success:
            continue
        exc = resp.exception
        # Admin SDK reports stale tokens as UnregisteredError / SenderIdMismatchError;
        # malformed ones (e.g. raw APNs tokens) as INVALID_ARGUMENT naming the token.
        if isinstance(exc, (messaging.UnregisteredError, messaging.SenderIdMismatchError)) or (
            getattr(exc, "code", None) == "INVALID_ARGUMENT" and "registration token" in str(exc).lower()
        ):
            stale.append(tokens[idx])
    return stale


def _remove_tokens(user_id: str, failed_tokens: list[str]):
    if not failed_tokens:
        return
    db = get_firestore_client()
    if not db:
        return
    from firebase_admin import firestore
    _tokens.drop(user_id)
    user_ref = db.collection("users").document(user_id)
    remove = {"fcmTokens": firestore.firestore.ArrayRemove(failed_tokens)}
    for ref in (user_ref.collection("private").document("push"), user_ref):
        try:
            ref.update(remove)
        except Exception:
            pass  # doc or field missing


# ─── Clan chat: one push fan-out per message on the server ───
# The app used to write one `notifications` doc per member per message (N writes + N listener
# events + N pushes processed one by one). New clients mark messages `fanout: "server"` and the
# backend sends one multicast to all members' devices instead. @mentioned members still get a
# notification doc from the app, so they are skipped here (no double push).

def _active_member_ids(clan_id: str) -> list[str]:
    cached = _clan_members.get(clan_id)
    if cached is not None:
        return cached
    db = get_firestore_client()
    if not db:
        return []
    from google.cloud.firestore_v1.base_query import FieldFilter
    docs = (db.collection("clan_memberships")
            .where(filter=FieldFilter("clanId", "==", clan_id))
            .where(filter=FieldFilter("status", "==", "active"))
            .stream())
    ids = [uid for uid in ((d.to_dict() or {}).get("userId") for d in docs) if isinstance(uid, str) and uid]
    _clan_members.set(clan_id, ids)
    return ids


def _clan_name(clan_id: str) -> str:
    cached = _clan_names.get(clan_id)
    if cached is not None:
        return cached
    db = get_firestore_client()
    name = ""
    if db:
        try:
            snap = db.collection("clans_v2").document(clan_id).get()
            name = _clip((snap.to_dict() or {}).get("name", ""), 60) if snap.exists else ""
        except Exception:
            pass
    _clan_names.set(clan_id, name)
    return name


def process_clan_message(doc_data: dict, doc_id: str):
    if doc_data.get("fanout") != "server" or doc_data.get("isDeleted"):
        return
    created = _parse_timestamp(doc_data.get("createdAt"))
    if created is None or created < server_start_time - 30 or time.time() - created > MAX_PUSH_AGE_SEC:
        return
    clan_id = _clip(doc_data.get("clanId", ""), 128)
    sender_id = doc_data.get("userId", "")
    if not clan_id or not isinstance(sender_id, str):
        return
    mentioned = {m for m in (doc_data.get("mentions") or []) if isinstance(m, str)}
    recipients = [uid for uid in _active_member_ids(clan_id) if uid != sender_id and uid not in mentioned]
    if not recipients or not _claim_push(doc_id, False, prefix="m"):
        return

    messaging = get_messaging_client()
    if not messaging:
        return
    sender = _sender_display_name(sender_id) or _clip(doc_data.get("userName"), 60) or "Clan member"
    clan = _clan_name(clan_id)
    text = _clip(doc_data.get("text"), 300) or ("📷 Photo" if doc_data.get("images") or doc_data.get("imageUrl") else "New message")
    title = clan or sender
    body = f"{sender}: {text}" if clan else text
    data = {"link": f"/clan/{clan_id}/chat", "clanId": clan_id, "type": "clan_message", "messageId": _clip(doc_id, 128)}

    owners: list[tuple[str, str]] = []
    for uid in recipients:
        owners.extend((token, uid) for token in _user_tokens(uid))
    for start in range(0, len(owners), 500):
        chunk = owners[start:start + 500]
        tokens = [t for t, _ in chunk]
        try:
            response = messaging.send_each_for_multicast(messaging.MulticastMessage(
                notification=messaging.Notification(title=title, body=body),
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(channel_id="clan_chat_messages", priority="high"),
                ),
                apns=messaging.APNSConfig(
                    headers={"apns-priority": "10", "apns-push-type": "alert"},
                    payload=messaging.APNSPayload(aps=messaging.Aps(sound="default", thread_id=f"clan_{clan_id}")),
                ),
                data=data,
                tokens=tokens,
            ))
            stale = set(_stale_tokens(response, tokens))
            by_user: dict[str, list[str]] = {}
            for token, uid in chunk:
                if token in stale:
                    by_user.setdefault(uid, []).append(token)
            for uid, bad in by_user.items():
                _remove_tokens(uid, bad)
        except Exception as e:
            print(f"Error sending clan chat push for {doc_id}: {e}")


def _clan_message_snapshot_factory():
    def on_snapshot(col_snapshot, changes, read_time):
        for change in changes:
            if change.type.name == 'ADDED':
                _pool.submit(_safe, process_clan_message, change.document.to_dict() or {}, change.document.id)
    return on_snapshot


def _safe(fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except Exception as e:
        print(f"Push worker error: {e}")


def on_snapshot_factory(is_app_notification):
    is_initial = True

    def on_snapshot(col_snapshot, changes, read_time):
        nonlocal is_initial
        if is_initial:
            is_initial = False
            # Still process the initial snapshot but `process_notification` will filter out old ones
            for doc in col_snapshot:
                _pool.submit(_safe, process_notification, doc.to_dict() or {}, doc.id, is_app_notification, is_initial_load=True)
            return

        for change in changes:
            if change.type.name == 'ADDED':
                _pool.submit(_safe, process_notification, change.document.to_dict() or {}, change.document.id,
                             is_app_notification, is_initial_load=False)

    return on_snapshot


_watches: list = []
_renew_timer: threading.Timer | None = None


def _open_watches():
    """(Re)opens the listeners on recent docs only, so startup doesn't read whole collections."""
    global _watches, _renew_timer
    db = get_firestore_client()
    if not db:
        return
    from google.cloud.firestore_v1.base_query import FieldFilter
    since = datetime.now(timezone.utc) - timedelta(seconds=LISTEN_LOOKBACK_SEC)
    recent = lambda name: db.collection(name).where(filter=FieldFilter("createdAt", ">=", since))
    old = _watches
    try:
        _watches = [
            recent("notifications").on_snapshot(on_snapshot_factory(False)),
            recent("app_notifications").on_snapshot(on_snapshot_factory(True)),
            recent("clan_messages").on_snapshot(_clan_message_snapshot_factory()),
        ]
    except Exception as e:
        print(f"Failed to start FCM listeners: {e}")
        _watches = old
        old = []
    # Overlapping by LISTEN_LOOKBACK_SEC is safe: push receipts make every push happen once.
    for w in old:
        try:
            w.unsubscribe()
        except Exception:
            pass
    _renew_timer = threading.Timer(LISTEN_RENEW_SEC, _open_watches)
    _renew_timer.daemon = True
    _renew_timer.start()


def start_fcm_listener():
    db = get_firestore_client()
    if not db:
        print("Skipping FCM listener (Firebase not initialized).")
        return

    print("Starting FCM listeners for notifications, app_notifications and clan_messages...")
    _open_watches()
