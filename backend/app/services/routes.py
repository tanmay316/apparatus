"""Route planning for the Routes (Pro) feature: suggested loops, snap-to-path drawing, elevation.

Routing goes to an OSRM-compatible server (foot / bike profiles) and elevation to an
OpenTopoData-style API. Both are shared public services, so calls are spaced out per process
and results are cached.
"""
import asyncio
import math
import time
from typing import Optional

import httpx

from app.core.config import settings

_HEADERS = {"User-Agent": f"{settings.APP_NAME}/1.0 (route planner; {settings.PUBLIC_APP_URL})"}
_CACHE_TTL = 3600
_MIN_GAP_SEC = 0.25
_cache: dict[str, tuple[float, object]] = {}
_lock = asyncio.Lock()
_last_call = 0.0
EARTH_M = 6_371_000.0

# Roads wind more than a circle: aim the loop smaller than the target distance.
_ROAD_FACTOR = 0.75
_MAX_POINTS = 1200


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    return None


def _cache_set(key: str, value) -> None:
    if len(_cache) > 2000:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:500]:
            _cache.pop(k, None)
    _cache[key] = (time.time(), value)


def destination(lat: float, lng: float, bearing_deg: float, dist_m: float) -> tuple[float, float]:
    """Point `dist_m` from (lat, lng) along `bearing_deg` (great circle)."""
    d = dist_m / EARTH_M
    b = math.radians(bearing_deg)
    p1 = math.radians(lat)
    l1 = math.radians(lng)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180


def _xy(points: list[list[float]]) -> list[tuple[float, float]]:
    lat0 = math.radians(points[0][0])
    return [(p[1] * 111_320 * math.cos(lat0), p[0] * 110_540) for p in points]


def _rdp_keep(xy: list[tuple[float, float]], tol: float) -> list[bool]:
    n = len(xy)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tol * tol
    while stack:
        s, e = stack.pop()
        ax, ay = xy[s]
        dx, dy = xy[e][0] - ax, xy[e][1] - ay
        len2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(s + 1, e):
            px, py = xy[i][0] - ax, xy[i][1] - ay
            if len2 > 0:
                t = max(0.0, min(1.0, (px * dx + py * dy) / len2))
                px -= t * dx
                py -= t * dy
            d = px * px + py * py
            if d > best:
                best, idx = d, i
        if idx > 0 and best > tol2:
            keep[idx] = True
            stack.append((s, idx))
            stack.append((idx, e))
    return keep


def simplify(points: list[list[float]], max_points: int = _MAX_POINTS) -> list[list[float]]:
    """Shape-preserving reduction: corners keep their points, straight runs lose them."""
    if len(points) <= 2:
        return points
    xy = _xy(points)
    tol = 1.0
    keep = _rdp_keep(xy, tol)
    while sum(keep) > max_points and tol < 200:
        tol *= 1.6
        keep = _rdp_keep(xy, tol)
    return [[round(p[0], 6), round(p[1], 6)] for p, k in zip(points, keep) if k]


def _haversine_m(a: list[float], b: list[float]) -> float:
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_M * math.asin(min(1.0, math.sqrt(h)))


async def _throttle() -> None:
    global _last_call
    async with _lock:
        wait = _MIN_GAP_SEC - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()


async def route_through(client: httpx.AsyncClient, kind: str, coords: list[tuple[float, float]]) -> Optional[dict]:
    """Path along roads/trails through the given (lat, lng) waypoints, or None."""
    base = settings.ROUTING_BIKE_URL if kind == "cycle" else settings.ROUTING_FOOT_URL
    path = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in coords)
    await _throttle()
    try:
        r = await client.get(f"{base}/{path}", params={"overview": "full", "geometries": "geojson", "steps": "false"}, headers=_HEADERS)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    routes = data.get("routes") or []
    if data.get("code") != "Ok" or not routes:
        return None
    geometry = routes[0].get("geometry", {}).get("coordinates") or []
    points = [[c[1], c[0]] for c in geometry if isinstance(c, list) and len(c) >= 2]
    if len(points) < 2:
        return None
    return {"distance_m": float(routes[0].get("distance") or 0), "points": points}


