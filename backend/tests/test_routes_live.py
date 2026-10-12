"""Live check of the route planner (hits the public routing + elevation services).

Run: cd backend; ./venv/Scripts/python tests/test_routes_live.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import routes as planner  # noqa: E402


def check(name, ok, info=""):
    print(f"{'PASS' if ok else 'FAIL'} | {name} {info}")
    return ok


async def main():
    ok = True
    # Pure helpers
    lat, lng = planner.destination(18.52, 73.85, 90, 1000)
    ok &= check("destination east 1 km", abs(lat - 18.52) < 1e-3 and 0.009 < lng - 73.85 < 0.0099, f"{lat:.5f},{lng:.5f}")
    zig = [[18.52, 73.85 + i * 1e-5] for i in range(500)] + [[18.52 + i * 1e-5, 73.855] for i in range(500)]
    s = planner.simplify(zig, 100)
    ok &= check("simplify keeps corner", len(s) <= 100 and any(abs(p[1] - 73.855) < 1e-4 and abs(p[0] - 18.52) < 1e-4 for p in s), f"{len(s)} pts")

    # Live services (Pune)
    loops = await planner.suggest_loops(18.5204, 73.8567, 5, "run", seed=1)
    ok &= check("suggest returns loops", len(loops) >= 1, f"{[l['distanceKm'] for l in loops]}")
    for l in loops:
        ok &= check(f"  {l['name']} near 5 km", 3.5 <= l["distanceKm"] <= 6.5, f"{l['distanceKm']} km, gain {l['elevationGainM']} m, {len(l['points'])} pts")
        first, last = l["points"][0], l["points"][-1]
        ok &= check("  starts/ends at start", planner._haversine_m(first, last) < 300)
    snap = await planner.snap_route([[18.5204, 73.8567], [18.5304, 73.8467]], "walk")
    ok &= check("snap follows paths", bool(snap) and snap["distanceKm"] > 1.3, f"{snap and snap['distanceKm']} km")
    print("ALL OK" if ok else "SOME FAILED")
    return ok


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(main()) else 1)
