import type { PlanDay } from '@/types';

/** A logged workout counts for a plan day when it was saved for that day (by id, or by day number on older logs). */
export function isWorkoutForDay(workout: any, day: PlanDay, planId?: string | null): boolean {
  if (!workout || workout.dayId == null) return false;
  if (day.id && workout.dayId === day.id) return true;
  // Older logs stored the day number; only trust that for this plan (or logs without a plan id).
  const samePlan = !planId || !workout.planId || workout.planId === planId;
  return samePlan && String(workout.dayId) === String(day.dayNumber);
}

export function isDayDoneThisWeek(day: PlanDay, weekWorkouts: any[], planId?: string | null): boolean {
  return weekWorkouts.some(w => isWorkoutForDay(w, day, planId));
}

/**
 * The plan day to train next: the day of a running session, otherwise the first day in plan order that
 * hasn't been done this week (since Monday). A missed day stays up next until it's done, so on Tuesday
 * with Monday skipped, Monday's workout is shown, not Tuesday's. When the week is complete, the last day.
 */
export function upNextDayIndex(days: PlanDay[], weekWorkouts: any[], planId?: string | null, activeSessionDayId?: string | null): number {
  if (days.length === 0) return -1;
  if (activeSessionDayId) {
    const active = days.findIndex(d => d.id === activeSessionDayId || String(d.dayNumber) === String(activeSessionDayId));
    if (active !== -1) return active;
  }
  const next = days.findIndex(d => !isDayDoneThisWeek(d, weekWorkouts, planId));
  return next === -1 ? days.length - 1 : next;
}
