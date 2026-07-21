from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import api_router

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


@app.on_event("startup")
def on_startup():
    """Create tables on startup (SQLite for dev, Alembic for production)."""
    from app.db.session import engine
    from app.database.models import Base  # Import all models
    Base.metadata.create_all(bind=engine)


app.include_router(api_router, prefix=settings.API_V1_STR)
