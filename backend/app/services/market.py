"""
Marketplace: paid event/challenge tickets, paid clans, coach plans and brand sponsorships.

Money flow: the buyer pays a Razorpay Payment Link (a hosted page, so it works on the web and
in the APK). Once Razorpay reports the link paid (webhook, or the app polling /refresh) we grant
access and transfer the seller's share to their Razorpay Route linked account. Prices and payout
accounts are always read from Firestore here; the client only names the item it wants.

Firestore (written with the Admin SDK; the rules keep clients out):
  market_orders/{orderId}   one checkout attempt and its outcome
  payout_accounts/{uid}     seller application; an admin sets status=active + razorpayAccountId
  sponsorships/{id}         brand request; an admin quotes a fee, the payment applies the sponsor
"""
from __future__ import annotations

import logging
import re
import secrets
import string
import time
from typing import Optional

from app.core.config import settings
from app.core.firebase import get_firestore_client
from app.services.subscription import PAYMENT_ID_RE, _rzp, _to_epoch, verified_email

logger = logging.getLogger(__name__)

# kind -> (collection, fee bucket, price field)
KINDS: dict[str, tuple[str, str, str]] = {
    "event": ("simple_events", "ticket", "ticketPrice"),
    "challenge": ("challenges_v2", "ticket", "ticketPrice"),
    "clan": ("clans_v2", "coach", "joinPrice"),
    "plan": ("market_listings", "coach", "price"),
}

ORDER_ID_RE = re.compile(r"^mo_[A-Za-z0-9]{16}$")
LINK_ID_RE = re.compile(r"^plink_[A-Za-z0-9]{6,40}$")
ACCOUNT_ID_RE = re.compile(r"^acc_[A-Za-z0-9]{6,40}$")
DOC_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

LINK_TTL_SEC = 30 * 60
REUSE_SEC = 25 * 60
SPONSOR_LINK_TTL_SEC = 7 * 24 * 3600
TRANSFER_RETRY_SEC = 15 * 60
HOLD_AFTER_END_SEC = 2 * 24 * 3600


class MarketError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def is_admin(user: dict) -> bool:
    email = verified_email(user)
    return bool(email) and email.strip().lower() in {e.lower() for e in settings.csv(settings.ADMIN_EMAILS)}


def fee_pct(bucket: str) -> float:
    return settings.MARKET_FEE_PCT_TICKET if bucket == "ticket" else settings.MARKET_FEE_PCT_COACH


def split_amount(price_inr: int, pct: float) -> tuple[int, int, int]:
    """(total, platform fee, seller share) in paise."""
    total = int(price_inr) * 100
    fee = min(total, max(0, round(total * pct / 100)))
    return total, fee, total - fee


def valid_price(value) -> Optional[int]:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
        return None
    value = int(value)
    return value if settings.MARKET_MIN_PRICE_INR <= value <= settings.MARKET_MAX_PRICE_INR else None


def new_order_id() -> str:
    alphabet = string.ascii_letters + string.digits
    return "mo_" + "".join(secrets.choice(alphabet) for _ in range(16))


def public_config() -> dict:
    return {
        "enabled": settings.market_enabled,
        "fees": {"ticket": settings.MARKET_FEE_PCT_TICKET, "coach": settings.MARKET_FEE_PCT_COACH},
        "minPrice": settings.MARKET_MIN_PRICE_INR,
        "maxPrice": settings.MARKET_MAX_PRICE_INR,
    }


def _db():
    db = get_firestore_client()
    if not db:
        raise MarketError(503, "Payments are not available right now.")
    return db


def payout_account(db, uid: str) -> Optional[str]:
    if not uid or not DOC_ID_RE.match(uid):
        return None
    snap = db.collection("payout_accounts").document(uid).get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    acc = str(data.get("razorpayAccountId") or "")
    return acc if data.get("status") == "active" and ACCOUNT_ID_RE.match(acc) else None


