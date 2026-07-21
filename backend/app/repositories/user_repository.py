"""
User Repository — SQL only.
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.database.models import User, UserPreference, UserGoal


class UserRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_or_create_user(self, uid: str, email: str = "") -> User:
        user = self.db.query(User).filter(User.id == uid).first()
        if not user:
            user = User(id=uid, email=email)
            self.db.add(user)
            self.db.flush()
        return user

    def get_user(self, uid: str) -> Optional[User]:
        return self.db.query(User).filter(User.id == uid).first()

    def get_preferences(self, uid: str) -> Optional[UserPreference]:
        return self.db.query(UserPreference).filter(UserPreference.user_id == uid).first()

    def upsert_preferences(self, uid: str, data: dict) -> UserPreference:
        pref = self.get_preferences(uid)
        if pref:
            for k, v in data.items():
                if hasattr(pref, k):
                    setattr(pref, k, v)
        else:
            pref = UserPreference(user_id=uid, **data)
            self.db.add(pref)
        self.db.flush()
        return pref

    def get_goals(self, uid: str) -> Optional[UserGoal]:
        return self.db.query(UserGoal).filter(UserGoal.user_id == uid).first()

    def upsert_goals(self, uid: str, data: dict) -> UserGoal:
        goal = self.get_goals(uid)
        if goal:
            for k, v in data.items():
                if hasattr(goal, k):
                    setattr(goal, k, v)
        else:
            goal = UserGoal(user_id=uid, **data)
            self.db.add(goal)
        self.db.flush()
        return goal
