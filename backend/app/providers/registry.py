"""
Model availability registry shared by all providers.

Free-tier model catalogues change constantly (models are renamed, decommissioned
or rate limited). Instead of hard-coding one model per provider we keep an ordered
candidate list, check it against the provider's live /models list, and remember
models that answered 404/410 so they are skipped until the cache expires.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Dict, Iterable, List, Optional, Set, Tuple

import httpx

logger = logging.getLogger(__name__)

DISCOVERY_TTL = 6 * 3600
DEAD_MODEL_TTL = 6 * 3600

_available: Dict[str, Tuple[float, Set[str], Dict[str, dict]]] = {}
_dead: Dict[str, float] = {}

# Used only when none of the configured candidates exist on the provider.
_CHAT_PATTERNS = [
    r"gpt-oss-120b", r"deepseek-v\d", r"nemotron-3-super", r"llama-3\.3-70b", r"qwen3[.\d]*-(235b|80b|32b|27b)",
    r"mistral-large", r"llama-4-maverick", r"gemma-4", r"kimi-k\d", r"gpt-oss-20b", r"nemotron.*(super|ultra)",
    r"llama-4-scout", r"gemma-3-27b", r"llama-3\.1-8b",
]
_VISION_PATTERNS = [
    r"gemma-4", r"llama-4-maverick", r"llama-4-scout", r"nemotron.*omni", r"qwen.*vl", r"gemma-3-(27b|12b)",
    r"llama-3\.2-90b-vision", r"vision",
]
_NOT_CHAT = re.compile(r"embed|rerank|whisper|tts|guard|safety|reward|parse|ocr|clip|speech|audio|image-gen|flux|sdxl", re.I)


def _key(provider: str, model: str) -> str:
    return f"{provider}:{model}"


def mark_dead(provider: str, model: str, reason: str = "") -> None:
    _dead[_key(provider, model)] = time.time()
    logger.warning("Model %s/%s disabled for %dh: %s", provider, model, DEAD_MODEL_TTL // 3600, reason[:160])


def is_dead(provider: str, model: str) -> bool:
    ts = _dead.get(_key(provider, model))
    if ts is None:
        return False
    if time.time() - ts > DEAD_MODEL_TTL:
        _dead.pop(_key(provider, model), None)
        return False
    return True


def is_model_gone_error(status: Optional[int], body: str) -> bool:
    """404/410 or an explicit 'model does not exist / decommissioned' message."""
    text = (body or "").lower()
    if status in (404, 410):
        return True
    return any(s in text for s in (
        "model_not_found", "does not exist", "decommissioned", "end of life", "no longer available",
        "not a valid model", "unknown model", "model not found", "no endpoints found",
    ))


async def discover(provider: str, base_url: str, headers: dict) -> Optional[Tuple[Set[str], Dict[str, dict]]]:
    """Live model ids for an OpenAI-compatible provider (cached). None when unknown."""
    cached = _available.get(provider)
    if cached and time.time() - cached[0] < DISCOVERY_TTL:
        return cached[1], cached[2]
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(f"{base_url}/models", headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
        meta = {m["id"]: m for m in data if isinstance(m, dict) and m.get("id")}
        ids = set(meta)
        if ids:
            _available[provider] = (time.time(), ids, meta)
            return ids, meta
    except Exception as exc:
        logger.info("Model discovery for %s failed: %s", provider, type(exc).__name__)
    return None


def _supports_images(meta: dict) -> Optional[bool]:
    modalities = (meta.get("architecture") or {}).get("input_modalities")
    if isinstance(modalities, list):
        return "image" in modalities
    return None


def choose_models(
    provider: str,
    candidates: Iterable[str],
    discovered: Optional[Tuple[Set[str], Dict[str, dict]]],
    kind: str = "chat",
    limit: int = 3,
) -> List[str]:
    """Configured candidates that are alive, else the best available match by pattern."""
    configured = [m for m in candidates if m and not is_dead(provider, m)]
    if discovered is None:
        return configured[:limit]
    ids, meta = discovered
    chosen = [m for m in configured if m in ids]
    if chosen:
        return chosen[:limit]

    free_only = provider == "openrouter"
    patterns = _VISION_PATTERNS if kind == "vision" else _CHAT_PATTERNS
    picks: List[str] = []
    for pattern in patterns:
        rx = re.compile(pattern, re.I)
        for model_id in sorted(ids):
            if model_id in picks or is_dead(provider, model_id) or _NOT_CHAT.search(model_id) or not rx.search(model_id):
                continue
            if free_only and not model_id.endswith(":free"):
                continue
            if kind == "vision" and _supports_images(meta.get(model_id, {})) is False:
                continue
            picks.append(model_id)
            break
        if len(picks) >= limit:
            break
    if picks:
        logger.warning("%s: no configured %s model is live; using %s", provider, kind, picks)
    return picks


# ─── JSON helpers ────────────────────────────────────────────────

_THINK_RE = re.compile(r"<think>.*?</think>", re.S | re.I)


def strip_reasoning(text: str) -> Tuple[str, Optional[str]]:
    """Removes <think> blocks some reasoning models emit; returns (content, reasoning)."""
    if not text:
        return "", None
    match = re.search(r"<think>(.*?)</think>", text, re.S | re.I)
    reasoning = match.group(1).strip() if match else None
    return _THINK_RE.sub("", text).strip(), reasoning


def extract_json(text: str):
    """First JSON object/array in a model reply (tolerates fences and chatter). Raises ValueError."""
    if text is None:
        raise ValueError("empty")
    cleaned, _ = strip_reasoning(text)
    cleaned = cleaned.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.S)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    starts = [i for i in (cleaned.find("{"), cleaned.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no JSON found")
    start = min(starts)
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(cleaned[start:])
    return obj
