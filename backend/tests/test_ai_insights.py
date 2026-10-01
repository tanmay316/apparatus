"""
AI summary tests (no network).
Run: cd backend; ./venv/Scripts/python tests/test_ai_insights.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.providers.llm.base import LLMResponse  # noqa: E402
from app.services import ai_insights as ai  # noqa: E402
from app.services import subscription as subs  # noqa: E402

failed = 0


def check(name, ok):
    global failed
    if not ok:
        failed += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}")


facts = {"type": "run", "distance_km": 8.02, "pace": "5:12", "previous_pace": "5:24", "weekly_km": 31.5, "fitness": 42,
         "observations": [{"title": "Negative split", "text": "Second half faster."}, {"title": "Cadence 172", "text": "Good turnover."}]}
ft = '{"distance_km":8.02,"pace":"5:12","previous_pace":"5:24","weekly_km":31.5,"fitness":42}'
check("exact numbers allowed", ai.numbers_grounded("8.02 km at 5:12 /km, fitness 42", ft))
check("rounded numbers allowed", ai.numbers_grounded("about 8 km and 31.5 km this week", ft))
check("small counts allowed", ai.numbers_grounded("Do 2 easy runs and 1 rest day", ft))
check("invented number rejected", not ai.numbers_grounded("You ran 12 km", ft))
check("invented pace rejected", not ai.numbers_grounded("Aim for 4:59 /km", ft))
check("invented percentage rejected", not ai.numbers_grounded("You were 18% faster", ft))

try:
    ai.clean_facts({"a": float("nan")})
    check("NaN rejected", False)
except ai.FactsError:
    check("NaN rejected", True)
try:
    ai.clean_facts({"x": "y" * 50, **{f"k{i}": "v" * 150 for i in range(49)}})
    check("oversized facts rejected", False)
except ai.FactsError:
    check("oversized facts rejected", True)
cleaned = ai.clean_facts({"name": "Bench <script>`{x}`", "bad key!": 1, "deep": {"a": [1.234567, True]}})
check("strings sanitised", "<" not in cleaned["name"] and "`" not in cleaned["name"] and "{" not in cleaned["name"])
check("keys sanitised", "badkey" in cleaned)
check("floats rounded", cleaned["deep"]["a"][0] == 1.23)

check("parses fenced JSON", ai.parse_summary('```json\n{"headline":"Strong run","points":["a","b","c"],"action":"Rest"}\n```')["headline"] == "Strong run")
check("rejects thin output", ai.parse_summary('{"headline":"x","points":["only one"]}') is None)
check("strips markdown", ai.parse_summary('{"headline":"**Big** day","points":["a","b"],"action":"go"}')["headline"] == "Big day")
fb = ai.fallback_summary(facts)
check("fallback uses the app's observations", fb["headline"] == "Negative split" and fb["points"][0].startswith("Cadence 172"))


class FakeProvider:
    provider_name = "fake"

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = 0

    async def chat(self, messages, system_prompt=None, temperature=0.7, max_tokens=None, json_mode=False):
        self.calls += 1
        return LLMResponse(content=self.answers.pop(0), provider_used="fake")


good = '{"headline":"Faster than last time","points":["8.02 km at 5:12 /km vs 5:24","31.5 km this week","Fitness at 42"],"action":"Keep tomorrow easy"}'
bad = '{"headline":"Huge PR","points":["You ran 12 km","At 4:30 pace","Up 25%"],"action":"Race now"}'

p = FakeProvider([good])
out = asyncio.run(ai.generate_summary("cardio", facts, [p]))
check("grounded answer accepted", out is not None and out["headline"] == "Faster than last time" and p.calls == 1)
p = FakeProvider([bad, good])
out = asyncio.run(ai.generate_summary("cardio", facts, [p]))
check("ungrounded answer retried once", out is not None and p.calls == 2)
p = FakeProvider([bad, bad])
check("still ungrounded → None (fallback)", asyncio.run(ai.generate_summary("cardio", facts, [p])) is None)

check("free tier: 1 AI summary a week", subs.FREE_LIMITS["ai_summary"] == (1, "week"))
day, month, week = subs._period_keys()
data = {"day": day, "month": month, "week": "2000-W01", "counts": {"ai_call": 2, "ai_summary": 1, "workout_plan": 1}}
fresh = subs._fresh_counts(data, day, month, week)
check("week rollover resets weekly count only", fresh == {"ai_call": 2, "workout_plan": 1})
data = {"day": "2000-01-01", "month": month, "week": week, "counts": {"ai_call": 3, "ai_summary": 1}}
check("day rollover keeps weekly count", subs._fresh_counts(data, day, month, week) == {"ai_summary": 1})
check("weekly 402 wording", "this week" in subs.QuotaResult(False, "ai_summary", 1, 1, "week").detail()["message"])

sys.exit(1 if failed else 0)
