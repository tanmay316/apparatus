"""
/account — server-side account deletion (called by the app before it deletes the Firebase login).
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.guardrails import check_rate_limit
from app.core.security import get_current_user
from app.db.session import get_db
from app.services.account_deletion import delete_account_data

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/account", tags=["account"])


@router.delete("")
async def delete_account(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    uid = current_user["uid"]
    rate = check_rate_limit(f"{uid}:account-delete", limit=5, window_seconds=600)
    if not rate.allowed:
        raise HTTPException(status_code=429, detail=rate.message)
    try:
        return await asyncio.to_thread(delete_account_data, db, uid)
    except Exception:
        db.rollback()
        logger.exception("Account deletion failed for %s", uid)
        raise HTTPException(status_code=500, detail="Could not delete your data right now. Please try again.")
