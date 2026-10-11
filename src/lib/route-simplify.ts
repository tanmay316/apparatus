import type { RoutePoint } from '@/types';

/** Indices kept by Ramer-Douglas-Peucker at `toleranceM` (metres, local equirectangular projection). */
function rdpKeep(xs: Float64Array, ys: Float64Array, toleranceM: number): Uint8Array {
  const n = xs.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tol2 = toleranceM * toleranceM;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const end = stack.pop()!;
    const start = stack.pop()!;
    const ax = xs[start], ay = ys[start];
    const dx = xs[end] - ax, dy = ys[end] - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      let px = xs[i] - ax, py = ys[i] - ay;
      if (len2 > 0) {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        px -= t * dx;
        py -= t * dy;
      }
      const d = px * px + py * py;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push(start, idx, idx, end);
    }
  }
  return keep;
}

/**
 * Shrinks a route to at most `maxPoints` while keeping its shape: corners and curves always keep
 * their points (RDP from 0.5 m), and the remaining budget is spread evenly over time.
 */
export function simplifyRoute(points: RoutePoint[], maxPoints = 1000): RoutePoint[] {
  if (!points || points.length <= maxPoints) return points || [];
  const n = points.length;
  const lat0 = points[0].lat * Math.PI / 180;
  const mPerLng = 111_320 * Math.cos(lat0);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i].lng * mPerLng;
    ys[i] = points[i].lat * 110_540;
  }
  const count = (k: Uint8Array) => k.reduce((s, v) => s + v, 0);

  let lo = 0.5;
  let hi = 100;
  let best = rdpKeep(xs, ys, lo);
  if (count(best) > maxPoints) {
    best = rdpKeep(xs, ys, hi);
    for (let iter = 0; iter < 14; iter++) {
      const mid = (lo + hi) / 2;
      const k = rdpKeep(xs, ys, mid);
      if (count(k) <= maxPoints) { best = k; hi = mid; } else lo = mid;
    }
  }
  // Spend the leftover budget on evenly spaced fixes so pace/split timing stays dense on straights.
  const spare = maxPoints - count(best);
  if (spare > 0) {
    const step = n / spare;
    for (let j = 0; j < spare; j++) best[Math.min(n - 1, Math.floor(j * step))] = 1;
  }
  const out: RoutePoint[] = [];
  for (let i = 0; i < n; i++) if (best[i]) out.push(points[i]);
  return out.length <= maxPoints ? out : out.filter((_, i) => i % Math.ceil(out.length / maxPoints) === 0 || i === out.length - 1);
}
