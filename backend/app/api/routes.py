"""/routes: suggested loops, snap-to-path drawing and elevation for the Routes (Pro) feature."""
import asyncio

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.core.guardrails import check_rate_limit
from app.core.security import get_current_user
from app.services import routes as planner
from app.services.subscription import is_pro, verified_email

router = APIRouter(prefix="/routes", tags=["routes"])

MAX_KM = {"walk": 30.0, "run": 50.0, "cycle": 120.0}


def _check_points(points: list[list[float]]) -> list[list[float]]:
    for p in points:
        if len(p) != 2 or not (-85 <= p[0] <= 85) or not (-180 <= p[1] <= 180):
            raise ValueError("Each point must be [lat, lng]")
    return points


class SuggestRequest(BaseModel):
    lat: float = Field(..., ge=-85, le=85)
    lng: float = Field(..., ge=-180, le=180)
    distanceKm: float = Field(..., ge=1, le=120)
    type: str = Field(..., pattern="^(run|walk|cycle)$")
    seed: int = Field(0, ge=0, le=1000)


class PointsRequest(BaseModel):
    type: str = Field("run", pattern="^(run|walk|cycle)$")
    points: list[list[float]] = Field(..., min_length=2, max_length=40)

    @field_validator("points")
    @classmethod
    def valid_points(cls, v):
        return _check_points(v)


class ElevationRequest(BaseModel):
    points: list[list[float]] = Field(..., min_length=2, max_length=2000)

    @field_validator("points")
    @classmethod
    def valid_points(cls, v):
        return _check_points(v)


async def _require_pro(user: dict) -> None:
    if settings.pro_enforced and not await asyncio.to_thread(is_pro, user["uid"], verified_email(user)):
        raise HTTPException(status_code=402, detail={
            "code": "pro_required", "kind": "routes", "limit": 0, "period": "day",
            "message": f"Routes are part of {settings.APP_NAME} Pro.",
        })


def _rate(user: dict, name: str, limit: int) -> None:
    verdict = check_rate_limit(f"{user['uid']}:routes-{name}", limit=limit, window_seconds=600)
    if not verdict.allowed:
        raise HTTPException(status_code=429, detail=verdict.message)


@router.post("/suggest")
async def suggest(req: SuggestRequest, current_user: dict = Depends(get_current_user)):
    await _require_pro(current_user)
    _rate(current_user, "suggest", 20)
    km = min(req.distanceKm, MAX_KM[req.type])
    loops = await planner.suggest_loops(req.lat, req.lng, km, req.type, req.seed)
    if not loops:
        raise HTTPException(status_code=502, detail="Couldn't find routes here right now. Try another distance or try again shortly.")
    return {"routes": loops}


@router.post("/snap")
async def snap(req: PointsRequest, current_user: dict = Depends(get_current_user)):
    await _require_pro(current_user)
    _rate(current_user, "snap", 150)
    route = await planner.snap_route(req.points, req.type)
    if not route:
        raise HTTPException(status_code=502, detail="Couldn't follow paths between these points. Try placing them closer to a road or trail.")
    return route


@router.post("/elevation")
async def elevation(req: ElevationRequest, current_user: dict = Depends(get_current_user)):
    await _require_pro(current_user)
    _rate(current_user, "elevation", 60)
    async with httpx.AsyncClient(timeout=10.0) as client:
        elev = await planner.elevation_profile(client, req.points)
    return {"elevationGainM": elev["gain_m"] if elev else None, "elevationProfile": elev["profile"] if elev else None}
