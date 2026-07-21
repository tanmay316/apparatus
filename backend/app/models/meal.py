from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.db.base_class import Base

class MealLog(Base):
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("user.id"), index=True)
    
    meal_type = Column(String) # Breakfast, Lunch, Dinner, Snack
    food_items = Column(JSON) # Array of parsed items
    
    # Macros
    calories = Column(Float, default=0.0)
    protein = Column(Float, default=0.0)
    carbs = Column(Float, default=0.0)
    fat = Column(Float, default=0.0)
    fiber = Column(Float, default=0.0)
    
    # AI Analysis
    health_score = Column(Integer, nullable=True)
    ai_suggestions = Column(JSON, nullable=True)
    
    # Original image if scanned
    image_url = Column(String, nullable=True) # Could be Railway hosted URL or base64
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
