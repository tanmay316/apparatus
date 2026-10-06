import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { AlertTriangle, BatteryCharging, Check, ChevronRight, Flag, Plus, Scale, Target, Trash2, TrendingUp, type LucideIcon } from 'lucide-react';
import type { CardioActivity, Workout } from '@/types';
import {
  cumulativeComparison, goalLabel, goalMetrics, goalProgress, hybridBalance, MAX_GOALS, readiness, suggestGoalTarget,
  GOAL_UNITS, type CumMetric, type GoalMetric, type GoalPeriod, type GoalProgress, type GoalSport, type TrainingGoal,
} from '@/lib/pro-insights';
import { RANGE_LABEL, type TimeRange } from '@/lib/time-range';
import { useSaveTrainingGoals, useTrainingGoals } from '@/services/goals';
import { useUIStore } from '@/stores/ui-store';
import { niceTicks, ScrollChart } from '@/components/ui/ScrollChart';
import { ChipGroup, Field, FormSection, FormSheet } from '@/components/ui/FormSheet';
import { ProBadge, ProLock } from './ProLock';
import { AskAIButton } from './AICoach';
import { BRAND } from '@/lib/brand';

const today = () => format(new Date(), 'yyyy-MM-dd');
const tick = { fontSize: 11, fill: 'rgb(var(--color-bone-dim))' };
const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--color-bone) / 0.1)', background: 'rgb(var(--color-ink-2))', color: 'rgb(var(--color-bone))', fontSize: 12 };
const CARDIO = 'rgb(var(--viz-cardio))';
const STRENGTH = 'rgb(var(--viz-strength))';
const TONE_COLOR = { good: '#059669', info: '#0284c7', warn: '#d97706' } as const;

/** Full-width card used by the Pro tools; big type and generous charts for phones. */
export function ToolCard({ icon: Icon, title, subtitle, right, children, color = CARDIO }: {
  icon: LucideIcon; title: string; subtitle?: string; right?: ReactNode; children: ReactNode; color?: string;
}) {
  return (
    <section className="pro-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold text-bone leading-tight">{title}</h3>
            {subtitle && <p className="text-[12px] text-bone-dim mt-0.5 leading-snug">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="pro-track flex p-1 rounded-full w-full">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`flex-1 h-9 rounded-full text-[13px] font-semibold transition-colors ${value === o.value ? 'pro-thumb text-bone' : 'text-bone-dim'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Readiness ───────────────────────────────────────────────

function Gauge({ value, color, size = 112 }: { value: number; color: string; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--color-bone) / 0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-bold tabular-nums leading-none text-bone">{value}</span>
        <span className="text-[10.5px] uppercase tracking-wider text-bone-dim mt-1">of 100</span>
      </div>
    </div>
  );
}

export function ReadinessCard({ cardio, workouts }: { cardio: CardioActivity[]; workouts: Workout[] }) {
  const r = useMemo(() => readiness(cardio, workouts, today()), [cardio, workouts]);
  if (!r) return null;
  const color = TONE_COLOR[r.tone];
  return (
    <ToolCard
      icon={BatteryCharging}
      title="Today's readiness"
      subtitle="From your training form, muscle recovery and rest days"
      color={color}
      right={<AskAIButton prompt={() => `My readiness today is ${r.score}/100 (${r.label}). ${r.factors.map(f => `${f.label}: ${f.score} (${f.text})`).join('; ')}. Suggested: ${r.plan.title}. What exact session should I do today?`} />}
    >
      <div className="flex items-center gap-4">
        <Gauge value={r.score} color={color} />
        <div className="min-w-0">
          <div className="text-[20px] font-bold leading-tight" style={{ color }}>{r.label}</div>
          <div className="mt-1.5 text-[14px] font-semibold text-bone">{r.plan.title}</div>
          <p className="text-[12.5px] text-bone-dim leading-snug mt-0.5">{r.plan.text}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {r.factors.map(f => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="font-semibold text-bone">{f.label}</span>
              <span className="text-bone-dim truncate">{f.text}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-bone/[0.07] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, f.score)}%`, background: f.score >= 70 ? '#059669' : f.score >= 45 ? '#d97706' : '#e11d48' }} />
            </div>
          </div>
        ))}
      </div>
      {r.fresh.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-bone-dim mr-0.5">Fresh to train:</span>
          {r.fresh.slice(0, 5).map(g => <span key={g} className="h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{g}</span>)}
        </div>
      )}
    </ToolCard>
  );
}

