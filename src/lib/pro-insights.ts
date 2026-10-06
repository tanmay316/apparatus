/**
 * Pro training tools: daily readiness, goals, month/year cumulative progress,
 * hybrid (cardio + strength) balance and the per-session pace / elevation profile.
 */
import type { CardioActivity, CardioActivityType, Workout } from '@/types';
import { shiftDate, startMs, type Insight } from '@/lib/analysis-common';
import { fitnessFreshness, intensityFactor, thresholdKmh } from '@/lib/training-load';
import { analyzeStrengthTrends } from '@/lib/strength-trends';
import { groupShares, isWorking, type MajorGroup } from '@/lib/workout-analysis';
import { routeProfile, timeAt } from '@/lib/cardio-analysis';
import { bucketIndex, rangeBuckets, rangeDays, rangeStart, type RangeBucket, type TimeRange } from '@/lib/time-range';

const movingSec = (a: CardioActivity) => a.movingDurationSec || a.durationSec || 0;
const doneSets = (w: Workout) => (w.exercises || []).reduce((n, e) => n + (e.sets || []).filter(s => s.completed !== false).length, 0);
/** Strength minutes, with a set-count estimate for old sessions without a duration. */
export const workoutMinutes = (w: Workout) => (w.durationMin && w.durationMin > 0 ? Math.min(w.durationMin, 240) : doneSets(w) * 2.5);
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
const dayKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function weekStart(key: string): string {
  const [y, m, d] = parts(key);
  const day = new Date(y, m - 1, d).getDay();
  return shiftDate(key, -((day + 6) % 7));
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

// ─── Readiness ───────────────────────────────────────────────

export interface ReadinessFactor { key: 'form' | 'muscles' | 'rest'; label: string; score: number; text: string }
export interface Readiness {
  score: number;
  label: string;
  tone: 'good' | 'info' | 'warn';
  factors: ReadinessFactor[];
  plan: { title: string; text: string };
  fresh: MajorGroup[];
  tired: MajorGroup[];
}

const BIG_GROUPS: MajorGroup[] = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes'];
const LEGS: MajorGroup[] = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
const UPPER: MajorGroup[] = ['Chest', 'Back', 'Shoulders'];

/** How ready the body is to train hard today, from training form, muscle recovery and rest days. */
export function readiness(cardio: CardioActivity[], workouts: Workout[], asOf: string, nowMs = Date.now()): Readiness | null {
  const since = shiftDate(asOf, -27);
  const recentC = cardio.filter(a => a.date >= since && a.date <= asOf);
  const recentW = workouts.filter(w => w.date >= since && w.date <= asOf);
  if (recentC.length + recentW.length === 0) return null;

  const f = fitnessFreshness(cardio, workouts, asOf, 42);
  const formScore = Math.round(clamp(15 + ((f.form + 30) / 35) * 85, 15, 100) - (f.ramp > 8 ? 10 : 0));

  const rec = analyzeStrengthTrends(workouts, asOf, nowMs).recovery;
  const ready = (groups: MajorGroup[]) => {
    const vals = rec.filter(r => groups.includes(r.group)).map(r => r.readiness);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 100;
  };
  const big = rec.filter(r => BIG_GROUPS.includes(r.group)).map(r => r.readiness);
  const muscleScore = Math.round(0.6 * ready(BIG_GROUPS) + 0.4 * Math.min(100, ...big));
  const tired = rec.filter(r => r.group !== 'Forearms' && r.readiness < 60).sort((a, b) => a.readiness - b.readiness).map(r => r.group);
  const fresh = rec.filter(r => r.group !== 'Forearms' && r.readiness >= 85 && r.hoursAgo !== null && r.hoursAgo >= 48).map(r => r.group);

  const active = new Set([...recentC.map(a => a.date), ...recentW.map(w => w.date)]);
  let day = active.has(asOf) ? asOf : shiftDate(asOf, -1);
  let streak = 0;
  while (active.has(day)) { streak++; day = shiftDate(day, -1); }
  const restScore = streak <= 2 ? 100 : clamp(100 - (streak - 2) * 15, 25, 100);

  const score = Math.round(0.5 * formScore + 0.3 * muscleScore + 0.2 * restScore);
  const legs = Math.round(ready(LEGS));
  const upper = Math.round(ready(UPPER));
  const freshList = fresh.slice(0, 3).join(', ').toLowerCase();

  let plan: Readiness['plan'];
  if (score >= 80) {
    plan = legs >= 70
      ? { title: 'Go hard today', text: 'Intervals, a tempo run or heavy legs. Your body can take a key session.' }
      : { title: 'Hard upper body', text: `Legs are still recovering (${legs}%). Push upper body hard, or keep cardio easy.` };
  } else if (score >= 60) {
    plan = { title: 'Steady training', text: freshList ? `A steady run or ride, or strength for ${freshList}.` : 'A steady run or ride, or a normal strength session.' };
  } else if (score >= 40) {
    plan = { title: 'Easy day', text: `Easy cardio for 20-40 minutes or mobility.${upper >= 80 && legs < 60 ? ' Light upper-body work is fine.' : ''} Keep it conversational.` };
  } else {
    plan = { title: 'Rest or recover', text: 'Rest, walk or stretch today. Recovery is when fitness is built.' };
  }

  const label = score >= 80 ? 'Ready to push' : score >= 60 ? 'Good to train' : score >= 40 ? 'Take it steady' : 'Recover';
  const tone = score >= 60 ? 'good' : score >= 40 ? 'info' : 'warn';
  return {
    score,
    label,
    tone,
    factors: [
      { key: 'form', label: 'Training form', score: formScore, text: `${f.form > 0 ? '+' : ''}${f.form} · ${f.state.label}` },
      { key: 'muscles', label: 'Muscles', score: muscleScore, text: tired.length ? `${tired.slice(0, 2).join(', ')} still recovering` : 'All recovered' },
      { key: 'rest', label: 'Rest', score: restScore, text: streak === 0 ? 'Rested yesterday' : `${streak} day${streak === 1 ? '' : 's'} in a row` },
    ],
    plan,
    fresh,
    tired,
  };
}

// ─── Goals ───────────────────────────────────────────────────

export type GoalPeriod = 'week' | 'month' | 'year';
export type GoalSport = 'all' | CardioActivityType | 'strength';
export type GoalMetric = 'distance' | 'time' | 'sessions' | 'elevation';
export interface TrainingGoal { id: string; period: GoalPeriod; sport: GoalSport; metric: GoalMetric; target: number }

export const MAX_GOALS = 6;
export const GOAL_UNITS: Record<GoalMetric, string> = { distance: 'km', time: 'h', sessions: 'sessions', elevation: 'm' };
const GOAL_MAX: Record<GoalMetric, number> = { distance: 20000, time: 2000, sessions: 1000, elevation: 500000 };
const SPORT_NOUN: Record<GoalSport, string> = { all: 'Train', run: 'Run', walk: 'Walk', cycle: 'Ride', strength: 'Lift' };

/** Metrics that make sense for each sport (strength has no distance or climb). */
export function goalMetrics(sport: GoalSport): GoalMetric[] {
  if (sport === 'strength') return ['sessions', 'time'];
  if (sport === 'all') return ['time', 'sessions', 'distance'];
  return ['distance', 'time', 'sessions', 'elevation'];
}

export function sanitizeGoals(raw: unknown): TrainingGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: TrainingGoal[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const { id, period, sport, metric, target } = g as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(id)) continue;
    if (!['week', 'month', 'year'].includes(period as string)) continue;
    if (!['all', 'run', 'walk', 'cycle', 'strength'].includes(sport as string)) continue;
    if (!goalMetrics(sport as GoalSport).includes(metric as GoalMetric)) continue;
    const t = Number(target);
    if (!Number.isFinite(t) || t <= 0 || t > GOAL_MAX[metric as GoalMetric]) continue;
    out.push({ id, period: period as GoalPeriod, sport: sport as GoalSport, metric: metric as GoalMetric, target: r1(t) });
    if (out.length >= MAX_GOALS) break;
  }
  return out;
}

