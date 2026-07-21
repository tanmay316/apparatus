from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import get_current_user
from app.api.nutrition import router as nutrition_router

api_router = APIRouter()

# Include the nutrition sub-router
api_router.include_router(nutrition_router)


@api_router.get("/health")
def health_check():
    return {"status": "healthy", "service": "apparatus-ai-nutrition"}


@api_router.get("/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