// ─── Goals ───────────────────────────────────────────────────

const STATUS: Record<GoalProgress['status'], { label: string; color: string }> = {
  done: { label: 'Done', color: '#059669' },
  ahead: { label: 'Ahead', color: '#059669' },
  on_track: { label: 'On track', color: '#0284c7' },
  behind: { label: 'Behind', color: '#d97706' },
};
const SPORTS: { value: GoalSport; label: string }[] = [
  { value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Ride' }, { value: 'strength', label: 'Strength' }, { value: 'all', label: 'Any training' },
];
const PERIODS: { value: GoalPeriod; label: string }[] = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }];
const METRIC_LABEL: Record<GoalMetric, string> = { distance: 'Distance (km)', time: 'Time (hours)', sessions: 'Sessions', elevation: 'Climb (m)' };

function GoalRow({ p, onEdit }: { p: GoalProgress; onEdit: () => void }) {
  const s = STATUS[p.status];
  const fmt = (v: number) => (p.goal.metric === 'elevation' ? v.toLocaleString() : String(v));
  return (
    <button type="button" onClick={onEdit} className="w-full text-left pro-tile p-3.5 active:scale-[0.99] transition-transform">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-bone truncate">{p.label}</span>
        <span className="h-6 px-2 rounded-full text-[11px] font-bold shrink-0 inline-flex items-center gap-1" style={{ background: `color-mix(in srgb, ${s.color} 14%, transparent)`, color: s.color }}>
          {p.status === 'done' && <Check size={11} strokeWidth={3} />}{s.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[24px] font-bold tabular-nums text-bone leading-none">{fmt(p.value)}</span>
        <span className="text-[13px] text-bone-dim">/ {fmt(p.goal.target)} {p.unit === 'sessions' ? '' : p.unit}</span>
        <span className="ml-auto text-[13px] font-semibold tabular-nums text-bone">{Math.round(p.pct * 100)}%</span>
      </div>
      <div className="relative mt-2.5 h-2.5 rounded-full bg-bone/[0.08]">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, p.pct * 100)}%`, background: s.color }} />
        {p.status !== 'done' && (
          <div className="absolute -top-1 -bottom-1 w-[3px] rounded-full bg-bone" style={{ left: `calc(${Math.min(100, p.expectedPct * 100)}% - 1.5px)` }} title="Where you should be today" />
        )}
      </div>
      <div className="mt-1.5 text-[11.5px] text-bone-dim">
        {p.status === 'done' ? 'Goal reached. Nice work.' : `${fmt(p.perDay)} ${p.unit} a day for ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} · white line = on pace`}
      </div>
    </button>
  );
}

function GoalEditor({ goal, cardio, workouts, onClose }: { goal: TrainingGoal | null; cardio: CardioActivity[]; workouts: Workout[]; onClose: () => void }) {
  const { data: goals = [] } = useTrainingGoals();
  const save = useSaveTrainingGoals();
  const showToast = useUIStore(s => s.showToast);
  const [sport, setSport] = useState<GoalSport>(goal?.sport || 'run');
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period || 'week');
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric || 'distance');
  const validMetric = goalMetrics(sport).includes(metric) ? metric : goalMetrics(sport)[0];
  const suggested = useMemo(() => suggestGoalTarget({ sport, period, metric: validMetric }, cardio, workouts, today()), [sport, period, validMetric, cardio, workouts]);
  const [target, setTarget] = useState<string>(goal ? String(goal.target) : '');
  const [busy, setBusy] = useState(false);
  const value = Number(target || suggested);
  const valid = Number.isFinite(value) && value > 0;

  const persist = async (next: TrainingGoal[], msg: string) => {
    setBusy(true);
    try {
      await save(next);
      showToast(msg);
      onClose();
    } catch {
      showToast('Could not save your goal. Check your connection.', 'error');
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const item: TrainingGoal = { id: goal?.id || crypto.randomUUID(), sport, period, metric: validMetric, target: value };
    persist(goal ? goals.map(g => (g.id === goal.id ? item : g)) : [...goals, item], goal ? 'Goal updated' : 'Goal added');
  };

  return (
    <FormSheet icon={Target} title={goal ? 'Edit goal' : 'New goal'} subtitle={valid ? goalLabel({ sport, period, metric: validMetric, target: value }) : 'Pick a sport, period and target'}
      onClose={onClose} onSubmit={submit} submitLabel={goal ? 'Save goal' : 'Add goal'} busy={busy} disabled={!valid}>
      <FormSection title="What">
        <ChipGroup label="Sport" value={sport} onChange={s => { setSport(s); setTarget(''); }} options={SPORTS} />
        <ChipGroup label="Measure" value={validMetric} onChange={m => { setMetric(m); setTarget(''); }} options={goalMetrics(sport).map(m => ({ value: m, label: METRIC_LABEL[m] }))} />
      </FormSection>
      <FormSection title="When">
        <ChipGroup label="Period" value={period} onChange={p => { setPeriod(p); setTarget(''); }} options={PERIODS} />
      </FormSection>
      <FormSection title="Target">
        <Field id="goal-target" label={`Target (${GOAL_UNITS[validMetric]})`} hint={`Suggested from your recent ${period}s: ${suggested} ${GOAL_UNITS[validMetric]}`}>
          <input id="goal-target" className="dx-input text-[18px] font-semibold" inputMode="decimal" placeholder={String(suggested)} value={target}
            onChange={e => setTarget(e.target.value.replace(/[^0-9.]/g, '').slice(0, 7))} />
        </Field>
        {goal && (
          <button type="button" disabled={busy} onClick={() => persist(goals.filter(g => g.id !== goal.id), 'Goal removed')}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose-500">
            <Trash2 size={15} /> Delete this goal
          </button>
        )}
      </FormSection>
    </FormSheet>
  );
}

export function GoalsCard({ cardio, workouts }: { cardio: CardioActivity[]; workouts: Workout[] }) {
  const { data: goals = [] } = useTrainingGoals();
  const [editing, setEditing] = useState<TrainingGoal | null | 'new'>(null);
  const progress = useMemo(() => goals.map(g => goalProgress(g, cardio, workouts, today())), [goals, cardio, workouts]);
  const canAdd = goals.length < MAX_GOALS;
  return (
    <ToolCard
      icon={Flag}
      title="Goals"
      subtitle={goals.length ? `${progress.filter(p => p.status === 'done').length} of ${goals.length} reached` : 'Weekly, monthly and yearly targets'}
      color="#d97706"
      right={canAdd && goals.length > 0 && (
        <button type="button" onClick={() => setEditing('new')} className="h-9 px-3 rounded-full text-[13px] font-semibold pro-track text-bone inline-flex items-center gap-1"><Plus size={15} /> Add</button>
      )}
    >
      {goals.length === 0 ? (
        <button type="button" onClick={() => setEditing('new')} className="w-full pro-tile p-5 text-center">
          <Target size={28} className="mx-auto text-amber-500" />
          <div className="mt-2 text-[15px] font-semibold text-bone">Set your first goal</div>
          <p className="mt-1 text-[12.5px] text-bone-dim">Like "Run 40 km this month" or "Lift 3 times a week". We track your pace every day.</p>
          <span className="mt-3 inline-flex items-center gap-1 h-10 px-5 rounded-full text-[14px] font-semibold text-white" style={{ background: '#d97706' }}><Plus size={16} /> Add goal</span>
        </button>
      ) : (
        <div className="space-y-2.5">
          {progress.map(p => <GoalRow key={p.goal.id} p={p} onEdit={() => setEditing(p.goal)} />)}
        </div>
      )}
      <AnimatePresence>
        {editing && <GoalEditor goal={editing === 'new' ? null : editing} cardio={cardio} workouts={workouts} onClose={() => setEditing(null)} />}
      </AnimatePresence>
    </ToolCard>
  );
}

// ─── This month / year vs last ──────────────────────────────

const CUM_METRICS: { value: CumMetric; label: string }[] = [{ value: 'distance', label: 'Distance' }, { value: 'time', label: 'Time' }, { value: 'elevation', label: 'Climb' }];

export function CumulativeCard({ cardio, workouts }: { cardio: CardioActivity[]; workouts: Workout[] }) {
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [metric, setMetric] = useState<CumMetric>('distance');
  const c = useMemo(() => cumulativeComparison(cardio, workouts, metric, mode, today()), [cardio, workouts, metric, mode]);
  const diff = Math.round((c.current - c.previousSoFar) * 10) / 10;
  const fmt = (v: number) => (metric === 'elevation' ? Math.round(v).toLocaleString() : String(v));
  const xTicks = mode === 'month' ? [1, 8, 15, 22, 29] : c.points.filter((p, i) => i === 0 || p.label !== c.points[i - 1].label).map(p => p.x).filter((_, i) => i % 2 === 0);
  return (
    <ToolCard
      icon={TrendingUp}
      title={mode === 'month' ? 'This month vs last' : 'This year vs last'}
      subtitle={metric === 'time' ? 'All cardio and strength time' : 'All runs, walks and rides'}
      right={<AskAIButton prompt={() => `${c.currentLabel} so far: ${fmt(c.current)} ${c.unit} (${metric}). ${c.previousLabel} at the same point: ${fmt(c.previousSoFar)} ${c.unit}, total ${fmt(c.previousTotal)} ${c.unit}. Am I on track and what should I aim for?`} />}
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Pills label="Period" value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
        <Pills label="Measure" value={metric} onChange={setMetric} options={CUM_METRICS} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-bone-dim">{c.currentLabel} so far</div>
          <div className="text-[32px] font-bold tabular-nums leading-none text-bone mt-1">{fmt(c.current)}<span className="text-[15px] font-semibold text-bone-dim ml-1">{c.unit}</span></div>
        </div>
        <div className="text-right">
          <div className="text-[15px] font-bold tabular-nums" style={{ color: diff >= 0 ? '#059669' : '#d97706' }}>{diff >= 0 ? '+' : '−'}{fmt(Math.abs(diff))} {c.unit}</div>
          <div className="text-[11.5px] text-bone-dim">vs {c.previousLabel} at this point</div>
        </div>
      </div>
      <div className="mt-3 -mx-1" style={{ height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={c.points} margin={{ top: 8, right: 10, bottom: 0, left: -8 }}>
            <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={x => (mode === 'month' ? String(x) : c.points.find(p => p.x === x)?.label || '')} tick={tick} axisLine={false} tickLine={false} height={24} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={x => (mode === 'month' ? `Day ${x}` : c.points.find(p => p.x === x)?.label)} formatter={(v: number, name: string) => [`${fmt(v)} ${c.unit}`, name]} />
            {c.points.some(p => p.average !== null) && <Line isAnimationActive={false} type="monotone" dataKey="average" name="3-month avg" stroke="rgb(var(--color-bone-dim) / 0.45)" strokeWidth={1.5} strokeDasharray="2 4" dot={false} />}
            <Line isAnimationActive={false} type="monotone" dataKey="previous" name={c.previousLabel} stroke="rgb(var(--color-bone-dim))" strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="current" name={c.currentLabel} stroke={CARDIO} strokeWidth={3} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-bone-dim">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-full" style={{ background: CARDIO }} />{c.currentLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed border-bone-dim" />{c.previousLabel} ({fmt(c.previousTotal)} {c.unit})</span>
        {c.points.some(p => p.average !== null) && <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dotted border-bone-dim/50" />3-month avg</span>}
      </div>
    </ToolCard>
  );
}

// ─── Hybrid balance ──────────────────────────────────────────

export function HybridCard({ cardio, workouts, range, earliest }: { cardio: CardioActivity[]; workouts: Workout[]; range: TimeRange; earliest?: string | null }) {
  const h = useMemo(() => hybridBalance(cardio, workouts, today(), range, earliest), [cardio, workouts, range, earliest]);
  if (!h) return null;
  const ticks = niceTicks(0, Math.max(30, ...h.buckets.map(b => b.cardioMin + b.strengthMin)));
  const hours = (m: number) => (m >= 120 ? `${Math.round(m / 6) / 10} h` : `${m} min`);
  const slot = h.buckets.length <= 12 ? 28 : 22;
  return (
    <ToolCard
      icon={Scale}
      title="Cardio vs strength"
      subtitle={`${RANGE_LABEL[range]} · ${h.style.label}`}
      color={STRENGTH}
      right={<AskAIButton prompt={() => `${RANGE_LABEL[range]}: ${hours(h.cardioMin)} cardio (${h.cardioPct}%) and ${hours(h.strengthMin)} strength (${h.strengthPct}%). ${h.clashCount} times I did heavy legs and a hard run or ride within 24 h. How should I balance and schedule them for my goals?`} />}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <div className="pro-tile p-3">
          <div className="text-[11px] uppercase tracking-wider text-bone-dim">Cardio</div>
          <div className="text-[26px] font-bold tabular-nums leading-tight" style={{ color: CARDIO }}>{h.cardioPct}%</div>
          <div className="text-[12px] text-bone-dim">{hours(h.cardioMin)}</div>
        </div>
        <div className="pro-tile p-3">
          <div className="text-[11px] uppercase tracking-wider text-bone-dim">Strength</div>
          <div className="text-[26px] font-bold tabular-nums leading-tight" style={{ color: STRENGTH }}>{h.strengthPct}%</div>
          <div className="text-[12px] text-bone-dim">{hours(h.strengthMin)}</div>
        </div>
      </div>
      <div className="mt-3 flex h-3 rounded-full overflow-hidden gap-[2px]">
        <div style={{ width: `${h.cardioPct}%`, background: CARDIO }} />
        <div style={{ width: `${h.strengthPct}%`, background: STRENGTH }} />
      </div>
      <div className="mt-4">
        <ScrollChart count={h.buckets.length} slot={slot} height={190} ticks={ticks} top={8} bottom={24} axisWidth={40} format={v => `${Math.round(v)}m`} tickStyle={{ color: 'rgb(var(--color-bone-dim))' }}>
          {w => (
            <BarChart width={w} height={190} data={h.buckets} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" height={24} tick={tick} axisLine={false} tickLine={false} minTickGap={14} />
              <YAxis hide domain={[ticks[0], ticks[ticks.length - 1]]} allowDataOverflow />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k: string) => [`${v} min`, k]} />
              <Bar isAnimationActive={false} dataKey="cardioMin" name="Cardio" stackId="t" fill={CARDIO} maxBarSize={26} />
              <Bar isAnimationActive={false} dataKey="strengthMin" name="Strength" stackId="t" fill={STRENGTH} radius={[5, 5, 0, 0]} maxBarSize={26} />
            </BarChart>
          )}
        </ScrollChart>
      </div>
      {h.clashes.length > 0 && (
        <div className="mt-3 rounded-2xl p-3" style={{ background: 'color-mix(in srgb, #d97706 10%, transparent)' }}>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-600 dark:text-amber-400"><AlertTriangle size={15} /> {h.clashCount} clash{h.clashCount === 1 ? '' : 'es'} between legs and hard cardio</div>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-bone">
            {h.clashes.map((x, i) => <li key={i} className="flex items-center gap-1.5"><ChevronRight size={13} className="text-bone-dim shrink-0" />{x.text}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[12.5px] leading-snug"><b style={{ color: TONE_COLOR[h.tip.tone] }}>{h.tip.title}.</b> <span className="text-bone-dim">{h.tip.text}</span></p>
    </ToolCard>
  );
}

/** Pro dashboard on the Progress overview: readiness, goals, month-on-month and hybrid balance. */
export function TrainingToolsPanel({ cardio, workouts, range, earliest }: { cardio: CardioActivity[]; workouts: Workout[]; range: TimeRange; earliest?: string | null }) {
  if (cardio.length + workouts.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-[17px] font-semibold text-bone">Your training</h2>
        <ProBadge />
      </div>
      <ProLock title="Readiness, goals & trends" reason={`See how ready you are to train today, set goals, compare months and balance cardio with strength with ${BRAND.name} Pro.`} maxHeight={560}>
        <div className="space-y-3">
          <ReadinessCard cardio={cardio} workouts={workouts} />
          <GoalsCard cardio={cardio} workouts={workouts} />
          <CumulativeCard cardio={cardio} workouts={workouts} />
          <HybridCard cardio={cardio} workouts={workouts} range={range} earliest={earliest} />
        </div>
      </ProLock>
    </div>
  );
}
