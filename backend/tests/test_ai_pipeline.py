"""
Offline checks for the AI pipeline (no network, no API keys).
Run: cd backend && ./venv/Scripts/python tests/test_ai_pipeline.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import httpx  # noqa: E402

from app.providers import registry  # noqa: E402
from app.providers.llm.base import LLMResponse  # noqa: E402
from app.providers.vision import detect_food_with_fallback, parse_vision_payload  # noqa: E402

failures = 0


def check(name, actual, expected):
    global failures
    ok = actual == expected
    failures += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} | {name}" + ("" if ok else f" | got {actual!r} expected {expected!r}"))


# ─── JSON extraction ──────────────────────────────────────────────
check("fenced json", registry.extract_json('```json\n{"a": 1}\n```'), {"a": 1})
check("chatter + think", registry.extract_json('<think>hmm {"x":0}</think>Sure! {"a": [1, 2]} done'), {"a": [1, 2]})
try:
    registry.extract_json("no json here")
    check("no json raises", False, True)
except ValueError:
    check("no json raises", True, True)

# ─── Model selection ──────────────────────────────────────────────
disc = ({"llama-3.3-70b-versatile", "openai/gpt-oss-20b", "whisper-large-v3"}, {})
check("configured models filtered by live list", registry.choose_models("groqtest", ["qwen/qwen3.6-27b", "llama-3.3-70b-versatile"], disc), ["llama-3.3-70b-versatile"])
check("pattern fallback when none configured exist", registry.choose_models("groqtest2", ["gone-model"], disc), ["llama-3.3-70b-versatile", "openai/gpt-oss-20b"])
registry.mark_dead("groqtest3", "llama-3.3-70b-versatile", "410")
check("dead model skipped", registry.choose_models("groqtest3", ["llama-3.3-70b-versatile", "openai/gpt-oss-20b"], disc), ["openai/gpt-oss-20b"])
or_disc = ({"a/vision-free:free", "b/vision-paid", "c/text:free"}, {"a/vision-free:free": {"architecture": {"input_modalities": ["text", "image"]}},
                                                                     "b/vision-paid": {"architecture": {"input_modalities": ["image"]}}})
check("openrouter vision fallback picks free image model", registry.choose_models("openrouter", ["x"], or_disc, "vision"), ["a/vision-free:free"])
check("410 detected as gone", registry.is_model_gone_error(410, ""), True)
check("groq model_not_found detected", registry.is_model_gone_error(400, '{"code":"model_not_found"}'), True)
check("rate limit is not gone", registry.is_model_gone_error(429, "rate limit"), False)

# ─── Vision payload validation ────────────────────────────────────
v = parse_vision_payload({"is_food": True, "detected_foods": [
    {"name": "Roti", "estimated_weight_grams": 80, "protein": 6, "carbs": 36, "fat": 4},
    {"name": "", "calories": 100},
    {"name": "Huge", "estimated_weight_grams": 99999, "calories": 50000, "confidence": 5},
    "garbage",
]}, "test", 10)
check("invalid items dropped", [f.name for f in v.detected_foods], ["Roti", "Huge"])
check("calories derived from macros", v.detected_foods[0].calories, 6 * 4 + 36 * 4 + 4 * 9)
check("weight/calories/confidence clamped", (v.detected_foods[1].estimated_weight_grams, v.detected_foods[1].calories, v.detected_foods[1].confidence), (2000, 6000, 1))
check("not food payload", parse_vision_payload({"is_food": False, "detected_foods": []}, "t", 1).is_food, False)


# ─── Hedged vision fallback ───────────────────────────────────────
class FakeVision:
    def __init__(self, name, delay, payload=None, error=None):
        self.provider_name, self.delay, self.payload, self.error = name, delay, payload, error
        self.called = False

    async def vision(self, prompt, image, mime):
        self.called = True
        await asyncio.sleep(self.delay)
        if self.error:
            raise RuntimeError(self.error)
        return LLMResponse(content=self.payload, provider_used=self.provider_name)


FOOD = '{"is_food": true, "detected_foods": [{"name": "Dal", "estimated_weight_grams": 200, "calories": 230, "protein": 12, "carbs": 30, "fat": 6}]}'
NOT_FOOD = '{"is_food": false, "reason": "A laptop.", "detected_foods": []}'


async def vision_cases():
    slow, fast = FakeVision("slow", 5, FOOD), FakeVision("fast", 0.05, FOOD)
    r = await detect_food_with_fallback("x", [slow, fast], budget=10, hedge_after=0.2)
    check("hedge: second provider wins while first is slow", r.provider_used, "fast")

    r = await detect_food_with_fallback("x", [FakeVision("broken", 0, error="HTTP 404"), FakeVision("ok", 0, FOOD)], budget=5, hedge_after=2)
    check("failure falls through to next provider", (r.provider_used, len(r.detected_foods)), ("ok", 1))

    r = await detect_food_with_fallback("x", [FakeVision("nf", 0, NOT_FOOD), FakeVision("ok2", 0, FOOD)], budget=30, hedge_after=2)
    check("single not-food verdict is double-checked", r.provider_used, "ok2")

    r = await detect_food_with_fallback("x", [FakeVision("nf1", 0, NOT_FOOD), FakeVision("nf2", 0, NOT_FOOD)], budget=30, hedge_after=2)
    check("two not-food verdicts → not food", r.is_food, False)

    r = await detect_food_with_fallback("x", [FakeVision("e1", 0, error="boom"), FakeVision("e2", 0, "not json")], budget=5, hedge_after=1)
    check("all failed → failed status (is_food True, no items)", (r.provider_used, r.is_food, r.detected_foods), ("none", True, []))

asyncio.run(vision_cases())


# ─── OpenAI-compatible provider: retired model skipped ────────────
async def provider_cases():
    from app.providers.llm import openai_compat
    from app.providers.llm.base import ChatMessage
    calls = []

    def handler(request: httpx.Request):
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "old-model"}, {"id": "new-model"}]})
        body = request.read().decode()
        calls.append(body)
        if '"old-model"' in body:
            return httpx.Response(410, text='{"detail":"The model has reached its end of life"}')
        return httpx.Response(200, json={"choices": [{"message": {"content": "<think>x</think>Hello"}}], "usage": {"total_tokens": 5}})

    real = httpx.AsyncClient
    openai_compat.httpx.AsyncClient = lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    registry.httpx.AsyncClient = openai_compat.httpx.AsyncClient
    try:
        p = openai_compat.OpenAICompatProvider("nvidia", "key", ["old-model", "new-model"], [])
        r = await p.chat([ChatMessage(role="user", content="hi")])
        check("410 model skipped, next model answers", (r.content, r.model_used), ("Hello", "new-model"))
        check("reasoning stripped from content", r.reasoning, "x")
        await p.chat([ChatMessage(role="user", content="hi again")])
        check("dead model not retried", sum('"old-model"' in c for c in calls), 1)
    finally:
        openai_compat.httpx.AsyncClient = real
        registry.httpx.AsyncClient = real

asyncio.run(provider_cases())


# ─── Coach agent loop ─────────────────────────────────────────────
async def coach_cases():
    from app.agents.coach import agent as coach
    from app.agents.coach.tools import ToolContext

    class ScriptedLLM:
        provider_name = "scripted"

        def __init__(self, replies):
            self.replies, self.seen = list(replies), []

        async def chat(self, messages, system_prompt=None, temperature=0.7, max_tokens=None, json_mode=False):
            self.seen.append(messages[-1].content)
            return LLMResponse(content=self.replies.pop(0), provider_used="scripted")

    llm = ScriptedLLM([
        '{"thought": "Need the progression.", "tool_calls": [{"name": "get_skill_progression", "args": {"skill": "front lever"}}], "answer": ""}',
        '{"thought": "Answer.", "tool_calls": [], "answer": "Start with **Tuck Front Lever** 4 x 10s."}',
    ])
    ctx = ToolContext(db=None, uid="u", token=None, keys={}, llm=[llm], goals={}, prefs={}, today="2026-09-29")
    res = await coach.run_coach(ctx, "How do I start front lever?", [], "- none")
    check("agent answers after tool", res.answer, "Start with **Tuck Front Lever** 4 x 10s.")
    check("tool used", res.tools_used, ["get_skill_progression"])
    check("tool result fed back", "Tuck Front Lever" in llm.seen[1], True)
    check("reasoning lists data used", "get skill progression" in (res.reasoning or ""), True)

    plain = ScriptedLLM(["Creatine monohydrate at 3–5 g/day is well studied."])
    res = await coach.run_coach(ToolContext(db=None, uid="u", token=None, keys={}, llm=[plain], goals={}, prefs={}, today="2026-09-29"),
                                "Is creatine safe?", [], "- none")
    check("plain-text reply accepted as answer", res.answer.startswith("Creatine"), True)

    looping = ScriptedLLM(['{"tool_calls": [{"name": "get_skill_progression", "args": {"skill": "planche"}}]}'] * 3
                          + ['{"tool_calls": [], "answer": "Done."}'])
    res = await coach.run_coach(ToolContext(db=None, uid="u", token=None, keys={}, llm=[looping], goals={}, prefs={}, today="2026-09-29"),
                                "planche?", [], "- none")
    check("repeated identical tool call executed once", res.tools_used, ["get_skill_progression"])
    check("loop terminates with answer", res.answer, "Done.")

    class Down:
        provider_name = "down"

        async def chat(self, *a, **k):
            raise RuntimeError("503")
    res = await coach.run_coach(ToolContext(db=None, uid="u", token=None, keys={}, llm=[Down()], goals={}, prefs={}, today="2026-09-29"),
                                "hi", [], "- none")
    check("provider outage → friendly fallback, no raw error", res.answer.startswith("I couldn't generate"), True)

asyncio.run(coach_cases())


# ─── Training summaries ───────────────────────────────────────────
from app.agents.coach import training  # noqa: E402

check("firestore decode", training.decode_fields({"a": {"integerValue": "3"}, "b": {"arrayValue": {"values": [{"mapValue": {"fields": {"w": {"doubleValue": 2.5}}}}]}}}),
      {"a": 3, "b": [{"w": 2.5}]})
snap = training.training_snapshot({"available": True, "stats": {"totalWorkouts": 3}, "profile": {"athleteRank": {"label": "Developing II"}},
                                   "workouts": [{"date": "2026-09-29", "dayTitle": "Push", "durationMin": 50,
                                                 "exercises": [{"name": "Bench", "sets": [{"reps": 8, "weight": 60, "completed": True}]}]}],
                                   "cardio": [{"date": "2026-09-27", "type": "run", "distanceKm": 5, "movingDurationSec": 1500}]}, "2026-09-29")
check("snapshot counts today's session", "Last 7 days: 1 strength sessions, 1 cardio sessions (run 5.0 km)" in snap, True)
check("snapshot best set", "Bench 1 sets best 8×60kg" in snap, True)
check("cardio pace line", training.cardio_line({"date": "d", "type": "run", "distanceKm": 5, "movingDurationSec": 1500}), "d Run 5.00 km in 25 min (5:00/km, +0 m)")


# ─── DB: image cleanup keeps logged meal photos; message marked logged ─
def db_cases():
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database.models import Base, ChatMessage, ChatSession, MealLog, ScannedImage, User
    from app.repositories.image_repository import ImageRepository
    from app.api.nutrition import _mark_message_logged

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    db.add(User(id="u", email="u@x"))
    old = datetime.now(timezone.utc) - timedelta(days=10)
    kept, dropped, fresh = ScannedImage(user_id="u", base64_data="a", created_at=old), ScannedImage(user_id="u", base64_data="b", created_at=old), ScannedImage(user_id="u", base64_data="c")
    db.add_all([kept, dropped, fresh])
    db.flush()
    db.add(MealLog(user_id="u", image_id=kept.id, meal_type="lunch"))
    db.commit()
    deleted = ImageRepository(db).delete_old_images(7)
    db.commit()
    check("cleanup deletes only unreferenced old images", (deleted, sorted(i.base64_data for i in db.query(ScannedImage))), (1, ["a", "c"]))

    s = ChatSession(user_id="u", title="t")
    db.add(s)
    db.flush()
    m = ChatMessage(session_id=s.id, role="assistant", content="x", metadata_={"nutrition_data": {"a": 1}})
    db.add(m)
    db.commit()
    _mark_message_logged(db, "u", f"msg-{m.id}")
    db.commit()
    db.expire_all()
    check("message marked logged (portable JSON update)", db.get(ChatMessage, m.id).metadata_, {"nutrition_data": {"a": 1}, "logged": True})
    other = ChatMessage(session_id=s.id, role="assistant", content="y", metadata_={})
    db.add(other)
    db.commit()
    _mark_message_logged(db, "someone-else", f"msg-{other.id}")
    db.commit()
    db.expire_all()
    check("other users cannot mark it", db.get(ChatMessage, other.id).metadata_, {})

db_cases()


# ─── Food scan service states ─────────────────────────────────────
async def scan_cases():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database.models import Base, ChatMessage, User
    from app.providers.vision.base import VisionResult
    from app.services import food_scan

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    db.add(User(id="u", email="u@x"))
    db.commit()
    food_scan.get_llm_providers = lambda *a, **k: []
    food_scan.get_vision_providers = lambda *a, **k: []
    seen_notes = []

    async def fake_detect(image, providers, mime, user_note=""):
        seen_notes.append(user_note)
        return {
            "food": parse_vision_payload({"is_food": True, "detected_foods": [{"name": "Paneer tikka", "estimated_weight_grams": 150, "calories": 390, "protein": 27, "carbs": 9, "fat": 27}]}, "fake", 5),
            "nothing": VisionResult(detected_foods=[], is_food=False, raw_description="A keyboard.", provider_used="fake"),
            "down": VisionResult(detected_foods=[], is_food=True, raw_description="All vision providers failed: timeout", provider_used="none"),
        }[image]

    food_scan.detect_food_with_fallback = fake_detect
    ok = await food_scan.scan_food(db, "u", {}, "food", "image/jpeg", "lunch", note="with extra butter")
    check("scan ok: success, card, summary", (ok["success"], ok["status"], "Paneer tikka" in ok["message"], bool(ok["nutrition"])), (True, "ok", True, True))
    check("user note forwarded to vision", seen_notes[-1], "with extra butter")
    check("assistant message id returned", ok["assistant_message_id"].startswith("msg-"), True)
    stored = db.get(ChatMessage, int(ok["assistant_message_id"][4:]))
    check("card stored on message for history + Track", bool(stored.metadata_["nutrition_data"]["nutrition"]), True)
    again = await food_scan.scan_food(db, "u", {}, "food", "image/jpeg", "lunch", note="with extra butter", session_id=ok["session_id"])
    check("repeat photo served from cache", (again["vision"]["provider_used"].startswith("cache"), len(seen_notes)), (True, 1))
    nf = await food_scan.scan_food(db, "u", {}, "nothing", "image/jpeg", "lunch")
    check("not food: no card, clear message", (nf["success"], nf["status"], nf["nutrition"], "couldn't find any food" in nf["message"]), (False, "not_food", None, True))
    down = await food_scan.scan_food(db, "u", {}, "down", "image/jpeg", "lunch")
    check("provider outage: failed status, retry message", (down["status"], "try again" in down["message"]), ("failed", True))
    check("failed scan stores no card", db.get(ChatMessage, int(down["assistant_message_id"][4:])).metadata_, None)

asyncio.run(scan_cases())


# ─── API wiring: chat → card → track ──────────────────────────────
def api_cases():
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.main import app
    from app.api import nutrition as api
    from app.agents.coach.agent import CoachResult
    from app.core.security import get_current_user
    from app.database.models import Base, MealLog
    from app.db.session import get_db

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: {"uid": "api-user", "email": "a@b.c"}
    card = {"success": True, "status": "ok", "vision": {"detected_foods": []}, "nutrition": {
        "nutrition": {"items": [{"name": "Egg", "weight_grams": 100, "calories": 155, "protein": 13, "carbs": 1, "fat": 11, "fiber": 0}],
                      "total_calories": 155, "total_protein": 13, "total_carbs": 1, "total_fat": 11, "total_fiber": 0},
        "health_score": {"score": 70, "grade": "B", "suggestions": []}}}
    captured = {}

    async def fake_coach(ctx, message, history, context):
        captured["context"] = context
        return CoachResult(answer="Two eggs ≈ **155 kcal**.", nutrition_card=card, tools_used=["estimate_meal"])

    async def no_training(uid, token):
        return {"workouts": [], "cardio": [], "stats": {}, "profile": {}, "available": False}

    api.run_coach = fake_coach
    api.training.fetch_training_data = no_training
    api.resolve_api_keys = lambda user: asyncio.sleep(0, result={})
    client = TestClient(app)

    r = client.post("/api/v1/nutrition/chat", json={"message": "I ate 2 eggs, track it"})
    body = r.json()
    check("chat 200 without body profile (no more 400)", r.status_code, 200)
    check("chat returns card + server message id", (bool(body["nutritionData"]), body["message_id"].startswith("msg-")), (True, True))
    check("context flags missing profile", "NOT SET" in captured["context"], True)

    r = client.post("/api/v1/nutrition/food/log", json={"meal_type": "breakfast", "vision_data": body["nutritionData"], "message_id": body["message_id"]})
    check("track meal succeeds", (r.status_code, r.json().get("success")), (200, True))
    msgs = client.get(f"/api/v1/nutrition/chat/sessions/{body['session_id']}/messages").json()
    check("message marked tracked in history", msgs[-1]["metadata_"].get("logged"), True)
    db = Session()
    check("meal saved with totals", round(db.query(MealLog).first().total_calories), 155)
    r = client.post("/api/v1/nutrition/food/log", json={"meal_type": "lunch", "vision_data": {"success": True, "nutrition": None}})
    check("empty result cannot be tracked", r.status_code, 400)
    r = client.post("/api/v1/nutrition/chat", json={"message": "write me a python script to sort a list"})
    check("off-topic handled in-band", r.status_code == 200 and "outside" in r.json()["response"], True)
    app.dependency_overrides.clear()

api_cases()

print(f"\n{failures} failed" if failures else "\nall passed")
sys.exit(1 if failures else 0)
