"""
Pro prices shown in the app: admin_settings/pricing (written only here; the rules block clients).

  plans.<monthly|sixmonth|yearly> = { price, mrp, enabled }   price = what Play charges in India (₹),
                                                               mrp = struck-through regular price (>= price)
  label = optional sale banner, e.g. "Diwali sale"
"""
from __future__ import annotations

from app.core.firebase import get_firestore_client
from app.services import subscription as subs

DEFAULT_PRICES = {"monthly": 200, "sixmonth": 1200, "yearly": 2000}
MIN_INR, MAX_INR = 10, 100_000


class PricingError(Exception):
    pass


def _ref():
    db = get_firestore_client()
    return db.collection("admin_settings").document("pricing") if db else None


def defaults() -> dict:
    return {
        "plans": {p: {"price": DEFAULT_PRICES[p], "mrp": DEFAULT_PRICES[p], "enabled": True} for p in subs.PLANS},
        "label": "",
    }


def load() -> dict:
    ref = _ref()
    snap = ref.get() if ref else None
    data = (snap.to_dict() or {}) if snap and snap.exists else {}
    out = defaults()
    for plan, cfg in (data.get("plans") or {}).items():
        if plan in out["plans"] and isinstance(cfg, dict):
            out["plans"][plan].update({k: cfg[k] for k in ("price", "mrp", "enabled") if k in cfg})
    out["label"] = str(data.get("label") or "")[:60]
    return out


def validate(plans: dict, label: str) -> dict:
    clean = {}
    for plan in subs.PLANS:
        cfg = plans.get(plan)
        if not isinstance(cfg, dict):
            raise PricingError(f"Missing prices for {plan}.")
        price, mrp, enabled = int(cfg.get("price") or 0), int(cfg.get("mrp") or 0), bool(cfg.get("enabled"))
        if not MIN_INR <= price <= MAX_INR:
            raise PricingError(f"{plan}: price must be ₹{MIN_INR}–₹{MAX_INR:,}.")
        if not price <= mrp <= MAX_INR:
            raise PricingError(f"{plan}: the regular price can't be lower than the selling price.")
        clean[plan] = {"price": price, "mrp": mrp, "enabled": enabled}
    if not any(c["enabled"] for c in clean.values()):
        raise PricingError("Keep at least one plan on sale.")
    return {"plans": clean, "label": (label or "").strip()[:60]}


def save(config: dict, uid: str) -> None:
    from google.cloud import firestore as gcf
    ref = _ref()
    if not ref:
        raise PricingError("Firestore isn't available.")
    ref.set({**config, "updatedAt": gcf.SERVER_TIMESTAMP, "updatedBy": uid})


def enabled_prices(config: dict) -> dict[str, int]:
    return {p: c["price"] for p, c in config["plans"].items() if c["enabled"]}
