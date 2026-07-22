"""
Middleware for resolving API keys from admin settings (Firestore) or user's personal keys.
"""
from typing import Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


import httpx

async def resolve_api_keys(user: dict) -> dict:
    """
    Resolve API keys with priority:
    1. Admin global keys (if use_admin_keys is on)
    2. User's personal keys from Firestore private subcollection
    3. Environment variable fallback
    """
    groq_key = settings.GROQ_API_KEY
    nvidia_key = settings.NVIDIA_API_KEY
    gemini_key = settings.GEMINI_API_KEY
    openrouter_key = settings.OPENROUTER_API_KEY
    
    user_id = user.get("uid", "")
    token = user.get("_token")
    
    if not token:
        logger.warning("No user token provided, falling back to .env keys")
        return {
            "groq_key": groq_key,
            "nvidia_key": nvidia_key,
            "gemini_key": gemini_key,
            "openrouter_key": openrouter_key,
        }

    project_id = "apparatus-46b1b"
    base_url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # 1. Fetch admin global keys
            admin_resp = await client.get(f"{base_url}/admin_settings/api_keys", headers=headers)
            logger.error(f"Firestore REST API admin_settings response: {admin_resp.status_code} - {admin_resp.text}")
            
            if admin_resp.status_code == 200:
                admin_doc = admin_resp.json()
                fields = admin_doc.get("fields", {})
                
                # Firestore REST API wraps values in types, e.g., {"use_admin_keys": {"booleanValue": true}}
                use_admin = fields.get("use_admin_keys", {}).get("booleanValue", False)
                if use_admin:
                    groq_key = fields.get("groq_api_key", {}).get("stringValue", groq_key)
                    nvidia_key = fields.get("nvidia_api_key", {}).get("stringValue", nvidia_key)
                    gemini_key = fields.get("gemini_api_key", {}).get("stringValue", gemini_key)
                    openrouter_key = fields.get("openrouter_api_key", {}).get("stringValue", openrouter_key)
                    return {
                        "groq_key": groq_key,
                        "nvidia_key": nvidia_key,
                        "gemini_key": gemini_key,
                        "openrouter_key": openrouter_key,
                    }

            # 2. Fetch user's personal keys
            user_resp = await client.get(f"{base_url}/users/{user_id}/private/api_keys", headers=headers)
            logger.error(f"Firestore REST API user keys response: {user_resp.status_code} - {user_resp.text}")
            if user_resp.status_code == 200:
                user_doc = user_resp.json()
                fields = user_doc.get("fields", {})
                
                groq_key = fields.get("groq_api_key", {}).get("stringValue", groq_key)
                nvidia_key = fields.get("nvidia_api_key", {}).get("stringValue", nvidia_key)
                gemini_key = fields.get("gemini_api_key", {}).get("stringValue", gemini_key)
                openrouter_key = fields.get("openrouter_api_key", {}).get("stringValue", openrouter_key)

    except Exception as e:
        logger.warning(f"Could not resolve API keys from Firestore REST API: {e}")

    return {
        "groq_key": groq_key,
        "nvidia_key": nvidia_key,
        "gemini_key": gemini_key,
        "openrouter_key": openrouter_key,
    }
