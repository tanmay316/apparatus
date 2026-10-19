import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { Bike, Dumbbell, Flame, Footprints, Gauge, Zap, type LucideIcon } from 'lucide-react';
import type { CardioActivity, Workout } from '@/types';
import { fitnessScore, relativeEffort, type EffortKind } from '@/lib/relative-effort';
import { Pills, ToolCard } from './TrainingTools';
import { AskAIButton } from './AICoach';
import { InfoTip } from '@/components/ui/InfoTip';

const today = () => format(new Date(), 'yyyy-MM-dd');
const tick = { fontSize: 11, fill: 'rgb(var(--color-bone-dim))' };
const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--color-bone) / 0.1)', background: 'rgb(var(--color-ink-2))', color: 'rgb(var(--color-bone))', fontSize: 12 };
const EFFORT = '#e11d48';
const FITNESS = 'rgb(var(--viz-cardio))';
const TONE_COLOR = { good: '#059669', info: '#0284c7', warn: '#d97706' } as const;
const KIND_ICON: Record<EffortKind, LucideIcon> = { run: Zap, walk: Footprints, cycle: Bike, strength: Dumbbell };

/** Strava-style relative effort: this week against the range your last three weeks set. */
export function RelativeEffortCard({ cardio, workouts }: { cardio: CardioActivity[]; workouts: Workout[] }) {
  const [view, setView] = useState<'week' | 'weeks'>('week');
  const e = useMemo(() => relativeEffort(cardio, workouts, today(), 12), [cardio, workouts]);
  const { current } = e;
  const tone = TONE_COLOR[e.status.tone];
  const hasRange = current.low !== null && current.high !== null;
  const weekMax = Math.max(10, current.high || 0, ...e.days.map(d => d.cumulative || 0)) * 1.15;

  return (
    <ToolCard
      icon={Flame}
      title="Relative effort"
      info="One effort score for every run, ride, walk and workout, based on how long and how hard it was. The shaded band is your usual weekly range (last 3 weeks)."
      color={EFFORT}
      right={<AskAIButton prompt={() => `My relative effort this week is ${current.total}${hasRange ? ` (my weekly range is ${current.low}–${current.high}, from the last 3 weeks)` : ''}: ${e.status.label}. This week's sessions: ${e.activities.map(a => `${a.title} ${a.score}`).join(', ') || 'none yet'}. How should I plan the rest of my week?`} />}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-bone-dim">This week</div>
          <div className="text-[34px] font-bold tabular-nums leading-none text-bone mt-1">{current.total}</div>
        </div>
        <div className="text-right">
          <div className="text-[14px] font-bold" style={{ color: tone }}>{e.status.label}</div>
          <div className="text-[12px] text-bone-dim">{hasRange ? `Weekly range ${current.low}–${current.high}` : 'Range after 3 weeks'}</div>
        </div>
      </div>

      <div className="mt-3">
        <Pills label="Effort view" value={view} onChange={setView} options={[{ value: 'week', label: 'This week' }, { value: 'weeks', label: 'Last 12 weeks' }]} />
      </div>

      <div className="mt-3 -mx-1" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {view === 'week' ? (
            <ComposedChart data={e.days} margin={{ top: 8, right: 10, bottom: 0, left: -8 }}>
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} height={24} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={40} domain={[0, Math.ceil(weekMax)]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [v, name]} />
              {hasRange && <ReferenceArea y1={current.low!} y2={current.high!} fill={EFFORT} fillOpacity={0.1} stroke="none" ifOverflow="extendDomain" />}
              <Bar isAnimationActive={false} dataKey="score" name="Day effort" fill="rgb(var(--color-bone-dim) / 0.35)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line isAnimationActive={false} type="stepAfter" dataKey="cumulative" name="Week total" stroke={EFFORT} strokeWidth={3} dot={{ r: 3, fill: EFFORT }} connectNulls={false} />
            </ComposedChart>
          ) : (
            <ComposedChart data={e.weeks} margin={{ top: 8, right: 10, bottom: 0, left: -8 }}>
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} height={24} minTickGap={18} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar isAnimationActive={false} dataKey="total" name="Effort" fill={EFFORT} radius={[5, 5, 0, 0]} maxBarSize={22} />
              <Line isAnimationActive={false} type="monotone" dataKey="high" name="Range top" stroke="rgb(var(--color-bone-dim))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
              <Line isAnimationActive={false} type="monotone" dataKey="low" name="Range bottom" stroke="rgb(var(--color-bone-dim))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[13px] font-semibold flex items-center gap-1.5" style={{ color: tone }}>{e.status.label}<InfoTip>{e.status.text}</InfoTip></p>

      {e.activities.length > 0 && (
        <div className="mt-3 divide-y divide-line/60">
          {e.activities.map(a => {
            const Icon = KIND_ICON[a.kind];
            return (
              <div key={a.id} className="flex items-center gap-3 py-2">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-bone/[0.05] text-bone-dim"><Icon size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-bone truncate">{a.title}</div>
                  <div className="text-[11.5px] text-bone-dim">{format(new Date(`${a.date}T12:00:00`), 'EEE, MMM d')}</div>
                </div>
                <span className="text-[16px] font-bold tabular-nums" style={{ color: EFFORT }}>{a.score}</span>
              </div>
            );
          })}
        </div>
      )}
    </ToolCard>
  );
}

