import type { BadgeContext, CardioActivity, UserStats, Workout } from '@/types';
import { evaluateBadges } from '@/lib/badges';
import { findPersonalRecords } from '@/lib/progressive-overload';

/** Bump to force every user's stats to be rebuilt from their history on next login. */
export const STATS_VERSION = 5;

export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, (m || 1) - 1, (d || 1) + days));
}

export function weekStartKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const offset = (date.getDay() + 6) % 7; // Monday = 0
  return shiftDateKey(key, -offset);
}

export function emptyStats(): UserStats {
  return {
    totalWorkouts: 0,
    totalCalories: 0,
    totalDurationMin: 0,
    totalVolume: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastWorkoutDate: null,
    xp: 0,
    prCount: 0,
    bestHold: 0,
    badges: [],
    totalCardioSessions: 0,
    totalDistanceKm: 0,
    longestCardioKm: 0,
    totalCardioMin: 0,
    maxLiftKg: 0,
    fullWeekAchieved: false,
  };
}

const MAX_TIME_XP_MIN = 180;
const MAX_EFFORT_XP = 150;
// Per-km XP by activity: a cycled km takes far less effort than a run km.
const CARDIO_KM_XP: Record<string, number> = { run: 10, walk: 6, cycle: 3 };

/** Strength XP: 50 for showing up + 1/min + load moved (1 per 500 kg·reps) + 25 per PR. */
export function workoutXp(volume: number, durationMin: number, prCount = 0): number {
  return 50
    + Math.round(Math.min(durationMin || 0, MAX_TIME_XP_MIN))
    + Math.min(MAX_EFFORT_XP, Math.round((volume || 0) / 500))
    + Math.min(100, (prCount || 0) * 25);
}

/** Cardio XP: 50 for showing up + 1/min + distance weighted by activity type. */
export function cardioXp(distanceKm: number, durationMin: number, type?: string): number {
  const perKm = CARDIO_KM_XP[type || ''] ?? 8;
  return 50
    + Math.round(Math.min(durationMin || 0, MAX_TIME_XP_MIN))
    + Math.min(MAX_EFFORT_XP, Math.round((distanceKm || 0) * perKm));
}

/** Bonus for training on a new day while a streak is running: 5 XP per streak day, max 50. */
export function streakBonusXp(streakDays: number): number {
  return streakDays > 1 ? Math.min(50, streakDays * 5) : 0;
}

/** Streak shown to users: a missed day means the streak is over. */
export function effectiveStreak(stats?: Partial<UserStats> | null, today: string = localDateKey()): number {
  if (!stats?.lastWorkoutDate) return 0;
  const last = stats.lastWorkoutDate;
  return last === today || last === shiftDateKey(today, -1) ? stats.currentStreak || 0 : 0;
}

export function badgeContextFromStats(stats: Partial<UserStats>): BadgeContext {
  const totalWorkouts = stats.totalWorkouts || 0;
  const totalCardio = stats.totalCardioSessions || 0;
  return {
    totalSessions: totalWorkouts + totalCardio,
    totalCalories: stats.totalCalories || 0,
    totalDurationMin: stats.totalDurationMin || 0,
    totalVolume: stats.totalVolume || 0,
    maxLiftKg: stats.maxLiftKg || 0,
    bestHold: stats.bestHold || 0,
    currentStreak: stats.currentStreak || 0,
    longestStreak: stats.longestStreak || 0,
    prCount: stats.prCount || 0,
    daysCompleted: totalWorkouts,
    uniqueDaysCompleted: totalWorkouts,
    yogaCount: 0,
    measurementsCount: 0,
    weekGoalHit: !!stats.fullWeekAchieved,
    totalCardioSessions: totalCardio,
    totalCardioMin: stats.totalCardioMin || 0,
    totalDistanceKm: stats.totalDistanceKm || 0,
    longestCardioKm: stats.longestCardioKm || 0,
  };
}

/** Badges are never revoked: newly earned ones are appended to what the user already has. */
export function mergeBadges(previous: string[] | undefined, stats: Partial<UserStats>) {
  const before = (previous || []).filter(Boolean);
  const owned = new Set(before);
  const unlocked = evaluateBadges(badgeContextFromStats(stats)).filter(id => !owned.has(id));
  return { badges: [...before, ...unlocked], unlocked };
}

export interface SessionInput {
  kind: 'workout' | 'cardio';
  dateKey: string;
  calories: number;
  durationMin: number;
  volume?: number;
  prCount?: number;
  bestHold?: number;
  distanceKm?: number;
  cardioType?: string;
  maxLiftKg?: number;
  fullWeek?: boolean;
}

export interface SessionResult {
  stats: UserStats;
  xpEarned: number;
  streakBonus: number;
  unlocked: string[];
}

