"""
Middleware for resolving API keys from admin settings (Firestore) or user's personal keys.
"""
from typing import Optional
from google.cloud import firestore as gcs_firestore
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


async def resolve_api_keys(user_id: str) -> dict:
    """
    Resolve API keys with priority:
    1. Admin global keys (if use_admin_keys is on)
    2. User's personal keys from Firestore private subcollection
    3. Environment variable fallback
    """
    nvidia_key = settings.NVIDIA_API_KEY
    gemini_key = settings.GEMINI_API_KEY
    openrouter_key = settings.OPENROUTER_API_KEY

    try:
        # Try to use Firebase Admin to read Firestore
        import firebase_admin
        if firebase_admin._apps:
            from firebase_admin import firestore
            db = firestore.client()

            # 1. Check admin global keys
            admin_doc = db.collection("admin_settings").document("api_keys").get()
            if admin_doc.exists:
                admin_data = admin_doc.to_dict()
                if admin_data.get("use_admin_keys"):
                    nvidia_key = admin_data.get("nvidia_api_key", nvidia_key)
                    gemini_key = admin_data.get("gemini_api_key", gemini_key)
                    openrouter_key = admin_data.get("openrouter_api_key", openrouter_key)
                    return {
                        "nvidia_key": nvidia_key,
                        "gemini_key": gemini_key,
                        "openrouter_key": openrouter_key,
                    }

            # 2. Check user's personal keys
            user_keys_doc = (
                db.collection("users").document(user_id)
                .collection("private").document("api_keys").get()
            )
            if user_keys_doc.exists:
                user_data = user_keys_doc.to_dict()
                nvidia_key = user_data.get("nvidia_api_key", nvidia_key)
                gemini_key = user_data.get("gemini_api_key", gemini_key)
                openrouter_key = user_data.get("openrouter_api_key", openrouter_key)

    except Exception as e:
        logger.warning(f"Could not resolve API keys from Firestore: {e}")

    return {
        "nvidia_key": nvidia_key,
        "gemini_key": gemini_key,
        "openrouter_key": openrouter_key,
    }
