import json
import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

# Initialize Firebase Admin SDK
def init_firebase():
    if not firebase_admin._apps:
        try:
            if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
                # Load from env string (Railway)
                service_account_info = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
                cred = credentials.Certificate(service_account_info)
            else:
                # Fallback for local development if json isn't set
                # Requires GOOGLE_APPLICATION_CREDENTIALS or a local firebase.json
                cred = credentials.ApplicationDefault()
                
            options = {"projectId": "apparatus-46b1b"}
            firebase_admin.initialize_app(cred, options=options)
        except Exception as e:
            print(f"Failed to initialize Firebase Admin SDK: {e}")

init_firebase()

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
