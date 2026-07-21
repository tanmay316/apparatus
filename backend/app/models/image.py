from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.base_class import Base

class ScannedImage(Base):
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("user.id"), index=True)
    
    # Store Base64 string heavily compressed from the client
    base64_data = Column(String)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
