import {
  SKILLS,
  SKILL_BY_ID,
  type AssessmentMetric,
  type CalisthenicsSkill,
  type SkillFamily,
  type SkillStep,
  type SkillTier,
} from '@/data/calisthenics-curriculum';

/** Sessions that must hit the full target before the coach moves you up. */
export const PASSES_TO_ADVANCE = 2;
/** Consecutive missed sessions before the coach suggests stepping back. */
export const FAILS_TO_REGRESS = 4;
export const MAX_ACTIVE_SKILLS = 6;
const HISTORY_LIMIT = 30;

export type Assessment = Record<AssessmentMetric, number>;

export interface SkillLog {
  at: number;
  step: number;
  best: number;
  passed: boolean;
}

export interface SkillProgress {
  skillId: string;
  /** Index of the step being trained. Equal to steps.length once mastered. */
  step: number;
  mastered: boolean;
  /** Passing sessions at the current step. */
  passes: number;
  /** Consecutive sessions that missed the target at the current step. */
  misses: number;
  /** Best single set at the current step. */
  best: number;
  sessions: number;
  startedAt: number;
  lastPracticed?: number;
  masteredAt?: number;
  history: SkillLog[];
}

export interface TutorProfile {
  level: SkillTier;
  assessment: Assessment;
  assessedAt: number;
  daysPerWeek: number;
  activeSkills: string[];
}

export type ProgressMap = Record<string, SkillProgress>;
export type SkillStatus = 'locked' | 'available' | 'active' | 'mastered';

export const ASSESSMENT_QUESTIONS: { metric: AssessmentMetric; label: string; hint: string; unit: 'reps' | 'sec' }[] = [
  { metric: 'pushups', label: 'Push-ups', hint: 'Max strict reps, chest to the floor', unit: 'reps' },
  { metric: 'pullups', label: 'Pull-ups', hint: 'Max strict reps from a dead hang', unit: 'reps' },
  { metric: 'dips', label: 'Dips', hint: 'Max reps on parallel bars (0 if no access)', unit: 'reps' },
  { metric: 'squats', label: 'Bodyweight squats', hint: 'Max reps below parallel', unit: 'reps' },
  { metric: 'deadHangSec', label: 'Dead hang', hint: 'Longest hang from a bar', unit: 'sec' },
  { metric: 'hollowSec', label: 'Hollow body hold', hint: 'Lower back stays on the floor', unit: 'sec' },
  { metric: 'lsitSec', label: 'L-sit', hint: 'Legs straight, hands on the floor or bars', unit: 'sec' },
  { metric: 'wallHandstandSec', label: 'Wall handstand', hint: 'Chest or back to the wall', unit: 'sec' },
];

export const EMPTY_ASSESSMENT: Assessment = {
  pushups: 0, pullups: 0, dips: 0, squats: 0, hollowSec: 0, deadHangSec: 0, wallHandstandSec: 0, lsitSec: 0,
};

export function levelFromAssessment(a: Assessment): SkillTier {
  if (a.pullups >= 20 && a.dips >= 30 && a.pushups >= 50 && a.lsitSec >= 30 && a.wallHandstandSec >= 60) return 4;
  if (a.pullups >= 15 && a.dips >= 20 && a.pushups >= 40 && (a.lsitSec >= 20 || a.wallHandstandSec >= 45)) return 3;
  if (a.pullups >= 8 && a.pushups >= 25 && (a.dips >= 10 || a.pushups >= 35)) return 2;
  if (a.pullups >= 1 || a.pushups >= 10) return 1;
  return 0;
}

/** Deepest step already passed according to the tests; untested easy skills are credited to experienced users. */
export function placementStep(skill: CalisthenicsSkill, a: Assessment, level: SkillTier): number {
  let step = 0;
  let hasTest = false;
  skill.steps.forEach((s, i) => {
    if (!s.test) return;
    hasTest = true;
    if (a[s.test.metric] >= s.test.min) step = i + 1;
  });
  if (!hasTest && level >= skill.tier + 2) return skill.steps.length;
  return step;
}

