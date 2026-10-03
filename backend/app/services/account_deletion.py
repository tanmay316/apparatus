"""
Server-side part of account deletion: everything the app can't delete itself.

The app deletes its Firestore data and the Firebase login; this removes the nutrition database rows,
server-only Firestore docs (entitlement, usage, AI summaries, Play purchase links) and stops Pro renewals.
Marketplace orders are kept: they are financial records.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.firebase import get_firestore_client
from app.database.models import (
    ChatMessage, ChatSession, MealItem, MealLog, MealPlan, NutritionSummary, SavedRecipe, ScannedImage, User, UserGoal,
    UserInsight, UserPreference,
)
from app.services import play_billing as play
from app.services import subscription as subs

logger = logging.getLogger(__name__)


def _cancel_pro(uid: str) -> bool:
    entitlement = subs.get_entitlement(uid, None)
    key = entitlement.get("subscriptionId")
    if not key or entitlement.get("provider") != "google_play" or entitlement.get("status") in ("cancelled", "expired"):
        return False
    db = get_firestore_client()
    snap = db.collection("play_purchases").document(key).get() if db else None
    token = (snap.to_dict() or {}).get("token") if snap and snap.exists else None
    if not token:
        return False
    # Stops renewals; there is no account left to use the remaining period.
    play.cancel(token)
    return True


def _delete_sql(db: Session, uid: str) -> None:
    meal_ids = [m.id for m in db.query(MealLog.id).filter(MealLog.user_id == uid).all()]
    if meal_ids:
        db.query(MealItem).filter(MealItem.meal_id.in_(meal_ids)).delete(synchronize_session=False)
    db.query(MealLog).filter(MealLog.user_id == uid).delete(synchronize_session=False)
    db.query(ScannedImage).filter(ScannedImage.user_id == uid).delete(synchronize_session=False)
    session_ids = [s.id for s in db.query(ChatSession.id).filter(ChatSession.user_id == uid).all()]
    if session_ids:
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(ChatSession).filter(ChatSession.user_id == uid).delete(synchronize_session=False)
    for model in (NutritionSummary, SavedRecipe, MealPlan, UserInsight, UserGoal, UserPreference):
        db.query(model).filter(model.user_id == uid).delete(synchronize_session=False)
    db.query(User).filter(User.id == uid).delete(synchronize_session=False)
    db.commit()


def _delete_firestore(uid: str) -> None:
    db = get_firestore_client()
    if not db:
        return
    user_ref = db.collection("users").document(uid)
    for sub in ("private", "ai_insights"):
        for doc in user_ref.collection(sub).list_documents():
            doc.delete()
    for purchase in db.collection("play_purchases").where("uid", "==", uid).limit(50).stream():
        purchase.reference.delete()


def delete_account_data(db: Session, uid: str) -> dict:
    cancelled = False
    try:
        cancelled = _cancel_pro(uid)
    except Exception:
        # Deleting must not be blocked by Google Play; renewal notices find no account afterwards.
        logger.exception("Could not cancel subscription for deleted account %s", uid)
    _delete_sql(db, uid)
    _delete_firestore(uid)
    return {"deleted": True, "subscriptionCancelled": cancelled}
