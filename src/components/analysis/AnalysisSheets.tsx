import { useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { getWorkoutWithHistory } from '@/services/workouts';
import { getCardioWithHistory } from '@/services/cardio';
import { analyzeWorkout } from '@/lib/workout-analysis';
import { analyzeCardio } from '@/lib/cardio-analysis';
import type { CardioActivity } from '@/types';
import { WorkoutAnalysisView } from './WorkoutAnalysisView';
import { CardioAnalysisView } from './CardioAnalysisView';
import { lockBodyScroll } from '@/lib/scroll-lock';

function AnalysisSheet({ title, subtitle, onClose, footer, children }: {
  title: string; subtitle?: string; onClose: () => void; footer?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const unlock = lockBodyScroll();
    window.addEventListener('keydown', onKey);
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center sm:p-4 bg-black/60" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-label={title}
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-line bg-ink-2 text-bone shadow-2xl overflow-hidden"
        style={{ paddingBottom: 'var(--sab)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] leading-tight">{title}</h2>
            {subtitle && <p className="text-[12px] text-bone-dim mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-bone-dim hover:text-bone hover:bg-bone/[0.08]" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line">{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  );
}

const Loading = () => <div className="py-10 flex justify-center text-bone-dim"><Loader2 size={22} className="animate-spin" /></div>;
const Missing = () => <p className="py-10 text-center text-[13px] text-bone-dim">This session is no longer available.</p>;

function OpenInProgress({ date, tab, id, onClose }: { date: string; tab: 'strength' | 'cardio'; id: string; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => { onClose(); navigate(`/progress?date=${encodeURIComponent(date)}&tab=${tab}&session=${encodeURIComponent(id)}`); }}
      className="w-full h-10 rounded-xl bg-sienna text-[#fbe1d1] text-[13px] font-bold"
    >
      Open in Progress
    </button>
  );
}

export function WorkoutAnalysisSheet({ uid, workoutId, onClose }: { uid: string; workoutId: string; onClose: () => void }) {
  const imperial = useUIStore(s => s.units) === 'imperial';
  const { data, isLoading } = useQuery({
    queryKey: ['workoutAnalysis', uid, workoutId],
    queryFn: () => getWorkoutWithHistory(uid, workoutId),
  });
  const analysis = useMemo(
    () => (data ? analyzeWorkout(data.workout, data.history, { weightUnit: imperial ? 'lb' : 'kg' }) : null),
    [data, imperial],
  );
  const w = data?.workout;

  return (
    <AnalysisSheet
      title="Workout analysis"
      subtitle={w ? [w.dayTitle, w.planTitle, w.date].filter(Boolean).join(' · ') : undefined}
      onClose={onClose}
      footer={w && <OpenInProgress date={w.date} tab="strength" id={workoutId} onClose={onClose} />}
    >
      {isLoading ? <Loading /> : analysis ? <WorkoutAnalysisView analysis={analysis} imperial={imperial} workout={w} /> : <Missing />}
    </AnalysisSheet>
  );
}

const TYPE_TITLE = { run: 'Run analysis', walk: 'Walk analysis', cycle: 'Ride analysis' } as const;

/** Pass `activity` + `history` when already loaded, or `uid` + `activityId` to fetch. */
export function CardioAnalysisSheet({ uid, activityId, activity, history, onClose }: {
  uid?: string; activityId?: string; activity?: CardioActivity; history?: CardioActivity[]; onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['cardioAnalysis', uid, activityId],
    queryFn: () => getCardioWithHistory(uid!, activityId!),
    enabled: !activity && !!uid && !!activityId,
  });
  const current = activity ?? data?.activity;
  const all = history ?? data?.history;
  const analysis = useMemo(() => (current ? analyzeCardio(current, all ?? []) : null), [current, all]);

  return (
    <AnalysisSheet
      title={current ? TYPE_TITLE[current.type] ?? 'Cardio analysis' : 'Cardio analysis'}
      subtitle={current?.date}
      onClose={onClose}
      footer={current?.id && <OpenInProgress date={current.date} tab="cardio" id={current.id} onClose={onClose} />}
    >
      {!activity && isLoading ? <Loading /> : analysis ? <CardioAnalysisView analysis={analysis} activity={current} history={all} /> : <Missing />}
    </AnalysisSheet>
  );
}
