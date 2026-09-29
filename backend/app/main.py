import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import api_router

logger = logging.getLogger(__name__)

_docs = os.getenv("ENABLE_API_DOCS", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if _docs else None,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
)

# Auth is a Bearer token, never a cookie, so credentialed CORS is not needed.
_raw_origins = set(settings.cors_origins)
if not _raw_origins or "*" in _raw_origins:
    _allow_origins = ["*"]
else:
    # Always ensure website, APK, and dev origins are allowed
    _raw_origins.update([
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://apparatus-46b1b.web.app",
        "https://apparatus-46b1b.firebaseapp.com",
        "https://apparatus.app",
        "capacitor://apparatus.app",
    ])
    _allow_origins = list(_raw_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.options("/{full_path:path}")
def preflight_options_handler(full_path: str):
    from fastapi.responses import Response
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "*",
        },
    )



@app.get("/")
def root():
    return {"message": "Apparatus AI Nutrition Backend"}


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
        logger.error("Health check database error: %s", exc)
        return {"status": "degraded", "database": "unavailable"}


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
