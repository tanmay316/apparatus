from sqlalchemy import Column, String, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.db.base_class import Base

class User(Base):
    id = Column(String, primary_key=True, index=True) # Firebase UID
    email = Column(String, unique=True, index=True)
    is_admin = Column(Boolean, default=False)
    
    # Nutrition profile details
    preferences = Column(JSON, default={})
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