export function goalLabel(g: Pick<TrainingGoal, 'period' | 'sport' | 'metric' | 'target'>): string {
  const when = g.period === 'week' ? 'this week' : g.period === 'month' ? 'this month' : 'this year';
  const amount = g.metric === 'sessions'
    ? `${g.target} ${g.sport === 'strength' ? 'workout' : 'session'}${g.target === 1 ? '' : 's'}`
    : g.metric === 'elevation' ? `${g.target.toLocaleString()} m up` : `${g.target} ${GOAL_UNITS[g.metric]}`;
  return `${SPORT_NOUN[g.sport]} ${amount} ${when}`;
}

export function periodRange(period: GoalPeriod, asOf: string): { start: string; end: string } {
  const [y, m] = parts(asOf);
  if (period === 'week') { const start = weekStart(asOf); return { start, end: shiftDate(start, 6) }; }
  if (period === 'month') return { start: dayKey(y, m, 1), end: dayKey(y, m, daysInMonth(y, m)) };
  return { start: dayKey(y, 1, 1), end: dayKey(y, 12, 31) };
}

function goalValue(g: Pick<TrainingGoal, 'sport' | 'metric'>, cardio: CardioActivity[], workouts: Workout[], from: string, to: string): number {
  const inRange = (d: string) => d >= from && d <= to;
  const c = g.sport === 'strength' ? [] : cardio.filter(a => inRange(a.date) && (g.sport === 'all' || a.type === g.sport));
  const w = g.sport === 'all' || g.sport === 'strength' ? workouts.filter(x => inRange(x.date)) : [];
  switch (g.metric) {
    case 'distance': return c.reduce((s, a) => s + (a.distanceKm || 0), 0);
    case 'elevation': return c.reduce((s, a) => s + (a.elevationGainM || 0), 0);
    case 'sessions': return c.length + w.length;
    case 'time': return (c.reduce((s, a) => s + movingSec(a), 0) / 60 + w.reduce((s, x) => s + workoutMinutes(x), 0)) / 60;
  }
}

