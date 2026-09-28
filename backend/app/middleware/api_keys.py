"""
Middleware for resolving API keys from admin settings (Firestore) or user's personal keys.
"""
import asyncio
import logging

import httpx

from app.core.config import settings
from app.core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

_KEY_FIELDS = ("groq_api_key", "nvidia_api_key", "gemini_api_key", "openrouter_api_key")


def _env_keys() -> dict:
    return {
        "groq_key": settings.GROQ_API_KEY,
        "nvidia_key": settings.NVIDIA_API_KEY,
        "gemini_key": settings.GEMINI_API_KEY,
        "openrouter_key": settings.OPENROUTER_API_KEY,
    }


def _merge(keys: dict, values: dict) -> dict:
    merged = dict(keys)
    for field in _KEY_FIELDS:
        value = values.get(field)
        if isinstance(value, str) and value.strip():
            merged[field.replace("_api_key", "_key")] = value.strip()
    return merged


def _admin_keys_from_firestore() -> dict:
    """admin_settings/api_keys is admin-only in the rules, so read it with the Admin SDK."""
    db = get_firestore_client()
    if not db:
        return {}
    snap = db.collection("admin_settings").document("api_keys").get()
    return (snap.to_dict() or {}) if snap.exists else {}


async def resolve_api_keys(user: dict) -> dict:
    """
    Resolve API keys with priority:
    1. Admin global keys (if admin_settings/ai_mode.use_admin_keys is on)
    2. User's personal keys from users/{uid}/private/api_keys
    3. Environment variable fallback
    Secrets are never logged.
    """
    keys = _env_keys()
    user_id = user.get("uid", "")
    token = user.get("_token")
    if not token or not user_id:
        return keys

    project_id = "apparatus-46b1b"
    base_url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            mode_resp = await client.get(f"{base_url}/admin_settings/ai_mode", headers=headers)
            use_admin = False
            if mode_resp.status_code == 200:
                fields = mode_resp.json().get("fields", {})
                use_admin = fields.get("use_admin_keys", {}).get("booleanValue", False)

            if use_admin:
                try:
                    admin_values = await asyncio.to_thread(_admin_keys_from_firestore)
                    return _merge(keys, admin_values)
                except Exception as exc:
                    logger.warning("Could not read admin API keys: %s", type(exc).__name__)
                    return keys

            user_resp = await client.get(f"{base_url}/users/{user_id}/private/api_keys", headers=headers)
            if user_resp.status_code == 200:
                fields = user_resp.json().get("fields", {})
                personal = {f: fields.get(f, {}).get("stringValue", "") for f in _KEY_FIELDS}
                keys = _merge(keys, personal)
    except Exception as exc:
        logger.warning("Could not resolve API keys from Firestore: %s", type(exc).__name__)

    return keys