export function newProgress(skillId: string, step = 0, now = Date.now()): SkillProgress {
  const skill = SKILL_BY_ID[skillId];
  const total = skill?.steps.length ?? 0;
  const clamped = Math.max(0, Math.min(step, total));
  return {
    skillId,
    step: clamped,
    mastered: total > 0 && clamped >= total,
    passes: 0,
    misses: 0,
    best: 0,
    sessions: 0,
    startedAt: now,
    masteredAt: total > 0 && clamped >= total ? now : undefined,
    history: [],
  };
}

export function placeAllSkills(a: Assessment, level: SkillTier, existing: ProgressMap = {}, now = Date.now()): ProgressMap {
  const map: ProgressMap = { ...existing };
  for (const skill of SKILLS) {
    const placed = placementStep(skill, a, level);
    const current = map[skill.id];
    if (!current) {
      if (placed > 0) map[skill.id] = newProgress(skill.id, placed, now);
    } else if (placed > current.step) {
      map[skill.id] = { ...newProgress(skill.id, placed, now), sessions: current.sessions, history: current.history, startedAt: current.startedAt };
    }
  }
  return map;
}

export function stepOf(map: ProgressMap, skillId: string): number {
  return map[skillId]?.step ?? 0;
}

export function isMastered(map: ProgressMap, skillId: string): boolean {
  return !!map[skillId]?.mastered;
}

export interface MissingPrereq {
  skill: CalisthenicsSkill;
  /** Step that must be reached, or undefined when the whole skill is required. */
  step?: SkillStep;
}

export function missingPrerequisites(skill: CalisthenicsSkill, map: ProgressMap): MissingPrereq[] {
  const missing: MissingPrereq[] = [];
  for (const req of skill.prerequisites) {
    const other = SKILL_BY_ID[req.skillId];
    if (!other) continue;
    if (isMastered(map, other.id)) continue;
    if (req.step !== undefined && stepOf(map, other.id) >= req.step) continue;
    missing.push({ skill: other, step: req.step !== undefined ? other.steps[req.step] : undefined });
  }
  return missing;
}

export function skillStatus(skill: CalisthenicsSkill, map: ProgressMap, profile?: TutorProfile | null): SkillStatus {
  if (isMastered(map, skill.id)) return 'mastered';
  if (missingPrerequisites(skill, map).length > 0) return 'locked';
  if (profile?.activeSkills.includes(skill.id)) return 'active';
  return 'available';
}

export function currentStep(skill: CalisthenicsSkill, map: ProgressMap): SkillStep | undefined {
  return skill.steps[stepOf(map, skill.id)];
}

export function skillCompletion(skill: CalisthenicsSkill, map: ProgressMap): number {
  if (isMastered(map, skill.id)) return 1;
  const progress = map[skill.id];
  const step = stepOf(map, skill.id);
  const within = progress && skill.steps[step] ? Math.min(1, (progress.passes / PASSES_TO_ADVANCE) * 0.5 + (progress.best / skill.steps[step].target) * 0.5) : 0;
  return Math.min(0.99, (step + within) / skill.steps.length);
}

/** Remaining weeks [low, high] to master the skill from the current position. */
export function remainingWeeks(skill: CalisthenicsSkill, map: ProgressMap): [number, number] {
  if (isMastered(map, skill.id)) return [0, 0];
  const step = stepOf(map, skill.id);
  const progress = map[skill.id];
  let low = 0;
  let high = 0;
  skill.steps.forEach((s, i) => {
    if (i < step) return;
    const share = i === step && progress ? 1 - Math.min(0.9, progress.best / s.target) * 0.6 : 1;
    low += s.weeks[0] * share;
    high += s.weeks[1] * share;
  });
  return [Math.max(1, Math.round(low)), Math.max(1, Math.round(high))];
}

/** Weeks to master the skill including any unfinished prerequisite skills. */
export function weeksFromHere(skill: CalisthenicsSkill, map: ProgressMap, seen = new Set<string>()): [number, number] {
  if (seen.has(skill.id)) return [0, 0];
  seen.add(skill.id);
  const [low, high] = remainingWeeks(skill, map);
  let preLow = 0;
  let preHigh = 0;
  for (const m of missingPrerequisites(skill, map)) {
    const [l, h] = weeksFromHere(m.skill, map, seen);
    // Prerequisites train in parallel, so the longest one gates the start.
    preLow = Math.max(preLow, l);
    preHigh = Math.max(preHigh, h);
  }
  return [low + preLow, high + preHigh];
}