export interface GoalProgress {
  goal: TrainingGoal;
  label: string;
  value: number;
  pct: number;
  /** Share of the period already gone, so the bar can show where "on pace" is. */
  expectedPct: number;
  status: 'done' | 'ahead' | 'on_track' | 'behind';
  daysLeft: number;
  /** Amount needed per remaining day (including today). */
  perDay: number;
  unit: string;
}

export function goalProgress(goal: TrainingGoal, cardio: CardioActivity[], workouts: Workout[], asOf: string): GoalProgress {
  const { start, end } = periodRange(goal.period, asOf);
  const total = daysBetween(start, end) + 1;
  const elapsed = daysBetween(start, asOf) + 1;
  const value = goalValue(goal, cardio, workouts, start, asOf);
  const pct = goal.target > 0 ? value / goal.target : 0;
  const expectedPct = elapsed / total;
  const daysLeft = Math.max(1, total - elapsed + 1);
  const status = pct >= 1 ? 'done' : pct >= expectedPct * 1.05 ? 'ahead' : pct >= expectedPct * 0.9 ? 'on_track' : 'behind';
  return {
    goal,
    label: goalLabel(goal),
    value: goal.metric === 'sessions' || goal.metric === 'elevation' ? Math.round(value) : r1(value),
    pct: Math.min(1, pct),
    expectedPct,
    status,
    daysLeft,
    perDay: r1(Math.max(0, goal.target - value) / daysLeft),
    unit: GOAL_UNITS[goal.metric],
  };
}

