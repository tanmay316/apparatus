import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, Clock, Layers, Share2, ChevronRight, Activity, Sparkles, Play } from 'lucide-react';
import { useState } from 'react';
import type { Plan, PlanDay } from '@/types';
import { AiPlanGeneratorModal } from '@/components/ui/AiPlanGeneratorModal';
import { getActiveMuscles, type MuscleRegion } from '@/lib/muscle-map';

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

export function WeeklyTimeline({ activePlan, activeDays, todayWorkouts, recentWorkouts, onShareDay }: WeeklyTimelineProps) {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  if (!activePlan || activeDays.length === 0) return null;

  const firstUncompletedIndex = activeDays.findIndex(d =>
    !todayWorkouts.some((w: any) => w.dayId === d.id) && !recentWorkouts.some((w: any) => w.dayId === d.id)
  );
  const activeIndex = firstUncompletedIndex === -1 ? activeDays.length - 1 : firstUncompletedIndex;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      aria-label="Weekly training"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <h3 className="dx-section-title">This week</h3>
          <p className="text-[12px] dx-muted truncate">{activePlan.title}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="dx-icon-btn dx-icon-btn--sm"
            title="Generate AI Plan"
            aria-label="Generate AI plan"
          >
            <Sparkles size={15} className="text-amber-500" />
          </button>
          <Link to="/plans" className="dx-link">
            All plans <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <AiPlanGeneratorModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} />

      <div className="dx-rail">
        {activeDays.filter(Boolean).map((day, index) => {
          const wasCompleted = todayWorkouts.some((w: any) => w.dayId === day.id)
            || recentWorkouts.some((w: any) => w.dayId === day.id);
          const isToday = index === activeIndex;

          const allExercises = [...(day.warmup || []), ...(day.skillWork || []), ...(day.strength || []), ...(day.cooldown || [])];
          const exerciseNames = allExercises.filter(Boolean).map(ex => ex.name);
          const muscleIds = Array.from(getActiveMuscles(exerciseNames)) as MuscleRegion[];
          const muscleString = muscleIds
            .map(m => m.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
            .slice(0, 2)
            .join(' · ') || 'Full Body';

          return (
            <Link
              key={day.id}
              to={`/workout/${activePlan.id}/day/${day.id}`}
              className="dx-card w-[78vw] max-w-[300px] sm:w-[280px] lg:w-auto lg:max-w-none p-4 flex flex-col"
              style={isToday ? { borderColor: 'var(--dx-accent)', boxShadow: '0 0 0 1px var(--dx-accent) inset, var(--dx-shadow)' } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="dx-eyebrow tabular">Day {String(day.dayNumber).padStart(2, '0')}</span>
                <div className="flex items-center gap-1.5">
                  {wasCompleted && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onShareDay) onShareDay(day);
                      }}
                      className="dx-icon-btn dx-icon-btn--sm !w-8 !h-8 !rounded-[10px]"
                      title="Share Workout"
                      aria-label="Share workout"
                    >
                      <Share2 size={13} />
                    </button>
                  )}
                  {wasCompleted ? (
                    <span className="dx-pill dx-pill--success"><Check size={12} strokeWidth={3} /> Logged</span>
                  ) : isToday ? (
                    <span className="dx-pill dx-pill--accent">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dx-accent)' }} /> Up next
                    </span>
                  ) : (
                    <span className="dx-pill dx-pill--neutral">Upcoming</span>
                  )}
                </div>
              </div>

              <h4 className="mt-3 text-[15px] font-semibold leading-snug line-clamp-2">{day.title}</h4>
              <p className={`mt-1 text-[12.5px] font-medium truncate ${isToday ? 'dx-accent' : 'dx-muted'}`}>{muscleString}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="dx-chip !h-6 !text-[11.5px]"><Clock size={12} className="dx-muted" /> {day.time}</span>
                <span className="dx-chip !h-6 !text-[11.5px]"><Layers size={12} className="dx-muted" /> {allExercises.length} ex</span>
                {day.skill && (
                  <span className="dx-chip !h-6 !text-[11.5px] max-w-full truncate"><Activity size={12} className="dx-muted" /> {day.skill}</span>
                )}
              </div>

              <div className="mt-auto pt-4">
                {isToday && !wasCompleted ? (
                  <div className="dx-btn w-full !h-10 !text-[13px]">
                    <Play size={14} fill="currentColor" /> Start workout
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between text-[11px] font-medium dx-muted mb-1.5">
                      <span>{wasCompleted ? 'Completed' : 'Not started'}</span>
                      <span className="tabular">{wasCompleted ? '100%' : '0%'}</span>
                    </div>
                    <div className="dx-progress">
                      <span style={{ width: wasCompleted ? '100%' : '0%', background: wasCompleted ? 'var(--dx-success)' : undefined }} />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </motion.section>
  );
}
