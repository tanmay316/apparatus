"""
Marketplace tests. Pure logic always runs; the Firestore part needs the emulator:
  npx firebase emulators:exec --only firestore --project demo-apparatus "backend/venv/Scripts/python backend/tests/test_market.py"
Razorpay is faked, so nothing leaves the machine.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.services import market  # noqa: E402

failed = 0


def check(name, ok):
    global failed
    if not ok:
        failed += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}")


def raises(fn, status=None):
    try:
        fn()
        return False
    except market.MarketError as exc:
        return status is None or exc.status == status


# ─── Pure logic ───
check("10% ticket split", market.split_amount(199, 10) == (19900, 1990, 17910))
check("20% coach split", market.split_amount(999, 20) == (99900, 19980, 79920))
check("price below min rejected", market.valid_price(settings.MARKET_MIN_PRICE_INR - 1) is None)
check("price above max rejected", market.valid_price(settings.MARKET_MAX_PRICE_INR + 1) is None)
check("fractional price rejected", market.valid_price(99.5) is None)
check("bool price rejected", market.valid_price(True) is None)
check("string price rejected", market.valid_price("199") is None)
check("valid price", market.valid_price(199) == 199 and market.valid_price(199.0) == 199)
check("order ids match their regex", all(market.ORDER_ID_RE.match(market.new_order_id()) for _ in range(50)))
check("order id regex rejects paths", not market.ORDER_ID_RE.match("mo_../../x") and not market.ORDER_ID_RE.match("mo_abc"))
paid = {"status": "paid", "amount_paid": 19900, "payments": [{"payment_id": "pay_ABC123456", "status": "captured"}]}
check("paid link gives payment id", market.paid_payment_id(paid, 19900) == "pay_ABC123456")
check("underpaid link is not paid", market.paid_payment_id({**paid, "amount_paid": 100}, 19900) is None)
check("unpaid link is not paid", market.paid_payment_id({**paid, "status": "created"}, 19900) is None)
check("malformed payment id ignored", market.paid_payment_id({**paid, "payments": [{"payment_id": "pay_/x", "status": "captured"}]}, 19900) is None)
check("admin needs verified email", not market.is_admin({"email": settings.csv(settings.ADMIN_EMAILS)[0], "email_verified": False}))
check("admin with verified email", market.is_admin({"email": settings.csv(settings.ADMIN_EMAILS)[0], "email_verified": True}))
check("webhook ignores other events", market.handle_webhook({"event": "payment.captured"}) is None)

if not os.environ.get("FIRESTORE_EMULATOR_HOST"):
    print("(skipping Firestore tests: FIRESTORE_EMULATOR_HOST not set)")
    sys.exit(1 if failed else 0)

# ─── Firestore (emulator) ───
from google.auth.credentials import AnonymousCredentials  # noqa: E402
from google.cloud import firestore  # noqa: E402

db = firestore.Client(project="demo-apparatus", credentials=AnonymousCredentials())
market.get_firestore_client = lambda: db
settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET = "rzp_test_x", "secret"

calls = []
links = {}


def fake_rzp(method, path, **kwargs):
    calls.append((method, path, kwargs.get("json")))
    if method == "POST" and path == "/payment_links":
        link_id = f"plink_T{len(links):08d}"
        links[link_id] = {"id": link_id, "amount": kwargs["json"]["amount"], "status": "created", "amount_paid": 0, "payments": None,
                          "short_url": f"https://rzp.io/i/{link_id}"}
        return links[link_id]
    if method == "GET" and path.startswith("/payment_links/"):
        return links[path.rsplit("/", 1)[1]]
    if method == "POST" and path.endswith("/transfers"):
        return {"entity": "collection", "count": 1, "items": [{"id": f"trf_{len(calls)}"}]}
    raise AssertionError(f"unexpected call {method} {path}")


market._rzp = fake_rzp


def pay(order_id):
    link_id = db.collection("market_orders").document(order_id).get().to_dict()["linkId"]
    links[link_id].update(status="paid", amount_paid=links[link_id]["amount"],
                          payments=[{"payment_id": f"pay_{link_id[6:]}", "status": "captured"}])


def get(coll, doc_id):
    return db.collection(coll).document(doc_id).get().to_dict() or {}


for coll in ("market_orders", "simple_events", "simple_event_participants", "clans_v2", "clan_memberships", "plans",
             "market_listings", "payout_accounts", "users", "sponsorships", "challenges_v2"):
    for d in db.collection(coll).stream():
        d.reference.delete()

future = time.time() + 7 * 86400
db.collection("users").document("buyer").set({"displayName": "Buyer B", "photoURL": ""})
db.collection("payout_accounts").document("seller").set({"status": "active", "razorpayAccountId": "acc_TEST12345678"})
db.collection("payout_accounts").document("nopay").set({"status": "pending", "razorpayAccountId": ""})
db.collection("simple_events").document("ev1").set({"title": "City 10K", "createdBy": "seller", "ticketPrice": 199, "status": "upcoming",
                                                      "endTime": future, "participantCount": 1, "visibility": "public"})
db.collection("simple_events").document("free").set({"title": "Free run", "createdBy": "seller", "status": "upcoming", "endTime": future})
db.collection("simple_events").document("nopay_ev").set({"title": "X", "createdBy": "nopay", "ticketPrice": 99, "status": "upcoming", "endTime": future})
db.collection("simple_events").document("full").set({"title": "Full", "createdBy": "seller", "ticketPrice": 99, "status": "upcoming",
                                                       "endTime": future, "participantCount": 5, "maxParticipants": 5})
db.collection("clans_v2").document("c1").set({"name": "Iron Club", "leaderId": "seller", "joinPrice": 499, "status": "active",
                                                "visibility": "public", "memberCount": 1})
db.collection("clan_memberships").document("c1_kicked").set({"clanId": "c1", "userId": "kicked", "status": "removed"})
db.collection("plans").document("p1").set({"ownerId": "seller", "title": "Planche in 12 weeks", "isPublic": False, "daysPerWeek": 2})
db.collection("plans").document("p1").collection("days").document("d1").set({"title": "Push", "order": 1})
db.collection("plans").document("p1").collection("days").document("d2").set({"title": "Pull", "order": 2})
db.collection("market_listings").document("l1").set({"sellerId": "seller", "planId": "p1", "price": 999, "active": True, "title": "Planche", "salesCount": 0})
db.collection("challenges_v2").document("ch1").set({"title": "Push-up month", "createdBy": "seller", "status": "active"})

buyer = {"uid": "buyer", "email": "buyer@example.com", "email_verified": True}

# Event ticket
o1 = market.create_checkout(buyer, "event", "ev1", "web")
check("checkout creates an unpaid order", o1["status"] == "created" and o1["shortUrl"].startswith("https://rzp.io/"))
link_body = calls[-1][2]
check("link amount comes from Firestore", link_body["amount"] == 19900)
check("web checkout returns to /purchase", link_body["callback_url"].endswith(f"/purchase/{o1['orderId']}"))
again = market.create_checkout(buyer, "event", "ev1", "app")
check("second checkout reuses the unpaid link", again["orderId"] == o1["orderId"] and len(links) == 1)
check("unpaid refresh stays created", market.refresh_order(o1["orderId"], "buyer")["status"] == "created")
check("someone else can't read the order", raises(lambda: market.refresh_order(o1["orderId"], "mallory"), 404))
pay(o1["orderId"])
r1 = market.refresh_order(o1["orderId"], "buyer")
check("paid order is fulfilled", r1["status"] == "fulfilled")
part = get("simple_event_participants", "ev1_buyer")
check("buyer got a spot", part.get("userId") == "buyer" and part.get("paid") is True and part.get("eventId") == "ev1")
ev = get("simple_events", "ev1")
check("counters bumped", ev.get("participantCount") == 2 and ev.get("ticketsSold") == 1)
order = get("market_orders", o1["orderId"])
transfers = [c for c in calls if c[1].endswith("/transfers")]
check("seller share transferred once", len(transfers) == 1 and order["transfer"]["status"] == "created")
tr = transfers[0][2]["transfers"][0]
check("transfer amount = price minus fee", tr["amount"] == 17910 and tr["account"] == "acc_TEST12345678")
check("ticket money held until after the event", tr.get("on_hold") is True and tr["on_hold_until"] > future)
market.refresh_order(o1["orderId"], "buyer")
market.handle_webhook({"event": "payment_link.paid", "payload": {"payment_link": {"entity": {"reference_id": o1["orderId"]}}}})
check("replays don't double count", get("simple_events", "ev1")["participantCount"] == 2)
check("replays don't double pay", len([c for c in calls if c[1].endswith("/transfers")]) == 1)
check("can't buy a second ticket", raises(lambda: market.create_checkout(buyer, "event", "ev1"), 409))

# Guards
seller = {"uid": "seller", "email": "s@example.com", "email_verified": True}
check("free event isn't for sale", raises(lambda: market.create_checkout(buyer, "event", "free"), 400))
check("host without payouts can't sell", raises(lambda: market.create_checkout(buyer, "event", "nopay_ev"), 409))
check("sold out", raises(lambda: market.create_checkout(buyer, "event", "full"), 409))
check("can't buy own item", raises(lambda: market.create_checkout(seller, "clan", "c1"), 400))
check("removed member can't buy back in", raises(lambda: market.create_checkout({"uid": "kicked"}, "clan", "c1"), 403))
check("unknown kind", raises(lambda: market.describe_item(db, "coupon", "x", "buyer"), 400))
check("bad item id", raises(lambda: market.describe_item(db, "event", "../x", "buyer"), 400))
check("missing item", raises(lambda: market.create_checkout(buyer, "event", "nope"), 404))

# Paid clan
o2 = market.create_checkout(buyer, "clan", "c1")
pay(o2["orderId"])
check("clan order fulfilled", market.refresh_order(o2["orderId"], "buyer")["status"] == "fulfilled")
check("buyer is an active member", get("clan_memberships", "c1_buyer").get("status") == "active")
check("member count bumped", get("clans_v2", "c1")["memberCount"] == 2)
check("clan payout has no hold", "on_hold" not in calls[-1][2]["transfers"][0] and calls[-1][2]["transfers"][0]["amount"] == 39920)

# Coach plan
o3 = market.create_checkout(buyer, "plan", "l1")
pay(o3["orderId"])
r3 = market.refresh_order(o3["orderId"], "buyer")
plan_id = (r3.get("result") or {}).get("planId", "")
copy = get("plans", plan_id)
check("plan copied to buyer", copy.get("ownerId") == "buyer" and copy.get("purchasedFrom") == "l1" and copy.get("isPublic") is False)
check("plan days copied", len(list(db.collection("plans").document(plan_id).collection("days").stream())) == 2)
check("sales counted", get("market_listings", "l1")["salesCount"] == 1)
check("can't buy the same plan twice", raises(lambda: market.create_checkout(buyer, "plan", "l1"), 409))

# Item deleted after payment → refund queue, no payout
db.collection("simple_events").document("gone").set({"title": "Gone", "createdBy": "seller", "ticketPrice": 99, "status": "upcoming", "endTime": future})
o4 = market.create_checkout(buyer, "event", "gone")
db.collection("simple_events").document("gone").delete()
pay(o4["orderId"])
before = len(calls)
check("deleted item → refund_due", market.refresh_order(o4["orderId"], "buyer")["status"] == "refund_due")
check("no payout for refunds", not any(c[1].endswith("/transfers") for c in calls[before:]))

# Sponsorship
db.collection("sponsorships").document("sp1").set({"requesterId": "buyer", "brandName": "MuscleFuel", "logoUrl": "https://x.test/l.png",
                                                     "website": "https://x.test", "prize": "Protein for a year", "contactEmail": "b@brand.test",
                                                     "status": "pending", "targetType": "challenge", "targetId": "ch1"})
check("quote needs a sane fee", raises(lambda: market.quote_sponsorship("sp1", 5), 400))
q = market.quote_sponsorship("sp1", 5000)
check("quote emails the brand a link", calls[-1][2]["notify"]["email"] is True and calls[-1][2]["amount"] == 500000)
check("sponsorship quoted", get("sponsorships", "sp1").get("status") == "quoted")
pay(q["orderId"])
market.refresh_order(q["orderId"])
check("paid sponsorship goes live", get("sponsorships", "sp1").get("status") == "live")
sponsor = get("challenges_v2", "ch1").get("sponsor") or {}
check("challenge shows the sponsor", sponsor.get("name") == "MuscleFuel" and sponsor.get("prize") == "Protein for a year")
check("can't re-quote a paid sponsorship", raises(lambda: market.quote_sponsorship("sp1", 6000), 409))

# Failed transfer can be retried by an admin
db.collection("payout_accounts").document("seller").update({"status": "suspended"})
db.collection("simple_events").document("ev2").set({"title": "Ev2", "createdBy": "seller", "ticketPrice": 99, "status": "upcoming", "endTime": future})
db.collection("payout_accounts").document("seller").update({"status": "active"})
o5 = market.create_checkout(buyer, "event", "ev2")
db.collection("payout_accounts").document("seller").update({"status": "suspended"})
pay(o5["orderId"])
market.refresh_order(o5["orderId"], "buyer")
check("no account → transfer failed", get("market_orders", o5["orderId"])["transfer"]["status"] == "failed")
db.collection("payout_accounts").document("seller").update({"status": "active"})
check("retry without force does nothing", market.transfer_seller_share(db, o5["orderId"])["status"] == "failed")
check("admin retry succeeds", market.transfer_seller_share(db, o5["orderId"], force=True)["status"] == "created")

sys.exit(1 if failed else 0)
