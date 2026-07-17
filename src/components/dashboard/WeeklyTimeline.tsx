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
}

export function WeeklyTimeline({ activePlan, activeDays, todayWorkouts, recentWorkouts, onShareDay }: WeeklyTimelineProps) {
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
          <BookOpen size={15} className="text-teal" />
          <h3 className="font-mono text-[11px] text-bone-dim tracking-[0.15em] uppercase">Weekly Training Plan</h3>
        </div>
        <Link to="/plans" className="flex items-center gap-1 text-[10px] text-teal font-mono hover:underline tracking-wider">
          <BookOpen size={12} /> ALL PLANS →
        </Link>
      </div>

      {/* Scrollable timeline with larger cards */}
      <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory touch-pan-x scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
        {activeDays.map((day, index) => {
          const wasCompleted = todayWorkouts.some((w: any) => w.dayId === day.id)
            || recentWorkouts.some((w: any) => w.dayId === day.id);
          const isToday = index === 0;
          const allExercises = [...(day.warmup || []), ...(day.skillWork || []), ...(day.strength || []), ...(day.cooldown || [])];

          return (
            <Link
              key={day.id}
              to={`/workout/${activePlan.id}/day/${day.id}`}
              className={`snap-start shrink-0 w-[240px] sm:w-[270px] rounded-2xl border p-5 transition-all duration-200 group hover:-translate-y-1 relative flex flex-col justify-between ${
                wasCompleted
                  ? 'border-teal/30 bg-teal/[0.05] shadow-[0_4px_20px_rgba(79,158,141,0.08)]'
                  : isToday
                  ? 'border-teal/40 bg-gradient-to-b from-teal/[0.08] to-transparent shadow-[0_4px_20px_rgba(79,158,141,0.12)]'
                  : 'border-white/[0.06] bg-ink-2/70 hover:border-white/15'
              }`}
            >
              <div>
                {/* Day header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-bone-dim tracking-wider">
                    DAY {String(day.dayNumber).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-2">
                    {wasCompleted ? (
                      <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
                        <Check size={12} /> LOGGED
                      </span>
                    ) : isToday ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-teal">
                        <span className="w-2 h-2 rounded-full bg-teal animate-pulse" /> TODAY
                      </span>
                    ) : null}

                    {/* Share Button for logged workout */}
                    {wasCompleted && onShareDay && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onShareDay(day);
                        }}
                        className="w-7 h-7 rounded-full bg-teal/15 border border-teal/40 flex items-center justify-center text-teal hover:bg-teal/30 hover:scale-105 transition-all"
                        title="Share this workout card"
                      >
                        <Share2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h4 className="font-display text-lg text-bone leading-snug mb-3 line-clamp-2 group-hover:text-teal transition-colors">
                  {day.title}
                </h4>

                {/* Details */}
                <div className="flex items-center gap-3 text-xs font-mono text-bone-dim mb-3">
                  <span className="flex items-center gap-1">
                    <Clock size={12} className="text-teal" /> ~{day.time}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Layers size={12} className="text-teal" /> {allExercises.length} ex
                  </span>
                </div>

                {/* Skill tag */}
                {day.skill && (
                  <div className="text-[10px] font-mono text-amber tracking-wider uppercase mb-3 truncate">
                    SKILL — {day.skill}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-teal rounded-full transition-all duration-500"
                  style={{ width: wasCompleted ? '100%' : '0%' }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
