import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import api_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Apparatus AI Nutrition Backend", "docs": "/docs"}


@app.get("/ping")
def ping():
    """Keep-alive endpoint for cron-job.org"""
    return {"status": "ok", "message": "Pong!"}


@app.get("/health")
def health():
    """Reports whether the database is actually reachable."""
    from sqlalchemy import text
    from app.db.session import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        return {"status": "degraded", "database": "unavailable", "detail": str(exc)}


@app.on_event("startup")
def on_startup():
    """Create tables on startup (SQLite for dev, Alembic for production)."""
    from app.services.fcm import start_fcm_listener

    # A database outage must not take the whole service down with it: only the
    # nutrition endpoints need Postgres, while push notifications, the AI agent
    # and the keep-alive endpoints stay perfectly usable without it.
    try:
        from app.db.session import engine
        from app.database.models import Base  # Import all models

        Base.metadata.create_all(bind=engine)
        logger.info("Database tables verified.")
    except Exception as exc:
        logger.error(
            "Database unavailable at startup — nutrition endpoints will fail until it "
            "recovers. Check the DATABASE_URL env var. Error: %s",
            exc,
        )

    # Start the background FCM push notification listener
    try:
        start_fcm_listener()
    except Exception as exc:
        logger.error("Failed to start FCM listener: %s", exc)


app.include_router(api_router, prefix=settings.API_V1_STR)