def _doc(db, collection: str, doc_id: str) -> dict:
    snap = db.collection(collection).document(doc_id).get()
    if not snap.exists:
        raise MarketError(404, "This item no longer exists.")
    return snap.to_dict() or {}


def _membership(db, clan_id: str, uid: str) -> dict:
    snap = db.collection("clan_memberships").document(f"{clan_id}_{uid}").get()
    return (snap.to_dict() or {}) if snap.exists else {}


def _already_bought(db, uid: str, item_key: str) -> bool:
    q = (db.collection("market_orders").where("buyerId", "==", uid)
         .where("itemKey", "==", item_key).where("status", "==", "fulfilled").limit(1))
    return any(True for _ in q.stream())


def describe_item(db, kind: str, item_id: str, uid: str) -> dict:
    """Validates that `uid` may buy the item right now and returns its server-side terms."""
    if kind not in KINDS or not DOC_ID_RE.match(item_id or ""):
        raise MarketError(400, "Unknown item.")
    collection, bucket, price_field = KINDS[kind]
    data = _doc(db, collection, item_id)
    price = valid_price(data.get(price_field))
    if not price:
        raise MarketError(400, "This item isn't for sale.")
    now = time.time()
    hold_until = None

    if kind in ("event", "challenge"):
        seller = str(data.get("createdBy") or "")
        title = str(data.get("title") or "Ticket")
        end = _to_epoch(data.get("endTime" if kind == "event" else "endDate"))
        if data.get("status") in ("completed", "cancelled") or (end and end < now):
            raise MarketError(409, "This has already ended.")
        part_coll = "simple_event_participants" if kind == "event" else "challenge_participants"
        if db.collection(part_coll).document(f"{item_id}_{uid}").get().exists:
            raise MarketError(409, "You already have a spot.")
        cap = data.get("maxParticipants")
        if isinstance(cap, int) and cap > 0 and int(data.get("participantCount") or 0) >= cap:
            raise MarketError(409, "Sold out.")
        clan_id = str(data.get("clanId") or "")
        if data.get("visibility") == "clan_only" and clan_id and _membership(db, clan_id, uid).get("status") != "active":
            raise MarketError(403, "Join the clan first to get a ticket.")
        if end and end > now:
            hold_until = int(end + HOLD_AFTER_END_SEC)
    elif kind == "clan":
        seller = str(data.get("leaderId") or "")
        title = f"{data.get('name') or 'Clan'} membership"
        if data.get("status", "active") != "active" or data.get("visibility") == "closed":
            raise MarketError(409, "This clan isn't accepting members.")
        member = _membership(db, item_id, uid)
        if member.get("status") == "active":
            raise MarketError(409, "You're already a member.")
        if member.get("status") == "removed":
            raise MarketError(403, "The clan leader removed you from this clan.")
    else:
        seller = str(data.get("sellerId") or "")
        title = str(data.get("title") or "Training plan")
        if not data.get("active"):
            raise MarketError(409, "This plan is no longer for sale.")
        plan = db.collection("plans").document(str(data.get("planId") or "_")).get()
        if not plan.exists or (plan.to_dict() or {}).get("ownerId") != seller:
            raise MarketError(409, "This plan is no longer for sale.")
        if _already_bought(db, uid, f"plan:{item_id}"):
            raise MarketError(409, "You already own this plan.")

    if not seller:
        raise MarketError(409, "This item isn't for sale.")
    if seller == uid:
        raise MarketError(400, "You can't buy your own item.")
    return {"kind": kind, "itemId": item_id, "title": title[:120], "price": price,
            "sellerId": seller, "feePct": fee_pct(bucket), "holdUntil": hold_until}


def _buyer_profile(db, uid: str) -> tuple[str, str]:
    snap = db.collection("users").document(uid).get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    return str(data.get("displayName") or "Athlete")[:60], str(data.get("photoURL") or "")[:500]


def _public_order(order_id: str, order: dict) -> dict:
    return {
        "orderId": order_id,
        "status": order.get("status"),
        "kind": order.get("kind"),
        "itemId": order.get("itemId"),
        "title": order.get("title"),
        "amount": order.get("amount"),
        "shortUrl": order.get("shortUrl") if order.get("status") == "created" else None,
        "result": order.get("result") or {},
    }


