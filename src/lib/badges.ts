import type { Badge, BadgeContext } from '@/types';

export const BADGES: Badge[] = [
  // ─── Workout Milestones (strength + cardio sessions) ─────
  {
    id: 'first_workout',
    icon: '🎯',
    name: 'First Rep',
    desc: 'Complete your first workout or cardio session',
    cond: (ctx) => ctx.totalSessions >= 1,
  },
  {
    id: 'ten_workouts',
    icon: '🔥',
    name: 'Decade',
    desc: 'Complete 10 workouts or cardio sessions',
    cond: (ctx) => ctx.totalSessions >= 10,
  },
  {
    id: 'twenty_five_sessions',
    icon: '🧱',
    name: 'Foundation',
    desc: 'Complete 25 training sessions',
    cond: (ctx) => ctx.totalSessions >= 25,
  },
  {
    id: 'fifty_workouts',
    icon: '💪',
    name: 'Half Century',
    desc: 'Complete 50 workouts or cardio sessions',
    cond: (ctx) => ctx.totalSessions >= 50,
  },
  {
    id: 'hundred_workouts',
    icon: '👑',
    name: 'Centurion',
    desc: 'Complete 100 workouts or cardio sessions',
    cond: (ctx) => ctx.totalSessions >= 100,
  },
  {
    id: 'two_fifty_sessions',
    icon: '🛡️',
    name: 'Veteran',
    desc: 'Complete 250 training sessions',
    cond: (ctx) => ctx.totalSessions >= 250,
  },
  {
    id: 'five_hundred_sessions',
    icon: '💎',
    name: 'Lifetime Athlete',
    desc: 'Complete 500 training sessions',
    cond: (ctx) => ctx.totalSessions >= 500,
  },

  // ─── Streak Badges ────────────────────────────────────────
  {
    id: 'streak_3',
    icon: '⚡',
    name: 'Three-Peat',
    desc: 'Train 3 days in a row',
    cond: (ctx) => ctx.longestStreak >= 3,
  },
  {
    id: 'streak_7',
    icon: '🌟',
    name: 'Weekly Warrior',
    desc: 'Train 7 days in a row',
    cond: (ctx) => ctx.longestStreak >= 7,
  },
  {
    id: 'streak_14',
    icon: '🏆',
    name: 'Fortnight Fighter',
    desc: 'Train 14 days in a row',
    cond: (ctx) => ctx.longestStreak >= 14,
  },
  {
    id: 'streak_30',
    icon: '🔱',
    name: 'Iron Will',
    desc: 'Train 30 days in a row',
    cond: (ctx) => ctx.longestStreak >= 30,
  },
  {
    id: 'streak_60',
    icon: '☀️',
    name: 'Unbroken',
    desc: 'Train 60 days in a row',
    cond: (ctx) => ctx.longestStreak >= 60,
  },
  {
    id: 'streak_100',
    icon: '♾️',
    name: 'Century Streak',
    desc: 'Train 100 days in a row',
    cond: (ctx) => ctx.longestStreak >= 100,
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
  {
    id: 'volume_500k',
    icon: '🏗️',
    name: 'Mass Mover',
    desc: 'Accumulate 500,000 kg·reps total volume',
    cond: (ctx) => ctx.totalVolume >= 500000,
  },
  {
    id: 'volume_1m',
    icon: '🏔️',
    name: 'Million Kilo Club',
    desc: 'Accumulate 1,000,000 kg·reps total volume',
    cond: (ctx) => ctx.totalVolume >= 1000000,
  },

  // ─── Peak Strength ────────────────────────────────────────
  {
    id: 'lift_50',
    icon: '🔩',
    name: 'Loaded',
    desc: 'Complete a set with 50 kg',
    cond: (ctx) => ctx.maxLiftKg >= 50,
  },
  {
    id: 'lift_100',
    icon: '🔨',
    name: 'Triple Digits',
    desc: 'Complete a set with 100 kg',
    cond: (ctx) => ctx.maxLiftKg >= 100,
  },
  {
    id: 'lift_150',
    icon: '🦾',
    name: 'Heavy Metal',
    desc: 'Complete a set with 150 kg',
    cond: (ctx) => ctx.maxLiftKg >= 150,
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
  {
    id: 'twenty_five_prs',
    icon: '💥',
    name: 'Limit Breaker',
    desc: 'Set 25 personal records',
    cond: (ctx) => ctx.prCount >= 25,
  },
  {
    id: 'fifty_prs',
    icon: '📊',
    name: 'Always Improving',
    desc: 'Set 50 personal records',
    cond: (ctx) => ctx.prCount >= 50,
  },

  // ─── Endurance ─────────────────────────────────────────────
  {
    id: 'hold_60',
    icon: '🧘',
    name: 'Stillness',
    desc: 'Hold a static position for 60+ seconds',
    cond: (ctx) => ctx.bestHold >= 60,
  },
  {
    id: 'hold_120',
    icon: '⏳',
    name: 'Time Under Tension',
    desc: 'Hold a static position for 2 minutes',
    cond: (ctx) => ctx.bestHold >= 120,
  },
  {
    id: 'hold_180',
    icon: '🗿',
    name: 'Unshakable',
    desc: 'Hold a static position for 3 minutes',
    cond: (ctx) => ctx.bestHold >= 180,
  },

  // ─── Cardio ───────────────────────────────────────────────
  {
    id: 'first_cardio',
    icon: '🏃',
    name: 'First Miles',
    desc: 'Complete your first run, walk or ride',
    cond: (ctx) => ctx.totalCardioSessions >= 1,
  },
  {
    id: 'cardio_10',
    icon: '👟',
    name: 'Road Regular',
    desc: 'Complete 10 cardio sessions',
    cond: (ctx) => ctx.totalCardioSessions >= 10,
  },
  {
    id: 'cardio_25',
    icon: '🌬️',
    name: 'Built to Move',
    desc: 'Complete 25 cardio sessions',
    cond: (ctx) => ctx.totalCardioSessions >= 25,
  },
  {
    id: 'cardio_50',
    icon: '🛣️',
    name: 'Endurance Engine',
    desc: 'Complete 50 cardio sessions',
    cond: (ctx) => ctx.totalCardioSessions >= 50,
  },
  {
    id: 'cardio_100',
    icon: '❤️',
    name: 'Cardio Century',
    desc: 'Complete 100 cardio sessions',
    cond: (ctx) => ctx.totalCardioSessions >= 100,
  },
  {
    id: 'distance_5k',
    icon: '🥾',
    name: '5K Finisher',
    desc: 'Cover 5 km in a single session',
    cond: (ctx) => ctx.longestCardioKm >= 5,
  },
  {
    id: 'distance_10k',
    icon: '🏅',
    name: '10K Club',
    desc: 'Cover 10 km in a single session',
    cond: (ctx) => ctx.longestCardioKm >= 10,
  },
  {
    id: 'distance_half_marathon',
    icon: '🎽',
    name: 'Half Marathon',
    desc: 'Cover 21.1 km in a single session',
    cond: (ctx) => ctx.longestCardioKm >= 21.1,
  },
  {
    id: 'distance_marathon',
    icon: '🏁',
    name: 'Marathon Distance',
    desc: 'Cover 42.2 km in a single session',
    cond: (ctx) => ctx.longestCardioKm >= 42.2,
  },
  {
    id: 'total_50km',
    icon: '🗺️',
    name: 'Explorer',
    desc: 'Cover 50 km in total',
    cond: (ctx) => ctx.totalDistanceKm >= 50,
  },
  {
    id: 'total_100km',
    icon: '🌍',
    name: 'Globetrotter',
    desc: 'Cover 100 km in total',
    cond: (ctx) => ctx.totalDistanceKm >= 100,
  },
  {
    id: 'total_250km',
    icon: '🧭',
    name: 'Pathfinder',
    desc: 'Cover 250 km in total',
    cond: (ctx) => ctx.totalDistanceKm >= 250,
  },
  {
    id: 'total_500km',
    icon: '🚵',
    name: 'Long Haul',
    desc: 'Cover 500 km in total',
    cond: (ctx) => ctx.totalDistanceKm >= 500,
  },
  {
    id: 'total_1000km',
    icon: '🌐',
    name: 'Thousand K Club',
    desc: 'Cover 1,000 km in total',
    cond: (ctx) => ctx.totalDistanceKm >= 1000,
  },

  // ─── Time & Energy ────────────────────────────────────────
  {
    id: 'time_10h',
    icon: '⌚',
    name: 'Ten Hours In',
    desc: 'Train for 10 total hours',
    cond: (ctx) => ctx.totalDurationMin >= 600,
  },
  {
    id: 'time_50h',
    icon: '🕰️',
    name: 'Dedicated',
    desc: 'Train for 50 total hours',
    cond: (ctx) => ctx.totalDurationMin >= 3000,
  },
  {
    id: 'time_100h',
    icon: '⏱️',
    name: 'Hundred Hours',
    desc: 'Train for 100 total hours',
    cond: (ctx) => ctx.totalDurationMin >= 6000,
  },
  {
    id: 'calories_10k',
    icon: '🔥',
    name: 'Five Figures',
    desc: 'Burn 10,000 tracked calories',
    cond: (ctx) => ctx.totalCalories >= 10000,
  },
  {
    id: 'calories_50k',
    icon: '🌋',
    name: 'Furnace',
    desc: 'Burn 50,000 tracked calories',
    cond: (ctx) => ctx.totalCalories >= 50000,
  },

  // ─── Cross-training ───────────────────────────────────────
  {
    id: 'hybrid_10',
    icon: '⚔️',
    name: 'Hybrid Athlete',
    desc: 'Complete 10 strength workouts and 10 cardio sessions',
    cond: (ctx) => ctx.daysCompleted >= 10 && ctx.totalCardioSessions >= 10,
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

/** Numeric thresholds so the UI can show how close a locked badge is. */
const TARGETS: Record<string, [keyof BadgeContext, number]> = {
  first_workout: ['totalSessions', 1],
  ten_workouts: ['totalSessions', 10],
  twenty_five_sessions: ['totalSessions', 25],
  fifty_workouts: ['totalSessions', 50],
  hundred_workouts: ['totalSessions', 100],
  two_fifty_sessions: ['totalSessions', 250],
  five_hundred_sessions: ['totalSessions', 500],
  streak_3: ['longestStreak', 3],
  streak_7: ['longestStreak', 7],
  streak_14: ['longestStreak', 14],
  streak_30: ['longestStreak', 30],
  streak_60: ['longestStreak', 60],
  streak_100: ['longestStreak', 100],
  volume_1k: ['totalVolume', 1000],
  volume_10k: ['totalVolume', 10000],
  volume_100k: ['totalVolume', 100000],
  volume_500k: ['totalVolume', 500000],
  volume_1m: ['totalVolume', 1000000],
  lift_50: ['maxLiftKg', 50],
  lift_100: ['maxLiftKg', 100],
  lift_150: ['maxLiftKg', 150],
  first_pr: ['prCount', 1],
  ten_prs: ['prCount', 10],
  twenty_five_prs: ['prCount', 25],
  fifty_prs: ['prCount', 50],
  hold_60: ['bestHold', 60],
  hold_120: ['bestHold', 120],
  hold_180: ['bestHold', 180],
  first_cardio: ['totalCardioSessions', 1],
  cardio_10: ['totalCardioSessions', 10],
  cardio_25: ['totalCardioSessions', 25],
  cardio_50: ['totalCardioSessions', 50],
  cardio_100: ['totalCardioSessions', 100],
  distance_5k: ['longestCardioKm', 5],
  distance_10k: ['longestCardioKm', 10],
  distance_half_marathon: ['longestCardioKm', 21.1],
  distance_marathon: ['longestCardioKm', 42.2],
  total_50km: ['totalDistanceKm', 50],
  total_100km: ['totalDistanceKm', 100],
  total_250km: ['totalDistanceKm', 250],
  total_500km: ['totalDistanceKm', 500],
  total_1000km: ['totalDistanceKm', 1000],
  time_10h: ['totalDurationMin', 600],
  time_50h: ['totalDurationMin', 3000],
  time_100h: ['totalDurationMin', 6000],
  calories_10k: ['totalCalories', 10000],
  calories_50k: ['totalCalories', 50000],
};

for (const badge of BADGES) {
  const target = TARGETS[badge.id];
  if (target) {
    const [key, goal] = target;
    badge.progress = (ctx) => ({ value: Math.min(Number(ctx[key]) || 0, goal), target: goal });
  }
}

const hybridBadge = BADGES.find(badge => badge.id === 'hybrid_10');
if (hybridBadge) {
  hybridBadge.progress = (ctx) => ({
    value: Math.min(ctx.daysCompleted, ctx.totalCardioSessions, 10),
    target: 10,
  });
}

/** Evaluate which badges a user has earned */
export function evaluateBadges(context: BadgeContext): string[] {
  return BADGES.filter(b => b.cond(context)).map(b => b.id);
}

/** Get badge definition by ID */
export function getBadge(id: string): Badge | undefined {
  return BADGES.find(b => b.id === id);
}
