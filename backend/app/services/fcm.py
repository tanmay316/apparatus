import time
import threading
from app.core.firebase import get_firestore_client, get_messaging_client

# Keep track of when the server started to avoid sending notifications for old messages
server_start_time = time.time()

def process_notification(doc_data, doc_id, is_app_notification=False):
    # Check if the notification was created before the server started
    created_at = doc_data.get("createdAt")
    if created_at:
        try:
            # Firestore timestamps
            created_time = created_at.timestamp()
            # If the notification was created before the server booted (minus a 30s buffer), ignore it
            if created_time < (server_start_time - 30):
                return
        except Exception as e:
            print(f"Error parsing timestamp for {doc_id}: {e}")

    receiver_id = doc_data.get("userId") if is_app_notification else doc_data.get("receiverId")
    if not receiver_id:
        return

    if is_app_notification:
        title = doc_data.get("title", "Apparatus Alert")
        body = doc_data.get("body", "You have a new alert")
        link = doc_data.get("link", "")
        extra_type = doc_data.get("type", "alert")
        clan_id = ""
    else:
        sender_name = doc_data.get("senderName", "")
        title = f"New message from {sender_name}" if sender_name else "Apparatus Notification"
        body = doc_data.get("message", "You have a new notification")
        extra = doc_data.get("extra", {})
        link = extra.get("link", "")
        clan_id = extra.get("clanId", "")
        extra_type = doc_data.get("type", "general")

    send_push_notification(receiver_id, title, body, {
        "link": link,
        "clanId": clan_id,
        "type": extra_type
    })


def send_push_notification(user_id: str, title: str, body: str, data_payload: dict):
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
        
        fcm_tokens = user_data.get("fcmTokens")
        if fcm_tokens and isinstance(fcm_tokens, list):
            tokens.extend(fcm_tokens)
        
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
            data=str_data_payload,
            tokens=unique_tokens,
        )

        response = messaging.send_each_for_multicast(message)
        
        # Clean up stale tokens
        if response.failure_count > 0:
            failed_tokens = []
            for idx, resp in enumerate(response.responses):
                if not resp.success:
                    if resp.exception and resp.exception.code in ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"]:
                        failed_tokens.append(unique_tokens[idx])
            
            if failed_tokens:
                from firebase_admin import firestore
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
                process_notification(doc.to_dict(), doc.id, is_app_notification)
            return

        for change in changes:
            if change.type.name == 'ADDED':
                process_notification(change.document.to_dict(), change.document.id, is_app_notification)

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
