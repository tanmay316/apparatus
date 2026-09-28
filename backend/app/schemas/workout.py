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
    goal: str = Field(..., max_length=200)
    days: int = Field(..., ge=1, le=7)
    equipment: str = Field(..., max_length=300)
    customInfo: str = Field("", max_length=2000)
    
    # Extended user context (all optional for backwards compat)
    experience: str = Field("", max_length=40)
    gender: str = Field("", max_length=40)
    age: int = Field(0, ge=0, le=120)
    weight: float = Field(0, ge=0, le=500)
    sessionDuration: int = Field(60, ge=10, le=300)
    injuries: str = Field("", max_length=500)
    trainingStyle: str = Field("", max_length=60)
    fitnessGoal: str = Field("", max_length=120)

class WorkoutPlanResponse(BaseModel):
    title: str
    description: str
    days: List[WorkoutDay]
