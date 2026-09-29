import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Footprints, Play } from 'lucide-react';
import { DEFAULT_STEP_GOAL, getDailySteps } from '@/services/cardio';
import { pedometerService } from '@/services/pedometer';
import { localDateKey } from '@/lib/stats';

const RING = 2 * Math.PI * 26;

/** Today's steps (whole-day phone count where available) against the goal set in Settings. */
export function StepGoalCard({ userId, goal }: { userId: string; goal?: number }) {
  const queryClient = useQueryClient();
  const target = goal && goal > 0 ? goal : DEFAULT_STEP_GOAL;
  const today = localDateKey();
  const { data: steps = 0 } = useQuery({
    queryKey: ['stepsToday', userId, today],
    queryFn: () => getDailySteps(userId, today),
    refetchInterval: 60_000,
  });
  const { data: permission } = useQuery({
    queryKey: ['stepsPermission'],
    queryFn: () => pedometerService.stepsPermission(),
    staleTime: 5 * 60_000,
  });

  const enableAllDay = async () => {
    await pedometerService.requestStepsPermission();
    queryClient.invalidateQueries({ queryKey: ['stepsPermission'] });
    queryClient.invalidateQueries({ queryKey: ['stepsToday'] });
  };

  const pct = Math.round((steps / target) * 100);
  const done = steps >= target;
  const remaining = Math.max(0, target - steps);

  return (
    <div className="space-y-2">
    <Link
      to="/cardio?type=walk"
      className="dx-card p-4 flex items-center gap-4 hover:border-emerald-500/40 active:scale-[0.99] transition-all group block cursor-pointer"
      aria-label="Daily step goal - Start walking cardio session"
      title="Start walking cardio session"
    >
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
          <circle cx="30" cy="30" r="26" fill="none" strokeWidth="6" style={{ stroke: 'var(--dx-card-2)' }} />
          <circle
            cx="30" cy="30" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - Math.min(1, steps / target))}
            style={{ stroke: done ? 'var(--dx-success)' : 'var(--dx-accent)', transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular">{pct}%</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[12px] font-medium dx-muted group-hover:text-[var(--dx-text)] transition-colors">
          <Footprints size={14} className="text-emerald-500" /> Steps today
        </div>
        <div className="mt-0.5 text-[20px] font-semibold tabular leading-tight">
          {steps.toLocaleString()}
          <span className="text-[12px] font-normal dx-muted"> / {target.toLocaleString()}</span>
        </div>
        <div className="text-[12px] dx-muted">
          {done ? 'Goal reached' : `${remaining.toLocaleString()} to go`}
        </div>
      </div>
      <div
        className={`dx-icon-btn dx-icon-btn--sm shrink-0 transition-all ${
          done
            ? 'group-hover:bg-emerald-500 group-hover:text-white'
            : 'bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white'
        }`}
        aria-label="Start a walk"
        title="Start a walk"
      >
        <Play size={15} />
      </div>
    </Link>
    {permission === 'prompt' && (
      <button
        type="button"
        onClick={enableAllDay}
        className="w-full dx-card px-4 py-3 flex items-center gap-2 text-left text-[13px] font-medium hover:border-emerald-500/40 transition-colors"
      >
        <Footprints size={15} className="text-emerald-500 shrink-0" />
        <span className="flex-1">Count every step today, not just tracked walks</span>
        <span className="text-emerald-500 font-semibold">Allow</span>
      </button>
    )}
    {permission === 'denied' && (
      <p className="text-[11.5px] dx-muted px-1">
        Step access is off, so only tracked walks and runs count. Turn on Physical activity / Motion &amp; Fitness for Apparatus in your phone settings.
      </p>
    )}
    </div>
  );
}
