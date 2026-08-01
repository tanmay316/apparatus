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
        className="relative overflow-hidden rounded-2xl border border-dashed border-line p-6 sm:p-8 mb-6 text-center bg-ink-2"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-sienna/5 blur-3xl" />
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
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-line text-bone-dim font-mono text-xs hover:text-bone hover:bg-ink-3 transition-all"
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
  const wasCompletedToday = todayWorkouts.some((w: any) => w.dayId === todayDay.id || String(todayDay.dayNumber) === String(w.dayId));
  const allExercises = [...(todayDay.warmup || []), ...(todayDay.skillWork || []), ...(todayDay.strength || []), ...(todayDay.cooldown || [])];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative overflow-hidden p-4 mb-3 rounded-[16px] bg-[#fbe1d1]/40 backdrop-blur-xl border border-white/40 shadow-lg text-[#5d2a1a]"
    >
      <div className="relative flex items-center justify-between gap-3">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#5d2a1a] opacity-80">Today's Focus</span>
            {wasCompletedToday && (
              <span className="font-sans text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-[#5d2a1a] text-[#fbe1d1]">
                ✓ Done
              </span>
            )}
          </div>
          <h2 className="font-sans font-semibold text-lg text-[#5d2a1a] mb-2 tracking-tight leading-snug line-clamp-1">{todayDay.title}</h2>

          <div className="flex flex-wrap gap-1.5">
            <span className="flex items-center gap-1 text-[11px] font-sans text-[#5d2a1a] bg-white/40 px-2.5 py-1 rounded-full">
              <Clock size={12} />
              ~{todayDay.time}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-sans text-[#5d2a1a] bg-white/40 px-2.5 py-1 rounded-full">
              <Target size={12} />
              {todayDay.skill || 'General'}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-sans text-[#5d2a1a] bg-white/40 px-2.5 py-1 rounded-full">
              <Layers size={12} />
              {allExercises.length} ex
            </span>
          </div>
        </div>

        {/* CTA Buttons — compact */}
        <div className="shrink-0 flex items-center gap-2">
          <Link
            to={`/workout/${activePlan.id}/day/${todayDay.id}`}
            className="w-10 h-10 rounded-full bg-[#5d2a1a] text-[#fbe1d1] inline-flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_10px_rgba(0,0,0,0.2),-4px_-4px_10px_rgba(255,255,255,0.5)]"
            title={wasCompletedToday ? 'Redo Workout' : isActive ? 'Resume Workout' : 'Start Workout'}
          >
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </Link>
          <Link
            to="/explore"
            className="w-10 h-10 rounded-full bg-white/60 text-[#5d2a1a] inline-flex items-center justify-center hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_10px_rgba(0,0,0,0.1),-4px_-4px_10px_rgba(255,255,255,0.8)]"
            title="Explore Programs & Community Workouts"
          >
            <Compass size={18} />
          </Link>
          <Link
            to="/plans"
            className="w-10 h-10 rounded-full bg-white/60 text-[#5d2a1a] inline-flex items-center justify-center hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_10px_rgba(0,0,0,0.1),-4px_-4px_10px_rgba(255,255,255,0.8)]"
            title="My Custom Plan"
          >
            <Plus size={18} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