const SPANS = [
  { value: '90', label: '3M' },
  { value: '180', label: '6M' },
  { value: '365', label: '1Y' },
  { value: '730', label: '2Y' },
];

/** Fitness score (42-day training load) over time, across every kind of training. */
export function FitnessScoreCard({ cardio, workouts }: { cardio: CardioActivity[]; workouts: Workout[] }) {
  const [span, setSpan] = useState('180');
  const f = useMemo(() => fitnessScore(cardio, workouts, today(), Number(span)), [cardio, workouts, span]);
  const label = SPANS.find(s => s.value === span)?.label || '';
  return (
    <ToolCard
      icon={Gauge}
      title="Fitness score"
      info="Every session adds to your score by how long and how hard it was; it fades slowly when you rest. A steady climb of a few points a week builds fitness without overdoing it."
      right={<AskAIButton prompt={() => `My fitness score is ${f.current} (${f.level}), ${f.change >= 0 ? 'up' : 'down'} ${Math.abs(f.change)} over the last ${label}. My peak was ${f.peak} on ${f.peakDate}. How do I keep raising it safely?`} />}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-bone-dim">Today</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[34px] font-bold tabular-nums leading-none text-bone">{f.current}</span>
            <span className="text-[13px] font-semibold" style={{ color: FITNESS }}>{f.level}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-bold tabular-nums" style={{ color: f.change >= 0 ? '#059669' : '#d97706' }}>{f.change >= 0 ? '+' : '−'}{Math.abs(f.change)}</div>
          <div className="text-[11.5px] text-bone-dim">over {label} · peak {f.peak}</div>
        </div>
      </div>
      <div className="mt-3">
        <Pills label="Time span" value={span} onChange={setSpan} options={SPANS} />
      </div>
      <div className="mt-3 -mx-1" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={f.series} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="fitness-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={FITNESS} stopOpacity={0.35} />
                <stop offset="100%" stopColor={FITNESS} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} height={24} minTickGap={40}
              tickFormatter={d => format(new Date(`${d}T12:00:00`), Number(span) > 200 ? 'MMM yy' : 'MMM d')} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={d => format(new Date(`${d}T12:00:00`), 'EEE, MMM d, yyyy')} formatter={(v: number) => [v, 'Fitness']} />
            {f.peak > 0 && <ReferenceLine y={f.peak} stroke="rgb(var(--color-bone-dim))" strokeDasharray="4 4" />}
            <Area isAnimationActive={false} type="monotone" dataKey="fitness" stroke={FITNESS} strokeWidth={2.5} fill="url(#fitness-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ToolCard>
  );
}
