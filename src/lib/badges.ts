import type { Badge, BadgeCategory, BadgeContext, CardioTypeStats } from '@/types';

type BadgeDef = Omit<Badge, 'category'>;

const DEFINITIONS: BadgeDef[] = [
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

// ─── Run / walk / ride ───────────────────────────────────────
// Judged per activity: 21 km is a feat on foot but an easy ride.
type Kind = 'run' | 'walk' | 'ride';
type Metric = Exclude<keyof CardioTypeStats, 'best5kSec' | 'best10kSec'>;

function reach(kind: Kind, metric: Metric, target: number, id: string, icon: string, name: string, desc: string): BadgeDef {
  return {
    id, icon, name, desc,
    cond: ctx => (ctx[kind][metric] || 0) >= target,
    progress: ctx => ({ value: Math.min(ctx[kind][metric] || 0, target), target }),
  };
}

function under(kind: Kind, metric: 'best5kSec' | 'best10kSec', maxSec: number, id: string, icon: string, name: string, desc: string): BadgeDef {
  return { id, icon, name, desc, cond: ctx => { const v = ctx[kind][metric]; return !!v && v <= maxSec; } };
}

const TYPE_BADGES: [Kind, BadgeDef[]][] = [
  ['run', [
    reach('run', 'sessions', 1, 'run_first', '👟', 'First Run', 'Complete your first run'),
    reach('run', 'sessions', 10, 'run_10', '🏃', 'Run Regular', 'Complete 10 runs'),
    reach('run', 'sessions', 50, 'run_50', '🛣️', 'Road Runner', 'Complete 50 runs'),
    reach('run', 'sessions', 100, 'run_100', '💯', 'Run Century', 'Complete 100 runs'),
    reach('run', 'longestKm', 5, 'run_5k', '🥉', '5K Runner', 'Run 5 km in a single run'),
    reach('run', 'longestKm', 10, 'run_10k', '🏅', '10K Runner', 'Run 10 km in a single run'),
    reach('run', 'longestKm', 21.1, 'run_half', '🎽', 'Half Marathoner', 'Run a half marathon (21.1 km)'),
    reach('run', 'longestKm', 42.2, 'run_marathon', '🏁', 'Marathoner', 'Run a full marathon (42.2 km)'),
    under('run', 'best5kSec', 30 * 60, 'run_5k_30', '⏱️', 'Sub-30 5K', 'Run 5 km in under 30 minutes'),
    under('run', 'best5kSec', 25 * 60, 'run_5k_25', '⚡', 'Sub-25 5K', 'Run 5 km in under 25 minutes'),
    under('run', 'best5kSec', 20 * 60, 'run_5k_20', '🚀', 'Sub-20 5K', 'Run 5 km in under 20 minutes'),
    under('run', 'best10kSec', 60 * 60, 'run_10k_60', '🕐', 'Sub-60 10K', 'Run 10 km in under an hour'),
    under('run', 'best10kSec', 50 * 60, 'run_10k_50', '🔥', 'Sub-50 10K', 'Run 10 km in under 50 minutes'),
    reach('run', 'totalKm', 50, 'run_total_50', '🗺️', 'Run 50', 'Run 50 km in total'),
    reach('run', 'totalKm', 100, 'run_total_100', '🌍', 'Run 100', 'Run 100 km in total'),
    reach('run', 'totalKm', 250, 'run_total_250', '🧭', 'Run 250', 'Run 250 km in total'),
    reach('run', 'totalKm', 500, 'run_total_500', '🏔️', 'Run 500', 'Run 500 km in total'),
    reach('run', 'totalKm', 1000, 'run_total_1000', '🌐', 'Thousand K Runner', 'Run 1,000 km in total'),
  ]],
  ['walk', [
    reach('walk', 'sessions', 1, 'walk_first', '🚶', 'First Walk', 'Complete your first walk'),
    reach('walk', 'sessions', 10, 'walk_10', '🌳', 'Daily Stroller', 'Complete 10 walks'),
    reach('walk', 'sessions', 50, 'walk_50', '🌄', 'Walk Habit', 'Complete 50 walks'),
    reach('walk', 'sessions', 100, 'walk_100', '💯', 'Walk Century', 'Complete 100 walks'),
    reach('walk', 'longestKm', 5, 'walk_5k', '🥾', '5K Walk', 'Walk 5 km in a single walk'),
    reach('walk', 'longestKm', 10, 'walk_10k', '🧳', '10K Trek', 'Walk 10 km in a single walk'),
    reach('walk', 'longestKm', 21.1, 'walk_half', '🏕️', 'Half Marathon Walk', 'Walk 21.1 km in a single walk'),
    reach('walk', 'longestKm', 42.2, 'walk_marathon', '🏔️', 'Marathon Walker', 'Walk 42.2 km in a single walk'),
    reach('walk', 'maxSteps', 10000, 'walk_steps_10k', '👣', '10K Steps', 'Take 10,000 steps in a single walk'),
    reach('walk', 'maxSteps', 20000, 'walk_steps_20k', '🦶', '20K Steps', 'Take 20,000 steps in a single walk'),
    reach('walk', 'bestSpeed3k', 5.5, 'walk_brisk', '💨', 'Brisk Walker', 'Average 5.5 km/h over a walk of 3 km or more'),
    reach('walk', 'bestSpeed3k', 6.5, 'walk_power', '⚡', 'Power Walker', 'Average 6.5 km/h over a walk of 3 km or more'),
    reach('walk', 'totalKm', 50, 'walk_total_50', '🗺️', 'Walk 50', 'Walk 50 km in total'),
    reach('walk', 'totalKm', 100, 'walk_total_100', '🌍', 'Walk 100', 'Walk 100 km in total'),
    reach('walk', 'totalKm', 250, 'walk_total_250', '🧭', 'Walk 250', 'Walk 250 km in total'),
    reach('walk', 'totalKm', 500, 'walk_total_500', '🌐', 'Walk 500', 'Walk 500 km in total'),
  ]],
  ['ride', [
    reach('ride', 'sessions', 1, 'ride_first', '🚲', 'First Ride', 'Complete your first ride'),
    reach('ride', 'sessions', 10, 'ride_10', '🚴', 'Ride Regular', 'Complete 10 rides'),
    reach('ride', 'sessions', 50, 'ride_50', '🛤️', 'Saddle Time', 'Complete 50 rides'),
    reach('ride', 'sessions', 100, 'ride_100', '💯', 'Ride Century', 'Complete 100 rides'),
    reach('ride', 'longestKm', 20, 'ride_20k', '🚴', '20K Ride', 'Ride 20 km in a single ride'),
    reach('ride', 'longestKm', 50, 'ride_50k', '🏅', 'Half Century', 'Ride 50 km in a single ride'),
    reach('ride', 'longestKm', 100, 'ride_100k', '🏆', 'Century Ride', 'Ride 100 km in a single ride'),
    reach('ride', 'longestKm', 200, 'ride_200k', '👑', 'Double Century', 'Ride 200 km in a single ride'),
    reach('ride', 'bestSpeed20k', 20, 'ride_speed_20', '💨', 'Cruiser', 'Average 20 km/h over a ride of 20 km or more'),
    reach('ride', 'bestSpeed20k', 25, 'ride_speed_25', '⚡', 'Pace Setter', 'Average 25 km/h over a ride of 20 km or more'),
    reach('ride', 'bestSpeed20k', 30, 'ride_speed_30', '🚀', 'Speed Demon', 'Average 30 km/h over a ride of 20 km or more'),
    reach('ride', 'maxClimbM', 500, 'ride_climb_500', '⛰️', 'Hill Climber', 'Climb 500 m in a single ride'),
    reach('ride', 'maxClimbM', 1000, 'ride_climb_1000', '🏔️', 'Mountain Goat', 'Climb 1,000 m in a single ride'),
    reach('ride', 'totalKm', 100, 'ride_total_100', '🗺️', 'Ride 100', 'Ride 100 km in total'),
    reach('ride', 'totalKm', 500, 'ride_total_500', '🌍', 'Ride 500', 'Ride 500 km in total'),
    reach('ride', 'totalKm', 1000, 'ride_total_1000', '🧭', 'Ride 1,000', 'Ride 1,000 km in total'),
    reach('ride', 'totalKm', 2500, 'ride_total_2500', '🌐', 'Ride 2,500', 'Ride 2,500 km in total'),
    reach('ride', 'totalKm', 5000, 'ride_total_5000', '🚀', 'Ride 5,000', 'Ride 5,000 km in total'),
  ]],
];

function categoryOf(id: string): BadgeCategory {
  if (id.startsWith('streak_')) return 'streak';
  if (/^(volume_|lift_|hold_|first_pr|ten_prs|twenty_five_prs|fifty_prs|full_week)/.test(id)) return 'strength';
  if (/^(first_cardio|cardio_)/.test(id)) return 'cardio';
  return 'general';
}

export const BADGES: Badge[] = [
  ...DEFINITIONS.map(b => ({ ...b, category: categoryOf(b.id) })),
  ...TYPE_BADGES.flatMap(([kind, list]) => list.map(b => ({ ...b, category: kind }))),
];

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  general: 'Milestones',
  streak: 'Streaks',
  strength: 'Strength',
  cardio: 'Cardio',
  run: 'Running',
  walk: 'Walking',
  ride: 'Cycling',
};

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

const KNOWN_IDS = new Set(BADGES.map(b => b.id));

/** Drops ids of retired badges (e.g. the old combined cardio distance badges). */
export function knownBadgeIds(ids: string[] | undefined): string[] {
  return (ids || []).filter(id => KNOWN_IDS.has(id));
}
