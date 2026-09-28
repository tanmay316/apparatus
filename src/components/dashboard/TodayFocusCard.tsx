import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, Clock, Target, Layers, Compass, Plus, Check, RotateCcw } from 'lucide-react';
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
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="dx-card p-5 sm:p-6"
      >
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
          <Compass size={22} />
        </div>
        <h2 className="text-[18px] font-semibold tracking-tight">Choose a plan to start training</h2>
        <p className="text-[13px] dx-muted mt-1 mb-5 max-w-sm leading-relaxed">
          Select a workout plan to get personalized daily sessions and track your progress.
        </p>
        <div className="flex gap-2.5">
          <Link to="/plans" className="dx-btn flex-1 sm:flex-none">Browse plans</Link>
          <Link to="/explore" className="dx-btn-secondary flex-1 sm:flex-none">
            <Compass size={16} /> Explore
          </Link>
        </div>
      </motion.section>
    );
  }

  const todayDay = activeDays[currentDayIndex] || activeDays[0];
  if (!todayDay) return null;

  const wasCompletedToday = todayWorkouts.some((w: any) => w.dayId === todayDay.id || String(todayDay.dayNumber) === String(w.dayId));
  const allExercises = [...(todayDay.warmup || []), ...(todayDay.skillWork || []), ...(todayDay.strength || []), ...(todayDay.cooldown || [])];
  const ctaLabel = wasCompletedToday ? 'Redo workout' : isActive ? 'Resume workout' : 'Start workout';
  const CtaIcon = wasCompletedToday ? RotateCcw : Play;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="dx-hero p-5 sm:p-6"
      aria-label="Today's focus"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-75">Today's focus</span>
        {wasCompletedToday ? (
          <span className="dx-pill" style={{ background: 'rgba(52, 211, 153, 0.18)', color: '#a7f3d0' }}>
            <Check size={12} strokeWidth={3} /> Done
          </span>
        ) : isActive ? (
          <span className="dx-pill" style={{ background: 'rgba(255, 255, 255, 0.14)', color: 'inherit' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> In progress
          </span>
        ) : null}
      </div>

      <h2 className="mt-2 text-[20px] sm:text-[23px] font-semibold leading-tight tracking-tight line-clamp-2">
        {todayDay.title}
      </h2>
      <p className="mt-1 text-[13px] opacity-75 truncate">{activePlan.title}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] opacity-90">
        <span className="inline-flex items-center gap-1.5"><Clock size={14} className="opacity-75" /> ~{todayDay.time}</span>
        <span className="inline-flex items-center gap-1.5"><Target size={14} className="opacity-75" /> {todayDay.skill || 'General'}</span>
        <span className="inline-flex items-center gap-1.5"><Layers size={14} className="opacity-75" /> {allExercises.length} exercises</span>
      </div>

      {isActive && !wasCompletedToday && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] opacity-75 mb-1.5">
            <span>Session progress</span>
            <span className="tabular">{sessionProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.16)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sessionProgress}%`, background: 'var(--dx-hero-btn)' }} />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2.5">
        <Link
          to={`/workout/${activePlan.id}/day/${todayDay.id}`}
          className="dx-hero-btn flex-1"
          title={ctaLabel}
        >
          <CtaIcon size={17} fill={wasCompletedToday ? 'none' : 'currentColor'} /> {ctaLabel}
        </Link>
        <Link to="/explore" className="dx-hero-icon" title="Explore Programs & Community Workouts" aria-label="Explore programs">
          <Compass size={19} />
        </Link>
        <Link to="/plans" className="dx-hero-icon" title="My Custom Plan" aria-label="My plans">
          <Plus size={20} />
        </Link>
      </div>
    </motion.section>
  );
}
