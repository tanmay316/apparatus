import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, Clock, Layers, Share2, BookOpen, ChevronRight, Activity, Sparkles } from 'lucide-react';
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

export function WeeklyTimeline({ activePlan, activeDays, todayWorkouts, recentWorkouts, onShareDay, isActive, sessionProgress, activeSessionDayId }: WeeklyTimelineProps) {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  if (!activePlan || activeDays.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-gray-400" />
          <h3 className="font-sans text-xs font-semibold text-gray-500 tracking-wider uppercase">Weekly Training</h3>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsAiModalOpen(true)} className="flex items-center justify-center p-1.5 rounded-full bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors" title="Generate AI Plan">
            <Sparkles size={14} className="animate-pulse" />
          </button>
          <Link to="/plans" className="flex items-center gap-1 text-xs text-gray-600 font-sans font-medium hover:text-gray-900 transition-colors">
            All Plans <ChevronRight size={12} />
          </Link>
        </div>
      </div>
      
      <AiPlanGeneratorModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} />

      <div className="flex gap-4 overflow-x-auto px-1 -mx-1 pb-6 pt-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {activeDays.filter(Boolean).map((day, index) => {
          const wasCompleted = todayWorkouts.some((w: any) => w.dayId === day.id)
            || recentWorkouts.some((w: any) => w.dayId === day.id);

          const firstUncompletedIndex = activeDays.findIndex(d =>
            !todayWorkouts.some((w: any) => w.dayId === d.id) && !recentWorkouts.some((w: any) => w.dayId === d.id)
          );
          const activeIndex = firstUncompletedIndex === -1 ? activeDays.length - 1 : firstUncompletedIndex;
          const isToday = index === activeIndex;

          const allExercises = [...(day.warmup || []), ...(day.skillWork || []), ...(day.strength || []), ...(day.cooldown || [])];
          
          const exerciseNames = allExercises.filter(Boolean).map(ex => ex.name);
          const activeMuscleSet = getActiveMuscles(exerciseNames);
          const muscleIds = Array.from(activeMuscleSet) as MuscleRegion[];
          const muscleString = muscleIds
            .map(m => m.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
            .slice(0, 2)
            .join(' • ') || 'Full Body';

          return (
            <motion.div
              key={day.id}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`snap-start shrink-0 relative ${isToday ? 'z-10' : 'z-0'}`}
            >
              <Link
                to={`/workout/${activePlan.id}/day/${day.id}`}
                className={`weekly-plan-card relative w-[82vw] sm:w-[260px] h-[350px] sm:h-[380px] min-h-0 p-5 rounded-[24px] flex flex-col justify-between transition-all duration-300 group border border-[#ececec] shadow-[6px_6px_14px_rgba(0,0,0,0.05),-6px_-6px_14px_rgba(255,255,255,0.8)] ${
                  isToday
                    ? 'bg-gradient-to-br from-[#fdfbfb] to-[#f4ebe6]'
                    : 'bg-gradient-to-br from-[#fdfbfb] to-[#f5f5f5]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      DAY {String(day.dayNumber).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-2 z-10">
                      {wasCompleted ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (onShareDay) onShareDay(day);
                            }}
                            className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors shadow-sm border border-blue-100"
                            title="Share Workout"
                          >
                            <Share2 size={12} strokeWidth={2.5} />
                          </button>
                          <span className="font-sans text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                            <Check size={12} strokeWidth={2.5} /> Logged
                          </span>
                        </>
                      ) : isToday ? (
                        <span className="font-sans text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-sienna-light/30 text-sienna flex items-center gap-1.5 shadow-sm border border-sienna-light/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-sienna animate-pulse" /> Today
                        </span>
                      ) : (
                        <span className="font-sans text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </div>

                  <h4 className={`font-sans font-bold text-lg leading-tight mb-2 line-clamp-2 ${isToday ? 'text-gray-900' : 'text-gray-800'}`}>
                    {day.title}
                  </h4>
                  
                  <p className={`font-sans text-xs font-semibold mb-4 truncate ${isToday ? 'text-sienna' : 'text-gray-500'}`}>
                    {muscleString}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-sans text-[11px] font-medium shadow-[2px_2px_5px_rgba(0,0,0,0.05),-2px_-2px_5px_rgba(255,255,255,1)] ${isToday ? 'bg-sienna-light/20 text-sienna' : 'bg-gray-100 text-gray-600'}`}>
                      <Clock size={12} /> {day.time}
                    </span>
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-sans text-[11px] font-medium shadow-[2px_2px_5px_rgba(0,0,0,0.05),-2px_-2px_5px_rgba(255,255,255,1)] ${isToday ? 'bg-sienna-light/20 text-sienna' : 'bg-gray-100 text-gray-600'}`}>
                      <Layers size={12} /> {allExercises.length} ex
                    </span>
                    {day.skill && (
                       <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-sans text-[11px] font-medium shadow-[2px_2px_5px_rgba(0,0,0,0.05),-2px_-2px_5px_rgba(255,255,255,1)] ${isToday ? 'bg-sienna-light/20 text-sienna' : 'bg-gray-100 text-gray-600'} truncate max-w-full`}>
                         <Activity size={12} /> {day.skill}
                       </span>
                    )}
                  </div>
                </div>

                <div className="weekly-plan-footer mt-4 pt-4 border-t border-gray-100">
                  {isToday ? (
                     <div className="weekly-plan-start w-full py-2.5 rounded-xl bg-sienna text-bone font-sans font-semibold text-sm flex items-center justify-center gap-2 hover:bg-sienna-dim transition-colors shadow-[4px_4px_10px_rgba(0,0,0,0.2),-4px_-4px_10px_rgba(255,255,255,0.5)]">
                       Start Workout
                     </div>
                  ) : (
                    <div className="w-full">
                      <div className="flex items-center justify-end text-[10px] font-sans font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                         <span>{wasCompleted ? '100%' : '0%'}</span>
                      </div>
                      <div className="weekly-plan-progress-track w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`weekly-plan-progress-fill h-full rounded-full transition-all duration-500 ${wasCompleted ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          style={{ width: wasCompleted ? '100%' : '0%' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
