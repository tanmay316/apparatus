import { Trophy } from 'lucide-react';
import type { WorkoutAnalysis } from '@/lib/workout-analysis';
import { Compare, Headline, InsightList, SectionTitle, StatGrid, TrendChip, trendOf } from './AnalysisParts';

const ZONES = [
  { key: 'strength', label: 'Strength 1–5', color: '#7c3aed' },
  { key: 'hypertrophy', label: 'Muscle 6–12', color: '#059669' },
  { key: 'endurance', label: 'Endurance 13+', color: '#0284c7' },
] as const;

const signed = (n: number, suffix = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${suffix}`;

export function WorkoutAnalysisView({ analysis: a, imperial }: { analysis: WorkoutAnalysis; imperial: boolean }) {
  const toUnit = (kg: number) => Math.round(imperial ? kg * 2.20462 : kg);
  const wu = imperial ? 'lb' : 'kg';
  const change = a.volumeChangePercent;
  const trend = trendOf(change);
  const weighted = a.totals.volumeKg > 0;
  const zoneTotal = a.zones.strength + a.zones.hypertrophy + a.zones.endurance;

  const totals = [
    { label: 'Working sets', value: String(a.totals.sets) },
    ...(a.totals.reps ? [{ label: 'Total reps', value: a.totals.reps.toLocaleString() }] : []),
    ...(a.totals.holdSec ? [{ label: 'Hold time', value: String(a.totals.holdSec), unit: 's' }] : []),
    ...(weighted ? [
      { label: 'Volume', value: toUnit(a.totals.volumeKg).toLocaleString(), unit: wu },
      { label: 'Heaviest set', value: String(toUnit(a.totals.heaviestKg)), unit: wu },
    ] : []),
    ...(a.totals.avgRpe !== null ? [{ label: 'Avg RPE', value: String(a.totals.avgRpe) }] : []),
    ...(a.totals.durationMin ? [{ label: 'Duration', value: String(a.totals.durationMin), unit: 'min' }] : []),
    { label: 'Exercises', value: String(a.totals.exercises) },
  ];

  const last = a.lastSameDay;
  const rows = [...a.exercises].sort((x, y) => {
    if (x.volumeChange === undefined) return 1;
    if (y.volumeChange === undefined) return -1;
    return y.volumeChange - x.volumeChange;
  });

  return (
    <div>
      <Headline
        trend={trend}
        title={change === undefined ? 'Baseline session' : change === 0 ? 'Volume matched' : `Volume ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}%`}
        subtitle="Each exercise vs its best previous session"
      />

      <SectionTitle>Session totals</SectionTitle>
      <StatGrid items={totals} />

      {last && (
        <div className="mt-2 p-3 rounded-2xl border border-line/60 space-y-1.5">
          <div className="text-[12px] font-semibold text-bone">vs last time you did this day <span className="font-normal text-bone-dim">({last.date})</span></div>
          <Compare label="Sets" before={String(last.sets)} after={String(a.totals.sets)} delta={signed(a.totals.sets - last.sets)} trend={trendOf(a.totals.sets - last.sets)} />
          {(last.reps > 0 || a.totals.reps > 0) && <Compare label="Reps" before={String(last.reps)} after={String(a.totals.reps)} delta={signed(a.totals.reps - last.reps)} trend={trendOf(a.totals.reps - last.reps)} />}
          {weighted && last.volumeKg > 0 && <Compare label={`Volume (${wu})`} before={toUnit(last.volumeKg).toLocaleString()} after={toUnit(a.totals.volumeKg).toLocaleString()} delta={signed(Math.round(((a.totals.volumeKg - last.volumeKg) / last.volumeKg) * 100), '%')} trend={trendOf(a.totals.volumeKg - last.volumeKg)} />}
          {last.durationMin > 0 && a.totals.durationMin > 0 && <Compare label="Duration" before={`${last.durationMin} min`} after={`${a.totals.durationMin} min`} />}
        </div>
      )}

      <SectionTitle>Coaching insights</SectionTitle>
      <InsightList insights={a.insights} />

      {zoneTotal > 0 && (
        <>
          <SectionTitle right={`${zoneTotal} rep sets`}>Rep ranges</SectionTitle>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-bone/[0.06]">
            {ZONES.map(z => a.zones[z.key] > 0 && (
              <div key={z.key} style={{ width: `${(a.zones[z.key] / zoneTotal) * 100}%`, background: z.color }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-bone-dim">
            {ZONES.map(z => (
              <span key={z.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: z.color }} />
                {z.label}: {a.zones[z.key]}
              </span>
            ))}
          </div>
        </>
      )}

      {a.muscles.length > 0 && (
        <>
          <SectionTitle right="10–20 sets/week for growth">Weekly sets per muscle</SectionTitle>
          <ul className="space-y-2">
            {a.muscles.map(m => {
              const color = m.weekSets > 20 ? '#d97706' : m.weekSets >= 10 ? '#059669' : '#0284c7';
              return (
                <li key={m.group}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-bone font-medium">{m.group}</span>
                    <span className="font-mono text-bone-dim tabular-nums">
                      {m.sessionSets > 0 ? `${m.sessionSets} today · ` : ''}<span className="text-bone font-semibold">{m.weekSets}</span> / wk · {m.weekDays}d
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 rounded-full bg-bone/[0.06] overflow-hidden">
                    <div className="absolute inset-y-0 bg-bone/[0.08]" style={{ left: `${(10 / 25) * 100}%`, width: `${(10 / 25) * 100}%` }} />
                    <div className="relative h-full rounded-full" style={{ width: `${Math.min(100, (m.weekSets / 25) * 100)}%`, background: color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {rows.length > 0 && (
        <>
          <SectionTitle>Exercise breakdown</SectionTitle>
          <ul className="space-y-2.5">
            {rows.map((row, i) => {
              const p = row.prev;
              const volUnit = row.unit === 'kg' ? wu : row.unit === 's' ? 's' : 'reps';
              const vol = (v: number) => (row.unit === 'kg' ? toUnit(v) : v).toLocaleString();
              return (
                <li key={`${row.name}-${i}`} className="p-3 rounded-2xl border border-line/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-bone truncate flex items-center gap-1.5">
                      {row.isPR && <Trophy size={13} className="text-amber-500 shrink-0" />}{row.name}
                    </span>
                    <TrendChip trend={trendOf(row.volumeChange)}>{row.volumeChange === undefined ? 'New' : signed(row.volumeChange, '%')}</TrendChip>
                  </div>
                  <div className="mt-2 space-y-1">
                    <Compare label="Sets" before={p ? String(p.sets) : undefined} after={String(row.sets)} />
                    {(row.reps > 0 || (p?.reps || 0) > 0) && <Compare label="Total reps" before={p ? String(p.reps) : undefined} after={String(row.reps)} />}
                    {(row.holdSec > 0 || (p?.holdSec || 0) > 0) && <Compare label="Hold time" before={p ? `${p.holdSec}s` : undefined} after={`${row.holdSec}s`} />}
                    {row.weighted && (
                      <>
                        <Compare label="Top weight" before={p?.topWeight ? `${toUnit(p.topWeight)} ${wu}` : undefined} after={`${toUnit(row.topWeight)} ${wu}`} />
                        {row.e1rm > 0 && <Compare label="Est. 1-rep max" before={p?.e1rm ? `${toUnit(p.e1rm)} ${wu}` : undefined} after={`${toUnit(row.e1rm)} ${wu}`} />}
                      </>
                    )}
                    <Compare label={`Volume (${volUnit})`} before={p ? vol(p.volume) : undefined} after={vol(row.volume)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.zone && <span className="px-1.5 py-px rounded-md bg-bone/[0.06] text-[10.5px] text-bone-dim">avg {row.avgReps} reps · {row.zone === 'hypertrophy' ? 'muscle' : row.zone} range</span>}
                    {row.rpe ? <span className="px-1.5 py-px rounded-md bg-bone/[0.06] text-[10.5px] text-bone-dim">RPE {row.rpe}</span> : null}
                    {row.groups.slice(0, 3).map(g => <span key={g} className="px-1.5 py-px rounded-md bg-bone/[0.06] text-[10.5px] text-bone-dim">{g}</span>)}
                    {row.stalled >= 3 && <span className="px-1.5 py-px rounded-md text-[10.5px] font-semibold" style={{ background: 'rgba(217,119,6,0.12)', color: '#d97706' }}>No PR in {row.stalled} sessions</span>}
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {row.reasons.map((r, j) => <li key={j} className="text-[11.5px] text-bone-dim leading-snug">• {r}</li>)}
                  </ul>
                  {p?.date && <div className="mt-1.5 text-[10.5px] text-bone-dim">Compared with {p.date}</div>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-4 text-[11px] text-bone-dim leading-relaxed">
        Volume = weight × reps for loaded sets, reps for bodyweight sets and seconds for holds. Weekly sets count a full set for the main muscle and half for helpers.
      </p>
    </div>
  );
}
