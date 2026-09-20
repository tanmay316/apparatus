"""
Guardrails for the AI agents.

Everything here is deterministic and runs before/after the LLM, so it costs no
tokens and adds no meaningful latency. The LLM system prompt is the second line
of defence, not the first.
"""
from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional

# ─── Limits ──────────────────────────────────────────────────────

MAX_MESSAGE_CHARS = 4000
MIN_MESSAGE_CHARS = 1
# ~8MB of base64 ≈ 6MB raw. Anything larger is either an attack or a photo that
# should have been compressed client-side.
MAX_IMAGE_BASE64_CHARS = 8_000_000
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}


@dataclass
class GuardrailVerdict:
    allowed: bool
    reason: str = ""
    # User-facing text used verbatim when `allowed` is False.
    message: str = ""


# ─── Prompt injection ────────────────────────────────────────────

_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instruction|prompt|rule|direction)",
    r"disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+(instruction|prompt|rule)",
    r"forget\s+(everything|all|your)\s+(you|instruction|rule|prompt)",
    r"you\s+are\s+now\s+(a|an|no longer)",
    r"act\s+as\s+(if\s+you\s+are\s+)?(a|an)\s+(?!nutrition|diet|fitness)",
    r"pretend\s+(to\s+be|you\s+are)",
    r"(reveal|show|print|repeat|output)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instruction)",
    r"what\s+(are|is)\s+your\s+(system\s+)?(prompt|instruction)s?\b",
    r"\bdeveloper\s+mode\b",
    r"\bjailbreak\b",
    r"\bDAN\s+mode\b",
    r"<\s*/?\s*(system|assistant)\s*>",
    r"\[\s*(system|INST)\s*\]",
    r"###\s*(system|instruction)",
]
_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def detect_prompt_injection(text: str) -> bool:
    return any(rx.search(text) for rx in _INJECTION_RE)


# ─── Topic scope ─────────────────────────────────────────────────
# The assistant is a nutrition/fitness coach. Anything clearly outside that is
# refused deterministically so the model never gets a chance to answer it.

_OFF_TOPIC_PATTERNS = [
    # Software / tech help
    r"\b(write|debug|fix|refactor|explain)\s+(me\s+)?(some\s+|this\s+|the\s+)?(code|script|function|program|sql|regex)\b",
    r"\b(python|javascript|typescript|java|c\+\+|html|css|react|sql)\s+(code|script|program|tutorial|error)\b",
    # Politics / religion / news
    r"\b(election|president|prime minister|political party|vote for|government policy)\b",
    r"\b(bible|quran|gita|religion|religious belief)\b",
    # Finance
    r"\b(stock market|crypto|bitcoin|ethereum|investment advice|trading strategy|mutual fund)\b",
    # Academic homework
    r"\b(solve|calculate)\s+(this\s+)?(math|algebra|calculus|physics|chemistry)\s+(problem|equation|homework)\b",
    r"\bwrite\s+(me\s+)?(an?\s+)?(essay|poem|song|story|novel|screenplay)\b",
    # Other assistants / general knowledge
    r"\b(weather|forecast)\s+(in|for|today|tomorrow)\b",
    r"\bwho\s+(won|is the president|is the ceo)\b",
    r"\btranslate\s+(this|the following)\b",
]
_OFF_TOPIC_RE = [re.compile(p, re.IGNORECASE) for p in _OFF_TOPIC_PATTERNS]

# If any of these appear the message is almost certainly in-domain, so the
# off-topic patterns are skipped (e.g. "protein in a bitcoin-shaped cake").
_ON_TOPIC_TERMS = {
    "calorie", "calories", "kcal", "protein", "carb", "carbs", "carbohydrate", "fat", "fats",
    "fiber", "fibre", "macro", "macros", "micronutrient", "vitamin", "mineral", "nutrition",
    "nutrient", "diet", "dietary", "meal", "meals", "breakfast", "lunch", "dinner", "snack",
    "food", "foods", "eat", "eating", "ate", "recipe", "cook", "cooking", "ingredient",
    "weight", "bmi", "tdee", "bmr", "bulk", "bulking", "cut", "cutting", "deficit", "surplus",
    "muscle", "workout", "exercise", "training", "gym", "cardio", "rep", "reps", "set", "sets",
    "hydration", "water", "supplement", "creatine", "whey", "vegan", "vegetarian", "keto",
    "paleo", "fasting", "hungry", "hunger", "craving", "portion", "serving", "gram", "grams",
    "fitness", "healthy", "health", "body", "fatloss", "physique", "metabolism", "digest",
}
_WORD_RE = re.compile(r"[a-z]+")


