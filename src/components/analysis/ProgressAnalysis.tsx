import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { analyzeWorkout } from '@/lib/workout-analysis';
import { analyzeCardio } from '@/lib/cardio-analysis';
import type { CardioActivity, Workout } from '@/types';
import { WorkoutAnalysisView } from './WorkoutAnalysisView';
import { CardioAnalysisView } from './CardioAnalysisView';

/** Collapsible analysis for one session, used inside the Progress day view. */
export function InlineSessionAnalysis({ kind, session, workouts, cardio, imperial, defaultOpen = false }: {
  kind: 'workout' | 'cardio';
  session: Workout | CardioActivity;
  workouts?: Workout[];
  cardio?: CardioActivity[];
  imperial: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const workoutAnalysis = useMemo(
    () => (open && kind === 'workout' ? analyzeWorkout(session as Workout, workouts || [], { weightUnit: imperial ? 'lb' : 'kg' }) : null),
    [open, kind, session, workouts, imperial],
  );
  const cardioAnalysis = useMemo(
    () => (open && kind === 'cardio' ? analyzeCardio(session as CardioActivity, cardio || []) : null),
    [open, kind, session, cardio],
  );

  return (
    <div className="mt-4 pt-3 border-t border-line">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-[13px] font-semibold text-bone"
      >
        <BarChart3 size={15} className="text-viz-strength" />
        <span className="flex-1 text-left">Session analysis</span>
        <ChevronDown size={15} className={`text-bone-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3">
          {workoutAnalysis && <WorkoutAnalysisView analysis={workoutAnalysis} imperial={imperial} workout={session as Workout} showStats={false} />}
          {cardioAnalysis && <CardioAnalysisView analysis={cardioAnalysis} activity={session as CardioActivity} history={cardio} showStats={false} />}
        </div>
      )}
    </div>
  );
}
