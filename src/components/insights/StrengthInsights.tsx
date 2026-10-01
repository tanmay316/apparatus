import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { Activity, BatteryCharging, Dumbbell, Grid3x3, Scale, Trophy } from 'lucide-react';
import type { Workout } from '@/types';
import { analyzeStrengthTrends, MAJOR_GROUPS, type LiftProgress } from '@/lib/strength-trends';
import { InsightList } from '@/components/analysis/AnalysisParts';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ProBadge, ProLock } from './ProLock';
import { AskAIButton } from './AICoach';
import { niceTicks, ScrollChart } from '@/components/ui/ScrollChart';

const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--color-bone) / 0.1)', background: 'rgb(var(--color-ink-2))', color: 'rgb(var(--color-bone))', fontSize: 12 };
const tick = { fontSize: 10.5, fill: 'rgb(var(--color-bone-dim))' };
const today = () => format(new Date(), 'yyyy-MM-dd');

function Card({ icon: Icon, title, subtitle, right, children }: { icon: typeof Activity; title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line/60 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-bone"><Icon size={14} className="text-viz-strength" /> {title}</div>
          {subtitle && <div className="text-[11.5px] text-bone-dim mt-0.5">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const readinessColor = (r: number) => (r >= 85 ? '#059669' : r >= 60 ? '#84cc16' : r >= 40 ? '#f59e0b' : '#ef4444');

function liftValue(l: Pick<LiftProgress, 'unit'>, v: number, imperial: boolean) {
  if (l.unit === 'kg') return `${Math.round(imperial ? v * 2.20462 : v)} ${imperial ? 'lb' : 'kg'}`;
  return l.unit === 's' ? `${Math.round(v)}s` : `${Math.round(v)} reps`;
}

function StrengthInsightsBody({ workouts, imperial }: { workouts: Workout[]; imperial: boolean }) {
  const t = useMemo(() => analyzeStrengthTrends(workouts, today()), [workouts]);
  const [liftName, setLiftName] = useState('');
  const lift = t.lifts.find(l => l.name === liftName) || t.lifts[0];
  const liftData = useMemo(() => (lift ? lift.points.map(p => ({ ...p, v: lift.unit === 'kg' && imperial ? Math.round(p.metric * 2.20462) : p.metric })) : []), [lift, imperial]);
  const liftTicks = useMemo(() => {
    const vals = liftData.map(p => p.v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max(1, (hi - lo) * 0.1);
    return niceTicks(Math.max(0, lo - pad), hi + pad);
  }, [liftData]);
  const heatRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (heatRef.current) heatRef.current.scrollLeft = heatRef.current.scrollWidth;
  }, [t.weeks.length]);
  const heatMax = Math.max(1, ...t.weeks.flatMap(w => Object.values(w.sets) as number[]));
  const groups = MAJOR_GROUPS.filter(g => t.weeks.some(w => (w.sets[g] || 0) > 0));

  return (
    <div className="space-y-3">
      <Card
        icon={BatteryCharging}
        title="Muscle recovery"
        subtitle="Based on sets in the last 7 days and time since you trained each muscle"
        right={<AskAIButton prompt={() => `My muscle recovery: ${t.recovery.filter(r => r.hoursAgo !== null).map(r => `${r.group} ${r.readiness}% ready (trained ${r.hoursAgo}h ago, ${r.recentSets} sets in 7 days)`).join('; ')}. What should I train today and what should rest?`} />}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {t.recovery.filter(r => r.hoursAgo !== null).map(r => (
            <div key={r.group} className="rounded-xl px-3 py-2 bg-bone/[0.04] border border-line/50">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-semibold text-bone">{r.group}</span>
                <span className="font-mono tabular-nums font-bold" style={{ color: readinessColor(r.readiness) }}>{r.readiness}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-bone/[0.08] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${r.readiness}%`, background: readinessColor(r.readiness) }} />
              </div>
              <div className="mt-1 text-[10.5px] text-bone-dim">{r.hoursAgo! < 48 ? `${r.hoursAgo}h ago` : `${Math.round(r.hoursAgo! / 24)}d ago`}{r.recentSets ? ` · ${r.recentSets} sets/7d` : ''}</div>
            </div>
          ))}
        </div>
      </Card>

      {t.acwr && (
        <Card
          icon={Activity}
          title="Training load"
          subtitle="This week's sets vs your 4-week average (acute:chronic ratio)"
          right={<AskAIButton prompt={() => `My strength training load: ${t.acwr!.acute} sets this week vs ${t.acwr!.chronic} usual, an acute:chronic ratio of ${t.acwr!.ratio}. Should I push harder, hold, or deload?`} />}
        >
          <div className="flex items-end gap-3">
            <span className="text-[30px] font-semibold leading-none tabular-nums text-bone">{t.acwr.ratio}×</span>
            <span className="text-[12px] text-bone-dim pb-1">{t.acwr.acute} sets this week · {t.acwr.chronic} usual</span>
          </div>
          <div className="relative mt-3 h-2.5 rounded-full overflow-hidden flex">
            <div style={{ flex: 0.8, background: '#38bdf8' }} />
            <div style={{ flex: 0.5, background: '#22c55e' }} />
            <div style={{ flex: 0.2, background: '#f59e0b' }} />
            <div style={{ flex: 0.5, background: '#ef4444' }} />
          </div>
          <div className="relative h-3">
            <span className="absolute -top-0.5 w-0.5 h-3 bg-bone" style={{ left: `${Math.min(100, (t.acwr.ratio / 2) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10.5px] text-bone-dim"><span>Detraining</span><span>Sweet spot 0.8–1.3</span><span>Spike</span></div>
        </Card>
      )}

      {lift && (
        <Card
          icon={Dumbbell}
          title="Lift progression"
          subtitle={lift.unit === 'kg' ? 'Estimated 1-rep max per session' : lift.unit === 's' ? 'Longest hold per session' : 'Best set (reps) per session'}
          right={<AskAIButton prompt={() => `My ${lift.name} progression (${lift.unit === 'kg' ? 'estimated 1RM' : 'best set'}): ${lift.points.slice(-10).map(p => `${p.date} ${liftValue(lift, p.metric, imperial)}`).join(', ')}. Best ${liftValue(lift, lift.best, imperial)}${lift.changePct !== undefined ? `, ${lift.changePct}% change` : ''}${lift.stalled ? `, no PR for ${lift.stalled} sessions` : ''}. How do I keep progressing on this lift?`} />}
        >
          <CustomSelect ariaLabel="Choose exercise" className="w-full mb-3" value={lift.name} onChange={setLiftName} options={t.lifts.map(l => ({ value: l.name, label: `${l.name} · ${l.sessions} sessions` }))} />
          <div className="grid grid-cols-3 gap-2 text-[11.5px] mb-2">
            <div><div className="text-bone-dim">Best</div><div className="font-semibold text-bone tabular-nums">{liftValue(lift, lift.best, imperial)}</div></div>
            <div><div className="text-bone-dim">Change</div><div className="font-semibold tabular-nums" style={{ color: (lift.changePct || 0) > 0 ? '#059669' : (lift.changePct || 0) < 0 ? '#e11d48' : undefined }}>{lift.changePct === undefined ? '—' : `${lift.changePct > 0 ? '+' : ''}${lift.changePct}%`}</div></div>
            <div><div className="text-bone-dim">Since PR</div><div className="font-semibold text-bone tabular-nums">{lift.stalled ? `${lift.stalled} sessions` : 'Latest'}</div></div>
          </div>
          <ScrollChart count={liftData.length} slot={44} height={160} ticks={liftTicks} top={6} bottom={24} tickStyle={{ color: 'rgb(var(--color-bone-dim))' }}>
            {w => (
              <LineChart width={w} height={160} data={liftData} margin={{ top: 6, right: 12, bottom: 0, left: 8 }}>
                <XAxis dataKey="date" height={24} tickFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d')} tick={tick} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis hide domain={[liftTicks[0], liftTicks[liftTicks.length - 1]]} allowDataOverflow />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [liftValue(lift, lift.unit === 'kg' && imperial ? v / 2.20462 : v, imperial), lift.unit === 'kg' ? 'Est. 1RM' : 'Best']} labelFormatter={d => format(new Date(`${d}T12:00:00`), 'MMM d, yyyy')} />
                <Line isAnimationActive={false} type="monotone" dataKey="v" stroke="rgb(var(--viz-strength))" strokeWidth={2.4} dot={{ r: 2.5 }} />
              </LineChart>
            )}
          </ScrollChart>
        </Card>
      )}

      {t.prs.length > 0 && (
        <Card icon={Trophy} title="Personal records" subtitle="Every time you beat your previous best">
          <ul className="divide-y divide-line/60">
            {t.prs.slice(0, 8).map((p, i) => (
              <li key={`${p.name}-${p.date}-${i}`} className="py-2 flex items-center gap-3 text-[12.5px]">
                <Trophy size={13} className="text-amber-500 shrink-0" />
                <span className="flex-1 min-w-0 truncate font-semibold text-bone">{p.name}</span>
                <span className="font-mono tabular-nums text-bone">{liftValue(p, p.value, imperial)}</span>
                <span className="text-[11px] text-emerald-500 font-semibold tabular-nums">+{Math.round(((p.value - p.prev) / p.prev) * 100)}%</span>
                <span className="text-[11px] text-bone-dim w-[70px] text-right">{p.date.slice(5)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {groups.length > 0 && (
        <Card
          icon={Grid3x3}
          title="Weekly sets per muscle"
          subtitle="8 weeks · 10–20 hard sets a week is the growth range"
          right={<AskAIButton prompt={() => `My weekly hard sets per muscle (oldest to newest, 8 weeks): ${groups.map(g => `${g}: ${t.weeks.map(w => Math.round(w.sets[g] || 0)).join('/')}`).join('; ')}. Which muscles are under- or over-trained, and how should I adjust my plan?`} />}
        >
          <div ref={heatRef} className="overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-[10.5px] tabular-nums border-separate" style={{ borderSpacing: 3 }}>
              <thead>
                <tr className="text-bone-dim">
                  <th />
                  {t.weeks.map(w => <th key={w.start} className="font-medium">{format(new Date(`${w.start}T12:00:00`), 'd/M')}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g}>
                    <td className="pr-2 text-bone-dim whitespace-nowrap">{g}</td>
                    {t.weeks.map(w => {
                      const v = w.sets[g] || 0;
                      const inRange = v >= 10 && v <= 20;
                      return (
                        <td key={w.start} className="text-center rounded-md h-6 min-w-[28px]" style={{ background: v ? `rgba(${inRange ? '5,150,105' : v > 20 ? '217,119,6' : '2,132,199'}, ${0.15 + 0.6 * Math.min(1, v / heatMax)})` : 'rgb(var(--color-bone) / 0.04)', color: v ? 'rgb(var(--color-bone))' : 'transparent' }}>
                          {v ? Math.round(v) : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {t.balance.length > 0 && (
        <Card
          icon={Scale}
          title="Muscle balance"
          subtitle="Sets in the last 4 weeks"
          right={<AskAIButton prompt={() => `My muscle balance over the last 4 weeks: ${t.balance.map(b => `${b.left} ${b.leftSets} sets vs ${b.right} ${b.rightSets} sets`).join('; ')}. Are any of these imbalanced, and how do I fix it?`} />}
        >
          <div className="space-y-3">
            {t.balance.map(b => {
              const total = b.leftSets + b.rightSets;
              const ratio = b.rightSets > 0 ? b.leftSets / b.rightSets : Infinity;
              const ok = ratio >= b.ideal[0] && ratio <= b.ideal[1];
              return (
                <div key={b.label}>
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-bone">{b.left} <b className="tabular-nums">{b.leftSets}</b></span>
                    <span className={ok ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>{ok ? 'Balanced' : 'Imbalanced'}</span>
                    <span className="text-bone"><b className="tabular-nums">{b.rightSets}</b> {b.right}</span>
                  </div>
                  <div className="mt-1 flex h-2 rounded-full overflow-hidden gap-[2px]">
                    <div style={{ width: `${(b.leftSets / total) * 100}%`, background: 'rgb(var(--viz-strength))' }} />
                    <div style={{ width: `${(b.rightSets / total) * 100}%`, background: 'rgb(var(--viz-cardio))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {t.insights.length > 0 && <InsightList insights={t.insights} />}
    </div>
  );
}

/** Pro: long-term strength analytics on the Progress page. */
export function StrengthInsightsPanel({ workouts, imperial }: { workouts: Workout[]; imperial: boolean }) {
  if (workouts.length < 2) return null;
  return (
    <section className="pro-panel p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-bone flex items-center gap-2">Strength insights <ProBadge /></h3>
        <p className="text-xs text-bone-dim mt-0.5">Recovery, training load, lift progression, PRs and muscle balance</p>
      </div>
      <ProLock title="Strength insights" reason="Track muscle recovery, training load, estimated 1RM progression, every PR and muscle balance with Apparatus Pro." maxHeight={520}>
        <StrengthInsightsBody workouts={workouts} imperial={imperial} />
      </ProLock>
    </section>
  );
}