export function formatWeeks([low, high]: [number, number]): string {
  if (high <= 0) return 'Done';
  const range = (a: number, b: number, unit: string) => (a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`);
  if (high < 9) return range(low, high, 'wk');
  if (high < 78) return range(Math.max(1, Math.round(low / 4.3)), Math.round(high / 4.3), 'mo');
  const yr = (w: number) => Math.round((w / 52) * 10) / 10;
  return range(yr(low), yr(high), 'yr');
}

export interface Prescription {
  skill: CalisthenicsSkill;
  step: SkillStep;
  stepIndex: number;
  sets: number;
  value: number;
  restSec: number;
  note: string;
}

export function restFor(skill: CalisthenicsSkill, step: SkillStep): number {
  if (skill.family === 'mobility') return 45;
  if (skill.tier >= 3) return 150;
  if (step.unit === 'sec') return 90;
  return step.target <= 5 ? 120 : 90;
}

/** Today's dose: ramps toward the target from the best set so far. */
export function prescribe(skill: CalisthenicsSkill, map: ProgressMap): Prescription | null {
  const stepIndex = stepOf(map, skill.id);
  const step = skill.steps[stepIndex];
  if (!step || isMastered(map, skill.id)) return null;
  const progress = map[skill.id];
  const best = progress && progress.step === stepIndex ? progress.best : 0;
  const passes = progress?.passes ?? 0;
  let value: number;
  if (best >= step.target) value = step.target;
  else if (best > 0) {
    const inc = step.unit === 'sec' ? Math.max(2, Math.round(step.target * 0.15)) : step.target <= 5 ? 1 : 2;
    value = Math.min(step.target, best + inc);
  } else {
    value = step.unit === 'sec' ? Math.max(5, Math.round(step.target * 0.5)) : Math.max(1, Math.round(step.target * 0.6));
  }
  let note: string;
  if (value >= step.target) {
    note = passes > 0
      ? `One more clean session at ${step.sets} × ${step.target} unlocks the next step.`
      : `Hit ${step.sets} × ${step.target} in ${PASSES_TO_ADVANCE} sessions to move up.`;
  } else if (best > 0) {
    note = `Beat your best (${best}). Build toward ${step.sets} × ${step.target}.`;
  } else {
    note = `Start easy and learn the shape. Goal: ${step.sets} × ${step.target}.`;
  }
  return { skill, step, stepIndex, sets: step.sets, value, restSec: restFor(skill, step), note };
}

export type LogOutcome = 'mastered' | 'advanced' | 'passed' | 'improved' | 'held' | 'regress';

export interface LogResult {
  progress: SkillProgress;
  outcome: LogOutcome;
  message: string;
}

/**
 * Records a practice session. `setValues` are the reps or seconds achieved on each set.
 * A test (`isTest`) that meets the target advances immediately.
 */
export function logPractice(skill: CalisthenicsSkill, prev: SkillProgress | undefined, setValues: number[], opts: { isTest?: boolean; now?: number } = {}): LogResult {
  const now = opts.now ?? Date.now();
  const base = prev ?? newProgress(skill.id, 0, now);
  const step = skill.steps[base.step];
  if (!step || base.mastered) {
    return { progress: base, outcome: 'held', message: `${skill.name} is already mastered.` };
  }
  const values = setValues.map(v => Math.max(0, Math.round(Number(v) || 0)));
  const best = Math.max(0, ...values);
  const passingSets = values.filter(v => v >= step.target).length;
  const passed = opts.isTest ? best >= step.target : passingSets >= step.sets;

  const history = [...base.history, { at: now, step: base.step, best, passed }].slice(-HISTORY_LIMIT);
  const next: SkillProgress = {
    ...base,
    sessions: base.sessions + 1,
    lastPracticed: now,
    best: Math.max(base.best, best),
    history,
  };

  const passes = passed ? base.passes + 1 : base.passes;
  if (passed && (opts.isTest || passes >= PASSES_TO_ADVANCE)) {
    const stepIndex = base.step + 1;
    const mastered = stepIndex >= skill.steps.length;
    const progress: SkillProgress = { ...next, step: stepIndex, mastered, passes: 0, misses: 0, best: 0, masteredAt: mastered ? now : undefined };
    if (mastered) return { progress, outcome: 'mastered', message: `You mastered ${skill.name}! Pick your next challenge.` };
    return { progress, outcome: 'advanced', message: `Step unlocked: ${skill.steps[stepIndex].name}. Start with lighter sets and build up.` };
  }

  if (passed) {
    return {
      progress: { ...next, passes, misses: 0 },
      outcome: 'passed',
      message: `Target hit! ${PASSES_TO_ADVANCE - passes} more clean session${PASSES_TO_ADVANCE - passes === 1 ? '' : 's'} to unlock the next step.`,
    };
  }

  const misses = base.misses + 1;
  if (best > base.best) {
    return { progress: { ...next, misses: 0 }, outcome: 'improved', message: `New best: ${best}${step.unit === 'sec' ? 's' : ' reps'}. Keep chipping away.` };
  }
  if (misses >= FAILS_TO_REGRESS && base.step > 0 && best < step.target * 0.5) {
    return {
      progress: { ...next, misses },
      outcome: 'regress',
      message: `Stuck for ${misses} sessions. Spend a week on ${skill.steps[base.step - 1].name} to build more capacity, then come back.`,
    };
  }
  return { progress: { ...next, misses }, outcome: 'held', message: 'Logged. Consistency wins. Rest well and hit it again next session.' };
}

export function stepBack(skill: CalisthenicsSkill, prev: SkillProgress | undefined, now = Date.now()): SkillProgress {
  const base = prev ?? newProgress(skill.id, 0, now);
  const step = Math.max(0, Math.min(base.step, skill.steps.length) - 1);
  return { ...base, step, mastered: false, masteredAt: undefined, passes: 0, misses: 0, best: 0 };
}

const FAMILY_ORDER: SkillFamily[] = ['balance', 'push', 'pull', 'core', 'legs', 'mobility'];

/** Auto-builds a balanced path: the next foundation skill in each family, matched to the user's level. */
export function recommendSkills(level: SkillTier, map: ProgressMap, limit = MAX_ACTIVE_SKILLS): string[] {
  const candidates = SKILLS.filter(s => !isMastered(map, s.id) && missingPrerequisites(s, map).length === 0 && s.tier <= level + 1);
  const rank = (s: CalisthenicsSkill) => {
    // Prefer skills near the user's level, then skills already in progress.
    const distance = Math.abs(s.tier - Math.max(0, level - 1));
    return distance * 10 - stepOf(map, s.id);
  };
  const picks: string[] = [];
  for (const family of FAMILY_ORDER) {
    const best = candidates.filter(s => s.family === family).sort((a, b) => rank(a) - rank(b))[0];
    if (best) picks.push(best.id);
  }
  // Fill remaining slots with the strongest strength builders.
  for (const s of candidates.sort((a, b) => rank(a) - rank(b))) {
    if (picks.length >= limit) break;
    if (!picks.includes(s.id)) picks.push(s.id);
  }
  return picks.slice(0, limit);
}

/** Replaces mastered or locked active skills with the next recommendation in the same family. */
export function refreshActiveSkills(profile: TutorProfile, map: ProgressMap): string[] {
  const keep = profile.activeSkills.filter(id => {
    const s = SKILL_BY_ID[id];
    return s && !isMastered(map, id) && missingPrerequisites(s, map).length === 0;
  });
  if (keep.length === profile.activeSkills.length) return keep;
  const recs = recommendSkills(effectiveLevel(profile, map), map, MAX_ACTIVE_SKILLS * 2).filter(id => !keep.includes(id));
  const removedFamilies = profile.activeSkills.filter(id => !keep.includes(id)).map(id => SKILL_BY_ID[id]?.family);
  for (const family of removedFamilies) {
    if (keep.length >= MAX_ACTIVE_SKILLS) break;
    const next = recs.find(id => SKILL_BY_ID[id].family === family && !keep.includes(id)) ?? recs.find(id => !keep.includes(id));
    if (next) keep.push(next);
  }
  return keep;
}

/** Level rises as skills are mastered: a tier counts once half of its skills are done. */
export function effectiveLevel(profile: TutorProfile | null, map: ProgressMap): SkillTier {
  let level: SkillTier = profile?.level ?? 0;
  for (const tier of [1, 2, 3, 4] as SkillTier[]) {
    const inTier = SKILLS.filter(s => s.tier === tier - 1);
    const done = inTier.filter(s => isMastered(map, s.id)).length;
    if (inTier.length && done / inTier.length >= 0.5 && tier > level) level = tier;
  }
  return level;
}

export const TRAINING_DAYS: Record<number, number[]> = {
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** For each training day of the week, which active skills are practised (spaced by each skill's frequency). */
export function weeklySchedule(profile: TutorProfile): { weekday: number; skillIds: string[] }[] {
  const days = TRAINING_DAYS[profile.daysPerWeek] ?? TRAINING_DAYS[3];
  const schedule = days.map(weekday => ({ weekday, skillIds: [] as string[] }));
  profile.activeSkills.forEach((id, idx) => {
    const skill = SKILL_BY_ID[id];
    if (!skill) return;
    const freq = Math.min(skill.daysPerWeek, days.length);
    const used = new Set<number>();
    for (let k = 0; k < freq; k++) {
      let d = (Math.round((k * days.length) / freq) + idx) % days.length;
      while (used.has(d)) d = (d + 1) % days.length;
      used.add(d);
      schedule[d].skillIds.push(id);
    }
  });
  return schedule;
}

const SESSION_ORDER: SkillFamily[] = ['balance', 'push', 'pull', 'core', 'legs', 'mobility'];

export interface DailySession {
  weekday: number;
  isRestDay: boolean;
  warmup: string[];
  items: Prescription[];
  minutes: number;
  nextTrainingDay?: number;
}

export function buildSession(profile: TutorProfile, map: ProgressMap, weekday: number): DailySession {
  const schedule = weeklySchedule(profile);
  const today = schedule.find(d => d.weekday === weekday);
  const next = schedule.find(d => d.weekday > weekday) ?? schedule[0];
  if (!today || today.skillIds.length === 0) {
    return {
      weekday,
      isRestDay: true,
      warmup: ['5 min easy walk or cycling', 'Wrist circles and rocks × 15', 'Deep squat hold 60s', 'Hanging or doorway shoulder stretch 60s'],
      items: [],
      minutes: 15,
      nextTrainingDay: next?.weekday,
    };
  }
  const items = today.skillIds
    .map(id => prescribe(SKILL_BY_ID[id], map))
    .filter((p): p is Prescription => !!p)
    .sort((a, b) => {
      // Straight-arm and balance work first while fresh.
      const fa = SESSION_ORDER.indexOf(a.skill.family) - (a.step.unit === 'sec' && a.skill.tier >= 2 ? 0.5 : 0);
      const fb = SESSION_ORDER.indexOf(b.skill.family) - (b.step.unit === 'sec' && b.skill.tier >= 2 ? 0.5 : 0);
      return fa - fb;
    });
  const needsWrists = items.some(p => p.skill.family === 'balance' || p.skill.family === 'push');
  const needsHang = items.some(p => p.skill.family === 'pull');
  const warmup = [
    '3 min jumping jacks or skipping',
    'Arm circles × 10 each way',
    'Cat-cow × 10',
    ...(needsWrists ? ['Wrist circles and rocks × 15'] : []),
    ...(needsHang ? ['Scapular pulls × 8'] : []),
    'Scapular push-ups × 10',
    'Bodyweight squats × 10',
  ];
  const workSec = items.reduce((sum, p) => {
    const perSet = p.step.unit === 'sec' ? p.value : p.value * 3;
    const sides = p.step.perSide ? 2 : 1;
    return sum + p.sets * (perSet * sides + p.restSec);
  }, 0);
  return { weekday, isRestDay: false, warmup, items, minutes: Math.round(workSec / 60) + 8, nextTrainingDay: next?.weekday };
}

export function coachGreeting(level: SkillTier, session: DailySession, mastered: number): string {
  if (session.isRestDay) return 'Rest day. Recovery is where strength is built. Keep it to light mobility.';
  if (mastered === 0 && level === 0) return 'Welcome! We start with the foundations. Quality reps beat quantity every time.';
  if (level >= 3) return 'Skill work first while you are fresh. Full rest between sets, perfect form only.';
  return 'Your lesson is ready. Warm up, then work through each skill in order.';
}
