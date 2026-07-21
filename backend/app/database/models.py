"""
Complete database models for the AI Nutrition System.
"""
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text,
    ForeignKey, JSON, Index
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


# ─── Users & Preferences ──────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)  # Firebase UID
    email = Column(String, unique=True, index=True)
    display_name = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    preferences = relationship("UserPreference", back_populates="user", uselist=False)
    goals = relationship("UserGoal", back_populates="user", uselist=False)
    meals = relationship("MealLog", back_populates="user")
    chat_sessions = relationship("ChatSession", back_populates="user")


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), unique=True, index=True)

    dietary_restrictions = Column(JSON, default=[])   # ["vegetarian", "gluten-free"]
    allergies = Column(JSON, default=[])               # ["peanuts", "shellfish"]
    cuisine_preferences = Column(JSON, default=[])     # ["indian", "mediterranean"]
    disliked_foods = Column(JSON, default=[])
    favorite_foods = Column(JSON, default=[])
    meal_timings = Column(JSON, default={})             # {"breakfast": "08:00", ...}
    eating_behavior = Column(JSON, default={})

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="preferences")


class UserGoal(Base):
    __tablename__ = "user_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), unique=True, index=True)

    fitness_goal = Column(String, default="build_muscle")  # build_muscle, lose_fat, maintain
    calorie_goal = Column(Float, default=2000.0)
    protein_goal = Column(Float, default=140.0)
    carb_goal = Column(Float, default=250.0)
    fat_goal = Column(Float, default=65.0)
    fiber_goal = Column(Float, default=30.0)

    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)
    activity_level = Column(String, default="moderate")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="goals")


# ─── Images ───────────────────────────────────────────────────────

class ScannedImage(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)

    base64_data = Column(Text)  # Compressed base64 string
    mime_type = Column(String, default="image/jpeg")
    source = Column(String, default="camera")  # camera, gallery, barcode

    # Vision analysis results (cached)
    vision_result = Column(JSON, nullable=True)
    provider_used = Column(String, nullable=True)
    vision_latency_ms = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── Meal Logs ────────────────────────────────────────────────────

class MealLog(Base):
    __tablename__ = "meal_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=True)

    meal_type = Column(String)  # breakfast, lunch, dinner, snack
    logged_at = Column(DateTime(timezone=True), server_default=func.now())

    # Totals (computed by tools, not AI)
    total_calories = Column(Float, default=0.0)
    total_protein = Column(Float, default=0.0)
    total_carbs = Column(Float, default=0.0)
    total_fat = Column(Float, default=0.0)
    total_fiber = Column(Float, default=0.0)

    # Health analysis
    health_score = Column(Integer, nullable=True)
    health_grade = Column(String, nullable=True)
    ai_suggestions = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="meals")
    items = relationship("MealItem", back_populates="meal", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_meal_user_date", "user_id", "logged_at"),
    )


class MealItem(Base):
    __tablename__ = "meal_items"

    id = Column(Integer, primary_key=True, index=True)
    meal_id = Column(Integer, ForeignKey("meal_logs.id"), index=True)

    food_name = Column(String)
    weight_grams = Column(Float)
    calories = Column(Float)
    protein = Column(Float)
    carbs = Column(Float)
    fat = Column(Float)
    fiber = Column(Float)
    confidence = Column(Float, default=1.0)
    category = Column(String, nullable=True)

    meal = relationship("MealLog", back_populates="items")


# ─── Nutrition Summaries ──────────────────────────────────────────

class NutritionSummary(Base):
    __tablename__ = "nutrition_summary"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    date = Column(String, index=True)  # YYYY-MM-DD

    total_calories = Column(Float, default=0.0)
    total_protein = Column(Float, default=0.0)
    total_carbs = Column(Float, default=0.0)
    total_fat = Column(Float, default=0.0)
    total_fiber = Column(Float, default=0.0)
    meal_count = Column(Integer, default=0)
    avg_health_score = Column(Float, nullable=True)

    __table_args__ = (
        Index("ix_summary_user_date", "user_id", "date", unique=True),
    )


# ─── Recipes ──────────────────────────────────────────────────────

class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    cuisine = Column(String, nullable=True)
    diet_type = Column(String, nullable=True)  # vegetarian, vegan, keto...

    ingredients = Column(JSON, default=[])
    instructions = Column(JSON, default=[])
    prep_time_min = Column(Integer, nullable=True)
    cook_time_min = Column(Integer, nullable=True)
    servings = Column(Integer, default=1)

    # Nutrition per serving
    calories = Column(Float, nullable=True)
    protein = Column(Float, nullable=True)
    carbs = Column(Float, nullable=True)
    fat = Column(Float, nullable=True)

    is_system = Column(Boolean, default=False)  # curated vs AI-generated
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SavedRecipe(Base):
    __tablename__ = "saved_recipes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── Meal Plans ───────────────────────────────────────────────────

class MealPlan(Base):
    __tablename__ = "meal_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    name = Column(String)
    plan_type = Column(String, default="weekly")  # daily, weekly, monthly
    start_date = Column(String, nullable=True)
    data = Column(JSON, default={})  # full plan structure
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── Chat ─────────────────────────────────────────────────────────

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    title = Column(String, default="New Chat")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), index=True)
    role = Column(String)  # user, assistant, system
    content = Column(Text)
    metadata_ = Column("metadata", JSON, nullable=True)  # token usage, provider, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")


# ─── Insights & Analytics ─────────────────────────────────────────

class UserInsight(Base):
    __tablename__ = "user_insights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    insight_type = Column(String)  # daily, weekly, monthly
    date = Column(String)
    data = Column(JSON, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── Cache Tables ─────────────────────────────────────────────────

class FoodCache(Base):
    __tablename__ = "food_cache"

    id = Column(Integer, primary_key=True, index=True)
    food_name = Column(String, unique=True, index=True)
    nutrition_data = Column(JSON)
    source = Column(String, default="database")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class VisionCache(Base):
    __tablename__ = "vision_cache"

    id = Column(Integer, primary_key=True, index=True)
    image_hash = Column(String, unique=True, index=True)
    result = Column(JSON)
    provider = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