def _create_link(order_id: str, amount: int, title: str, notes: dict, ttl: int,
                 customer: Optional[dict], return_to: str, notify_email: bool = False) -> dict:
    body = {
        "amount": amount,
        "currency": "INR",
        "description": title[:200],
        "reference_id": order_id,
        "expire_by": int(time.time() + ttl),
        "notify": {"sms": False, "email": notify_email},
        "reminder_enable": False,
        "notes": {k: str(v)[:250] for k, v in notes.items()},
    }
    if customer:
        body["customer"] = customer
    if return_to == "web" and settings.PUBLIC_APP_URL.startswith("https://"):
        body["callback_url"] = f"{settings.PUBLIC_APP_URL.rstrip('/')}/purchase/{order_id}"
        body["callback_method"] = "get"
    return _rzp("POST", "/payment_links", json=body)


def create_checkout(user: dict, kind: str, item_id: str, return_to: str = "app") -> dict:
    if not settings.market_enabled:
        raise MarketError(503, "Payments are not available yet.")
    db = _db()
    uid = user["uid"]
    info = describe_item(db, kind, item_id, uid)
    if not payout_account(db, info["sellerId"]):
        raise MarketError(409, "The host hasn't finished payout setup yet. Try again later.")
    total, fee, share = split_amount(info["price"], info["feePct"])
    item_key = f"{kind}:{item_id}"

    # Hand back the unpaid link from a moment ago instead of opening a second one.
    pending = (db.collection("market_orders").where("buyerId", "==", uid)
               .where("itemKey", "==", item_key).where("status", "==", "created").limit(5))
    for snap in pending.stream():
        o = snap.to_dict() or {}
        if o.get("amount") == total and o.get("shortUrl") and time.time() - float(o.get("createdAtSec") or 0) < REUSE_SEC:
            return _public_order(snap.id, o)

    name, photo = _buyer_profile(db, uid)
    email = verified_email(user)
    order_id = new_order_id()
    link = _create_link(
        order_id, total, info["title"],
        {"orderId": order_id, "uid": uid, "kind": kind, "itemId": item_id},
        LINK_TTL_SEC, {"name": name, "email": email} if email else None, return_to,
    )
    order = {
        "kind": kind, "itemId": item_id, "itemKey": item_key, "title": info["title"],
        "buyerId": uid, "buyerName": name, "buyerPhoto": photo,
        "sellerId": info["sellerId"], "amount": total, "fee": fee, "sellerAmount": share,
        "feePct": info["feePct"], "holdUntil": info["holdUntil"],
        "linkId": link.get("id"), "shortUrl": link.get("short_url"),
        "status": "created", "createdAtSec": time.time(), "createdAt": _server_ts(),
    }
    db.collection("market_orders").document(order_id).set(order)
    return _public_order(order_id, order)


def _server_ts():
    from google.cloud import firestore as gcf
    return gcf.SERVER_TIMESTAMP


def _increment(n: int):
    from google.cloud import firestore as gcf
    return gcf.Increment(n)


def fetch_link(link_id: str) -> dict:
    if not LINK_ID_RE.match(link_id or ""):
        raise ValueError("Invalid payment link id")
    return _rzp("GET", f"/payment_links/{link_id}")


def paid_payment_id(link: dict, expected_amount: int) -> Optional[str]:
    if link.get("status") != "paid" or int(link.get("amount_paid") or 0) < expected_amount:
        return None
    for p in link.get("payments") or []:
        pid = str(p.get("payment_id") or "")
        if p.get("status") == "captured" and PAYMENT_ID_RE.match(pid):
            return pid
    return None


