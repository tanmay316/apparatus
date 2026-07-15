import type { Badge, BadgeContext } from '@/types';

export const BADGES: Badge[] = [
  // ─── Workout Milestones ───────────────────────────────────
  {
    id: 'first_workout',
    icon: '🎯',
    name: 'First Rep',
    desc: 'Complete your first workout',
    cond: (ctx) => ctx.totalSessions >= 1,
  },
  {
    id: 'ten_workouts',
    icon: '🔥',
    name: 'Decade',
    desc: 'Complete 10 workouts',
    cond: (ctx) => ctx.totalSessions >= 10,
  },
  {
    id: 'fifty_workouts',
    icon: '💪',
    name: 'Half Century',
    desc: 'Complete 50 workouts',
    cond: (ctx) => ctx.totalSessions >= 50,
  },
  {
    id: 'hundred_workouts',
    icon: '👑',
    name: 'Centurion',
    desc: 'Complete 100 workouts',
    cond: (ctx) => ctx.totalSessions >= 100,
  },

  // ─── Streak Badges ────────────────────────────────────────
  {
    id: 'streak_3',
    icon: '⚡',
    name: 'Three-Peat',
    desc: 'Achieve a 3-day streak',
    cond: (ctx) => ctx.longestStreak >= 3,
  },
  {
    id: 'streak_7',
    icon: '🌟',
    name: 'Weekly Warrior',
    desc: 'Achieve a 7-day streak',
    cond: (ctx) => ctx.longestStreak >= 7,
  },
  {
    id: 'streak_14',
    icon: '🏆',
    name: 'Fortnight Fighter',
    desc: 'Achieve a 14-day streak',
    cond: (ctx) => ctx.longestStreak >= 14,
  },
  {
    id: 'streak_30',
    icon: '🔱',
    name: 'Iron Will',
    desc: 'Achieve a 30-day streak',
    cond: (ctx) => ctx.longestStreak >= 30,
  },

  // ─── Volume Badges ────────────────────────────────────────
  {
    id: 'volume_1k',
    icon: '🏋️',
    name: 'Metric Ton',
    desc: 'Accumulate 1,000 kg·reps total volume',
    cond: (ctx) => ctx.totalVolume >= 1000,
  },
  {
    id: 'volume_10k',
    icon: '⚙️',
    name: 'Heavy Lifter',
    desc: 'Accumulate 10,000 kg·reps total volume',
    cond: (ctx) => ctx.totalVolume >= 10000,
  },
  {
    id: 'volume_100k',
    icon: '🗿',
    name: 'Monolith',
    desc: 'Accumulate 100,000 kg·reps total volume',
    cond: (ctx) => ctx.totalVolume >= 100000,
  },

  // ─── Personal Records ─────────────────────────────────────
  {
    id: 'first_pr',
    icon: '📈',
    name: 'Record Breaker',
    desc: 'Set your first personal record',
    cond: (ctx) => ctx.prCount >= 1,
  },
  {
    id: 'ten_prs',
    icon: '🚀',
    name: 'PR Machine',
    desc: 'Set 10 personal records',
    cond: (ctx) => ctx.prCount >= 10,
  },

  // ─── Endurance ─────────────────────────────────────────────
  {
    id: 'hold_60',
    icon: '🧘',
    name: 'Stillness',
    desc: 'Hold a static position for 60+ seconds',
    cond: (ctx) => ctx.bestHold >= 60,
  },

  // ─── Variety ──────────────────────────────────────────────
  {
    id: 'full_week',
    icon: '📅',
    name: 'Full Week',
    desc: 'Complete all planned days in a single week',
    cond: (ctx) => ctx.weekGoalHit,
  },
];

/** Evaluate which badges a user has earned */
export function evaluateBadges(context: BadgeContext): string[] {
  return BADGES.filter(b => b.cond(context)).map(b => b.id);
}

/** Get badge definition by ID */
export function getBadge(id: string): Badge | undefined {
  return BADGES.find(b => b.id === id);
}
