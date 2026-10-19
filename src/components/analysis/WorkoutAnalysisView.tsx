import { useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import type { WorkoutAnalysis } from '@/lib/workout-analysis';
import { Compare, GatedInsights, Headline, MoreDetails, SectionTitle, StatGrid, TrendChip, trendOf } from './AnalysisParts';
import { ProBadge, ProLock } from '@/components/insights/ProLock';
import { AISummaryCard } from '@/components/insights/AICoach';
import { workoutFacts } from '@/lib/ai-facts';
import { sessionKey } from '@/services/ai-insights';
import type { Workout } from '@/types';

const ZONES = [
  { key: 'strength', label: 'Strength 1–5', color: '#7c3aed' },
  { key: 'hypertrophy', label: 'Muscle 6–12', color: '#059669' },
  { key: 'endurance', label: 'Endurance 13+', color: '#0284c7' },
] as const;

const signed = (n: number, suffix = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${suffix}`;

type ExerciseRowData = WorkoutAnalysis['exercises'][number];

/** One line per exercise; tap to see the comparison with last time. */
function ExerciseRow({ row, toUnit, wu }: { row: ExerciseRowData; toUnit: (kg: number) => number; wu: string }) {
  const [open, setOpen] = useState(false);
  const p = row.prev;
  const volUnit = row.unit === 'kg' ? wu : row.unit === 's' ? 's' : 'reps';
  const vol = (v: number) => (row.unit === 'kg' ? toUnit(v) : v).toLocaleString();
  const summary = [
    `${row.sets} set${row.sets === 1 ? '' : 's'}`,
    row.weighted ? `top ${toUnit(row.topWeight)} ${wu}` : row.holdSec > 0 ? `${row.holdSec}s hold` : row.reps > 0 ? `${row.reps} reps` : '',
  ].filter(Boolean).join(' · ');
  return (
    <li className="rounded-2xl border border-line/60">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 p-3 text-left">
        {row.isPR && <Trophy size={15} className="text-amber-500 shrink-0" aria-label="Personal record" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-bone truncate">{row.name}</span>
          <span className="block text-[12px] text-bone-dim truncate">{summary}</span>
        </span>
        <TrendChip trend={trendOf(row.volumeChange)}>{row.volumeChange === undefined ? 'New' : signed(row.volumeChange, '%')}</TrendChip>
        <ChevronDown size={15} className={`shrink-0 text-bone-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {p?.date && <div className="text-[11px] text-bone-dim mb-1">Last time: {p.date}</div>}
          <Compare label="Sets" before={p ? String(p.sets) : undefined} after={String(row.sets)} />
          {(row.reps > 0 || (p?.reps || 0) > 0) && <Compare label="Reps" before={p ? String(p.reps) : undefined} after={String(row.reps)} />}
          {(row.holdSec > 0 || (p?.holdSec || 0) > 0) && <Compare label="Hold" before={p ? `${p.holdSec}s` : undefined} after={`${row.holdSec}s`} />}
          {row.weighted && <Compare label="Top weight" before={p?.topWeight ? `${toUnit(p.topWeight)} ${wu}` : undefined} after={`${toUnit(row.topWeight)} ${wu}`} />}
          {row.weighted && row.e1rm > 0 && <Compare label="Est. 1-rep max" before={p?.e1rm ? `${toUnit(p.e1rm)} ${wu}` : undefined} after={`${toUnit(row.e1rm)} ${wu}`} />}
          <Compare label={`Volume (${volUnit})`} before={p ? vol(p.volume) : undefined} after={vol(row.volume)} />
          {row.stalled >= 3 && <div className="pt-1 text-[11.5px] font-semibold text-amber-600">No PR in {row.stalled} sessions</div>}
          {row.reasons[0] && <div className="pt-1 text-[11.5px] text-bone-dim leading-snug">{row.reasons[0]}</div>}
        </div>
      )}
    </li>
  );
}

