"""Account deletion removes one user's nutrition rows and nobody else's. Run: ./venv/Scripts/python tests/test_account_deletion.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db.base_class import Base  # noqa: E402
from app.database import models as m  # noqa: E402
from app.services import account_deletion  # noqa: E402

failed = []


def check(name, ok):
    print(("ok  " if ok else "FAIL") + f" {name}")
    if not ok:
        failed.append(name)


engine = create_engine("sqlite://")
Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if t.name in {
    "users", "user_preferences", "user_goals", "images", "meal_logs", "meal_items", "nutrition_summary", "recipes",
    "saved_recipes", "meal_plans", "chat_sessions", "chat_messages", "user_insights"}])
db = sessionmaker(bind=engine)()

for uid in ("gone", "stays"):
    db.add(m.User(id=uid, email=f"{uid}@x.com"))
    db.flush()
    meal = m.MealLog(user_id=uid)
    db.add(meal)
    db.flush()
    db.add(m.MealItem(meal_id=meal.id))
    chat = m.ChatSession(user_id=uid)
    db.add(chat)
    db.flush()
    db.add(m.ChatMessage(session_id=chat.id, role="user", content="hi"))
    db.add(m.UserInsight(user_id=uid, insight_type="daily", date="2026-10-01"))
db.commit()

account_deletion._delete_sql(db, "gone")
check("user row deleted", db.query(m.User).filter_by(id="gone").count() == 0)
check("meals deleted", db.query(m.MealLog).filter_by(user_id="gone").count() == 0)
check("meal items deleted", db.query(m.MealItem).count() == 1)
check("chat deleted", db.query(m.ChatSession).filter_by(user_id="gone").count() == 0 and db.query(m.ChatMessage).count() == 1)
check("insights deleted", db.query(m.UserInsight).filter_by(user_id="gone").count() == 0)
check("other user untouched", db.query(m.User).filter_by(id="stays").count() == 1 and db.query(m.MealLog).filter_by(user_id="stays").count() == 1)

sys.exit(1 if failed else 0)
