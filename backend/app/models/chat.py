from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.db.base_class import Base

class ChatSession(Base):
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("user.id"), index=True)
    
    # Store LangGraph message history or simple role/content array
    history = Column(JSON, default=[])
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
