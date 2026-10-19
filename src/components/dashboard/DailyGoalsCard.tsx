import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Footprints, Heart, type LucideIcon } from 'lucide-react';
import { DEFAULT_STEP_GOAL, getDailySteps } from '@/services/cardio';
import { historyQuery } from '@/services/history';
import { pedometerService } from '@/services/pedometer';
import { HEART_DAILY_GOAL, HEART_WEEKLY_GOAL, heartSummary } from '@/lib/heart-points';
import { localDateKey } from '@/lib/stats';
import { BRAND } from '@/lib/brand';
import { InfoTip } from '@/components/ui/InfoTip';

const R = 22;
const RING = 2 * Math.PI * R;
const HEART = '#e11d48';
const STEPS = '#10b981';

function GoalTile({ to, icon: Icon, color, label, value, target, unit }: {
  to: string; icon: LucideIcon; color: string; label: string; value: number; target: number; unit: string;
}) {
  const done = value >= target;
  return (
    <Link to={to} className="min-w-0 flex items-center gap-3 rounded-2xl p-2 -m-2 active:scale-[0.98] transition-transform" aria-label={`${label}: ${value} of ${target}`}>
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 52 52" className="w-14 h-14 -rotate-90">
          <circle cx="26" cy="26" r={R} fill="none" strokeWidth="6" style={{ stroke: 'var(--dx-card-2)' }} />
          <circle
            cx="26" cy="26" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - Math.min(1, value / target))}
            style={{ stroke: color, transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center" style={{ color }}>
          <Icon size={18} fill={done ? color : 'none'} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-[12px] dx-muted truncate">{label}</div>
        <div className="text-[19px] font-semibold tabular leading-tight truncate">{value.toLocaleString()}</div>
        <div className="text-[11.5px] dx-muted truncate">{done ? 'Goal reached' : `of ${target.toLocaleString()} ${unit}`}</div>
      </div>
    </Link>
  );
}

const INFO: ReactNode = (
  <>
    <b>Steps</b>: your daily step goal (change it in Settings).
    <br /><br />
    <b>Heart points</b>: the WHO recommends at least 150 minutes of moderate activity (or 75 of vigorous) every week.
    You get 1 point per minute of brisk walking, cycling or a workout, and 2 per minute of running or other hard efforts.
    {` ${HEART_DAILY_GOAL} points a day on 5 days meets the guideline.`}
  </>
);

/** Today's two goals, like the rings in Google Fit / Apple Fitness: steps and WHO heart points. */
export function DailyGoalsCard({ userId, stepGoal }: { userId: string; stepGoal?: number }) {
  const queryClient = useQueryClient();
  const target = stepGoal && stepGoal > 0 ? stepGoal : DEFAULT_STEP_GOAL;
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
  const { data: cardio = [] } = useQuery(historyQuery('cardio', userId));
  const { data: workouts = [] } = useQuery(historyQuery('workouts', userId));
  const heart = useMemo(() => heartSummary(cardio, workouts), [cardio, workouts]);
  const weekPct = Math.min(100, Math.round((heart.week / HEART_WEEKLY_GOAL) * 100));

  const enableAllDay = async () => {
    await pedometerService.requestStepsPermission();
    queryClient.invalidateQueries({ queryKey: ['stepsPermission'] });
    queryClient.invalidateQueries({ queryKey: ['stepsToday'] });
  };

  return (
    <div className="space-y-2">
      <section className="dx-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[14px] font-semibold">Today's goals</h3>
          <InfoTip label="About these goals">{INFO}</InfoTip>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <GoalTile to="/cardio?type=walk" icon={Footprints} color={STEPS} label="Steps" value={steps} target={target} unit="steps" />
          <GoalTile to="/cardio" icon={Heart} color={HEART} label="Heart points" value={heart.today} target={HEART_DAILY_GOAL} unit="pts" />
        </div>
        <div className="mt-3.5 flex items-center gap-2.5 text-[12px]">
          <span className="dx-muted shrink-0">This week</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--dx-card-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${weekPct}%`, background: HEART, transition: 'width 0.8s ease' }} />
          </div>
          <span className="tabular font-semibold shrink-0">{heart.week}<span className="dx-muted font-normal"> / {HEART_WEEKLY_GOAL}</span></span>
        </div>
      </section>
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
          Step access is off, so only tracked walks and runs count. Turn on Physical activity / Motion &amp; Fitness for {BRAND.name} in your phone settings.
        </p>
      )}
    </div>
  );
}
