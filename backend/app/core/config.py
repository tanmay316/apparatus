import json
import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings


def _brand() -> dict:
    # app/brand.json is copied from the repo-root brand.config.json by `npm run brand:sync` (also runs on build).
    try:
        return json.loads((Path(__file__).resolve().parents[1] / "brand.json").read_text("utf-8"))
    except (OSError, ValueError):
        return {}


_BRAND = _brand()


class Settings(BaseSettings):
    APP_NAME: str = _BRAND.get("name", "Apparatus")
    PROJECT_NAME: str = f"{_BRAND.get('name', 'Apparatus')} backend"
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

    # Pro subscriptions (Google Play Billing). Billing and free-tier AI limits stay off until the
    # service account is set. Play Console: subscription product GOOGLE_PLAY_PRO_PRODUCT_ID with
    # base plans "monthly" and "yearly".
    GOOGLE_PLAY_PACKAGE: str = _BRAND.get("appId", "com.tms.apparatus")
    GOOGLE_PLAY_PRO_PRODUCT_ID: str = "pro"
    # Service-account key JSON (raw or base64) with "View financial data" + "Manage orders" in Play Console.
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: str = ""
    # Real-time developer notifications (Pub/Sub push). Audience = the push endpoint URL;
    # the service account is the one set as the push subscription's authentication identity.
    GOOGLE_PLAY_RTDN_AUDIENCE: str = ""
    GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT: str = ""
    # Comma-separated emails that always get Pro (you, testers, giveaways).
    PRO_EMAILS: str = "tanmay.sharma4334@gmail.com,sharmamoni913@gmail.com"

    # Must match isAdmin() in firestore.rules.
    ADMIN_EMAILS: str = "tanmay.sharma4334@gmail.com,sharmamoni913@gmail.com"

    # Marketplace payments (off by default, admin switch). Uses Razorpay payment links + Route payouts.
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # Marketplace (tickets, paid clans, coach plans, sponsorships). Platform cut in percent;
    # the seller's share is paid out to their Razorpay Route linked account.
    MARKET_FEE_PCT_TICKET: float = 10.0
    MARKET_FEE_PCT_COACH: float = 20.0
    MARKET_MIN_PRICE_INR: int = 19
    MARKET_MAX_PRICE_INR: int = 50000
    # Seller sign-up: account age, and a monthly sales cap until a seller is trusted (admin flag or N completed sales).
    MARKET_SELLER_MIN_ACCOUNT_DAYS: int = 7
    MARKET_NEW_SELLER_MONTHLY_INR: int = 10000
    MARKET_TRUSTED_AFTER_SALES: int = 10
    # Web checkouts return here after paying (/purchase/<order id>).
    PUBLIC_APP_URL: str = _BRAND.get("webUrl", "https://apparatus-46b1b.web.app")

    @property
    def billing_enabled(self) -> bool:
        return bool(self.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)

    @property
    def market_enabled(self) -> bool:
        return bool(self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET)

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
