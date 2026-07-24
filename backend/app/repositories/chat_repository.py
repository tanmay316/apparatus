"""
Chat Repository — SQL only.
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from app.database.models import ChatSession, ChatMessage


class ChatRepository:

    def __init__(self, db: Session):
        self.db = db

    def create_session(self, user_id: str, title: str = "New Chat") -> ChatSession:
        session = ChatSession(user_id=user_id, title=title)
        self.db.add(session)
        self.db.flush()
        return session

    def get_session(self, session_id: int) -> Optional[ChatSession]:
        return self.db.query(ChatSession).filter(ChatSession.id == session_id).first()

    def get_user_sessions(self, user_id: str, limit: int = 20) -> List[ChatSession]:
        from sqlalchemy import func
        return (
            self.db.query(ChatSession)
            .filter(ChatSession.user_id == user_id)
            .order_by(func.coalesce(ChatSession.updated_at, ChatSession.created_at).desc())
            .limit(limit)
            .all()
        )

    def add_message(self, session_id: int, role: str, content: str, metadata: dict = None) -> ChatMessage:
        from sqlalchemy import func
        msg = ChatMessage(session_id=session_id, role=role, content=content, metadata_=metadata)
        self.db.add(msg)
        
        # Touch session to update its updated_at timestamp
        session = self.db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if session:
            session.updated_at = func.now()
            
        self.db.flush()
        return msg

    def get_recent_messages(self, session_id: int, limit: int = 15) -> List[ChatMessage]:
        return (
            self.db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
            .all()
        )[::-1]  # Reverse to chronological order

    def delete_session(self, session_id: int):
        self.db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
        self.db.query(ChatSession).filter(ChatSession.id == session_id).delete()
        self.db.flush()
