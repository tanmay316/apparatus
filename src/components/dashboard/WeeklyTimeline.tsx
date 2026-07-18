import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, Clock, Layers, Share2, BookOpen } from 'lucide-react';
import type { Plan, PlanDay } from '@/types';

interface WeeklyTimelineProps {
  activePlan: Plan | null | undefined;
  activeDays: PlanDay[];
  todayWorkouts: any[];
  recentWorkouts: any[];
  onShareDay?: (day: PlanDay) => void;
  isActive?: boolean;
  sessionProgress?: number;
  activeSessionDayId?: string | null;
}

export function WeeklyTimeline({ activePlan, activeDays, todayWorkouts, recentWorkouts, onShareDay, isActive, sessionProgress, activeSessionDayId }: WeeklyTimelineProps) {
  if (!activePlan || activeDays.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-bone-dim" />
          <h3 className="font-sans text-xs font-medium text-bone-dim tracking-wider uppercase">Weekly Training Plan</h3>
        </div>
        <Link to="/plans" className="flex items-center gap-1 text-xs text-bone font-sans font-medium hover:underline">
          All Plans →
        </Link>
      </div>

      {/* Scrollable timeline with separate floating cards & hidden scrollbar */}
      <div className="flex gap-5 sm:gap-6 overflow-x-auto px-4 sm:px-6 -mx-4 sm:-mx-6 pb-8 pt-3 snap-x snap-mandatory touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {activeDays.map((day, index) => {
          const wasCompleted = todayWorkouts.some((w: any) => w.dayId === day.id)
            || recentWorkouts.some((w: any) => w.dayId === day.id);
          
          // Determine the first uncompleted day to highlight as "Next/Today"
          const firstUncompletedIndex = activeDays.findIndex(d => 
            !todayWorkouts.some((w: any) => w.dayId === d.id) && !recentWorkouts.some((w: any) => w.dayId === d.id)
          );
          const activeIndex = firstUncompletedIndex === -1 ? activeDays.length - 1 : firstUncompletedIndex;
          const isToday = index === activeIndex;

          const allExercises = [...(day.warmup || []), ...(day.skillWork || []), ...(day.strength || []), ...(day.cooldown || [])];

          return (
            <motion.div
              key={day.id}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`snap-start shrink-0 relative hover:z-20 ${isToday ? 'z-10' : 'z-0'}`}
            >
              <Link
                to={`/workout/${activePlan.id}/day/${day.id}`}
                className={`relative w-[265px] sm:w-[295px] p-6 rounded-[24px] flex flex-col justify-between transition-all duration-200 group ${
                  isToday
                    ? 'bg-ink border border-line shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_20px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.05)]'
                    : 'bg-ink-2 border border-transparent'
                }`}
              >
                <div>
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-sans text-xs font-normal uppercase text-bone-dim">
                      DAY {String(day.dayNumber).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-2">
                      {wasCompleted ? (
                        <span className="font-sans text-[11px] font-medium uppercase px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Check size={11} strokeWidth={2.5} /> Logged
                        </span>
                      ) : isToday ? (
                        <span className="font-sans text-[11px] font-medium uppercase px-2.5 py-0.5 rounded-full bg-bone text-ink flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-ink animate-ping" /> Today
                        </span>
                      ) : (
                        <span className="font-sans text-[11px] font-normal uppercase text-bone-dim">
                          Upcoming
                        </span>
                      )}

                      {/* Share Button */}
                      {wasCompleted && onShareDay && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onShareDay(day);
                          }}
                          className="w-6 h-6 rounded-full bg-ink flex items-center justify-center text-green-600 dark:text-green-400 hover:scale-110 transition-all border border-line"
                          title="Share this workout card"
                        >
                          <Share2 size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h4 className="font-sans font-medium text-lg text-bone leading-snug mb-3 line-clamp-2 group-hover:text-sienna transition-colors">
                    {day.title}
                  </h4>

                  {/* Details Pills */}
                  <div className="flex items-center gap-2 text-xs font-sans text-bone-dim mb-3 flex-wrap">
                    <span className="flex items-center gap-1 bg-ink-3/50 px-2.5 py-1 rounded-full">
                      <Clock size={12} /> ~{day.time}
                    </span>
                    <span className="flex items-center gap-1 bg-ink-3/50 px-2.5 py-1 rounded-full">
                      <Layers size={12} /> {allExercises.length} ex
                    </span>
                  </div>

                  {/* Skill tag */}
                  {day.skill && (
                    <div className="text-[11px] font-sans font-normal text-bone-dim inline-block truncate max-w-full">
                      {day.skill}
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-line-solid rounded-full overflow-hidden mt-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      wasCompleted ? 'bg-[#2e7d32]' : (isActive && activeSessionDayId === day.id) ? 'bg-sienna' : 'bg-transparent'
                    }`}
                    style={{ width: wasCompleted ? '100%' : (isActive && activeSessionDayId === day.id) ? `${sessionProgress || 0}%` : '0%' }}
                  />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
