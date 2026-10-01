import type { ExerciseLog, Workout } from '@/types';
import {
  bestSetMetric, completedSets, estimatedOneRepMax, exerciseTrainingVolume, exerciseVolumeUnit, summarizeProgressiveOverload,
} from '@/lib/progressive-overload';
import { isWarmupOrCooldown, resolveExercise, type MuscleRegion } from '@/lib/muscle-map';
import { shiftDate, startMs, type Insight } from '@/lib/analysis-common';

export type { Insight };

export type RepZone = 'strength' | 'hypertrophy' | 'endurance';
export type MajorGroup = 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Forearms' | 'Quads' | 'Hamstrings' | 'Glutes' | 'Calves' | 'Core';

export interface ExerciseSnapshot {
  date?: string;
  sets: number;
  reps: number;
  holdSec: number;
  volume: number;
  /** kg; 0 when no weight was logged. */
  topWeight: number;
  e1rm: number;
  bestReps: number;
}

export interface ExerciseAnalysis extends ExerciseSnapshot {
  name: string;
  unit: 'kg' | 'reps' | 's';
  weighted: boolean;
  avgReps: number;
  zone?: RepZone;
  rpe: number | null;
  /** The best earlier session of this exercise (same baseline as the overload notification). */
  prev?: ExerciseSnapshot;
  volumeChange?: number;
  isPR: boolean;
  /** Sessions in a row (including this one) without beating the exercise's best set. */
  stalled: number;
  reasons: string[];
  groups: MajorGroup[];
}

export interface MuscleVolume { group: MajorGroup; sessionSets: number; weekSets: number; weekDays: number }

export interface WorkoutAnalysis {
  date: string;
  volumeChangePercent?: number;
  totals: {
    exercises: number;
    sets: number;
    reps: number;
    holdSec: number;
    /** Weight × reps over weighted sets only. */
    volumeKg: number;
    heaviestKg: number;
    avgRpe: number | null;
    durationMin: number;
  };
  lastSameDay?: { date: string; sets: number; reps: number; volumeKg: number; durationMin: number };
  zones: Record<RepZone, number>;
  muscles: MuscleVolume[];
  strengthDaysThisWeek: number;
  exercises: ExerciseAnalysis[];
  insights: Insight[];
}

const REGION_GROUP: Partial<Record<MuscleRegion, MajorGroup>> = {
  chest: 'Chest', upper_chest: 'Chest', lower_chest: 'Chest',
  lats: 'Back', rhomboids: 'Back', traps: 'Back', lower_back: 'Back',
  front_delts: 'Shoulders', side_delts: 'Shoulders', rear_delts: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
  abs: 'Core', lower_abs: 'Core', obliques: 'Core', hip_flexors: 'Core',
};

const groupCache = new Map<string, Map<MajorGroup, number>>();

/** Fractional set credit per muscle group: a primary mover counts a full set, a secondary half. */
export function groupShares(name: string): Map<MajorGroup, number> {
  const key = name.trim().toLowerCase();
  const cached = groupCache.get(key);
  if (cached) return cached;
  const shares = new Map<MajorGroup, number>();
  for (const score of resolveExercise(name)) {
    const group = REGION_GROUP[score.muscle];
    if (!group) continue;
    const credit = score.score >= 0.85 ? 1 : score.score >= 0.5 ? 0.5 : 0;
    if (credit > (shares.get(group) || 0)) shares.set(group, credit);
  }
  groupCache.set(key, shares);
  return shares;
}

export function isWorking(exercise: ExerciseLog): boolean {
  return completedSets(exercise).length > 0 && !isWarmupOrCooldown(exercise.name || '', exercise.section);
}