async def elevation_profile(client: httpx.AsyncClient, points: list[list[float]], samples: int = 100) -> Optional[dict]:
    """Elevation gain and a 100-point profile, sampled evenly by distance. None if unavailable."""
    if not settings.ELEVATION_URL or len(points) < 2:
        return None
    cum = [0.0]
    for a, b in zip(points, points[1:]):
        cum.append(cum[-1] + _haversine_m(a, b))
    total = cum[-1]
    if total <= 0:
        return None
    picks, j = [], 0
    for i in range(samples):
        target = total * i / (samples - 1)
        while j < len(cum) - 1 and cum[j] < target:
            j += 1
        picks.append(points[j])
    key = "e:" + "|".join(f"{p[0]:.4f},{p[1]:.4f}" for p in picks)
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    await _throttle()
    try:
        r = await client.get(settings.ELEVATION_URL, params={"locations": "|".join(f"{p[0]:.5f},{p[1]:.5f}" for p in picks)}, headers=_HEADERS)
        if r.status_code != 200:
            return None
        results = r.json().get("results") or []
        elev = [res.get("elevation") for res in results]
    except (httpx.HTTPError, ValueError):
        return None
    if len(elev) != len(picks) or any(e is None for e in elev):
        return None
    gain, anchor = 0.0, float(elev[0])
    for e in elev[1:]:
        e = float(e)
        if e - anchor >= 3:
            gain += e - anchor
            anchor = e
        elif e < anchor:
            anchor = e
    out = {"gain_m": round(gain), "profile": [round(float(e), 1) for e in elev]}
    _cache_set(key, out)
    return out


def _compass(bearing: float) -> str:
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][int(((bearing % 360) + 22.5) // 45) % 8]


async def suggest_loops(lat: float, lng: float, distance_km: float, kind: str, seed: int = 0, count: int = 3) -> list[dict]:
    """Up to `count` loops of about `distance_km` that start and finish at (lat, lng)."""
    key = f"s:{kind}:{lat:.3f}:{lng:.3f}:{distance_km:.1f}:{seed}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    target_m = distance_km * 1000
    loops: list[dict] = []
    async with httpx.AsyncClient(timeout=12.0) as client:
        for i in range(count):
            bearing = (seed * 47 + i * (360 / count) + 20) % 360
            radius = target_m / (2 * math.pi) * _ROAD_FACTOR
            best = None
            for _ in range(3):
                cx, cy = destination(lat, lng, bearing, radius)
                w1 = destination(cx, cy, bearing + 300, radius)
                w2 = destination(cx, cy, bearing + 60, radius)
                route = await route_through(client, kind, [(lat, lng), w1, w2, (lat, lng)])
                if not route or route["distance_m"] <= 0:
                    break
                if best is None or abs(route["distance_m"] - target_m) < abs(best["distance_m"] - target_m):
                    best = route
                ratio = target_m / route["distance_m"]
                if abs(1 - ratio) <= 0.1:
                    break
                radius *= max(0.5, min(1.8, ratio))
            if not best:
                continue
            if any(abs(l["distanceKm"] * 1000 - best["distance_m"]) < 50 for l in loops):
                continue
            elev = await elevation_profile(client, best["points"])
            loops.append({
                "id": f"loop-{seed}-{i}",
                "name": f"{distance_km:g} km loop heading {_compass(bearing)}",
                "distanceKm": round(best["distance_m"] / 1000, 2),
                "elevationGainM": elev["gain_m"] if elev else None,
                "elevationProfile": elev["profile"] if elev else None,
                "points": simplify(best["points"]),
            })
    if loops:
        _cache_set(key, loops)
    return loops


async def snap_route(points: list[list[float]], kind: str) -> Optional[dict]:
    """Follows roads/trails through the drawn waypoints."""
    key = f"p:{kind}:" + ";".join(f"{p[0]:.5f},{p[1]:.5f}" for p in points)
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    async with httpx.AsyncClient(timeout=12.0) as client:
        route = await route_through(client, kind, [(p[0], p[1]) for p in points])
        if not route:
            return None
        elev = await elevation_profile(client, route["points"])
    out = {
        "distanceKm": round(route["distance_m"] / 1000, 2),
        "elevationGainM": elev["gain_m"] if elev else None,
        "elevationProfile": elev["profile"] if elev else None,
        "points": simplify(route["points"]),
    }
    _cache_set(key, out)
    return out
