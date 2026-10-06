import { useMemo, useState, type ReactNode } from 'react';
import { Area, Bar, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { Activity, Gauge, Medal, Route, Timer, TrendingUp } from 'lucide-react';
import type { CardioActivity, CardioActivityType, Workout } from '@/types';
import { analyzeCardioTrends, ZONE_LABELS } from '@/lib/cardio-trends';
import { fitnessFreshness } from '@/lib/training-load';
import { formatClock, formatPaceSec } from '@/lib/cardio-analysis';
import { InsightList } from '@/components/analysis/AnalysisParts';
import { ProBadge, ProLock } from './ProLock';
import { AskAIButton } from './AICoach';
import { Pills, ToolCard } from './TrainingTools';
import { niceTicks, ScrollChart } from '@/components/ui/ScrollChart';
import { BRAND } from '@/lib/brand';
import { RANGE_LABEL, rangeDays, rangeStart, type TimeRange } from '@/lib/time-range';

const TYPES: { value: CardioActivityType; label: string }[] = [
  { value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' },
];
const ZONE_COLORS = ['#94a3b8', '#38bdf8', '#22c55e', '#f59e0b', '#f97316', '#ef4444'];
const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--color-bone) / 0.1)', background: 'rgb(var(--color-ink-2))', color: 'rgb(var(--color-bone))', fontSize: 12 };
const tick = { fontSize: 10.5, fill: 'rgb(var(--color-bone-dim))' };
const today = () => format(new Date(), 'yyyy-MM-dd');

function Card(props: { icon: typeof Activity; title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return <ToolCard color="rgb(var(--viz-cardio))" {...props} />;
}

function Big({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-bone-dim">{label}</div>
      <div className="text-[26px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-[11.5px] text-bone-dim truncate">{sub}</div>}
    </div>
  );
}

/** Fitness (42-day load), Fatigue (7-day) and Form across all cardio and strength training. */
export function FitnessFreshnessCard({ cardio, workouts, days = 180 }: { cardio: CardioActivity[]; workouts: Workout[]; days?: number }) {
  const shown = Math.max(14, Math.min(730, days));
  const f = useMemo(() => fitnessFreshness(cardio, workouts, today(), shown), [cardio, workouts, shown]);
  const data = f.series.map(p => ({ ...p, label: p.date }));
  const ticks = useMemo(() => {
    const vals = f.series.flatMap(p => [p.load, p.fitness, p.fatigue, p.form]);
    return niceTicks(Math.min(0, ...vals), Math.max(1, ...vals));
  }, [f.series]);
  const tone = f.state.tone === 'warn' ? '#d97706' : f.state.tone === 'good' ? '#059669' : '#0284c7';
  return (
    <Card
      icon={TrendingUp}
      title="Fitness & freshness"
      subtitle="Training load from every run, ride, walk and workout"
      right={<AskAIButton prompt={() => `My fitness & freshness chart: Fitness ${f.fitness} (${f.ramp >= 0 ? '+' : ''}${f.ramp} this week), Fatigue ${f.fatigue} (${f.weekLoad} training load in the last 7 days), Form ${f.form} (${f.state.label}). What does this mean and how should I train this week?`} />}
    >
      <div className="grid grid-cols-3 gap-3">
        <Big label="Fitness" value={f.fitness} sub={`${f.ramp >= 0 ? '+' : ''}${f.ramp} this week`} color="rgb(var(--viz-cardio))" />
        <Big label="Fatigue" value={f.fatigue} sub={`${f.weekLoad} load / 7d`} color="#a855f7" />
        <Big label="Form" value={f.form > 0 ? `+${f.form}` : f.form} sub={f.state.label} color={tone} />
      </div>
      <div className="mt-3">
        <ScrollChart count={data.length} slot={shown <= 31 ? 10 : shown <= 120 ? 5 : 3} height={200} ticks={ticks} top={6} bottom={24} tickStyle={{ color: 'rgb(var(--color-bone-dim))' }}>
          {w => (
            <ComposedChart width={w} height={200} data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" height={24} tickFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d')} tick={tick} axisLine={false} tickLine={false} minTickGap={36} />
              <YAxis hide domain={[ticks[0], ticks[ticks.length - 1]]} allowDataOverflow />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={d => format(new Date(`${d}T12:00:00`), 'EEE, MMM d')} />
              <Area isAnimationActive={false} type="monotone" dataKey="form" name="Form" stroke="none" fill={tone} fillOpacity={0.14} />
              <Bar isAnimationActive={false} dataKey="load" name="Load" fill="rgb(var(--color-bone-dim) / 0.35)" maxBarSize={shown <= 31 ? 10 : 4} />
              <Line isAnimationActive={false} type="monotone" dataKey="fitness" name="Fitness" stroke="rgb(var(--viz-cardio))" strokeWidth={2.4} dot={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="fatigue" name="Fatigue" stroke="#a855f7" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          )}
        </ScrollChart>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: tone }}><b>{f.state.label}.</b> <span className="text-bone-dim">{f.state.text}</span></p>
    </Card>
  );
}