/** Folds one finished session (strength or cardio) into the user's aggregate stats. */
export function applySession(previous: Partial<UserStats> | undefined, session: SessionInput): SessionResult {
  const base: UserStats = { ...emptyStats(), ...(previous || {}) } as UserStats;
  const last = base.lastWorkoutDate;
  let currentStreak = base.currentStreak || 0;
  let lastWorkoutDate = last;

  if (!last) {
    currentStreak = 1;
    lastWorkoutDate = session.dateKey;
  } else if (session.dateKey === last) {
    currentStreak = Math.max(currentStreak, 1);
  } else if (session.dateKey === shiftDateKey(last, 1)) {
    currentStreak += 1;
    lastWorkoutDate = session.dateKey;
  } else if (session.dateKey > last) {
    currentStreak = 1;
    lastWorkoutDate = session.dateKey;
  }
  // An older session saved late (e.g. a run that started before midnight) doesn't move the streak.

  const isNewTrainingDay = lastWorkoutDate !== last || !last;
  const streakBonus = isNewTrainingDay ? streakBonusXp(currentStreak) : 0;
  const xpEarned = streakBonus + (session.kind === 'workout'
    ? workoutXp(session.volume || 0, session.durationMin, session.prCount || 0)
    : cardioXp(session.distanceKm || 0, session.durationMin, session.cardioType));
  const distance = session.distanceKm || 0;

  const stats: UserStats = {
    ...base,
    totalWorkouts: (base.totalWorkouts || 0) + (session.kind === 'workout' ? 1 : 0),
    totalCardioSessions: (base.totalCardioSessions || 0) + (session.kind === 'cardio' ? 1 : 0),
    totalCalories: Math.round((base.totalCalories || 0) + (session.calories || 0)),
    totalDurationMin: Math.round((base.totalDurationMin || 0) + (session.durationMin || 0)),
    totalVolume: (base.totalVolume || 0) + (session.volume || 0),
    totalDistanceKm: Math.round(((base.totalDistanceKm || 0) + distance) * 100) / 100,
    longestCardioKm: Math.max(base.longestCardioKm || 0, distance),
    totalCardioMin: Math.round((base.totalCardioMin || 0) + (session.kind === 'cardio' ? session.durationMin || 0 : 0)),
    maxLiftKg: Math.max(base.maxLiftKg || 0, session.maxLiftKg || 0),
    currentStreak,
    longestStreak: Math.max(base.longestStreak || 0, currentStreak),
    lastWorkoutDate,
    xp: (base.xp || 0) + xpEarned,
    prCount: (base.prCount || 0) + (session.prCount || 0),
    bestHold: Math.max(base.bestHold || 0, session.bestHold || 0),
    fullWeekAchieved: !!base.fullWeekAchieved || !!session.fullWeek,
  };
  const { badges, unlocked } = mergeBadges(base.badges, stats);
  stats.badges = badges;
  return { stats, xpEarned, streakBonus, unlocked };
}

/** Heaviest completed set weight in a session (kg). */
export function heaviestLiftKg(workout: Pick<Workout, 'exercises'>): number {
  return Math.max(0, ...(workout.exercises || []).flatMap(exercise =>
    (exercise.sets || []).filter(set => set.completed !== false).map(set => Number(set.weight) || 0),
  ));
}

export function bestHoldSeconds(workout: Pick<Workout, 'exercises'>): number {
  return Math.max(0, ...(workout.exercises || []).flatMap(exercise =>
    (exercise.sets || []).filter(set => set.completed !== false).map(set => Number(set.seconds) || 0),
  ));
}

export function cardioDurationMin(activity: Pick<CardioActivity, 'movingDurationSec' | 'durationSec'>): number {
  return (activity.movingDurationSec || activity.durationSec || 0) / 60;
}

/** True when this session completes every planned day of its plan for that week. */
export function completesPlanWeek(
  workout: Pick<Workout, 'planId' | 'dayId' | 'date'>,
  earlier: Pick<Workout, 'planId' | 'dayId' | 'date'>[],
  daysPerWeek: number,
): boolean {
  if (!workout.planId || !workout.dayId || !workout.date || daysPerWeek <= 0) return false;
  const week = weekStartKey(workout.date);
  const days = new Set(
    earlier
      .filter(w => w.planId === workout.planId && w.date && weekStartKey(w.date) === week)
      .map(w => w.dayId),
  );
  days.add(workout.dayId);
  return days.size >= daysPerWeek;
}

function timeOf(value: any, fallbackKey?: string): number {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  if (fallbackKey) {
    const t = new Date(`${fallbackKey}T12:00:00`).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

/** Recomputes aggregate stats from the full workout + cardio history. Earned badges are kept. */
export function rebuildStats(
  previous: Partial<UserStats> | undefined,
  workouts: Workout[],
  cardio: CardioActivity[],
  planDaysPerWeek: Record<string, number>,
): UserStats {
  const sessions = [
    ...workouts.map(w => ({ kind: 'workout' as const, time: timeOf(w.startedAt, w.date), workout: w })),
    ...cardio.map(c => ({ kind: 'cardio' as const, time: timeOf(c.startedAt, c.date), cardio: c })),
  ].sort((a, b) => a.time - b.time);

  let stats: UserStats = { ...emptyStats(), badges: [...(previous?.badges || [])] };
  const history: Workout[] = [];

  for (const session of sessions) {
    if (session.kind === 'workout') {
      const w = session.workout;
      const dateKey = w.date || localDateKey(new Date(session.time));
      stats = applySession(stats, {
        kind: 'workout',
        dateKey,
        calories: w.calories || 0,
        durationMin: w.durationMin || 0,
        volume: w.volume || 0,
        prCount: findPersonalRecords(w, history).length,
        bestHold: bestHoldSeconds(w),
        maxLiftKg: heaviestLiftKg(w),
        fullWeek: completesPlanWeek({ ...w, date: dateKey }, history, planDaysPerWeek[w.planId] || 0),
      }).stats;
      history.push({ ...w, date: dateKey });
    } else {
      const c = session.cardio;
      stats = applySession(stats, {
        kind: 'cardio',
        dateKey: c.date || localDateKey(new Date(session.time)),
        calories: c.calories || 0,
        durationMin: cardioDurationMin(c),
        distanceKm: c.distanceKm || 0,
        cardioType: c.type,
      }).stats;
    }
  }

  return { ...stats, statsVersion: STATS_VERSION };
}
