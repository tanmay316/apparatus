import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, Clock, Target, Layers, Compass } from 'lucide-react';
import type { Plan, PlanDay } from '@/types';

interface TodayFocusCardProps {
  activePlan: Plan | null | undefined;
  activeDays: PlanDay[];
  todayWorkouts: any[];
  currentDayIndex: number;
  isActive: boolean;
  sessionProgress: number;
}

export function TodayFocusCard({ activePlan, activeDays, todayWorkouts, currentDayIndex, isActive, sessionProgress }: TodayFocusCardProps) {
  // No active plan
  if (!activePlan || activeDays.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-2xl border border-dashed border-white/[0.08] p-6 sm:p-8 mb-6 text-center"
        style={{ background: 'rgba(17,21,34,0.6)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-teal/[0.03] blur-3xl" />
        </div>
        <div className="relative">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-teal/10 border border-teal/20 flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Compass size={24} className="text-teal" />
          </div>
          <h3 className="font-display text-lg sm:text-xl text-bone mb-2">Choose a Plan to Start Training</h3>
          <p className="text-xs sm:text-sm text-bone-dim max-w-sm mx-auto mb-4 sm:mb-5">
            Select a workout plan to get personalized daily sessions and track your progress.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/plans"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-teal text-ink font-display font-bold text-sm hover:bg-teal-light transition-all duration-200"
            >
              Browse Plans
            </Link>
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-white/[0.08] text-bone-dim font-mono text-xs hover:text-bone hover:bg-white/[0.04] transition-all"
            >
              <Compass size={15} /> Explore
            </Link>
          </div>
        </div>
      </motion.div>
    );
  }

  // Find today's target day
  const todayDay = activeDays[currentDayIndex] || activeDays[0];
  const wasCompletedToday = todayWorkouts.some((w: any) => w.dayId === todayDay.id);
  const allExercises = [...(todayDay.warmup || []), ...(todayDay.skillWork || []), ...(todayDay.strength || []), ...(todayDay.cooldown || [])];
  const pct = wasCompletedToday ? 100 : isActive ? sessionProgress : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] p-5 sm:p-6 mb-6 group"
      style={{ background: 'linear-gradient(135deg, rgba(17,21,34,0.9) 0%, rgba(79,158,141,0.04) 100%)' }}
    >
      {/* Subtle glow */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-teal/[0.05] blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[10px] tracking-[0.15em] text-teal uppercase">Today's Focus</span>
            {wasCompletedToday && (
              <span className="text-[10px] font-mono font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">✓ DONE</span>
            )}
          </div>
          <h2 className="font-display text-xl sm:text-2xl text-bone mb-2.5">{todayDay.title}</h2>

          <div className="flex flex-wrap gap-3 mb-3">
            <span className="flex items-center gap-1.5 text-xs text-bone-dim">
              <Clock size={13} className="text-teal" />
              ~{todayDay.time}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-bone-dim">
              <Target size={13} className="text-amber" />
              {todayDay.skill || 'General'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-bone-dim">
              <Layers size={13} className="text-teal" />
              {allExercises.length} exercises
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-1">
            <motion.div
              className="h-full bg-gradient-to-r from-teal to-teal-light rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="font-mono text-[10px] text-bone-dim">
            DAY {todayDay.dayNumber} / {activeDays.length} · {activePlan.title}
          </div>
        </div>

        {/* CTA Buttons Row: Start Workout + Explore */}
        <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0 flex items-center gap-2.5">
          <Link
            to={`/workout/${activePlan.id}/day/${todayDay.id}`}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-teal text-ink font-display font-bold text-sm hover:bg-teal-light transition-all duration-200 shadow-[0_0_16px_rgba(79,158,141,0.15)]"
          >
            <Play size={16} fill="currentColor" />
            {wasCompletedToday ? 'Redo Workout' : isActive ? 'Resume Workout' : 'Start Workout'}
          </Link>
          <Link
            to="/explore"
            className="flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl border border-amber/20 bg-amber/10 text-amber font-mono text-xs font-semibold hover:bg-amber/20 transition-all"
            title="Explore community plans & workouts"
          >
            <Compass size={15} /> Explore
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
