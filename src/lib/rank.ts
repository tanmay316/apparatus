import type { UserStats } from '@/types';

export type RankTier = 'Beginner' | 'Novice' | 'Intermediate' | 'Advanced' | 'Elite';
export type RankTrack = 'Strength' | 'Endurance' | 'Hybrid';

export const RANK_TIERS: { name: RankTier; min: number }[] = [
  { name: 'Beginner', min: 0 },
  { name: 'Novice', min: 150 },
  { name: 'Intermediate', min: 350 },
  { name: 'Advanced', min: 600 },
  { name: 'Elite', min: 850 },
];

export interface AthleteRank {
  tier: RankTier;
  track: RankTrack | null;
  label: string;
  score: number;
  strengthScore: number;
  enduranceScore: number;
  consistencyScore: number;
  nextTier: { name: RankTier; min: number } | null;
}

const DEFAULT_BODYWEIGHT_KG = 75;

/** Share of `points` earned for reaching `value` out of `full` (sqrt makes early progress count more). */
function part(value: number, full: number, points: number, curve: 'linear' | 'sqrt' = 'linear'): number {
  const ratio = Math.min(Math.max(value, 0) / full, 1);
  return (curve === 'sqrt' ? Math.sqrt(ratio) : ratio) * points;
}

/** Strength track, 0–1000: how often, how much and how heavy you train. */
export function strengthScore(stats: Partial<UserStats>, bodyweightKg?: number | null): number {
  const bodyweight = bodyweightKg && bodyweightKg > 30 ? bodyweightKg : DEFAULT_BODYWEIGHT_KG;
  const relativeLoad = (stats.maxLiftKg || 0) / bodyweight;
  return Math.round(
    part(stats.totalWorkouts || 0, 100, 300)
    + part(stats.totalVolume || 0, 500_000, 300, 'sqrt')
    // Heaviest lift vs bodyweight, or longest hold for bodyweight/calisthenics athletes.
    + Math.max(part(relativeLoad, 2, 400), part(stats.bestHold || 0, 180, 400)),
  );
}

/** Endurance track, 0–1000: how often, how far and your longest single effort. */
export function enduranceScore(stats: Partial<UserStats>): number {
  return Math.round(
    part(stats.totalCardioSessions || 0, 100, 300)
    + part(stats.totalDistanceKm || 0, 1000, 300, 'sqrt')
    + part(stats.longestCardioKm || 0, 21.1, 400),
  );
}

export function computeAthleteRank(stats: Partial<UserStats> | null | undefined, bodyweightKg?: number | null): AthleteRank {
  const s = stats || {};
  const strength = strengthScore(s, bodyweightKg);
  const endurance = enduranceScore(s);
  const consistency = Math.round(part(s.longestStreak || 0, 30, 100));

  // Your main discipline counts fully; the other one adds a quarter, so pure
  // lifters and pure runners can both reach Elite while hybrids get a bonus.
  const primary = Math.max(strength, endurance);
  const secondary = Math.min(strength, endurance);
  const score = Math.min(1000, Math.round(primary + secondary * 0.25 + consistency));

  const tierIndex = RANK_TIERS.reduce((idx, tier, i) => (score >= tier.min ? i : idx), 0);
  const tier = RANK_TIERS[tierIndex].name;

  let track: RankTrack | null = null;
  if (primary >= 50) {
    if (secondary >= 150 && secondary >= primary * 0.6) track = 'Hybrid';
    else track = strength >= endurance ? 'Strength' : 'Endurance';
  }

  return {
    tier,
    track,
    label: track ? `${tier} · ${track}` : tier,
    score,
    strengthScore: strength,
    enduranceScore: endurance,
    consistencyScore: consistency,
    nextTier: RANK_TIERS[tierIndex + 1] || null,
  };
}

export function rankTierIndex(tier?: string | null): number {
  return Math.max(0, RANK_TIERS.findIndex(t => t.name === tier));
}

/** Maps the rank onto the legacy three-level field other screens (AI plans, Explore) read. */
export function experienceLevelFor(tier: RankTier): 'beginner' | 'intermediate' | 'advanced' {
  if (tier === 'Advanced' || tier === 'Elite') return 'advanced';
  if (tier === 'Intermediate') return 'intermediate';
  return 'beginner';
}
