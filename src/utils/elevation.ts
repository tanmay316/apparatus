/**
 * Robust elevation-gain computation for noisy altitude series (GPS or DEM).
 *
 * GPS altitude jitters by ±5–15 m even when standing still, so naive
 * "sum every rise" accumulates phantom climb on flat ground. This:
 *  1. Smooths altitude over a horizontal-distance window (moving average).
 *  2. Returns 0 when the smoothed profile's total range is within the noise
 *     floor (the terrain is effectively flat).
 *  3. Counts climbs with hysteresis: only rises of >= `thresholdM` above the
 *     running low anchor are added.
 *  4. Rejects physically implausible jumps (grade steeper than `maxGrade`).
 */
export interface AltSample {
  alt: number;
  /** Cumulative horizontal distance in metres. */
  distM: number;
}

export interface ElevationGainOptions {
  thresholdM?: number;
  smoothWindowM?: number;
  flatRangeM?: number;
  maxGrade?: number;
}

export function smoothAltitudes(samples: AltSample[], windowM: number): number[] {
  const out: number[] = new Array(samples.length);
  const half = windowM / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i].distM;
    while (hi < samples.length && samples[hi].distM <= d + half) sum += samples[hi++].alt;
    while (samples[lo].distM < d - half) sum -= samples[lo++].alt;
    out[i] = sum / (hi - lo);
  }
  return out;
}

export function computeElevationGain(samples: AltSample[], opts: ElevationGainOptions = {}): number {
  const { thresholdM = 4, smoothWindowM = 60, flatRangeM = 6, maxGrade = 0.35 } = opts;
  const valid = samples.filter(s => Number.isFinite(s.alt) && Number.isFinite(s.distM));
  if (valid.length < 2) return 0;

  const smoothed = smoothAltitudes(valid, smoothWindowM);
  const min = Math.min(...smoothed);
  const max = Math.max(...smoothed);
  if (max - min < flatRangeM) return 0;

  let gain = 0;
  let anchor = smoothed[0];
  let anchorDist = valid[0].distM;
  for (let i = 1; i < smoothed.length; i++) {
    const diff = smoothed[i] - anchor;
    const run = Math.max(1, valid[i].distM - anchorDist);
    if (diff >= thresholdM) {
      if (diff / run <= maxGrade) gain += diff;
      anchor = smoothed[i];
      anchorDist = valid[i].distM;
    } else if (diff <= -thresholdM) {
      anchor = smoothed[i];
      anchorDist = valid[i].distM;
    }
  }

  // A route cannot climb more than it travels at the max plausible grade.
  const totalDist = valid[valid.length - 1].distM - valid[0].distM;
  return Math.max(0, Math.min(gain, totalDist * maxGrade));
}