def is_on_topic(text: str) -> bool:
    """False only when the message clearly belongs to another domain."""
    lowered = text.lower()
    words = set(_WORD_RE.findall(lowered))
    if words & _ON_TOPIC_TERMS:
        return True
    return not any(rx.search(lowered) for rx in _OFF_TOPIC_RE)


OFF_TOPIC_REPLY = (
    "I'm Astra, your nutrition and fitness coach — that's outside what I can help with.\n\n"
    "Ask me about meals, macros, recipes, or hitting your calorie and protein targets."
)

INJECTION_REPLY = (
    "I can only help with nutrition and fitness questions.\n\n"
    "Ask me about your meals, macros, or training nutrition and I'm happy to help."
)


# ─── Input validation ────────────────────────────────────────────

def validate_chat_message(message: Optional[str]) -> GuardrailVerdict:
    if message is None or not message.strip():
        return GuardrailVerdict(False, "empty", "Please type a message first.")

    text = message.strip()
    if len(text) > MAX_MESSAGE_CHARS:
        return GuardrailVerdict(
            False,
            "too_long",
            f"That message is too long ({len(text):,} characters). "
            f"Please keep it under {MAX_MESSAGE_CHARS:,}.",
        )

    if detect_prompt_injection(text):
        return GuardrailVerdict(False, "injection", INJECTION_REPLY)

    if not is_on_topic(text):
        return GuardrailVerdict(False, "off_topic", OFF_TOPIC_REPLY)

    return GuardrailVerdict(True)


def validate_image(image_base64: Optional[str], mime_type: str) -> GuardrailVerdict:
    if not image_base64:
        return GuardrailVerdict(False, "empty", "No image was received. Please try again.")

    if len(image_base64) > MAX_IMAGE_BASE64_CHARS:
        return GuardrailVerdict(
            False,
            "too_large",
            "That image is too large. Please use a photo under about 6 MB.",
        )

    if mime_type.lower() not in ALLOWED_IMAGE_MIME:
        return GuardrailVerdict(
            False,
            "bad_mime",
            "Unsupported image format. Please use JPEG, PNG, WEBP or HEIC.",
        )

    return GuardrailVerdict(True)


# ─── Output validation ───────────────────────────────────────────

_LEAK_PATTERNS = [
    # Only anchored at the start: a reply that opens by reciting the persona or
    # instructions is prompt leakage, whereas a mid-answer mention is harmless.
    re.compile(r"\A\s*You are Astra[\s\S]{0,400}", re.IGNORECASE),
    re.compile(r"\A\s*(system prompt|my instructions are|here (are|is) my instructions)\s*:[\s\S]{0,400}", re.IGNORECASE),
    re.compile(r"\A\s*##\s*SCOPE[\s\S]{0,400}", re.IGNORECASE),
]
# Never echo anything shaped like a credential back to the user.
_SECRET_RE = re.compile(
    r"\b(nvapi-[A-Za-z0-9_\-]{20,}|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_\-]{30,}|gsk_[A-Za-z0-9]{20,})\b"
)

FALLBACK_REPLY = (
    "I couldn't generate a reliable answer just then. Please rephrase your question "
    "or try again in a moment."
)


def sanitize_output(text: str) -> str:
    """Strip prompt leakage and anything resembling an API key."""
    if not text:
        return FALLBACK_REPLY

    cleaned = text
    for rx in _LEAK_PATTERNS:
        cleaned = rx.sub("", cleaned)
    cleaned = _SECRET_RE.sub("[redacted]", cleaned)
    cleaned = cleaned.strip()

    # Surface provider failures as a friendly message rather than raw plumbing.
    if not cleaned or cleaned.startswith("All LLM providers failed") or cleaned.startswith("Error:"):
        return FALLBACK_REPLY

    return cleaned


# ─── Rate limiting ───────────────────────────────────────────────
# In-memory sliding window. The service runs single-worker on Render, so this is
# sufficient; move to Redis if the deployment is ever scaled horizontally.

_RATE_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)


def check_rate_limit(user_id: str, limit: int, window_seconds: int) -> GuardrailVerdict:
    now = time.time()
    bucket = _RATE_BUCKETS[user_id]

    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()

    if len(bucket) >= limit:
        retry_in = int(window_seconds - (now - bucket[0])) + 1
        return GuardrailVerdict(
            False,
            "rate_limited",
            f"You're sending requests a bit fast. Please wait {retry_in}s and try again.",
        )

    bucket.append(now)
    return GuardrailVerdict(True)
