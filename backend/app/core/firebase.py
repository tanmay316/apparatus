import json
import firebase_admin
from firebase_admin import credentials, firestore, messaging
from app.core.config import settings

def init_firebase():
    if not firebase_admin._apps:
        try:
            if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
                # Parse the JSON string from the environment variable
                cred_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
                print("Firebase Admin initialized successfully using service account JSON.")
            else:
                print("FIREBASE_SERVICE_ACCOUNT_JSON not found in environment. FCM notifications will be disabled.")
        except Exception as e:
            print(f"Failed to initialize Firebase Admin: {e}")

def get_firestore_client():
    if not firebase_admin._apps:
        init_firebase()
    if firebase_admin._apps:
        return firestore.client()
    return None

def get_messaging_client():
    if not firebase_admin._apps:
        init_firebase()
    if firebase_admin._apps:
        return messaging
    return None