export function WorkoutAnalysisView({ analysis: a, imperial, workout, showStats = true }: { analysis: WorkoutAnalysis; imperial: boolean; workout?: Workout; showStats?: boolean }) {
  const toUnit = (kg: number) => Math.round(imperial ? kg * 2.20462 : kg);
  const wu = imperial ? 'lb' : 'kg';
  const change = a.volumeChangePercent;
  const trend = trendOf(change);
  const weighted = a.totals.volumeKg > 0;
  const zoneTotal = a.zones.strength + a.zones.hypertrophy + a.zones.endurance;

  const keyStats = [
    { label: 'Sets', value: String(a.totals.sets) },
    weighted
      ? { label: 'Volume', value: toUnit(a.totals.volumeKg).toLocaleString(), unit: wu }
      : a.totals.reps ? { label: 'Reps', value: a.totals.reps.toLocaleString() } : { label: 'Hold', value: String(a.totals.holdSec), unit: 's' },
    a.totals.durationMin ? { label: 'Time', value: String(a.totals.durationMin), unit: 'min' } : { label: 'Exercises', value: String(a.totals.exercises) },
  ];
  const extraStats = [
    ...(a.totals.durationMin ? [{ label: 'Exercises', value: String(a.totals.exercises) }] : []),
    ...(weighted && a.totals.reps ? [{ label: 'Reps', value: a.totals.reps.toLocaleString() }] : []),
    ...(a.totals.holdSec && (weighted || a.totals.reps) ? [{ label: 'Hold', value: String(a.totals.holdSec), unit: 's' }] : []),
    ...(weighted ? [{ label: 'Heaviest set', value: String(toUnit(a.totals.heaviestKg)), unit: wu }] : []),
    ...(a.totals.avgRpe !== null ? [{ label: 'Avg RPE', value: String(a.totals.avgRpe) }] : []),
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
        title={change === undefined ? 'First time · baseline saved' : change === 0 ? 'Same volume as before' : `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} volume than before`}
        info={<>Each exercise is compared with its best earlier session.<br /><br />Volume = weight × reps for loaded sets, reps for bodyweight sets and seconds for holds.</>}
      />

      {showStats && <div className="mt-3"><StatGrid items={keyStats} /></div>}

      {last && (
        <>
          <SectionTitle info={`Last time you did this day: ${last.date}`}>vs last time</SectionTitle>
          <div className="p-3 rounded-2xl border border-line/60 space-y-1.5">
            <Compare label="Sets" before={String(last.sets)} after={String(a.totals.sets)} delta={signed(a.totals.sets - last.sets)} trend={trendOf(a.totals.sets - last.sets)} />
            {(last.reps > 0 || a.totals.reps > 0) && <Compare label="Reps" before={String(last.reps)} after={String(a.totals.reps)} delta={signed(a.totals.reps - last.reps)} trend={trendOf(a.totals.reps - last.reps)} />}
            {weighted && last.volumeKg > 0 && <Compare label={`Volume (${wu})`} before={toUnit(last.volumeKg).toLocaleString()} after={toUnit(a.totals.volumeKg).toLocaleString()} delta={signed(Math.round(((a.totals.volumeKg - last.volumeKg) / last.volumeKg) * 100), '%')} trend={trendOf(a.totals.volumeKg - last.volumeKg)} />}
          </div>
        </>
      )}

      {rows.length > 0 && (
        <>
          <SectionTitle info="Tap an exercise to compare it with last time. The % is its volume change.">Exercises</SectionTitle>
          <ul className="space-y-2">
            {rows.map((row, i) => <ExerciseRow key={`${row.name}-${i}`} row={row} toUnit={toUnit} wu={wu} />)}
          </ul>
        </>
      )}

      {a.insights.length > 0 && (
        <>
          <SectionTitle>Coach tips</SectionTitle>
          <GatedInsights insights={a.insights.slice(0, 3)} />
        </>
      )}

      {workout && (
        <div className="mt-4">
          <AISummaryCard
            kind="workout"
            summaryKey={sessionKey('w', workout)}
            facts={() => workoutFacts(a)}
            askPrompt={`About my workout on ${a.date}: ${a.totals.sets} working sets, ${a.totals.exercises} exercises${weighted ? `, ${toUnit(a.totals.volumeKg)} ${wu} volume` : ''}.`}
          />
        </div>
      )}

      {(extraStats.length > 0 || zoneTotal > 0 || a.muscles.length > 0 || a.insights.length > 3) && (
      <MoreDetails>
      {extraStats.length > 0 && <div className="mt-3"><StatGrid items={extraStats} /></div>}
      {a.insights.length > 3 && <div className="mt-3"><GatedInsights insights={a.insights.slice(3)} free={0} /></div>}

      {(zoneTotal > 0 || a.muscles.length > 0) && (
        <ProLock compact title="Rep ranges & weekly muscle volume" maxHeight={260}>
      {zoneTotal > 0 && (
        <>
          <SectionTitle right={<ProBadge />} info="1–5 reps builds strength, 6–12 builds muscle, 13+ builds endurance.">Rep ranges</SectionTitle>
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
          <SectionTitle info="Hard sets in the last 7 days. 10–20 a week per muscle is the growth range (green). A full set counts for the main muscle, half for helpers.">Weekly sets per muscle</SectionTitle>
          <ul className="space-y-2">
            {a.muscles.map(m => {
              const color = m.weekSets > 20 ? '#d97706' : m.weekSets >= 10 ? '#059669' : '#0284c7';
              return (
                <li key={m.group}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-bone font-medium">{m.group}</span>
                    <span className="tabular-nums text-bone-dim">
                      <span className="text-bone font-semibold">{m.weekSets}</span> sets this week
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
        </ProLock>
      )}
      </MoreDetails>
      )}
    </div>
  );
}
