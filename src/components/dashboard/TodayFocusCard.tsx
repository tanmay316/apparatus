import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Clock, Target, Layers, Compass, Plus, Footprints } from 'lucide-react';
import { usePedometerStore } from '@/stores/pedometer-store';
import { useAuthStore } from '@/stores/auth-store';
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
  const { isSupported, backgroundEnabled, dailySteps } = usePedometerStore();
  const { profile } = useAuthStore();
  const [showStepInfo, setShowStepInfo] = useState(false);
  
  const stepGoal = profile?.stepGoal || 10000;
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
      className="today-focus-card relative p-4 mb-3 rounded-[16px] bg-[#fbe1d1]/40 backdrop-blur-xl border border-white/40 shadow-lg text-[#5d2a1a]"
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

        {/* CTA Buttons & Step Ring — 2x2 grid */}
        <div className="shrink-0 grid grid-cols-2 gap-2">
          
          {/* Step Ring */}
          {isSupported && backgroundEnabled && (
            <div className="relative">
              <button 
                type="button"
                onClick={() => setShowStepInfo(!showStepInfo)}
                onBlur={() => setShowStepInfo(false)}
                className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/60 shadow-[4px_4px_10px_rgba(0,0,0,0.1),-4px_-4px_10px_rgba(255,255,255,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d2a1a]"
                title={`${dailySteps.toLocaleString()} / ${stepGoal.toLocaleString()} steps`}
              >
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 36 36">
                  {/* Background circle */}
                  <path
                    className="text-white"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Progress circle */}
                  <path
                    className="text-[#5d2a1a] transition-all duration-1000 ease-out"
                    strokeDasharray={`${dailySteps > 0 ? Math.max(Math.min((dailySteps / stepGoal) * 100, 100), 1) : 0}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="text-[10px] font-bold font-mono text-[#5d2a1a] relative z-10 tracking-tighter">
                  {dailySteps >= 10000 ? `${(dailySteps / 1000).toFixed(0)}k` : dailySteps >= 1000 ? `${(dailySteps / 1000).toFixed(1)}k` : dailySteps}
                </span>
              </button>

              <AnimatePresence>
                {showStepInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full right-0 mb-3 px-3 py-2 bg-[#5d2a1a] text-[#fbe1d1] text-xs font-medium rounded-lg shadow-xl whitespace-nowrap z-50 flex flex-col items-end pointer-events-none"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-white/70 uppercase tracking-wider">
                      <Footprints size={10} /> Daily Steps
                    </div>
                    <div className="font-mono text-sm">
                      <span className="text-white font-bold">{dailySteps.toLocaleString()}</span> / {stepGoal.toLocaleString()}
                    </div>
                    
                    {/* Small triangle arrow at the bottom pointing to the button */}
                    <div className="absolute top-full right-3 -mt-1 w-2 h-2 bg-[#5d2a1a] rotate-45" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Action Buttons */}
          <Link
            to={`/workout/${activePlan.id}/day/${todayDay.id}`}
            className="w-10 h-10 rounded-full bg-[#5d2a1a] text-[#fbe1d1] inline-flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_10px_rgba(0,0,0,0.2),-4px_-4px_10px_rgba(255,255,255,0.5)]"
            title={wasCompletedToday ? 'Redo Workout' : isActive ? 'Resume Workout' : 'Start Workout'}
          >
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </Link>
          
          <Link
            to="/explore"
            className="inline-flex w-10 h-10 rounded-full bg-white/60 text-[#5d2a1a] items-center justify-center hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_10px_rgba(0,0,0,0.1),-4px_-4px_10px_rgba(255,255,255,0.8)]"
            title="Explore Programs & Community Workouts"
          >
            <Compass size={18} />
          </Link>
          
          <Link
            to="/plans"
            className="inline-flex w-10 h-10 rounded-full bg-white/60 text-[#5d2a1a] items-center justify-center hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-[4px_4px_10px_rgba(0,0,0,0.1),-4px_-4px_10px_rgba(255,255,255,0.8)]"
            title="My Custom Plan"
          >
            <Plus size={18} />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
