from typing import List, Optional
from pydantic import BaseModel, Field

class Exercise(BaseModel):
    name: str
    sets: str
    tempo: str
    rest: str
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
    goal: str
    days: int
    equipment: str
    customInfo: str = ""

class WorkoutPlanResponse(BaseModel):
    title: str
    description: str
    days: List[WorkoutDay]
