from typing import List, Optional
from pydantic import BaseModel, Field

class Exercise(BaseModel):
    name: str
    sets: str
    tempo: str = ""
    rest: str = ""
    cues: Optional[List[str]] = []
    yt: Optional[str] = ""

class WorkoutDay(BaseModel):
    dayNumber: int
    title: str
    time: str
    warmup: List[Exercise] = []
    skillWork: List[Exercise] = []
    strength: List[Exercise] = []
    cooldown: List[Exercise] = []

class WorkoutPlanRequest(BaseModel):
    # Core
    goal: str
    days: int
    equipment: str
    customInfo: str = ""
    
    # Extended user context (all optional for backwards compat)
    experience: str = ""          # beginner / intermediate / advanced
    gender: str = ""
    age: int = 0
    weight: float = 0
    sessionDuration: int = 60     # minutes
    injuries: str = ""
    trainingStyle: str = ""       # bodybuilding, powerlifting, calisthenics, hybrid
    fitnessGoal: str = ""         # from user profile

class WorkoutPlanResponse(BaseModel):
    title: str
    description: str
    days: List[WorkoutDay]