function CardioInsightsBody({ activities, workouts, range, earliest }: { activities: CardioActivity[]; workouts: Workout[]; range: TimeRange; earliest?: string | null }) {
  const available = TYPES.filter(t => activities.some(a => a.type === t.value));
  const [type, setType] = useState<CardioActivityType>(() => available.find(t => t.value === 'run')?.value || available[0]?.value || 'run');
  const from = rangeStart(range, today(), earliest);
  const t = useMemo(() => analyzeCardioTrends(activities, type, today(), from), [activities, type, from]);
  const isRide = type === 'cycle';
  const rate = (sec: number, km: number) => (isRide ? `${Math.round((km / (sec / 3600)) * 10) / 10} km/h` : `${formatPaceSec(sec / km)} /km`);

  return (
    <div className="space-y-3">
      {available.length > 1 && <Pills label="Activity type" value={type} onChange={setType} options={available} />}

      <FitnessFreshnessCard cardio={activities} workouts={workouts} days={rangeDays(range, today(), earliest)} />

      {t.bestEfforts.length > 0 && (
        <Card
          icon={Medal}
          title="Best efforts"
          subtitle="All-time fastest over each distance, from your GPS routes"
          right={<AskAIButton prompt={() => `My ${TYPES.find(o => o.value === type)?.label.toLowerCase()} best efforts: ${t.bestEfforts.map(e => `${e.label} ${formatClock(e.sec)} (${e.date}${e.recentSec ? `, best in last 90 days ${formatClock(e.recentSec)}` : ''})`).join('; ')}. Which distance is my strength and which one should I target next?`} />}
        >
          <div className="divide-y divide-line/60">
            {t.bestEfforts.map(e => (
              <div key={e.label} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className="w-24 shrink-0 font-semibold text-bone">{e.label}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-mono font-semibold text-bone tabular-nums">{formatClock(e.sec)}</span>
                  <span className="text-bone-dim"> · {rate(e.sec, e.km)}{e.approx ? ' · est.' : ''}</span>
                </span>
                <span className="text-[11px] text-bone-dim text-right">
                  {e.date}
                  {e.recentSec && e.recentSec !== e.sec && <span className="block">90d: {formatClock(e.recentSec)}</span>}
                  {e.recentSec === e.sec && <span className="block text-emerald-500 font-semibold">recent PR</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(t.vo2max || t.predictions.length > 0) && (
        <Card
          icon={Gauge}
          title={t.vo2max ? 'VO2 max & race predictor' : 'Ride predictor'}
          subtitle={t.vo2max ? `From your best ${t.vo2max.from} in the last 90 days` : 'From your best recent effort'}
          right={<AskAIButton prompt={() => `${t.vo2max ? `My estimated VO2 max is ${t.vo2max.value} (${t.vo2max.level}), from my best ${t.vo2max.from}. ` : ''}Predicted times: ${t.predictions.map(p => `${p.label} ${formatClock(p.sec)}`).join(', ')}. How can I improve these, and is a realistic race goal within reach?`} />}
        >
          {t.vo2max && (
            <div className="flex items-end gap-3 mb-3">
              <span className="text-[34px] font-semibold leading-none tabular-nums text-bone">{t.vo2max.value}</span>
              <span className="text-[12px] text-bone-dim pb-1">ml/kg/min · <b className="text-bone">{t.vo2max.level}</b></span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {t.predictions.map(p => (
              <div key={p.label} className="rounded-xl px-3 py-2 bg-bone/[0.04] border border-line/50">
                <div className="text-[10.5px] text-bone-dim">{p.label}</div>
                <div className="text-[15px] font-bold text-bone tabular-nums">{formatClock(p.sec)}</div>
                <div className="text-[10.5px] text-bone-dim">{rate(p.sec, p.km)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {t.zones.length > 0 && (
        <Card
          icon={Timer}
          title="Intensity zones"
          subtitle={`${RANGE_LABEL[range]} · threshold ≈ ${isRide ? `${t.thresholdKmh} km/h` : `${formatPaceSec(3600 / t.thresholdKmh)} /km`}`}
          right={<AskAIButton prompt={() => `My intensity zones (${RANGE_LABEL[range].toLowerCase()}): ${t.zones.map((z, i) => `Z${z.zone} ${ZONE_LABELS[i]} ${Math.round(z.sec / 60)} min (${z.pct}%)`).join(', ')}. Is this a good balance of easy and hard training for me?`} />}
        >
          <div className="flex h-4 rounded-full overflow-hidden bg-bone/[0.06]">
            {t.zones.map((z, i) => z.pct > 0 && <div key={z.zone} style={{ width: `${z.pct}%`, background: ZONE_COLORS[i] }} title={`${z.label} ${z.pct}%`} />)}
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11.5px]">
            {t.zones.map((z, i) => (
              <span key={z.zone} className="flex items-center gap-1.5 text-bone-dim">
                <span className="w-2 h-2 rounded-full" style={{ background: ZONE_COLORS[i] }} />
                Z{z.zone} {ZONE_LABELS[i]} <b className="ml-auto text-bone tabular-nums">{Math.round(z.sec / 60)}m</b>
              </span>
            ))}
          </div>
        </Card>
      )}

      {t.matched && (
        <Card icon={Route} title="Your route over time" subtitle={`${t.matched.runs.length} efforts on the same ${t.matched.routeKm} km route`}>
          <ul className="space-y-1">
            {t.matched.runs.map((r, i) => {
              const best = t.matched!.bestPaceSec;
              const width = isRide ? (r.kmh / Math.max(...t.matched!.runs.map(x => x.kmh))) * 100 : (best / r.paceSec) * 100;
              return (
                <li key={`${r.date}-${i}`} className="flex items-center gap-2 text-[11.5px] font-mono tabular-nums">
                  <span className="w-20 shrink-0 text-bone-dim">{r.date.slice(5)}</span>
                  <div className="flex-1 h-2 rounded-full bg-bone/[0.06] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(8, width)}%`, background: r.paceSec === best ? '#059669' : r.isLatest ? 'rgb(var(--viz-cardio))' : 'rgb(var(--color-bone-dim) / 0.5)' }} />
                  </div>
                  <span className={`w-20 shrink-0 text-right ${r.isLatest ? 'font-bold text-bone' : 'text-bone-dim'}`}>{isRide ? `${r.kmh} km/h` : formatClock(r.sec)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {t.insights.length > 0 && <InsightList insights={t.insights} />}
    </div>
  );
}

/** Pro: long-term cardio analytics on the Progress page. */
export function CardioInsightsPanel({ activities, workouts, range = '90d', earliest }: { activities: CardioActivity[]; workouts: Workout[]; range?: TimeRange; earliest?: string | null }) {
  if (activities.length < 2) return null;
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h3 className="text-[17px] font-semibold text-bone flex items-center gap-2">Performance insights <ProBadge /></h3>
        <p className="text-[12px] text-bone-dim mt-0.5">Fitness, best efforts, VO2 max, zones and route history</p>
      </div>
      <ProLock title="Performance insights" reason={`See your fitness & freshness, best efforts, VO2 max, race predictions, intensity zones and route history with ${BRAND.name} Pro.`} maxHeight={520}>
        <CardioInsightsBody activities={activities} workouts={workouts} range={range} earliest={earliest} />
      </ProLock>
    </section>
  );
}
