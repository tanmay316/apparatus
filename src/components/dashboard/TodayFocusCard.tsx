import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, Clock, Target, Layers, Compass, Plus } from 'lucide-react';
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
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-sienna/[0.03] blur-3xl" />
        </div>
        <div className="relative">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-sienna/10 border border-sienna/20 flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Compass size={24} className="text-sienna" />
          </div>
          <h3 className="font-display text-lg sm:text-xl text-bone mb-2">Choose a Plan to Start Training</h3>
          <p className="text-xs sm:text-sm text-bone-dim max-w-sm mx-auto mb-4 sm:mb-5">
            Select a workout plan to get personalized daily sessions and track your progress.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/plans"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-sienna text-bone font-display font-bold text-sm hover:bg-sienna/80 transition-all duration-200"
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
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative overflow-hidden p-8 sm:p-9 mb-8 rounded-[24px] bg-[#fbe1d1] text-[#5d2a1a]"
    >
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        {/* Info */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-[#5d2a1a] opacity-80">Today's Focus</span>
            {wasCompletedToday && (
              <span className="font-sans text-[11px] font-medium uppercase px-3 py-0.5 rounded-full bg-[#5d2a1a] text-[#fbe1d1]">
                ✓ Completed
              </span>
            )}
          </div>
          <h2 className="font-serif font-normal text-3xl sm:text-4xl text-[#5d2a1a] mb-4 tracking-[-0.66px] leading-tight">{todayDay.title}</h2>

          <div className="flex flex-wrap gap-2.5 mb-5">
            <span className="flex items-center gap-1.5 text-xs font-sans text-[#5d2a1a] bg-white/40 px-3.5 py-1.5 rounded-full">
              <Clock size={14} />
              ~{todayDay.time}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-sans text-[#5d2a1a] bg-white/40 px-3.5 py-1.5 rounded-full">
              <Target size={14} />
              {todayDay.skill || 'General'}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-sans text-[#5d2a1a] bg-white/40 px-3.5 py-1.5 rounded-full">
              <Layers size={14} />
              {allExercises.length} exercises
            </span>
          </div>

          {/* Simple Gestural Progress Bar */}
          <div className="w-full h-2.5 bg-white/40 rounded-full overflow-hidden mb-2">
            <motion.div
              className="h-full bg-[#5d2a1a] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="font-sans text-xs text-[#5d2a1a] opacity-80 font-normal">
            DAY {todayDay.dayNumber} / {activeDays.length} · <span className="font-medium">{activePlan.title}</span>
          </div>
        </div>

        {/* CTA Buttons Row — 3 Icon Buttons */}
        <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0 flex items-center justify-end gap-2.5">
          <Link
            to={`/workout/${activePlan.id}/day/${todayDay.id}`}
            className="w-12 h-12 rounded-full bg-[#5d2a1a] text-[#fbe1d1] inline-flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-sm"
            title={wasCompletedToday ? 'Redo Workout' : isActive ? 'Resume Workout' : 'Start Workout'}
          >
            <Play size={20} fill="currentColor" className="ml-0.5" />
          </Link>
          <Link
            to="/explore"
            className="w-12 h-12 rounded-full bg-white/60 text-[#5d2a1a] inline-flex items-center justify-center hover:bg-white/90 hover:scale-105 active:scale-95 transition-all"
            title="Explore Programs & Community Workouts"
          >
            <Compass size={20} />
          </Link>
          <Link
            to="/plans"
            className="w-12 h-12 rounded-full bg-white/60 text-[#5d2a1a] inline-flex items-center justify-center hover:bg-white/90 hover:scale-105 active:scale-95 transition-all"
            title="My Custom Plan"
          >
            <Plus size={20} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
