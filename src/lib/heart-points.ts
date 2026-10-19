import type { CardioActivity, Workout } from '@/types';

/**
 * Heart points, the WHO activity guideline as a daily goal (like Google Fit / Apple Exercise):
 * 1 point per minute of moderate activity, 2 per minute of vigorous activity.
 * WHO: at least 150 moderate (or 75 vigorous) minutes a week = 150 points.
 */
export const HEART_WEEKLY_GOAL = 150;
/** 30 a day on 5 days meets the weekly guideline. */
export const HEART_DAILY_GOAL = 30;

const MAX_KMH = { run: 25, walk: 10, cycle: 70 } as const;

export function cardioHeartPoints(a: CardioActivity): number {
  const sec = a.movingDurationSec || a.durationSec || 0;
  if (sec <= 0) return 0;
  const min = sec / 60;
  const kmh = (a.distanceKm || 0) / (sec / 3600);
  if (kmh > (MAX_KMH[a.type] ?? 70)) return min;
  // Speed thresholds follow the Compendium of Physical Activities: 3 MET = moderate, 6 MET = vigorous.
  if (a.type === 'run') return kmh >= 6 ? min * 2 : min;
  if (a.type === 'cycle') return kmh >= 16 ? min * 2 : kmh >= 10 ? min : 0;
  return kmh >= 6.5 ? min * 2 : kmh >= 4 ? min : 0;
}

/** Strength training counts as moderate activity for its whole logged duration. */
export function workoutHeartPoints(w: Workout): number {
  return Math.min(180, Math.max(0, w.durationMin || 0));
}

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday of the week that contains `day`. */
export function weekStart(day: Date): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export interface HeartSummary {
  today: number;
  week: number;
  /** Monday → Sunday of the current week. */
  days: { date: string; points: number }[];
}

export function heartSummary(cardio: CardioActivity[], workouts: Workout[], now = new Date()): HeartSummary {
  const start = weekStart(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: dateKey(d), points: 0 };
  });
  const byDate = new Map(days.map(d => [d.date, d]));
  for (const a of cardio) {
    const day = a.date && byDate.get(a.date);
    if (day) day.points += cardioHeartPoints(a);
  }
  for (const w of workouts) {
    const day = w.date && byDate.get(w.date);
    if (day) day.points += workoutHeartPoints(w);
  }
  for (const d of days) d.points = Math.round(d.points);
  return {
    today: byDate.get(dateKey(now))?.points ?? 0,
    week: days.reduce((s, d) => s + d.points, 0),
    days,
  };
}