def refresh_order(order_id: str, uid: Optional[str] = None, admin: bool = False) -> dict:
    """Checks Razorpay for the order's link and fulfils it once paid. `uid=None` = trusted caller."""
    if not ORDER_ID_RE.match(order_id or ""):
        raise MarketError(404, "Order not found.")
    db = _db()
    ref = db.collection("market_orders").document(order_id)
    snap = ref.get()
    order = (snap.to_dict() or {}) if snap.exists else None
    if not order or (uid is not None and not admin and order.get("buyerId") != uid):
        raise MarketError(404, "Order not found.")
    if order.get("status") != "created":
        return _public_order(order_id, order)
    try:
        link = fetch_link(str(order.get("linkId") or ""))
    except Exception:
        raise MarketError(502, "Couldn't reach the payment provider. Try again in a moment.")
    payment_id = paid_payment_id(link, int(order.get("amount") or 0))
    if payment_id:
        order = fulfil_order(db, order_id, payment_id)
        if order.get("status") == "fulfilled" and order.get("sellerAmount"):
            transfer_seller_share(db, order_id)
    elif link.get("status") in ("expired", "cancelled"):
        ref.update({"status": link["status"]})
        order["status"] = link["status"]
    return _public_order(order_id, order)


# ─── Fulfilment ──────────────────────────────────────────────────

def _copy_plan(db, order_id: str, listing: dict) -> Optional[tuple[str, dict]]:
    """Copies the seller's plan days for the buyer (idempotent ids). Returns (new id, plan data)."""
    plan_id = str(listing.get("planId") or "")
    if not DOC_ID_RE.match(plan_id):
        return None
    src = db.collection("plans").document(plan_id)
    snap = src.get()
    if not snap.exists:
        return None
    new_id = f"bought_{order_id}"
    dest = db.collection("plans").document(new_id)
    for day in src.collection("days").stream():
        dest.collection("days").document(day.id).set(day.to_dict() or {})
    return new_id, snap.to_dict() or {}


