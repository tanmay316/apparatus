import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Flame, TrendingUp, Zap, Calendar, Compass, Plus, Play, ChevronRight
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { getPlan, getPlanDays } from '@/services/plans';
import { getWorkoutsByDateRange } from '@/services/workouts';

const QUOTES = [
  "Nobody sees the reps you did alone — your body will.",
  "Consistency beats intensity. Show up again tomorrow.",
  "The bar doesn't care how you feel. Grab it anyway.",
  "Every skill hold you've ever nailed started as a failed attempt.",
  "Strength is a habit before it's a look.",
  "You don't need a perfect session. You need a logged one.",
  "Discipline is remembering what you want, five minutes from now.",
  "A rest day well spent is still training.",
  "Your future self is trained by today's decision to show up.",
  "Progress hides in the sets you almost skipped.",
];

function getTodayQuote() {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function Dashboard() {
  const { profile, stats } = useAuthStore();

  if (!profile) return null;

  const xp = stats?.xp || 0;
  const streak = stats?.currentStreak || 0;
  const totalWorkouts = stats?.totalWorkouts || 0;
  const totalCalories = stats?.totalCalories || 0;
  const totalHours = Math.round((stats?.totalDurationMin || 0) / 60);

  const { data: activePlan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', profile.activePlanId],
    queryFn: () => getPlan(profile.activePlanId!),
    enabled: !!profile.activePlanId,
  });

  const { data: activeDays = [], isLoading: daysLoading } = useQuery({
    queryKey: ['planDays', profile.activePlanId],
    queryFn: () => getPlanDays(profile.activePlanId!),
    enabled: !!profile.activePlanId,
  });

  const { data: todayWorkouts = [] } = useQuery({
    queryKey: ['todayWorkouts', profile.uid],
    queryFn: () => {
      const todayStr = new Date().toISOString().split('T')[0];
      return getWorkoutsByDateRange(profile.uid, todayStr, todayStr);
    },
    enabled: !!profile.uid,
  });

  const { data: recentWorkouts = [] } = useQuery({
    queryKey: ['recentWorkouts', profile.uid],
    queryFn: () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split('T')[0];
      return getWorkoutsByDateRange(profile.uid, dateStr, new Date().toISOString().split('T')[0]);
    },
    enabled: !!profile.uid,
  });

  const store = useWorkoutStore();
  const { showToast } = useUIStore();

  const streakDays = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const done = recentWorkouts.some((w: any) => w.date === dateKey);
    streakDays.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' })[0].toUpperCase(),
      done,
    });
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {/* Hero */}
      <motion.div variants={item} className="pb-5 border-b border-line mb-5">
        <div className="font-mono text-amber text-xs tracking-widest mb-2">
          WELCOME BACK, {profile.displayName.toUpperCase()}
        </div>
        <h1 className="font-display text-3xl mb-2">Your training hub.</h1>
        <p className="text-bone-dim text-sm max-w-xl leading-relaxed">
          Track workouts, log progress, explore plans, and connect with other athletes.
          Tap any section in the sidebar to get started.
        </p>

        {/* Streak strip */}
        <div className="flex gap-1.5 mt-4">
          {streakDays.map((s, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded flex items-center justify-center font-mono text-[11px] font-bold ${
                s.done
                  ? 'bg-ink-2 text-teal border border-teal/20'
                  : 'bg-ink-3 text-bone-dim'
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Stats overview */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">STREAK</div>
          <div className="flex items-center gap-2 mt-1">
            <Flame size={18} className="text-amber" />
            <span className="text-xl font-bold font-mono">{streak}</span>
            <span className="text-xs text-bone-dim">days</span>
          </div>
        </div>
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">WORKOUTS</div>
          <div className="flex items-center gap-2 mt-1">
            <Zap size={18} className="text-teal" />
            <span className="text-xl font-bold font-mono">{totalWorkouts}</span>
          </div>
        </div>
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">CALORIES</div>
          <div className="flex items-center gap-2 mt-1">
            <TrendingUp size={18} className="text-amber" />
            <span className="text-xl font-bold font-mono">{totalCalories.toLocaleString()}</span>
          </div>
        </div>
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">HOURS</div>
          <div className="flex items-center gap-2 mt-1">
            <Calendar size={18} className="text-teal" />
            <span className="text-xl font-bold font-mono">{totalHours}</span>
          </div>
        </div>
      </motion.div>

      {/* Quote */}
      <motion.div variants={item} className="border-l-[3px] border-amber bg-ink-2 rounded-r px-4 py-3 mb-6">
        <p className="text-sm italic text-bone-dim leading-relaxed">{getTodayQuote()}</p>
      </motion.div>

      {/* Active Program Grid */}
      <motion.div variants={item} className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[11px] text-bone-dim tracking-wider uppercase">
            THIS WEEK — 0 / {activePlan?.daysPerWeek || 6} TRAINING DAYS
          </div>
          {profile.activePlanId && (
            <Link to={`/plans/${profile.activePlanId}`} className="text-[10px] text-teal font-mono hover:underline">
              VIEW FULL PLAN
            </Link>
          )}
        </div>
        <div className="h-1 w-full bg-ink-2 mb-6 rounded-full overflow-hidden">
          <div className="h-full bg-teal" style={{ width: '0%' }}></div>
        </div>
        
        {!profile.activePlanId ? (
          <div className="card p-5 border-dashed border-line flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div>
              <h3 className="font-display text-lg mb-1">No Active Program</h3>
              <p className="text-xs text-bone-dim">Set a plan as active to easily start workouts here.</p>
            </div>
            <Link to="/plans" className="btn-primary shrink-0">Select a Plan</Link>
          </div>
        ) : planLoading || daysLoading ? (
          <div className="card p-5 flex justify-center">
            <div className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activePlan && activeDays.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeDays.map((day) => {
              const wasCompletedToday = todayWorkouts.some((w: any) => w.dayId === day.id);
              
              // Calculate progress line percentage
              let pct = 0;
              if (store.isActive && store.dayId === day.id) {
                const completedCount = Object.values(store.logs).filter(ex => ex.sets.some(s => s.completed)).length;
                const totalCount = [...store.warmup, ...store.skillWork, ...store.strength, ...store.cooldown].length;
                pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
              } else if (wasCompletedToday) {
                pct = 100;
              }

              const CardContent = (
                <div className="p-5 flex flex-col h-full relative">
                  <div className="flex justify-between items-start mb-2 font-mono text-[11px] tracking-widest text-bone-dim">
                    <span>DAY {day.dayNumber.toString().padStart(2, '0')} / {activeDays.length.toString().padStart(2, '0')}</span>
                    <span>~{day.time}</span>
                  </div>
                  <h3 className="font-display text-xl mb-4 uppercase text-bone">{day.title}</h3>
                  
                  {/* Progress Line */}
                  <div className="h-1 w-full bg-ink mb-3 rounded-full overflow-hidden">
                    <div className="h-full bg-teal transition-all duration-300" style={{ width: `${pct}%` }}></div>
                  </div>
                  
                  {wasCompletedToday && (
                    <div className="text-[10px] text-teal font-mono flex items-center gap-1.5 mt-1 font-bold">
                      ✓ LOGGED TODAY
                    </div>
                  )}

                  <div className="text-xs font-mono text-amber tracking-wider mt-auto pt-4 uppercase">
                    {day.type === 'yoga' || day.title.toLowerCase().includes('yoga') ? 'RECOVERY — MOBILITY' : `SKILL — ${day.skill || 'NONE'}`}
                  </div>
                </div>
              );

              return (
                <Link 
                  key={day.id} 
                  to={`/workout/${activePlan.id}/day/${day.id}`} 
                  className="card-hover block h-full group"
                >
                  {CardContent}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="card p-5 border-dashed border-line text-center text-sm text-bone-dim">
            Active plan not found or has no days.
          </div>
        )}
      </motion.div>

      {/* Quick actions */}
      <motion.div variants={item}>
        <div className="font-mono text-[11px] text-bone-dim tracking-wider mb-3">QUICK ACTIONS</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to="/plans" className="card-hover p-5 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center group-hover:bg-teal/20 transition-colors">
                <Plus size={20} className="text-teal" />
              </div>
              <div>
                <div className="font-semibold text-sm">Create a Plan</div>
                <div className="text-xs text-bone-dim">Build your own workout program</div>
              </div>
            </div>
          </Link>

          <Link to="/explore" className="card-hover p-5 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-amber/10 flex items-center justify-center group-hover:bg-amber/20 transition-colors">
                <Compass size={20} className="text-amber" />
              </div>
              <div>
                <div className="font-semibold text-sm">Explore Plans</div>
                <div className="text-xs text-bone-dim">Browse sample plans & community</div>
              </div>
            </div>
          </Link>
        </div>
      </motion.div>

      {/* XP card */}
      <motion.div variants={item} className="card p-5 mt-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-teal flex items-center justify-center font-display font-bold text-xl text-ink flex-none">
            {Math.min(10, Math.floor(xp / 500) + 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1.5">
              <h4 className="font-display text-base">{xp < 100 ? 'Ground Zero' : xp < 500 ? 'Bar Novice' : xp < 1400 ? 'Skill Seeker' : 'Apparatus Master'}</h4>
              <span className="font-mono text-[11px] text-bone-dim">{xp} XP</span>
            </div>
            <div className="h-2 bg-line rounded-full overflow-hidden">
              <div
                className="h-full bg-amber rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (xp % 500) / 5)}%` }}
              />
            </div>
          </div>
          <div className="text-center px-2 flex-none">
            <div className="text-2xl">🔥</div>
            <div className="font-mono text-lg font-bold">{streak}</div>
            <div className="font-mono text-[10px] text-bone-dim tracking-wider">STREAK</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
