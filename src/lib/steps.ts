import type { CardioActivityType } from '@/types';

export type StepSource = 'native' | 'motion_estimate' | 'gps_estimate' | 'none';

export interface StrideProfile {
  heightCm?: number | null;
  gender?: string | null;
}

export interface PauseSpan {
  start: number;
  /** null while the pause is still running. */
  end: number | null;
}

const DEFAULT_HEIGHT_CM = 170;

function heightOf(p?: StrideProfile) {
  const h = Number(p?.heightCm);
  return Number.isFinite(h) && h >= 120 && h <= 230 ? h : DEFAULT_HEIGHT_CM;
}

/**
 * Step length in metres. Walking scales with height (~0.414 × height) and mildly with speed;
 * running uses speed-dependent cadence (≈155 spm at 8 km/h → ≈178 spm at 15 km/h), since stride,
 * not cadence, is what grows as runners speed up.
 */
export function stepLengthMeters(type: 'walk' | 'run', speedKmh: number | null | undefined, profile?: StrideProfile): number {
  const heightM = heightOf(profile) / 100;
  const female = /^f/i.test(profile?.gender || '');
  if (type === 'walk') {
    const v = speedKmh && speedKmh > 1 ? Math.min(8, speedKmh) : 5;
    const base = heightM * (female ? 0.413 : 0.415);
    return base * Math.min(1.2, Math.max(0.8, Math.pow(v / 5, 0.4)));
  }
  const v = speedKmh && speedKmh > 4 ? Math.min(25, speedKmh) : 10;
  const cadence = (130 + 3.2 * v) * Math.pow(1.7 / heightM, 0.3);
  return (v * 1000 / 60) / cadence;
}

/** Distance-based step estimate, used only when no pedometer reading exists. */
export function estimateSteps(type: CardioActivityType | null, distanceKm: number, movingSec?: number, profile?: StrideProfile): number | undefined {
  if (type !== 'walk' && type !== 'run') return undefined;
  if (!(distanceKm > 0.01)) return 0;
  const speedKmh = movingSec && movingSec > 30 ? distanceKm / (movingSec / 3600) : null;
  return Math.round((distanceKm * 1000) / stepLengthMeters(type, speedKmh, profile));
}

/** Time ranges between the session start and `until` that are not inside a manual pause. */
export function activeSegments(startedAt: number, pauses: PauseSpan[], until: number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = startedAt;
  for (const p of [...pauses].sort((a, b) => a.start - b.start)) {
    const start = Math.max(cursor, Math.min(p.start, until));
    if (start > cursor) out.push([cursor, start]);
    const end = p.end == null ? until : Math.min(p.end, until);
    cursor = Math.max(cursor, end);
    if (cursor >= until) break;
  }
  if (cursor < until) out.push([cursor, until]);
  return out;
}

/**
 * Plausibility check for a pedometer total. A phone in a bag on a stroller or bike mount barely
 * registers steps, so a count far below what the GPS distance implies is not trusted.
 */
export function isPlausiblePedometerCount(type: 'walk' | 'run', steps: number, distanceKm: number, movingSec?: number, profile?: StrideProfile) {
  if (distanceKm < 0.5) return true;
  const expected = estimateSteps(type, distanceKm, movingSec, profile) || 0;
  return steps >= expected * 0.25;
}

/**
 * Steps covered while the pedometer stream was not delivering (app killed or backgrounded on
 * Android), extrapolated with the stride this session actually measured when there is enough of it.
 */
export function gapSteps(opts: {
  type: 'walk' | 'run';
  measuredSteps: number;
  measuredDistanceKm: number;
  gapDistanceKm: number;
  movingSec?: number;
  profile?: StrideProfile;
}): number {
  if (!(opts.gapDistanceKm > 0.02)) return 0;
  const measuredStride = opts.measuredSteps >= 150 && opts.measuredDistanceKm >= 0.1
    ? (opts.measuredDistanceKm * 1000) / opts.measuredSteps
    : null;
  const stride = measuredStride && measuredStride > 0.3 && measuredStride < 2.2
    ? measuredStride
    : stepLengthMeters(opts.type, null, opts.profile);
  return Math.round((opts.gapDistanceKm * 1000) / stride);
}
