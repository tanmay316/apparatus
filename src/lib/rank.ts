import type { UserStats } from '@/types';
import { SKILL_BY_ID, SKILLS, type SkillTier } from '@/data/calisthenics-curriculum';
import { LIFTS, dayNumber, recencyFactor, type LiftId } from '@/lib/performance';
import { localDateKey } from '@/lib/stats';

export type RankTier = 'Beginner' | 'Novice' | 'Developing' | 'Intermediate' | 'Advanced' | 'Expert' | 'Elite';
export type RankTrack = 'Strength' | 'Endurance' | 'Hybrid';
export type Pillar = 'strength' | 'endurance' | 'skill' | 'consistency';

export const RANK_TIERS: { name: RankTier; min: number }[] = [
  { name: 'Beginner', min: 0 },
  { name: 'Novice', min: 150 },
  { name: 'Developing', min: 300 },
  { name: 'Intermediate', min: 450 },
  { name: 'Advanced', min: 600 },
  { name: 'Expert', min: 750 },
  { name: 'Elite', min: 900 },
];

export const DIVISIONS = ['I', 'II', 'III'] as const;
export const MAX_SCORE = 1000;

/** Share of the final score: main discipline, the other discipline, skills, adherence. */
export const SCORE_WEIGHTS = { primary: 0.6, secondary: 0.2, skill: 0.1, consistency: 0.1 } as const;

export const ADHERENCE_WEEKS = 12;
export const TARGET_DAYS_PER_WEEK = 4;
const STREAK_MIN_DAYS = 2;
const DEFAULT_BODYWEIGHT_KG = 75;

export interface RankStep {
  tier: RankTier;
  division: number;
  label: string;
  min: number;
}

export interface MetricScore {
  key: string;
  label: string;
  display: string;
  score: number;
  date?: string;
}

export interface AthleteRank {
  tier: RankTier;
  division: number;
  track: RankTrack | null;
  /** e.g. "Advanced II · Strength" */
  label: string;
  score: number;
  strengthScore: number;
  enduranceScore: number;
  skillScore: number;
  consistencyScore: number;
  primary: 'strength' | 'endurance' | null;
  /** Points each pillar adds to `score`. */
  contributions: Record<Pillar, number>;
  currentStep: RankStep;
  nextStep: RankStep | null;
  nextTier: { name: RankTier; min: number } | null;
  breakdown: {
    gym: number;
    bodyweight: number;
    lifts: MetricScore[];
    bodyweightMoves: MetricScore[];
    skills: MetricScore[];
    run: number;
    cycle: number;
    walk: number;
    endurance: MetricScore[];
    adherence: number;
    weekStreak: number;
    trainingDays: number;
    /** Qualifying days per rolling week, most recent first. */
    weekCounts: number[];
  };
  bodyweightKg: number;
  bodyweightKnown: boolean;
}

export interface RankOptions {
  gender?: string | null;
  /** YYYY-MM-DD; defaults to today. Consistency and old bests are judged relative to it. */
  today?: string;
}

type Curve = [number, number][];

