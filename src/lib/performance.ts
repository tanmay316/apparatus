import type { CardioActivity, PerformanceBest, Workout } from '@/types';

/**
 * Best single-session performances used by the athlete rank. Every metric is
 * "higher is better" so bests can be merged with a plain comparison.
 *
 *  lift:<id>   estimated 1RM in kg (Epley, sets of 1–12 reps)
 *  bw:pull/dip total load relative to bodyweight × rep factor (1 strict rep ≈ 1.03)
 *  bw:pushup   max reps in one set
 *  skill:<id>  share (0–1) of a calisthenics-curriculum skill shown in a logged set
 *  run:5k      5K-equivalent speed in km/h (Riegel), run:long longest run in km
 *  cycle:speed avg km/h on rides ≥ 10 km, cycle:long longest ride in km
 *  walk:speed  avg km/h on walks ≥ 2 km, walk:long longest walk in km
 */
export type SessionMetrics = Record<string, number>;

const DEFAULT_BODYWEIGHT_KG = 75;
const MAX_REPS_FOR_1RM = 12;
const MAX_BODYWEIGHT_REPS = 30;

export const LIFTS = [
  { id: 'squat', label: 'Back Squat' },
  { id: 'bench', label: 'Bench Press' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead Press' },
  { id: 'row', label: 'Barbell Row' },
] as const;
export type LiftId = typeof LIFTS[number]['id'];

const normalise = (name: string) => ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

const ASSISTED = /\b(assisted|band|banded|negative|negatives|eccentric|machine|jumping|kipping)\b/;

interface LiftPattern { id: LiftId; match: RegExp; exclude: RegExp; factor?: number }

const LIFT_PATTERNS: LiftPattern[] = [
  // Front squats are ~85% of a back squat.
  { id: 'squat', match: /\bfront squats?\b/, exclude: /\b(dumbbell|db|kettlebell|kb|smith|machine|goblet)\b/, factor: 1 / 0.85 },
  { id: 'squat', match: /\bsquats?\b/, exclude: /\b(goblet|split|bulgarian|pistol|shrimp|jump|jumping|air|bodyweight|body weight|sissy|hack|press|box|wall|cossack|overhead|zercher|belt|smith|machine|dumbbell|db|kettlebell|kb|sumo|pause|paused|front|skater|prisoner)\b/ },
  { id: 'bench', match: /\bbench( press)?\b/, exclude: /\b(dumbbell|db|incline|decline|machine|smith|close|floor|dip|dips|pin|board|jump|step|leg|hip|thrust|row)\b/ },
  { id: 'deadlift', match: /\bdead ?lifts?\b/, exclude: /\b(romanian|rdl|stiff|straight|single|one|dumbbell|db|kettlebell|kb|deficit|snatch|rack|block|trap|hex|jefferson|suitcase|stance|smith|machine)\b/ },
  { id: 'ohp', match: /\b(overhead press|ohp|military press|strict press|standing press|barbell shoulder press)\b/, exclude: /\b(dumbbell|db|machine|smith|kettlebell|kb|landmine|push press|arnold)\b/ },
  { id: 'row', match: /\b(barbell row|barbell rows|bent over rows?|pendlay rows?|bb rows?)\b/, exclude: /\b(dumbbell|db|cable|machine|seal|t bar|inverted|ring|bodyweight|upright|smith)\b/ },
];

const PULL = /\b(pull ?ups?|chin ?ups?)\b/;
const PULL_EXCLUDE = /\b(australian|inverted|lat|butterfly|archer|l sit|one arm|single arm|1 arm|typewriter|commando|scap|scapular)\b/;
const DIP = /\bdips?\b/;
const DIP_EXCLUDE = /\b(bench|chair|ring|rings|korean|straight bar|russian|tricep machine)\b/;
const PUSHUP = /\bpush ?ups?\b/;
const PUSHUP_EXCLUDE = /\b(knee|knees|incline|wall|pike|diamond|archer|one arm|single arm|planche|handstand|decline|clap|hindu|spiderman|pseudo|ring|typewriter)\b/;

interface SkillPattern {
  id: string;
  match: RegExp;
  exclude?: RegExp;
  unit: 'reps' | 'sec';
  /** Minimum reps/seconds for the set to count at all. */
  min: number;
  /** Reps/seconds that count as owning this variation. */
  full: number;
  /** Tuck / straddle variations scale down how much of the skill is shown. */
  progressions?: boolean;
}

// Ordered: the first match wins, so specific variations come before generic names.
const SKILL_PATTERNS: SkillPattern[] = [
  { id: 'ring_muscle_up', match: /\bring muscle ?ups?\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'muscle_up', match: /\bmuscle ?ups?\b/, exclude: /\b(transition|ring)\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'planche_push_up', match: /\bplanche push ?ups?\b/, exclude: /\bpseudo\b/, unit: 'reps', min: 1, full: 5, progressions: true },
  { id: 'planche', match: /\bplanche\b/, exclude: /\b(pseudo|lean|leans|push)\b/, unit: 'sec', min: 3, full: 10, progressions: true },
  { id: 'maltese', match: /\bmaltese\b/, unit: 'sec', min: 2, full: 8, progressions: true },
  { id: 'front_lever', match: /\bfront lever\b/, exclude: /\b(raise|raises|row|rows|pull|pulls)\b/, unit: 'sec', min: 3, full: 10, progressions: true },
  { id: 'back_lever', match: /\bback lever\b/, exclude: /\b(skin the cat|german hang)\b/, unit: 'sec', min: 3, full: 10, progressions: true },
  { id: 'human_flag', match: /\b(human flag|flag hold)\b/, unit: 'sec', min: 3, full: 10, progressions: true },
  { id: 'free_hspu', match: /\b(free ?standing|free) (handstand push ?ups?|hspu)\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'hspu', match: /\b(handstand push ?ups?|hspu)\b/, exclude: /\bpike\b/, unit: 'reps', min: 1, full: 8 },
  { id: 'one_arm_handstand', match: /\b(one arm|single arm|1 arm) handstand\b/, unit: 'sec', min: 3, full: 10 },
  { id: 'handstand_walk', match: /\bhandstand walk(s|ing)?\b/, unit: 'reps', min: 3, full: 20 },
  { id: 'press_handstand', match: /\bpress (to )?handstand\b/, unit: 'reps', min: 1, full: 3 },
  { id: 'wall_handstand', match: /\b(wall handstand|handstand (against|on) (the )?wall|chest to wall|wall walk)\b/, unit: 'sec', min: 20, full: 60 },
  { id: 'free_handstand', match: /\bhandstand\b/, exclude: /\b(wall|push|pushup|walk|shoulder tap|shoulder taps)\b/, unit: 'sec', min: 10, full: 60 },
  { id: 'one_arm_pull_up', match: /\b(one arm|single arm|1 arm) (pull|chin) ?ups?\b/, unit: 'reps', min: 1, full: 3 },
  { id: 'one_arm_push_up', match: /\b(one arm|single arm|1 arm) push ?ups?\b/, exclude: /\b(incline|elevated)\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'archer_pull_up', match: /\barcher (pull|chin) ?ups?\b/, unit: 'reps', min: 1, full: 8 },
  { id: 'l_sit_pull_up', match: /\bl sit (pull|chin) ?ups?\b/, unit: 'reps', min: 1, full: 10 },
  { id: 'ring_dips', match: /\bring dips?\b/, unit: 'reps', min: 1, full: 10 },
  { id: 'manna', match: /\bmanna\b/, unit: 'sec', min: 2, full: 8 },
  { id: 'v_sit', match: /\bv sit\b/, unit: 'sec', min: 3, full: 10 },
  { id: 'l_sit', match: /\bl sit\b/, unit: 'sec', min: 10, full: 30 },
  { id: 'dragon_flag', match: /\bdragon flags?\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'nordic_curl', match: /\bnordic (curls?|hamstring curls?)\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'pistol_squat', match: /\bpistol( squats?)?\b/, exclude: /\bbox\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'shrimp_squat', match: /\bshrimp squats?\b/, unit: 'reps', min: 1, full: 5 },
  { id: 'elbow_lever', match: /\belbow lever\b/, unit: 'sec', min: 5, full: 20 },
];

function progressionShare(name: string): number {
  if (/\badv(anced)? tuck\b/.test(name)) return 0.45;
  if (/\btuck\b/.test(name)) return 0.25;
  if (/\b(one leg|single leg|half lay|half)\b/.test(name)) return 0.6;
  if (/\bstraddle\b/.test(name)) return 0.75;
  return 1;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function keepBest(metrics: SessionMetrics, key: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) return;
  metrics[key] = Math.max(metrics[key] || 0, round3(value));
}

export function matchLift(exerciseName: string): { id: LiftId; factor: number } | null {
  const name = normalise(exerciseName);
  if (ASSISTED.test(name)) return null;
  const hit = LIFT_PATTERNS.find(p => p.match.test(name) && !p.exclude.test(name));
  return hit ? { id: hit.id, factor: hit.factor || 1 } : null;
}

export function matchSkill(exerciseName: string): SkillPattern | null {
  const name = normalise(exerciseName);
  if (ASSISTED.test(name)) return null;
  return SKILL_PATTERNS.find(p => p.match.test(name) && !p.exclude?.test(name)) || null;
}

/** Epley estimate of a one-rep max. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps < 1 || reps > MAX_REPS_FOR_1RM) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Bodyweight-relative pull/dip strength: (bodyweight + added) / bodyweight × rep factor. */
export function relativeBodyweightLoad(reps: number, addedKg: number, bodyweightKg: number): number {
  if (reps < 1) return 0;
  // Some people log their own bodyweight as the load on a strict pull-up.
  const added = Math.abs(addedKg - bodyweightKg) <= 3 ? 0 : Math.max(0, addedKg);
  return Math.min(2.4, (1 + added / bodyweightKg) * (1 + Math.min(reps, MAX_BODYWEIGHT_REPS) / 30));
}

export function workoutMetrics(workout: Pick<Workout, 'exercises' | 'bodyweight'>): SessionMetrics {
  const bodyweight = workout.bodyweight && workout.bodyweight > 30 ? workout.bodyweight : DEFAULT_BODYWEIGHT_KG;
  const metrics: SessionMetrics = {};

  for (const exercise of workout.exercises || []) {
    const sets = (exercise.sets || []).filter(set => set.completed !== false);
    if (!sets.length || !exercise.name) continue;
    const name = normalise(exercise.name);

    const skill = matchSkill(exercise.name);
    if (skill) {
      const share = skill.progressions ? progressionShare(name) : 1;
      for (const set of sets) {
        const reps = Number(set.reps) || 0;
        const seconds = Number(set.seconds) || 0;
        // A hold logged as reps only still proves the position was held.
        const value = skill.unit === 'sec' ? (seconds || (reps >= 1 ? skill.min : 0)) : reps;
        if (value < skill.min) continue;
        keepBest(metrics, `skill:${skill.id}`, share * Math.min(1, 0.5 + 0.5 * value / skill.full));
      }
      continue;
    }

    const lift = matchLift(exercise.name);
    if (lift) {
      for (const set of sets) {
        const e1rm = estimateOneRepMax(Number(set.weight) || 0, Number(set.reps) || 0) * lift.factor;
        // Ignore obvious entry mistakes (e.g. lb typed as kg twice over).
        if (e1rm > bodyweight * 4.5) continue;
        keepBest(metrics, `lift:${lift.id}`, e1rm);
      }
      continue;
    }

    if (ASSISTED.test(name)) continue;
    const kind = PULL.test(name) && !PULL_EXCLUDE.test(name) ? 'pull'
      : DIP.test(name) && !DIP_EXCLUDE.test(name) ? 'dip'
      : PUSHUP.test(name) && !PUSHUP_EXCLUDE.test(name) ? 'pushup'
      : null;
    if (!kind) continue;
    for (const set of sets) {
      const reps = Number(set.reps) || 0;
      if (kind === 'pushup') keepBest(metrics, 'bw:pushup', Math.min(reps, 150));
      else keepBest(metrics, `bw:${kind}`, relativeBodyweightLoad(reps, Number(set.weight) || 0, bodyweight));
    }
  }
  return metrics;
}

/** Riegel projection of a run to its 5K-equivalent speed. */
export function fiveKEquivalentKmh(distanceKm: number, seconds: number): number {
  if (distanceKm <= 0 || seconds <= 0) return 0;
  const fiveKSeconds = seconds * Math.pow(5 / distanceKm, 1.06);
  return 5 / (fiveKSeconds / 3600);
}

export function cardioMetrics(activity: Pick<CardioActivity, 'type' | 'distanceKm' | 'movingDurationSec' | 'durationSec'>): SessionMetrics {
  const metrics: SessionMetrics = {};
  const km = activity.distanceKm || 0;
  const seconds = activity.movingDurationSec || activity.durationSec || 0;
  if (km <= 0 || seconds <= 0) return metrics;
  const kmh = km / (seconds / 3600);

  if (activity.type === 'run' && kmh <= 22) {
    keepBest(metrics, 'run:long', km);
    if (km >= 1.6 && kmh >= 4) keepBest(metrics, 'run:5k', fiveKEquivalentKmh(km, seconds));
  } else if (activity.type === 'cycle' && kmh <= 60) {
    keepBest(metrics, 'cycle:long', km);
    if (km >= 10) keepBest(metrics, 'cycle:speed', kmh);
  } else if (activity.type === 'walk' && kmh <= 9) {
    keepBest(metrics, 'walk:long', km);
    if (km >= 2) keepBest(metrics, 'walk:speed', kmh);
  }
  return metrics;
}

export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

/** Old bests fade to 85% over a year once they are 6 months old: rank reflects current ability. */
export function recencyFactor(bestDate: string, today: string): number {
  const age = dayNumber(today) - dayNumber(bestDate);
  return 1 - 0.15 * Math.min(1, Math.max(0, (age - 180) / 365));
}

/** A new result replaces the stored best when it beats the best's recency-adjusted value. */
export function mergePerformance(
  previous: Record<string, PerformanceBest> | undefined,
  metrics: SessionMetrics,
  dateKey: string,
): Record<string, PerformanceBest> {
  const next = { ...(previous || {}) };
  for (const [key, value] of Object.entries(metrics)) {
    const best = next[key];
    if (!best || value > best.v * recencyFactor(best.d, dateKey)) next[key] = { v: value, d: dateKey };
  }
  return next;
}