/** A starting target: ~10% above the average of the last three full periods, rounded to a friendly number. */
export function suggestGoalTarget(g: Pick<TrainingGoal, 'period' | 'sport' | 'metric'>, cardio: CardioActivity[], workouts: Workout[], asOf: string): number {
  const vals: number[] = [];
  let ref = asOf;
  for (let i = 0; i < 3; i++) {
    const { start } = periodRange(g.period, ref);
    ref = shiftDate(start, -1);
    const prev = periodRange(g.period, ref);
    vals.push(goalValue(g, cardio, workouts, prev.start, prev.end));
  }
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const fallback: Record<GoalPeriod, Record<GoalMetric, number>> = {
    week: { distance: 15, time: 3, sessions: 4, elevation: 200 },
    month: { distance: 60, time: 12, sessions: 16, elevation: 800 },
    year: { distance: 700, time: 150, sessions: 180, elevation: 10000 },
  };
  if (avg <= 0) return fallback[g.period][g.metric];
  const want = avg * 1.1;
  const step = want >= 1000 ? 100 : want >= 100 ? 10 : want >= 20 ? 5 : 1;
  return Math.max(step, Math.round(want / step) * step);
}

// ─── Cumulative progress (this month vs last, this year vs last) ───

export type CumMetric = 'distance' | 'time' | 'elevation';
export interface CumPoint { x: number; label: string; current: number | null; previous: number; average: number | null }
export interface CumulativeComparison {
  mode: 'month' | 'year';
  unit: string;
  points: CumPoint[];
  current: number;
  /** Previous period at the same point in time. */
  previousSoFar: number;
  previousTotal: number;
  currentLabel: string;
  previousLabel: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dailyTotals(cardio: CardioActivity[], workouts: Workout[], metric: CumMetric, sport: 'all' | CardioActivityType): Map<string, number> {
  const out = new Map<string, number>();
  const add = (d: string, v: number) => { if (d && v) out.set(d, (out.get(d) || 0) + v); };
  for (const a of cardio) {
    if (sport !== 'all' && a.type !== sport) continue;
    add(a.date, metric === 'distance' ? a.distanceKm || 0 : metric === 'elevation' ? a.elevationGainM || 0 : movingSec(a) / 3600);
  }
  if (metric === 'time' && sport === 'all') for (const w of workouts) add(w.date, workoutMinutes(w) / 60);
  return out;
}

export function cumulativeComparison(cardio: CardioActivity[], workouts: Workout[], metric: CumMetric, mode: 'month' | 'year', asOf: string, sport: 'all' | CardioActivityType = 'all'): CumulativeComparison {
  const daily = dailyTotals(cardio, workouts, metric, sport);
  const [y, m, d] = parts(asOf);
  const round = (v: number) => (metric === 'elevation' ? Math.round(v) : r1(v));
  const unit = metric === 'distance' ? 'km' : metric === 'time' ? 'h' : 'm';

  // Running total for a month up to day n (clipped to the month's length).
  const monthRun = (yy: number, mm: number) => {
    const len = daysInMonth(yy, mm);
    const run: number[] = [];
    let s = 0;
    for (let day = 1; day <= len; day++) { s += daily.get(dayKey(yy, mm, day)) || 0; run.push(s); }
    return (n: number) => run[Math.min(n, len) - 1];
  };

  if (mode === 'month') {
    const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
    const cur = monthRun(y, m);
    const last = monthRun(prev[0], prev[1]);
    const older = [2, 3, 4].map(k => { const t = new Date(y, m - 1 - k, 1); return monthRun(t.getFullYear(), t.getMonth() + 1); });
    const hasOlder = older.some(fn => fn(31) > 0);
    const len = Math.max(daysInMonth(y, m), daysInMonth(prev[0], prev[1]));
    const points: CumPoint[] = [];
    for (let day = 1; day <= len; day++) {
      points.push({
        x: day,
        label: String(day),
        current: day <= d ? round(cur(day)) : null,
        previous: round(last(day)),
        average: hasOlder ? round((last(day) + older.reduce((s, fn) => s + fn(day), 0)) / 4) : null,
      });
    }
    return {
      mode, unit, points,
      current: round(cur(d)),
      previousSoFar: round(last(d)),
      previousTotal: round(last(31)),
      currentLabel: MONTHS[m - 1],
      previousLabel: MONTHS[prev[1] - 1],
    };
  }

  // Year: weekly samples of the running total.
  const yearRun = (yy: number) => {
    const run: number[] = [];
    let s = 0;
    for (let i = 0; i < 366; i++) {
      const k = shiftDate(dayKey(yy, 1, 1), i);
      if (!k.startsWith(`${yy}-`)) break;
      s += daily.get(k) || 0;
      run.push(s);
    }
    return (n: number) => run[Math.min(n, run.length) - 1];
  };
  const cur = yearRun(y);
  const last = yearRun(y - 1);
  const today = daysBetween(dayKey(y, 1, 1), asOf) + 1;
  const points: CumPoint[] = [];
  for (let day = 7; day <= 371; day += 7) {
    const n = Math.min(day, 366);
    const date = new Date(y, 0, n);
    points.push({
      x: n,
      label: MONTHS[date.getMonth()],
      current: n <= today ? round(cur(n)) : n - 7 < today ? round(cur(today)) : null,
      previous: round(last(n)),
      average: null,
    });
  }
  return {
    mode, unit, points,
    current: round(cur(today)),
    previousSoFar: round(last(today)),
    previousTotal: round(last(366)),
    currentLabel: String(y),
    previousLabel: String(y - 1),
  };
}

// ─── Hybrid balance (cardio vs strength) ─────────────────────

export interface HybridClash { date: string; text: string }
export interface HybridBalance {
  buckets: (RangeBucket & { cardioMin: number; strengthMin: number })[];
  cardioMin: number;
  strengthMin: number;
  cardioPct: number;
  strengthPct: number;
  style: { label: string; text: string };
  clashCount: number;
  clashes: HybridClash[];
  tip: Insight;
}

/** Sets of quad / hamstring / glute work in a session (credit for secondary muscles counts half). */
export function legSets(w: Workout): number {
  let n = 0;
  for (const e of (w.exercises || []).filter(isWorking)) {
    const sets = (e.sets || []).filter(s => s.completed !== false).length;
    const shares = groupShares(e.name);
    n += sets * Math.max(shares.get('Quads') || 0, shares.get('Hamstrings') || 0, shares.get('Glutes') || 0);
  }
  return r1(n);
}

const fmtDay = (key: string) => {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export function hybridBalance(cardio: CardioActivity[], workouts: Workout[], asOf: string, range: TimeRange = '90d', earliest?: string | null): HybridBalance | null {
  const buckets: HybridBalance['buckets'] = rangeBuckets(range, asOf, earliest).map(b => ({ start: b.start, end: b.end, label: b.label, cardioMin: 0, strengthMin: 0 }));
  const from = rangeStart(range, asOf, earliest);
  const c = cardio.filter(a => a.date >= from && a.date <= asOf);
  const w = workouts.filter(x => x.date >= from && x.date <= asOf);
  if (c.length + w.length === 0) return null;

  for (const a of c) { const i = bucketIndex(buckets, a.date); if (i >= 0) buckets[i].cardioMin += movingSec(a) / 60; }
  for (const x of w) { const i = bucketIndex(buckets, x.date); if (i >= 0) buckets[i].strengthMin += workoutMinutes(x); }
  for (const b of buckets) { b.cardioMin = Math.round(b.cardioMin); b.strengthMin = Math.round(b.strengthMin); }

  const cMin = Math.round(c.reduce((s, a) => s + movingSec(a) / 60, 0));
  const sMin = Math.round(w.reduce((s, x) => s + workoutMinutes(x), 0));
  const total = Math.max(1, cMin + sMin);
  const cardioPct = Math.round((cMin / total) * 100);
  const strengthPct = 100 - cardioPct;
  const style = cardioPct >= 80 ? { label: 'Endurance-focused', text: `${cardioPct}% of your training time is cardio.` }
    : cardioPct <= 20 ? { label: 'Strength-focused', text: `${strengthPct}% of your training time is lifting.` }
      : { label: 'Hybrid athlete', text: `${cardioPct}% cardio, ${strengthPct}% strength.` };

  // Heavy legs and a hard run or ride within 24 h of each other blunt both sessions.
  const since = from;
  const thr = { run: thresholdKmh(cardio, 'run', asOf), cycle: thresholdKmh(cardio, 'cycle', asOf), walk: 9.2 };
  const hard = cardio.filter(a => a.date >= since && a.date <= asOf && a.type !== 'walk'
    && (intensityFactor(a, thr[a.type]) >= 0.85 || movingSec(a) >= 90 * 60));
  const heavy = workouts.filter(x => x.date >= since && x.date <= asOf && legSets(x) >= 6);
  const clashes: HybridClash[] = [];
  for (const lift of heavy) {
    const liftAt = startMs(lift);
    for (const a of hard) {
      const gapH = (startMs(a) - liftAt) / 3_600_000;
      if (Math.abs(gapH) > 24 || (!liftAt && lift.date !== a.date)) continue;
      const noun = a.type === 'cycle' ? 'ride' : 'run';
      const h = Math.max(1, Math.round(Math.abs(gapH)));
      clashes.push({
        date: gapH >= 0 ? a.date : lift.date,
        text: gapH >= 0 ? `Heavy legs on ${fmtDay(lift.date)}, hard ${noun} ${h} h later` : `Hard ${noun} on ${fmtDay(a.date)}, heavy legs ${h} h later`,
      });
    }
  }
  clashes.sort((a, b) => b.date.localeCompare(a.date));

  const weeksSpan = Math.max(1, rangeDays(range, asOf, earliest) / 7);
  const perWeekC = cMin / weeksSpan;
  const perWeekS = sMin / weeksSpan;
  let tip: Insight;
  if (clashes.length >= 2) tip = { tone: 'warn', title: 'Space out legs and hard cardio', text: 'Keep heavy leg days and hard runs or rides at least 24 h apart, or do both in one session with the cardio after lifting.' };
  else if (perWeekS < 40 && perWeekC >= 60) tip = { tone: 'info', title: 'Add some strength', text: 'Two short strength sessions a week (legs + core) improve running economy and cut injury risk.' };
  else if (perWeekC < 75 && perWeekS >= 60) tip = { tone: 'info', title: 'Add easy cardio', text: `You average ${Math.round(perWeekC)} min of cardio a week. 150 min of easy cardio helps recovery between lifting days and heart health.` };
  else tip = { tone: 'good', title: 'Good mix', text: 'Cardio and strength are balanced without clashing. Keep it up.' };

  return { buckets, cardioMin: cMin, strengthMin: sMin, cardioPct, strengthPct, style, clashCount: clashes.length, clashes: clashes.slice(0, 3), tip };
}

// ─── Session pace & elevation profile, grade-adjusted pace ───

export interface ProfilePoint { km: number; elev: number | null; paceSec: number | null; kmh: number | null; gapSec: number | null; grade: number }
export interface SessionProfile {
  points: ProfilePoint[];
  hasElevation: boolean;
  paceSec: number;
  /** Flat-ground equivalent pace for runs. */
  gapPaceSec: number | null;
  /** Seconds per km the hills cost you (negative when the route was net downhill). */
  hillCostSec: number | null;
  climbM: number;
  descentM: number;
  maxGradePct: number;
}

/** Relative running cost of a slope vs flat ground, fitted to Strava's GAP curve (grade in %). */
export function gradeCost(gradePct: number): number {
  const g = clamp(gradePct, -30, 30);
  return 1 + 0.03 * g + 0.0018 * g * g;
}

export function sessionProfile(a: CardioActivity): SessionProfile | null {
  const route = a.route || [];
  const prof = routeProfile(route, a.type, a.distanceKm || 0);
  if (!prof) return null;
  const total = prof.km[prof.km.length - 1];
  const totalSec = prof.sec[prof.sec.length - 1];
  if (total < 0.3 || totalSec <= 0) return null;

  // Altitude per route point, gaps filled by interpolation.
  const alt = route.map(p => (typeof p.alt === 'number' && Number.isFinite(p.alt) ? p.alt : null));
  const known = alt.filter(v => v !== null).length;
  const hasElevation = known >= route.length * 0.6;
  if (hasElevation) {
    let prev = -1;
    for (let i = 0; i < alt.length; i++) {
      if (alt[i] === null) continue;
      if (prev === -1) for (let j = 0; j < i; j++) alt[j] = alt[i];
      else for (let j = prev + 1; j < i; j++) alt[j] = alt[prev]! + ((alt[i]! - alt[prev]!) * (j - prev)) / (i - prev);
      prev = i;
    }
    for (let j = prev + 1; j < alt.length; j++) alt[j] = alt[prev];
  }
  const altAt = (k: number) => {
    for (let i = 1; i < prof.km.length; i++) {
      if (prof.km[i] >= k) {
        const span = prof.km[i] - prof.km[i - 1];
        const f = span > 0 ? (k - prof.km[i - 1]) / span : 0;
        return alt[i - 1]! + f * (alt[i]! - alt[i - 1]!);
      }
    }
    return alt[alt.length - 1]!;
  };

  const step = Math.max(0.05, Math.round((total / 100) * 100) / 100);
  const ks: number[] = [];
  for (let k = 0; k < total - step * 0.5; k += step) ks.push(Math.round(k * 1000) / 1000);
  ks.push(total);
  const secs = ks.map(k => timeAt(prof, k));
  const rawElev = hasElevation ? ks.map(altAt) : [];
  // ~200 m moving average removes GPS altitude jitter.
  const w = Math.max(1, Math.round(0.1 / step));
  const elev = rawElev.map((_, i) => {
    const lo = Math.max(0, i - w);
    const hi = Math.min(rawElev.length - 1, i + w);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += rawElev[j];
    return s / (hi - lo + 1);
  });

  const isRun = a.type === 'run';
  const points: ProfilePoint[] = [];
  let eqKm = 0;
  let climb = 0;
  let descent = 0;
  let maxGrade = 0;
  for (let i = 0; i < ks.length; i++) {
    let grade = 0;
    if (hasElevation && i > 0) {
      const lo = Math.max(0, i - w);
      const hi = Math.min(ks.length - 1, i + w);
      const dist = (ks[hi] - ks[lo]) * 1000;
      grade = dist > 0 ? clamp(((elev[hi] - elev[lo]) / dist) * 100, -30, 30) : 0;
      const dh = elev[i] - elev[i - 1];
      if (dh > 0) climb += dh; else descent -= dh;
      maxGrade = Math.max(maxGrade, grade);
    }
    let paceSec: number | null = null;
    if (i > 0) {
      const lo = Math.max(0, i - 2);
      const dk = ks[i] - ks[lo];
      const dt = secs[i] - secs[lo];
      if (dk > 0 && dt > 0) paceSec = dt / dk;
      eqKm += (ks[i] - ks[i - 1]) * (hasElevation ? gradeCost(grade) : 1);
    }
    points.push({
      km: Math.round(ks[i] * 100) / 100,
      elev: hasElevation ? Math.round(elev[i] * 10) / 10 : null,
      paceSec: paceSec ? Math.round(paceSec) : null,
      kmh: paceSec ? r1(3600 / paceSec) : null,
      gapSec: paceSec && isRun && hasElevation ? Math.round(paceSec / gradeCost(grade)) : null,
      grade: r1(grade),
    });
  }
  // The first sample has no pace yet; borrow the next one so the line starts at 0 km.
  if (points.length > 1 && points[0].paceSec === null) {
    points[0] = { ...points[0], paceSec: points[1].paceSec, kmh: points[1].kmh, gapSec: points[1].gapSec };
  }

  const paceSec = Math.round(totalSec / total);
  const gapPaceSec = isRun && hasElevation && eqKm > 0 ? Math.round(totalSec / eqKm) : null;
  return {
    points,
    hasElevation,
    paceSec,
    gapPaceSec,
    hillCostSec: gapPaceSec !== null ? paceSec - gapPaceSec : null,
    climbM: Math.round(climb),
    descentM: Math.round(descent),
    maxGradePct: r1(maxGrade),
  };
}
