import os
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Apparatus AI Nutrition Backend"
    API_V1_STR: str = "/api/v1"

    # CORS — stored as comma-separated string, parsed at runtime. Defaults to * to allow web & mobile apps.
    BACKEND_CORS_ORIGINS: str = "*"

    @property
    def cors_origins(self) -> List[str]:
        return [s.strip() for s in self.BACKEND_CORS_ORIGINS.split(",") if s.strip()]

    SQLALCHEMY_DATABASE_URI: str = "sqlite:///./apparatus.db"

    def get_database_uri(self) -> str:
        url = os.getenv("DATABASE_URL", self.SQLALCHEMY_DATABASE_URI).strip()
        # Always use psycopg2: psycopg v3's auto-prepared statements break on Supabase's transaction pooler.
        for prefix in ("postgres://", "postgresql://", "postgresql+psycopg://"):
            if url.startswith(prefix):
                url = "postgresql+psycopg2://" + url[len(prefix):]
                break
        return url

    # Firebase Admin SDK credentials
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""

    # API Keys
    GROQ_API_KEY: str = ""
    NVIDIA_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # Provider order (first = preferred). Unknown names are ignored.
    LLM_PROVIDER_ORDER: str = "groq,gemini,nvidia,openrouter"
    VISION_PROVIDER_ORDER: str = "gemini,groq,openrouter,nvidia"

    # Candidate models per provider, best first. Models that are missing from the
    # provider's live /models list or answer 404/410 are skipped automatically.
    GROQ_CHAT_MODELS: str = "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b,llama-3.3-70b-versatile"
    GROQ_VISION_MODELS: str = "qwen/qwen3.8-27b,meta-llama/llama-4-scout-17b-16e-instruct,meta-llama/llama-4-maverick-17b-128e-instruct"
    NVIDIA_CHAT_MODELS: str = "deepseek-ai/deepseek-v4.1-flash,nvidia/nemotron-3-super-120b-a12b,mistralai/mistral-large-2-instruct,google/gemma-4-31b-it,openai/gpt-oss-20b"
    NVIDIA_VISION_MODELS: str = "google/gemma-4-31b-it,nvidia/nemotron-3-nano-omni-30b-a3b-reasoning,meta/llama-3.2-90b-vision-instruct"
    GEMINI_CHAT_MODELS: str = "gemini-3.5-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite"
    GEMINI_VISION_MODELS: str = "gemini-3.5-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite"
    OPENROUTER_CHAT_MODELS: str = "google/gemma-4-31b-it:free,meta-llama/llama-3.3-70b-instruct:free,openai/gpt-oss-120b:free,qwen/qwen3-235b-a22b:free"
    OPENROUTER_VISION_MODELS: str = "google/gemma-4-31b-it:free,nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,meta-llama/llama-4-scout:free,google/gemma-3-27b-it:free"

    # Latency budgets (seconds)
    LLM_CALL_TIMEOUT: float = 25.0
    VISION_CALL_TIMEOUT: float = 30.0
    VISION_TOTAL_BUDGET: float = 45.0
    # A second vision provider starts if the first hasn't answered by then.
    VISION_HEDGE_AFTER: float = 10.0
    AGENT_TOTAL_BUDGET: float = 55.0
    AGENT_MAX_STEPS: int = 4

    @staticmethod
    def csv(value: str) -> List[str]:
        return [s.strip() for s in (value or "").split(",") if s.strip()]

    model_config = {
        "case_sensitive": True,
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
