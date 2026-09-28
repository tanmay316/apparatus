import json
import logging
import threading
import time

import firebase_admin
import requests
from firebase_admin import credentials, auth
from google.auth import jwt as google_jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
def init_firebase():
    if not firebase_admin._apps:
        try:
            if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
                # Load from env string (Render / Railway)
                service_account_info = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
                cred = credentials.Certificate(service_account_info)
                options = {"projectId": service_account_info.get("project_id", "apparatus-46b1b")}
                firebase_admin.initialize_app(cred, options=options)
            else:
                # Direct initialization without GCP metadata server lookup
                options = {"projectId": "apparatus-46b1b"}
                firebase_admin.initialize_app(options=options)
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK: {e}")

init_firebase()

security = HTTPBearer()

PROJECT_ID = "apparatus-46b1b"
_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_certs_cache: dict = {"certs": None, "expires": 0.0}
_certs_lock = threading.Lock()


def _google_certs() -> dict:
    with _certs_lock:
        if _certs_cache["certs"] and time.time() < _certs_cache["expires"]:
            return _certs_cache["certs"]
        resp = requests.get(_CERTS_URL, timeout=5)
        resp.raise_for_status()
        _certs_cache["certs"] = resp.json()
        _certs_cache["expires"] = time.time() + 3600
        return _certs_cache["certs"]


def _verify_firebase_token(token: str) -> dict:
    # The Admin SDK path needs Google credentials; without a service account we
    # verify the RS256 signature against Google's published certs ourselves.
    if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
        return auth.verify_id_token(token)
    claims = google_jwt.decode(token, certs=_google_certs(), audience=PROJECT_ID)
    if claims.get("iss") != f"https://securetoken.google.com/{PROJECT_ID}":
        raise ValueError("Unexpected token issuer")
    if not claims.get("sub") or len(claims["sub"]) > 128:
        raise ValueError("Missing subject")
    if claims.get("auth_time", 0) > time.time() + 300:
        raise ValueError("auth_time in the future")
    claims["uid"] = claims["sub"]
    return claims


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Verifies the Firebase ID token signature, expiry, audience and issuer.

    Never decode a token without verifying it: an unsigned payload lets anyone
    claim any uid.
    """
    token = credentials.credentials
    try:
        decoded_token = _verify_firebase_token(token)
    except Exception as e:
        logger.info("Rejected ID token: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    decoded_token["_token"] = token
    return decoded_token