def fulfil_order(db, order_id: str, payment_id: str) -> dict:
    """Grants what was bought exactly once, even if the webhook and the app race."""
    from google.cloud import firestore as gcf

    ref = db.collection("market_orders").document(order_id)
    first = ref.get().to_dict() or {}
    kind, item_id, buyer = first.get("kind"), str(first.get("itemId") or ""), str(first.get("buyerId") or "")
    copied = None
    if kind == "plan" and first.get("status") == "created":
        listing = db.collection("market_listings").document(item_id).get()
        copied = _copy_plan(db, order_id, listing.to_dict() or {}) if listing.exists else None

    @gcf.transactional
    def txn(t):
        order = ref.get(transaction=t).to_dict() or {}
        if order.get("status") != "created":
            return order
        done = {"status": "fulfilled", "paymentId": payment_id, "fulfilledAt": gcf.SERVER_TIMESTAMP, "shortUrl": None}

        if kind in ("event", "challenge"):
            coll, part_coll = ("simple_events", "simple_event_participants") if kind == "event" else ("challenges_v2", "challenge_participants")
            item_ref = db.collection(coll).document(item_id)
            part_ref = db.collection(part_coll).document(f"{item_id}_{buyer}")
            item, part = item_ref.get(transaction=t), part_ref.get(transaction=t)
            if not item.exists:
                done.update(status="refund_due", result={"reason": "item_deleted"})
            else:
                bump = {"ticketsSold": gcf.Increment(1)}
                if not part.exists:
                    base = {kind + "Id": item_id, "userId": buyer, "userName": order.get("buyerName", ""),
                            "userPhoto": order.get("buyerPhoto", ""), "rank": 0, "isRanked": False,
                            "joinedAt": gcf.SERVER_TIMESTAMP, "paid": True, "orderId": order_id}
                    if kind == "challenge":
                        base.update(progress=0, updatedAt=gcf.SERVER_TIMESTAMP)
                    t.set(part_ref, base)
                    bump["participantCount"] = gcf.Increment(1)
                t.update(item_ref, bump)
        elif kind == "clan":
            clan_ref = db.collection("clans_v2").document(item_id)
            mem_ref = db.collection("clan_memberships").document(f"{item_id}_{buyer}")
            clan, mem = clan_ref.get(transaction=t), mem_ref.get(transaction=t)
            if not clan.exists:
                done.update(status="refund_due", result={"reason": "item_deleted"})
            elif (mem.to_dict() or {}).get("status") != "active":
                t.set(mem_ref, {"clanId": item_id, "userId": buyer, "userName": order.get("buyerName", ""),
                                "userPhoto": order.get("buyerPhoto", ""), "role": "member", "status": "active",
                                "joinedAt": gcf.SERVER_TIMESTAMP, "paid": True, "orderId": order_id})
                t.update(clan_ref, {"memberCount": gcf.Increment(1), "paidMembers": gcf.Increment(1)})
        elif kind == "plan":
            listing_ref = db.collection("market_listings").document(item_id)
            listing = listing_ref.get(transaction=t)
            if not copied or not listing.exists:
                done.update(status="refund_due", result={"reason": "item_deleted"})
            else:
                new_id, plan = copied
                plan = {k: v for k, v in plan.items() if k not in ("id", "days")}
                t.set(db.collection("plans").document(new_id), {
                    **plan, "ownerId": buyer, "ownerName": order.get("buyerName", ""), "type": "custom",
                    "isPublic": False, "isArchived": False, "usageCount": 0, "clonedFrom": None,
                    "purchasedFrom": item_id, "sellerId": order.get("sellerId", ""),
                    "createdAt": gcf.SERVER_TIMESTAMP, "updatedAt": gcf.SERVER_TIMESTAMP,
                })
                t.update(listing_ref, {"salesCount": gcf.Increment(1)})
                done["result"] = {"planId": new_id}
        elif kind == "sponsorship":
            sp_ref = db.collection("sponsorships").document(item_id)
            sp = sp_ref.get(transaction=t)
            data = sp.to_dict() or {}
            target_ref = _sponsor_target(db, data)
            target = target_ref.get(transaction=t) if target_ref else None
            update = {"status": "paid", "paidAt": gcf.SERVER_TIMESTAMP, "payUrl": None}
            if target is not None and target.exists:
                t.update(target_ref, {"sponsor": sponsor_badge(item_id, data)})
                update["status"] = "live"
            if sp.exists:
                t.update(sp_ref, update)
        else:
            done.update(status="refund_due", result={"reason": "unknown_kind"})

        t.update(ref, done)
        return {**order, **done}

    return txn(db.transaction())


def transfer_seller_share(db, order_id: str, force: bool = False) -> dict:
    """Sends the seller's share to their Route linked account (at most once per order)."""
    from google.cloud import firestore as gcf

    ref = db.collection("market_orders").document(order_id)

    @gcf.transactional
    def claim(t):
        order = ref.get(transaction=t).to_dict() or {}
        tr = order.get("transfer") or {}
        if order.get("status") != "fulfilled" or int(order.get("sellerAmount") or 0) <= 0:
            return None
        stale = tr.get("status") == "pending" and time.time() - float(tr.get("at") or 0) > TRANSFER_RETRY_SEC
        if tr and not (tr.get("status") == "failed" and force) and not (stale and force):
            return None
        t.update(ref, {"transfer": {"status": "pending", "at": time.time()}})
        return order

    order = claim(db.transaction())
    if not order:
        return (ref.get().to_dict() or {}).get("transfer") or {}
    result: dict
    account = payout_account(db, str(order.get("sellerId") or ""))
    payment_id = str(order.get("paymentId") or "")
    if not account:
        result = {"status": "failed", "error": "Seller has no active payout account", "at": time.time()}
    elif not PAYMENT_ID_RE.match(payment_id):
        result = {"status": "failed", "error": "Missing payment id", "at": time.time()}
    else:
        transfer = {"account": account, "amount": int(order["sellerAmount"]), "currency": "INR",
                    "notes": {"orderId": order_id, "kind": str(order.get("kind"))}}
        hold = order.get("holdUntil")
        if isinstance(hold, (int, float)) and hold > time.time() + 3600:
            transfer.update(on_hold=True, on_hold_until=int(hold))
        try:
            resp = _rzp("POST", f"/payments/{payment_id}/transfers", json={"transfers": [transfer]})
            items = resp.get("items") or [resp]
            result = {"status": "created", "id": str(items[0].get("id") or ""), "account": account, "at": time.time()}
        except Exception as exc:
            logger.warning("Transfer for %s failed: %s", order_id, exc)
            result = {"status": "failed", "error": "Payment provider rejected the transfer", "at": time.time()}
    ref.update({"transfer": result})
    return result


