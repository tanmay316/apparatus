/**
 * Relative effort across every activity (Strava-style): one effort score per session from the
 * same load model as Fitness & Freshness, weekly totals, and a "weekly range" learned from the
 * three weeks before so a week can be read as easy, on target or a big jump.
 */
import type { CardioActivity, CardioActivityType, Workout } from '@/types';
import { cardioLoad, strengthLoad, thresholdKmh, fitnessFreshness } from '@/lib/training-load';
import { shiftDate } from '@/lib/analysis-common';

export type EffortKind = CardioActivityType | 'strength';

export interface ActivityEffort {
  id: string;
  date: string;
  kind: EffortKind;
  title: string;
  score: number;
}

export interface EffortWeek {
  start: string;
  label: string;
  total: number;
  low: number | null;
  high: number | null;
}

export interface EffortSummary {
  weeks: EffortWeek[];
  current: EffortWeek;
  /** Cumulative effort by weekday for this week (null after today). */
  days: { label: string; date: string; cumulative: number | null; score: number }[];
  activities: ActivityEffort[];
  status: { label: string; tone: 'good' | 'info' | 'warn'; text: string };
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const offset = (d.getDay() + 6) % 7;
  return shiftDate(date, -offset);
}

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function activityEfforts(cardio: CardioActivity[], workouts: Workout[], asOf: string): ActivityEffort[] {
  const thr: Record<CardioActivityType, number> = {
    run: thresholdKmh(cardio, 'run', asOf),
    walk: thresholdKmh(cardio, 'walk', asOf),
    cycle: thresholdKmh(cardio, 'cycle', asOf),
  };
  const out: ActivityEffort[] = [];
  for (const a of cardio) {
    if (!a.date || a.date > asOf) continue;
    const score = cardioLoad(a, thr[a.type] || 9);
    if (score > 0) {
      const name = a.type === 'run' ? 'Run' : a.type === 'cycle' ? 'Ride' : 'Walk';
      out.push({ id: a.id || `${a.date}-${a.type}`, date: a.date, kind: a.type, title: `${name} · ${(a.distanceKm || 0).toFixed(1)} km`, score });
    }
  }
  for (const w of workouts) {
    if (!w.date || w.date > asOf) continue;
    const score = strengthLoad(w);
    if (score > 0) out.push({ id: w.id || `${w.date}-w`, date: w.date, kind: 'strength', title: w.dayTitle || 'Strength workout', score });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
}

/** Weekly effort with the range from the previous three weeks (80–125% of their average). */
export function relativeEffort(cardio: CardioActivity[], workouts: Workout[], asOf: string, weekCount = 12): EffortSummary {
  const efforts = activityEfforts(cardio, workouts, asOf);
  const byWeek = new Map<string, number>();
  for (const e of efforts) {
    const wk = weekStart(e.date);
    byWeek.set(wk, (byWeek.get(wk) || 0) + e.score);
  }
  const thisWeek = weekStart(asOf);
  const weeks: EffortWeek[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = shiftDate(thisWeek, -7 * i);
    const prior = [1, 2, 3].map(k => byWeek.get(shiftDate(start, -7 * k)) || 0);
    const avg = prior.reduce((s, v) => s + v, 0) / 3;
    weeks.push({
      start,
      label: shortDate(start),
      total: byWeek.get(start) || 0,
      low: avg > 0 ? Math.round(avg * 0.8) : null,
      high: avg > 0 ? Math.round(avg * 1.25) : null,
    });
  }
  const current = weeks[weeks.length - 1];

  let running = 0;
  const days = DAY_LABELS.map((label, i) => {
    const date = shiftDate(thisWeek, i);
    const score = efforts.filter(e => e.date === date).reduce((s, e) => s + e.score, 0);
    if (date <= asOf) running += score;
    return { label, date, score, cumulative: date <= asOf ? running : null };
  });

  const status = weekStatus(current, asOf);
  return { weeks, current, days, activities: efforts.filter(e => e.date >= thisWeek), status };
}

function weekStatus(w: EffortWeek, asOf: string): EffortSummary['status'] {
  if (w.low === null || w.high === null) {
    return { label: 'Building your range', tone: 'info', text: 'Train for a few weeks and we will learn the weekly effort that suits you.' };
  }
  const daysLeft = 6 - ((new Date(`${asOf}T12:00:00`).getDay() + 6) % 7);
  if (w.total > w.high) return { label: 'Above your range', tone: 'warn', text: 'A big week compared with your last three. Fitness grows, but so does injury risk: keep the next sessions easy.' };
  if (w.total >= w.low) return { label: 'In your range', tone: 'good', text: 'Steady, sustainable progress. This is the load your recent training says you can handle.' };
  if (daysLeft > 0) return { label: 'Below your range', tone: 'info', text: `About ${w.low - w.total} effort to go to reach your range, with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left this week.` };
  return { label: 'Recovery week', tone: 'info', text: 'Lighter than your recent weeks. Fine as a recovery week; push a little more next week to keep building.' };
}

export interface FitnessScore {
  series: { date: string; fitness: number }[];
  current: number;
  change: number;
  peak: number;
  peakDate: string;
  level: string;
}

const LEVELS: [number, string][] = [[80, 'Elite'], [60, 'Very high'], [40, 'High'], [25, 'Solid'], [12, 'Building'], [0, 'Starting out']];

/** Fitness score (42-day training load average) over `days`, with its change and peak. */
export function fitnessScore(cardio: CardioActivity[], workouts: Workout[], asOf: string, days: number): FitnessScore {
  const f = fitnessFreshness(cardio, workouts, asOf, days);
  const series = f.series.map(p => ({ date: p.date, fitness: p.fitness }));
  let peak = series[0];
  for (const p of series) if (p.fitness >= peak.fitness) peak = p;
  const current = series[series.length - 1].fitness;
  return {
    series,
    current,
    change: current - series[0].fitness,
    peak: peak.fitness,
    peakDate: peak.date,
    level: LEVELS.find(([min]) => current >= min)?.[1] || 'Starting out',
  };
}
