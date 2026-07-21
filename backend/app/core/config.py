import os
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Apparatus AI Nutrition Backend"
    API_V1_STR: str = "/api/v1"

    # CORS — stored as comma-separated string, parsed at runtime
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [s.strip() for s in self.BACKEND_CORS_ORIGINS.split(",") if s.strip()]

    # Database setup (PostgreSQL / SQLite fallback)
    SQLALCHEMY_DATABASE_URI: str = os.getenv("DATABASE_URL", "sqlite:///./apparatus.db")

    # Firebase Admin SDK credentials
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""

    # API Keys
    NVIDIA_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    model_config = {
        "case_sensitive": True,
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