function curve(points: Curve, x: number): number {
  if (!Number.isFinite(x) || x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

function inverseCurve(points: Curve, y: number): number {
  if (y <= points[0][1]) return points[0][0];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (y <= y1) {
      const [x0, y0] = points[i - 1];
      return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
    }
  }
  return points[points.length - 1][0];
}

// Lift ratio divided by the lift's intermediate standard → points.
const LIFT_CURVE: Curve = [[0, 0], [0.4, 90], [0.7, 250], [1, 450], [1.2, 600], [1.4, 750], [1.6, 900], [1.8, 1000]];
/** Intermediate e1RM standards as a multiple of bodyweight (men; women scaled below). */
const LIFT_STANDARD: Record<LiftId, number> = { squat: 1.5, bench: 1.15, deadlift: 1.9, ohp: 0.75, row: 1.0 };
const FEMALE_LIFT_FACTOR: Record<LiftId, number> = { squat: 0.75, bench: 0.62, deadlift: 0.75, ohp: 0.62, row: 0.65 };

// Pull-up load factor R: 1 strict rep ≈ 1.03, 10 reps ≈ 1.33, 20 reps (or +40% BW × 5) ≈ 1.67.
const PULL_CURVE: Curve = [[1, 0], [1.033, 120], [1.167, 280], [1.333, 450], [1.5, 600], [1.667, 750], [1.833, 900], [2, 1000]];
const DIP_EASE = 0.75;
const FEMALE_BODYWEIGHT_FACTOR = 1.5;
const PUSHUP_CURVE: Curve = [[0, 0], [1, 20], [10, 120], [20, 220], [30, 300], [40, 380], [50, 440], [75, 500]];

// Endurance: running is judged on 5K-equivalent pace and longest run; cycling on speed and range;
// walking tops out at an Intermediate level on its own.
const RUN_5K_CURVE: Curve = [[5, 0], [6.67, 100], [8.57, 250], [10, 380], [11.54, 500], [13.04, 640], [14.63, 780], [16.22, 900], [18.18, 1000]];
const RUN_LONG_CURVE: Curve = [[0, 0], [3, 150], [5, 280], [10, 480], [15, 620], [21.1, 780], [30, 900], [42.2, 1000]];
const CYCLE_SPEED_CURVE: Curve = [[12, 0], [15, 100], [20, 250], [25, 450], [28, 600], [32, 780], [36, 900], [40, 1000]];
const CYCLE_LONG_CURVE: Curve = [[0, 0], [10, 100], [20, 220], [40, 420], [60, 560], [100, 750], [160, 900], [200, 1000]];
const WALK_SPEED_CURVE: Curve = [[3.5, 0], [4.5, 80], [5.5, 180], [6.5, 300], [7.5, 400]];
const WALK_LONG_CURVE: Curve = [[0, 0], [3, 50], [10, 200], [20, 330], [30, 400]];
const FEMALE_RUN_FACTOR = 1.12;
const FEMALE_CYCLE_FACTOR = 1.1;

/** Points for fully owning a skill of each curriculum tier. */
const SKILL_TIER_POINTS: Record<SkillTier, number> = { 0: 60, 1: 200, 2: 450, 3: 720, 4: 1000 };

const clamp = (n: number) => Math.max(0, Math.min(MAX_SCORE, Math.round(n)));
const isFemale = (gender?: string | null) => gender?.toLowerCase() === 'female';

/** Best result counts most, but breadth across the top three still matters. */
function blend(scores: number[], bestShare = 0.6): number {
  const sorted = [...scores].sort((a, b) => b - a);
  const top3 = [0, 1, 2].map(i => sorted[i] || 0);
  return (sorted[0] || 0) * bestShare + (top3.reduce((a, b) => a + b, 0) / 3) * (1 - bestShare);
}

/** Two sub-scores → the stronger one plus a bonus from the weaker. */
const combine = (a: number, b: number, bonus: number) => Math.max(a, b) + bonus * Math.min(a, b);

export function skillPoints(skillId: string, share: number): number {
  const skill = SKILL_BY_ID[skillId];
  if (!skill || share <= 0) return 0;
  const f = Math.min(1, share);
  const full = SKILL_TIER_POINTS[skill.tier];
  if (skill.tier === 0) return f * full;
  // Starting a harder skill is worth a bit less than owning the tier below it.
  const floor = SKILL_TIER_POINTS[(skill.tier - 1) as SkillTier] * 0.8;
  return floor + f * (full - floor);
}

const formatNumber = (n: number, digits = 1) => (Math.round(n * 10 ** digits) / 10 ** digits).toString();

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Pull/dip load factor shown as strict reps, or added weight once reps alone can't express it. */
function describeBodyweightLoad(r: number): string {
  const reps = Math.round((r - 1) * 30);
  if (reps <= 1) return '1 strict rep';
  if (reps <= 30) return `${reps} strict reps`;
  const added = Math.round((r / (1 + 5 / 30) - 1) * 100);
  return `+${added}% BW × 5`;
}

function stepsFor(tierIndex: number): RankStep[] {
  const tier = RANK_TIERS[tierIndex];
  const top = RANK_TIERS[tierIndex + 1]?.min ?? MAX_SCORE + 1;
  const size = (top - tier.min) / DIVISIONS.length;
  return DIVISIONS.map((roman, i) => ({
    tier: tier.name,
    division: i + 1,
    label: `${tier.name} ${roman}`,
    min: tier.min + Math.ceil(i * size),
  }));
}

/** All 21 steps of the ladder, lowest first. */
export const RANK_STEPS: RankStep[] = RANK_TIERS.flatMap((_, i) => stepsFor(i));

export function rankStepIndex(tier?: string | null, division?: number | null): number {
  const i = RANK_STEPS.findIndex(s => s.tier === tier && s.division === (division || 1));
  return Math.max(0, i);
}

export function computeAthleteRank(
  stats: Partial<UserStats> | null | undefined,
  bodyweightKg?: number | null,
  options: RankOptions = {},
): AthleteRank {
  const s = stats || {};
  const today = options.today || localDateKey();
  const female = isFemale(options.gender);
  const bodyweightKnown = !!bodyweightKg && bodyweightKg > 30;
  const bodyweight = bodyweightKnown ? bodyweightKg! : DEFAULT_BODYWEIGHT_KG;
  const perf = s.performance || {};
  const best = (key: string) => {
    const p = perf[key];
    return p ? { value: p.v * recencyFactor(p.d, today), date: p.d } : null;
  };

  // ─── Strength: gym lifts vs bodyweight + bodyweight strength ───
  const lifts: MetricScore[] = [];
  for (const lift of LIFTS) {
    const b = best(`lift:${lift.id}`);
    if (!b) continue;
    const ratio = b.value / bodyweight;
    const standard = LIFT_STANDARD[lift.id] * (female ? FEMALE_LIFT_FACTOR[lift.id] : 1);
    lifts.push({
      key: lift.id,
      label: lift.label,
      display: `${Math.round(b.value)} kg e1RM · ${formatNumber(ratio, 2)}× BW`,
      score: clamp(curve(LIFT_CURVE, ratio / standard)),
      date: b.date,
    });
  }

  const bodyweightMoves: MetricScore[] = [];
  const pull = best('bw:pull');
  if (pull) {
    const r = female ? 1 + (pull.value - 1) * FEMALE_BODYWEIGHT_FACTOR : pull.value;
    bodyweightMoves.push({ key: 'pull', label: 'Pull-Ups', display: describeBodyweightLoad(pull.value), score: clamp(curve(PULL_CURVE, r)), date: pull.date });
  }
  const dip = best('bw:dip');
  if (dip) {
    const r = 1 + (dip.value - 1) * DIP_EASE * (female ? FEMALE_BODYWEIGHT_FACTOR : 1);
    bodyweightMoves.push({ key: 'dip', label: 'Dips', display: describeBodyweightLoad(dip.value), score: clamp(curve(PULL_CURVE, r)), date: dip.date });
  }
  const pushup = best('bw:pushup');
  if (pushup) {
    const reps = pushup.value * (female ? 1.6 : 1);
    bodyweightMoves.push({ key: 'pushup', label: 'Push-Ups', display: `${Math.round(pushup.value)} reps in a set`, score: clamp(curve(PUSHUP_CURVE, reps)), date: pushup.date });
  }

  const gym = clamp(blend(lifts.map(l => l.score)));
  const bodyweightScore = clamp(blend(bodyweightMoves.map(m => m.score)));
  const strength = clamp(combine(gym, bodyweightScore, 0.2));

  // ─── Skill: hardest calisthenics skills shown in logs or the Skills tutor ───
  const skillShares: Record<string, { share: number; date?: string }> = {};
  for (const [key, p] of Object.entries(perf)) {
    if (!key.startsWith('skill:')) continue;
    const id = key.slice(6);
    skillShares[id] = { share: p.v * recencyFactor(p.d, today), date: p.d };
  }
  for (const [id, share] of Object.entries(s.tutorSkills || {})) {
    if ((skillShares[id]?.share || 0) < share) skillShares[id] = { share };
  }
  const skills: MetricScore[] = Object.entries(skillShares)
    .filter(([id]) => SKILL_BY_ID[id])
    .map(([id, { share, date }]) => ({
      key: id,
      label: SKILL_BY_ID[id].name,
      display: share >= 0.999 ? 'Owned' : `${Math.round(share * 100)}% of the progression`,
      score: clamp(skillPoints(id, share)),
      date,
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);
  const skillSorted = skills.map(m => m.score);
  const skill = clamp((skillSorted[0] || 0) * 0.7 + ((skillSorted[1] || 0) + (skillSorted[2] || 0) + (skillSorted[3] || 0)) / 3 * 0.3);

  // ─── Endurance: each modality judged on its own standards ───
  const endurance: MetricScore[] = [];
  const run5k = best('run:5k');
  const runLong = best('run:long');
  const runPace = run5k ? clamp(curve(RUN_5K_CURVE, run5k.value * (female ? FEMALE_RUN_FACTOR : 1))) : 0;
  const runDistance = runLong ? clamp(curve(RUN_LONG_CURVE, runLong.value)) : 0;
  if (run5k) endurance.push({ key: 'run:5k', label: 'Running pace', display: `5K ≈ ${formatClock(5 / run5k.value * 3600)}`, score: runPace, date: run5k.date });
  if (runLong) endurance.push({ key: 'run:long', label: 'Longest run', display: `${formatNumber(runLong.value)} km`, score: runDistance, date: runLong.date });
  const run = clamp(runPace * 0.65 + runDistance * 0.35);

  const cycleSpeed = best('cycle:speed');
  const cycleLong = best('cycle:long');
  const ridePace = cycleSpeed ? clamp(curve(CYCLE_SPEED_CURVE, cycleSpeed.value * (female ? FEMALE_CYCLE_FACTOR : 1))) : 0;
  const rideDistance = cycleLong ? clamp(curve(CYCLE_LONG_CURVE, cycleLong.value)) : 0;
  if (cycleSpeed) endurance.push({ key: 'cycle:speed', label: 'Cycling speed', display: `${formatNumber(cycleSpeed.value)} km/h avg (10 km+)`, score: ridePace, date: cycleSpeed.date });
  if (cycleLong) endurance.push({ key: 'cycle:long', label: 'Longest ride', display: `${formatNumber(cycleLong.value)} km`, score: rideDistance, date: cycleLong.date });
  const cycle = clamp(ridePace * 0.55 + rideDistance * 0.45);

  const walkSpeed = best('walk:speed');
  const walkLong = best('walk:long');
  const walkPace = walkSpeed ? clamp(curve(WALK_SPEED_CURVE, walkSpeed.value)) : 0;
  const walkDistance = walkLong ? clamp(curve(WALK_LONG_CURVE, walkLong.value)) : 0;
  if (walkSpeed) endurance.push({ key: 'walk:speed', label: 'Walking pace', display: `${formatNumber(walkSpeed.value)} km/h avg (2 km+)`, score: walkPace, date: walkSpeed.date });
  if (walkLong) endurance.push({ key: 'walk:long', label: 'Longest walk', display: `${formatNumber(walkLong.value)} km`, score: walkDistance, date: walkLong.date });
  const walk = clamp(walkPace * 0.5 + walkDistance * 0.5);

  const modalities = [run, cycle, walk].sort((a, b) => b - a);
  const enduranceScore = clamp(modalities[0] + 0.15 * modalities[1]);

  // ─── Consistency: adherence over the last 12 weeks + weekly streak ───
  const todayNum = dayNumber(today);
  const weekCounts = Array.from({ length: ADHERENCE_WEEKS }, () => 0);
  let trainingDays = 0;
  for (const day of new Set(s.recentTrainingDays || [])) {
    const age = todayNum - dayNumber(day);
    if (age < 0 || age >= ADHERENCE_WEEKS * 7) continue;
    weekCounts[Math.floor(age / 7)]++;
    trainingDays++;
  }
  const adherence = weekCounts.reduce((sum, c) => sum + Math.min(c, TARGET_DAYS_PER_WEEK), 0) / (ADHERENCE_WEEKS * TARGET_DAYS_PER_WEEK);
  // The current rolling week gets grace until it's over.
  let weekStreak = 0;
  for (let i = weekCounts[0] >= STREAK_MIN_DAYS ? 0 : 1; i < ADHERENCE_WEEKS && weekCounts[i] >= STREAK_MIN_DAYS; i++) weekStreak++;
  const consistency = clamp(MAX_SCORE * (0.7 * adherence + 0.3 * weekStreak / ADHERENCE_WEEKS));

  // ─── Overall ───
  const strengthLeads = strength >= enduranceScore;
  const primaryScore = Math.max(strength, enduranceScore);
  const secondaryScore = Math.min(strength, enduranceScore);
  const contributions: Record<Pillar, number> = {
    strength: strength * (strengthLeads ? SCORE_WEIGHTS.primary : SCORE_WEIGHTS.secondary),
    endurance: enduranceScore * (strengthLeads ? SCORE_WEIGHTS.secondary : SCORE_WEIGHTS.primary),
    skill: skill * SCORE_WEIGHTS.skill,
    consistency: consistency * SCORE_WEIGHTS.consistency,
  };
  const score = clamp(contributions.strength + contributions.endurance + contributions.skill + contributions.consistency);
  for (const key of Object.keys(contributions) as Pillar[]) contributions[key] = Math.round(contributions[key]);

  const tierIndex = RANK_TIERS.reduce((idx, tier, i) => (score >= tier.min ? i : idx), 0);
  const steps = stepsFor(tierIndex);
  const currentStep = steps.reduce((cur, step) => (score >= step.min ? step : cur), steps[0]);
  const nextStep = RANK_STEPS[RANK_STEPS.findIndex(st => st.label === currentStep.label) + 1] || null;

  let track: RankTrack | null = null;
  if (primaryScore >= 50) {
    if (secondaryScore >= 300 && secondaryScore >= primaryScore * 0.6) track = 'Hybrid';
    else track = strengthLeads ? 'Strength' : 'Endurance';
  }

  return {
    tier: currentStep.tier,
    division: currentStep.division,
    track,
    label: track ? `${currentStep.label} · ${track}` : currentStep.label,
    score,
    strengthScore: strength,
    enduranceScore,
    skillScore: skill,
    consistencyScore: consistency,
    primary: primaryScore > 0 ? (strengthLeads ? 'strength' : 'endurance') : null,
    contributions,
    currentStep,
    nextStep,
    nextTier: RANK_TIERS[tierIndex + 1] || null,
    breakdown: {
      gym,
      bodyweight: bodyweightScore,
      lifts: lifts.sort((a, b) => b.score - a.score),
      bodyweightMoves: bodyweightMoves.sort((a, b) => b.score - a.score),
      skills,
      run,
      cycle,
      walk,
      endurance,
      adherence,
      weekStreak,
      trainingDays,
      weekCounts,
    },
    bodyweightKg: bodyweight,
    bodyweightKnown,
  };
}

export interface PillarBenchmarks {
  gym: string;
  bodyweight: string;
  run: string;
  cycle: string;
  skill: string;
  consistency: string;
}

/** What it takes for a single pillar to reach `score`: each line is one way to get there. */
export function pillarBenchmarks(score: number, gender?: string | null): PillarBenchmarks {
  const female = isFemale(gender);
  const liftRatio = (id: LiftId) => inverseCurve(LIFT_CURVE, score) * LIFT_STANDARD[id] * (female ? FEMALE_LIFT_FACTOR[id] : 1);
  const r = inverseCurve(PULL_CURVE, score);
  const pullR = female ? 1 + (r - 1) / FEMALE_BODYWEIGHT_FACTOR : r;
  const dipR = 1 + (r - 1) / (DIP_EASE * (female ? FEMALE_BODYWEIGHT_FACTOR : 1));
  const runKmh = inverseCurve(RUN_5K_CURVE, score) / (female ? FEMALE_RUN_FACTOR : 1);
  const rideKmh = inverseCurve(CYCLE_SPEED_CURVE, score) / (female ? FEMALE_CYCLE_FACTOR : 1);

  const tier = ([0, 1, 2, 3, 4] as SkillTier[]).find(t => SKILL_TIER_POINTS[t] >= score * 0.95) ?? 4;
  const examples = SKILLS.filter(sk => sk.tier === tier).slice(0, 3).map(sk => sk.name).join(', ');
  const partial = score < SKILL_TIER_POINTS[tier] * 0.95;

  const ratio = (n: number) => `${formatNumber(n, 2)}×`;
  const daysPerWeek = formatNumber(TARGET_DAYS_PER_WEEK * score / MAX_SCORE);
  const weeks = Math.round(ADHERENCE_WEEKS * score / MAX_SCORE);

  return {
    gym: `Squat ${ratio(liftRatio('squat'))} · Bench ${ratio(liftRatio('bench'))} · Deadlift ${ratio(liftRatio('deadlift'))} BW`,
    bodyweight: `Pull-ups ${describeBodyweightLoad(pullR)} · Dips ${describeBodyweightLoad(dipR)}`,
    run: `5K in ${formatClock(5 / runKmh * 3600)} + ${formatNumber(inverseCurve(RUN_LONG_CURVE, score))} km long run`,
    cycle: `${formatNumber(rideKmh)} km/h avg + ${Math.round(inverseCurve(CYCLE_LONG_CURVE, score))} km ride`,
    skill: `${partial ? 'Progressing' : 'Owning'} ${examples}`,
    consistency: `${daysPerWeek} training days/week, ${weeks}-week streak`,
  };
}

/** Maps the rank onto the legacy three-level field other screens (AI plans, Explore) read. */
export function experienceLevelFor(tier: RankTier): 'beginner' | 'intermediate' | 'advanced' {
  if (tier === 'Advanced' || tier === 'Expert' || tier === 'Elite') return 'advanced';
  if (tier === 'Intermediate' || tier === 'Developing') return 'intermediate';
  return 'beginner';
}