# ─── Sponsorships ────────────────────────────────────────────────

def _sponsor_target(db, data: dict):
    target_type, target_id = data.get("targetType"), str(data.get("targetId") or "")
    if target_type not in ("challenge", "event") or not DOC_ID_RE.match(target_id):
        return None
    return db.collection("challenges_v2" if target_type == "challenge" else "simple_events").document(target_id)


def sponsor_badge(sponsorship_id: str, data: dict) -> dict:
    return {
        "sponsorshipId": sponsorship_id,
        "name": str(data.get("brandName") or "")[:80],
        "logoUrl": str(data.get("logoUrl") or "")[:200_000],
        "website": str(data.get("website") or "")[:200],
        "prize": str(data.get("prize") or "")[:300],
    }


def quote_sponsorship(sponsorship_id: str, amount_inr: int) -> dict:
    if not settings.market_enabled:
        raise MarketError(503, "Payments are not available yet.")
    if not DOC_ID_RE.match(sponsorship_id or ""):
        raise MarketError(404, "Sponsorship not found.")
    if not isinstance(amount_inr, int) or not 100 <= amount_inr <= 1_000_000:
        raise MarketError(400, "Fee must be between ₹100 and ₹10,00,000.")
    db = _db()
    sp_ref = db.collection("sponsorships").document(sponsorship_id)
    snap = sp_ref.get()
    if not snap.exists:
        raise MarketError(404, "Sponsorship not found.")
    data = snap.to_dict() or {}
    if data.get("status") not in ("pending", "quoted"):
        raise MarketError(409, "This request is already paid or closed.")

    order_id = new_order_id()
    title = f"Sponsorship: {str(data.get('brandName') or 'Brand')[:60]}"
    email = str(data.get("contactEmail") or "").strip()
    customer = {"name": str(data.get("brandName") or "Sponsor")[:60]}
    if re.match(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$", email):
        customer["email"] = email
    link = _create_link(order_id, amount_inr * 100, title,
                        {"orderId": order_id, "kind": "sponsorship", "itemId": sponsorship_id},
                        SPONSOR_LINK_TTL_SEC, customer, "web", notify_email="email" in customer)
    db.collection("market_orders").document(order_id).set({
        "kind": "sponsorship", "itemId": sponsorship_id, "itemKey": f"sponsorship:{sponsorship_id}",
        "title": title, "buyerId": str(data.get("requesterId") or ""), "buyerName": customer["name"],
        "sellerId": "", "amount": amount_inr * 100, "fee": amount_inr * 100, "sellerAmount": 0, "feePct": 100,
        "linkId": link.get("id"), "shortUrl": link.get("short_url"),
        "status": "created", "createdAtSec": time.time(), "createdAt": _server_ts(),
    })
    sp_ref.update({"status": "quoted", "amountInr": amount_inr, "orderId": order_id,
                   "payUrl": link.get("short_url"), "quotedAt": _server_ts()})
    return {"orderId": order_id, "payUrl": link.get("short_url")}


def handle_webhook(event: dict) -> None:
    """payment_link.paid → re-check the link with Razorpay and fulfil the order."""
    if str(event.get("event", "")) != "payment_link.paid":
        return
    entity = (((event.get("payload") or {}).get("payment_link") or {}).get("entity")) or {}
    order_id = str(entity.get("reference_id") or "")
    if ORDER_ID_RE.match(order_id):
        try:
            refresh_order(order_id)
        except MarketError as exc:
            logger.warning("Webhook for %s: %s", order_id, exc.message)
