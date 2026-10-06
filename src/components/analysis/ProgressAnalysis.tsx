import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { analyzeWorkout } from '@/lib/workout-analysis';
import { analyzeCardio } from '@/lib/cardio-analysis';
import { startMs } from '@/lib/analysis-common';
import type { CardioActivity, Workout } from '@/types';
import { WorkoutAnalysisView } from './WorkoutAnalysisView';
import { CardioAnalysisView } from './CardioAnalysisView';

const CARDIO_LABEL = { run: 'Run', walk: 'Walk', cycle: 'Ride' } as const;
const RECENT = 40;

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
          {workoutAnalysis && <WorkoutAnalysisView analysis={workoutAnalysis} imperial={imperial} workout={session as Workout} />}
          {cardioAnalysis && <CardioAnalysisView analysis={cardioAnalysis} activity={session as CardioActivity} history={cardio} />}
        </div>
      )}
    </div>
  );
}

/** Strength tab: pick any recent workout and see its analysis. */
export function StrengthAnalysisPanel({ workouts, imperial, from = '' }: { workouts: Workout[]; imperial: boolean; from?: string }) {
  const recent = useMemo(() => [...workouts].filter(w => w.id && w.date >= from).sort((a, b) => startMs(b) - startMs(a)).slice(0, RECENT), [workouts, from]);
  const [selected, setSelected] = useState('');
  const workout = recent.find(w => w.id === selected) || recent[0];
  const analysis = useMemo(
    () => (workout ? analyzeWorkout(workout, workouts, { weightUnit: imperial ? 'lb' : 'kg' }) : null),
    [workout, workouts, imperial],
  );
  if (!workout || !analysis) return null;

  return (
    <section className="pro-panel p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-bone">Workout analysis</h3>
          <p className="text-xs text-bone-dim mt-0.5">Progressive overload, sets, weights and muscle volume</p>
        </div>
        <CustomSelect
          ariaLabel="Choose workout"
          className="sm:w-64"
          value={workout.id!}
          onChange={setSelected}
          options={recent.map(w => ({ value: w.id!, label: `${w.date} · ${w.dayTitle || w.planTitle || 'Workout'}` }))}
        />
      </div>
      <WorkoutAnalysisView analysis={analysis} imperial={imperial} workout={workout} />
    </section>
  );
}

/** Cardio tab: pick any recent run, walk or ride and see its analysis. */
export function CardioAnalysisPanel({ activities, from = '' }: { activities: CardioActivity[]; from?: string }) {
  const recent = useMemo(() => [...activities].filter(a => a.id && a.date >= from).sort((a, b) => startMs(b) - startMs(a)).slice(0, RECENT), [activities, from]);
  const [selected, setSelected] = useState('');
  const activity = recent.find(a => a.id === selected) || recent[0];
  const analysis = useMemo(() => (activity ? analyzeCardio(activity, activities) : null), [activity, activities]);
  if (!activity || !analysis) return null;

  return (
    <section className="pro-panel p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-bone">Session analysis</h3>
          <p className="text-xs text-bone-dim mt-0.5">Pace, splits, weekly load and race predictions</p>
        </div>
        <CustomSelect
          ariaLabel="Choose session"
          className="sm:w-64"
          value={activity.id!}
          onChange={setSelected}
          options={recent.map(a => ({ value: a.id!, label: `${a.date} · ${CARDIO_LABEL[a.type] ?? 'Cardio'} ${(a.distanceKm || 0).toFixed(1)} km` }))}
        />
      </div>
      <CardioAnalysisView analysis={analysis} activity={activity} history={activities} />
    </section>
  );
}