function snapshot(exercise: ExerciseLog, date?: string): ExerciseSnapshot {
  const sets = completedSets(exercise);
  const weighted = sets.filter(s => Number(s.weight) > 0);
  return {
    date,
    sets: sets.length,
    reps: sets.reduce((t, s) => t + (Number(s.reps) || 0), 0),
    holdSec: sets.reduce((t, s) => t + (Number(s.reps) ? 0 : Number(s.seconds) || 0), 0),
    volume: Math.round(exerciseTrainingVolume(exercise)),
    topWeight: Math.max(0, ...weighted.map(s => Number(s.weight) || 0)),
    e1rm: Math.round(Math.max(0, ...weighted.map(s => estimatedOneRepMax(Number(s.weight) || 0, Number(s.reps) || 0))) * 10) / 10,
    bestReps: Math.max(0, ...sets.map(s => Number(s.reps) || 0)),
  };
}

export function repZone(reps: number): RepZone | undefined {
  if (reps <= 0) return undefined;
  return reps <= 5 ? 'strength' : reps <= 12 ? 'hypertrophy' : 'endurance';
}

const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : undefined);
const signed = (n: number, suffix = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${suffix}`;

export interface AnalysisOptions {
  /** Display unit for weights in the generated text. */
  weightUnit?: 'kg' | 'lb';
}

/** Session-level and per-exercise breakdown of a workout against the user's history. */
export function analyzeWorkout(workout: Workout, history: Workout[], options: AnalysisOptions = {}): WorkoutAnalysis {
  const lb = options.weightUnit === 'lb';
  const w = (kg: number) => `${Math.round((lb ? kg * 2.20462 : kg) * 10) / 10} ${lb ? 'lb' : 'kg'}`;
  const currentMs = startMs(workout);
  const date = workout.date;
  const earlier = history
    .filter(h => h !== workout && (!workout.id || h.id !== workout.id) && startMs(h) < currentMs)
    .sort((a, b) => startMs(a) - startMs(b));
  // Same baseline as the saved overload summary: earlier days only, each exercise vs its best session.
  const priorDays = earlier.filter(h => h.date !== date && (h.exercises || []).length > 0);

  const overload = workout.progressiveOverload?.volumeChangePercent !== undefined
    ? workout.progressiveOverload
    : summarizeProgressiveOverload(workout, [...priorDays].reverse(), false);

  const working = (workout.exercises || []).filter(isWorking);
  const exercises: ExerciseAnalysis[] = working.map(exercise => {
    const current = snapshot(exercise);
    const unit = exerciseVolumeUnit(exercise);
    const weighted = unit === 'kg';
    const metric = bestSetMetric(exercise);

    let prevLog: ExerciseLog | null = null;
    let prevDate: string | undefined;
    let prevMetric = -1;
    const runningBests: number[] = [];
    for (const h of priorDays) {
      const match = (h.exercises || []).find(e => sameName(e.name, exercise.name));
      if (!match) continue;
      const m = bestSetMetric(match);
      runningBests.push(m);
      if (m > prevMetric) { prevLog = match; prevMetric = m; prevDate = h.date; }
    }
    const prev = prevLog ? snapshot(prevLog, prevDate) : undefined;

    // Trailing sessions (oldest → newest, ending with this one) that didn't beat the best before them.
    const sequence = [...runningBests, metric];
    let stalled = 0;
    let best = 0;
    const improved = sequence.map(m => { const up = m > best * 1.01; best = Math.max(best, m); return up; });
    for (let i = improved.length - 1; i >= 0 && !improved[i]; i--) stalled++;

    const repSets = completedSets(exercise).map(s => Number(s.reps) || 0).filter(r => r > 0);
    const avgReps = repSets.length ? Math.round((repSets.reduce((a, b) => a + b, 0) / repSets.length) * 10) / 10 : 0;

    const reasons: string[] = [];
    if (!prev) {
      reasons.push('First time logged — this session is your baseline.');
    } else {
      if (weighted && prev.topWeight > 0 && current.topWeight !== prev.topWeight) {
        reasons.push(`Top weight ${w(prev.topWeight)} → ${w(current.topWeight)} (${current.topWeight > prev.topWeight ? '+' : '−'}${w(Math.abs(current.topWeight - prev.topWeight))}).`);
      }
      if (current.sets !== prev.sets) reasons.push(`Sets ${prev.sets} → ${current.sets} (${signed(current.sets - prev.sets)}).`);
      if (current.reps !== prev.reps && (current.reps || prev.reps)) reasons.push(`Total reps ${prev.reps} → ${current.reps} (${signed(current.reps - prev.reps)}).`);
      if (current.holdSec !== prev.holdSec && (current.holdSec || prev.holdSec)) reasons.push(`Hold time ${prev.holdSec}s → ${current.holdSec}s (${signed(current.holdSec - prev.holdSec, 's')}).`);
      const e1rmChange = weighted ? pct(current.e1rm, prev.e1rm) : undefined;
      if (e1rmChange !== undefined && Math.abs(e1rmChange) >= 2) {
        reasons.push(`Estimated 1-rep max ${w(prev.e1rm)} → ${w(current.e1rm)} (${signed(e1rmChange, '%')}): ${e1rmChange > 0 ? 'you got stronger' : 'lower strength output than your best'}.`);
      }
      if (!reasons.length) reasons.push('Same sets, reps and load as your best session.');
    }

    return {
      name: exercise.name,
      unit,
      weighted,
      ...current,
      avgReps,
      zone: repZone(avgReps),
      rpe: exercise.rpe ?? null,
      prev,
      volumeChange: prev ? pct(current.volume, prev.volume) : undefined,
      isPR: !!prev && metric > prevMetric * 1.01,
      stalled: prev ? stalled : 0,
      reasons,
      groups: [...groupShares(exercise.name).keys()],
    };
  });

  const allSets = working.flatMap(e => completedSets(e));
  const weightedSets = allSets.filter(s => Number(s.weight) > 0);
  const rpes = working.map(e => e.rpe).filter((r): r is number => typeof r === 'number' && r > 0);
  const totals = {
    exercises: working.length,
    sets: allSets.length,
    reps: allSets.reduce((t, s) => t + (Number(s.reps) || 0), 0),
    holdSec: allSets.reduce((t, s) => t + (Number(s.reps) ? 0 : Number(s.seconds) || 0), 0),
    volumeKg: Math.round(weightedSets.reduce((t, s) => t + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0)),
    heaviestKg: Math.max(0, ...weightedSets.map(s => Number(s.weight) || 0)),
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    durationMin: Math.round(workout.durationMin || 0),
  };

  const sameDay = [...earlier].reverse().find(h => h.dayId && h.dayId === workout.dayId && h.planId === workout.planId);
  let lastSameDay: WorkoutAnalysis['lastSameDay'];
  if (sameDay) {
    const sets = (sameDay.exercises || []).filter(isWorking).flatMap(e => completedSets(e));
    lastSameDay = {
      date: sameDay.date,
      sets: sets.length,
      reps: sets.reduce((t, s) => t + (Number(s.reps) || 0), 0),
      volumeKg: Math.round(sets.reduce((t, s) => t + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0)),
      durationMin: Math.round(sameDay.durationMin || 0),
    };
  }

  const zones: Record<RepZone, number> = { strength: 0, hypertrophy: 0, endurance: 0 };
  for (const s of allSets) {
    const zone = repZone(Number(s.reps) || 0);
    if (zone) zones[zone]++;
  }

  // Rolling 7 days ending on this workout's date.
  const weekStart = shiftDate(date, -6);
  const weekWorkouts = [workout, ...earlier.filter(h => h.date >= weekStart && h.date <= date)];
  const muscleMap = new Map<MajorGroup, { sessionSets: number; weekSets: number; days: Set<string> }>();
  for (const session of weekWorkouts) {
    for (const exercise of (session.exercises || []).filter(isWorking)) {
      const sets = completedSets(exercise).length;
      for (const [group, credit] of groupShares(exercise.name)) {
        if (!credit) continue;
        const entry = muscleMap.get(group) || { sessionSets: 0, weekSets: 0, days: new Set<string>() };
        entry.weekSets += credit * sets;
        if (session === workout) entry.sessionSets += credit * sets;
        entry.days.add(session.date);
        muscleMap.set(group, entry);
      }
    }
  }
  const muscles: MuscleVolume[] = [...muscleMap.entries()]
    .map(([group, v]) => ({ group, sessionSets: Math.round(v.sessionSets * 10) / 10, weekSets: Math.round(v.weekSets * 10) / 10, weekDays: v.days.size }))
    .sort((a, b) => b.sessionSets - a.sessionSets || b.weekSets - a.weekSets);
  const strengthDaysThisWeek = new Set(weekWorkouts.map(s => s.date)).size;

  const volumeChangePercent = overload?.volumeChangePercent;
  const analysis: WorkoutAnalysis = {
    date, volumeChangePercent, totals, lastSameDay, zones, muscles, strengthDaysThisWeek, exercises, insights: [],
  };
  analysis.insights = workoutInsights(analysis);
  return analysis;
}

const list = (names: string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function workoutInsights(a: WorkoutAnalysis): Insight[] {
  const out: Insight[] = [];
  const change = a.volumeChangePercent;
  const compared = a.exercises.filter(e => e.volumeChange !== undefined);

  if (change !== undefined) {
    if (change > 0) {
      const drivers = compared.filter(e => (e.volumeChange || 0) > 0).sort((x, y) => (y.volumeChange || 0) - (x.volumeChange || 0)).slice(0, 2);
      out.push({ tone: 'good', title: `Progressive overload: volume +${change}%`, text: drivers.length ? `Driven by ${list(drivers.map(e => `${e.name} (+${e.volumeChange}%)`))}. Keep adding a rep or a little load each week.` : 'You did more total work than your previous best sessions.' });
    } else if (change <= -10) {
      const drops = compared.filter(e => (e.volumeChange || 0) < 0).sort((x, y) => (x.volumeChange || 0) - (y.volumeChange || 0)).slice(0, 2);
      out.push({ tone: 'warn', title: `Volume down ${Math.abs(change)}%`, text: `${drops.length ? `Biggest drops: ${list(drops.map(e => `${e.name} (${e.volumeChange}%)`))}. ` : ''}If this wasn't a planned deload, match your best session's sets and reps first, then build up again. Poor sleep, low food intake and stress are common causes.` });
    } else {
      out.push({ tone: 'info', title: 'Volume held steady', text: 'Similar total work to your best sessions. To keep growing, add one rep per set or a small load increase next time.' });
    }
  }

  const prs = a.exercises.filter(e => e.isPR);
  if (prs.length) out.push({ tone: 'good', title: `New best on ${prs.length} exercise${prs.length > 1 ? 's' : ''}`, text: `${list(prs.map(e => e.name))} beat every earlier session.` });

  const readyForLoad = a.exercises.filter(e => e.weighted && e.sets >= 2 && e.bestReps > 0 && e.avgReps >= 12);
  if (readyForLoad.length) out.push({ tone: 'good', title: 'Ready for more weight', text: `You hit 12+ reps per set on ${list(readyForLoad.map(e => e.name))}. Add 2.5–5% load next time and work back up the rep range (double progression).` });
  const readyForHarder = a.exercises.filter(e => !e.weighted && e.unit === 'reps' && e.sets >= 2 && e.avgReps >= 20);
  if (readyForHarder.length) out.push({ tone: 'good', title: 'Make it harder', text: `20+ reps per set on ${list(readyForHarder.map(e => e.name))}. For muscle growth, switch to a harder variation, add weight or slow the tempo (3 s down).` });
  const longHolds = a.exercises.filter(e => e.unit === 's' && e.sets >= 2 && e.holdSec / e.sets >= 60);
  if (longHolds.length) out.push({ tone: 'good', title: 'Progress the hold', text: `60 s+ holds on ${list(longHolds.map(e => e.name))}. Move to the next progression rather than holding longer.` });

  const stalled = a.exercises.filter(e => e.stalled >= 3);
  if (stalled.length) out.push({ tone: 'warn', title: 'Plateau', text: `${list(stalled.map(e => `${e.name} (${e.stalled} sessions)`))} hasn't beaten its best. Try one extra set, a different rep range, or a lighter deload week (about −10% load) before pushing again.` });

  const zoneTotal = a.zones.strength + a.zones.hypertrophy + a.zones.endurance;
  if (zoneTotal >= 4) {
    const share = (n: number) => Math.round((n / zoneTotal) * 100);
    if (share(a.zones.endurance) > 60) out.push({ tone: 'info', title: 'Mostly high-rep sets', text: `${share(a.zones.endurance)}% of sets were 13+ reps. Growth happens across rep ranges when sets end close to failure, but 6–12 reps is the most time-efficient range for building muscle.` });
    else if (share(a.zones.strength) > 60) out.push({ tone: 'info', title: 'Strength-focused session', text: `${share(a.zones.strength)}% of sets were 1–5 reps: great for maximal strength. Add some 6–12 rep work if you also want size.` });
    else if (share(a.zones.hypertrophy) >= 50) out.push({ tone: 'good', title: 'Muscle-building rep range', text: `${share(a.zones.hypertrophy)}% of sets in 6–12 reps — the sweet spot for hypertrophy.` });
  }

  const trained = a.muscles.filter(m => m.sessionSets > 0);
  const low = trained.filter(m => m.weekSets < 10);
  const high = trained.filter(m => m.weekSets > 20);
  const inRange = trained.filter(m => m.weekSets >= 10 && m.weekSets <= 20);
  if (inRange.length) out.push({ tone: 'good', title: 'In the growth range', text: `${list(inRange.map(m => `${m.group} ${m.weekSets} sets`))} over the last 7 days — within the 10–20 weekly hard sets linked to the best muscle growth.` });
  if (low.length) out.push({ tone: 'info', title: 'Room for more weekly volume', text: `${list(low.map(m => `${m.group} ${m.weekSets}`))} sets in the last 7 days. For growth, aim for about 10–20 hard sets per muscle each week, spread over 2+ sessions.` });
  if (high.length) out.push({ tone: 'warn', title: 'High weekly volume', text: `${list(high.map(m => `${m.group} ${m.weekSets} sets`))} this week. Above ~20 sets per muscle, extra volume adds fatigue faster than growth — watch recovery.` });
  const onceOnly = trained.filter(m => m.weekDays === 1 && m.weekSets >= 8);
  if (onceOnly.length) out.push({ tone: 'info', title: 'Split the volume', text: `${list(onceOnly.map(m => m.group))} ${onceOnly.length > 1 ? 'were' : 'was'} trained on one day only this week. Hitting each muscle twice a week tends to build more muscle than one big session.` });

  if (a.totals.avgRpe !== null) {
    if (a.totals.avgRpe < 7) out.push({ tone: 'info', title: `Effort RPE ${a.totals.avgRpe}`, text: 'Most working sets should finish 1–3 reps short of failure (RPE 7–9) to drive muscle growth.' });
    else if (a.totals.avgRpe > 9.3) out.push({ tone: 'warn', title: `Very high effort (RPE ${a.totals.avgRpe})`, text: 'Going to failure on every set piles up fatigue. Keep 1–2 reps in reserve on most sets and save all-out sets for the last one.' });
  }

  out.push(a.strengthDaysThisWeek >= 2
    ? { tone: 'good', title: 'Health guideline met', text: `${a.strengthDaysThisWeek} strength days in the last 7 days. The WHO recommends muscle-strengthening work for all major muscle groups on 2+ days a week.` }
    : { tone: 'info', title: 'Aim for 2 strength days a week', text: 'The WHO recommends muscle-strengthening activity on 2 or more days a week for long-term health, bone density and metabolic health.' });
  return out;
}
