import type { CardioAnalysis } from '@/lib/cardio-analysis';
import { formatClock, formatPaceSec } from '@/lib/cardio-analysis';
import { Compare, Headline, InsightList, SectionTitle, StatGrid, trendOf, type Trend } from './AnalysisParts';

const NOUN = { run: 'run', walk: 'walk', cycle: 'ride' } as const;

export function CardioAnalysisView({ analysis: a }: { analysis: CardioAnalysis }) {
  const isRide = a.type === 'cycle';
  const c = a.current;
  const p = a.previous;
  const noun = NOUN[a.type];

  const rate = (s: { paceSec: number; kmh: number }) => (isRide ? `${s.kmh} km/h` : `${formatPaceSec(s.paceSec)} /km`);
  // Faster is better: lower pace for foot, higher speed for rides.
  const rateDelta = (prev: { paceSec: number; kmh: number }): { text: string; trend: Trend } => {
    if (isRide) {
      const d = Math.round((c.kmh - prev.kmh) * 10) / 10;
      return { text: `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} km/h`, trend: trendOf(d) };
    }
    const d = c.paceSec - prev.paceSec;
    return { text: `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} s/km`, trend: trendOf(d, false) };
  };

  const headline = p ? rateDelta(p) : null;
  const stats = [
    { label: 'Distance', value: c.km.toFixed(2), unit: 'km' },
    { label: 'Moving time', value: formatClock(c.sec) },
    isRide ? { label: 'Avg speed', value: String(c.kmh), unit: 'km/h' } : { label: 'Avg pace', value: formatPaceSec(c.paceSec), unit: '/km' },
    isRide ? { label: 'Max speed', value: c.maxKmh.toFixed(1), unit: 'km/h' } : { label: 'Avg speed', value: String(c.kmh), unit: 'km/h' },
    { label: 'Elevation', value: String(c.elevGain), unit: 'm', sub: c.climbPerKm ? `${c.climbPerKm} m/km` : undefined },
    { label: 'Calories', value: String(c.calories), unit: 'kcal' },
    ...(c.steps ? [{ label: 'Steps', value: c.steps.toLocaleString() }] : []),
    ...(c.cadence ? [{ label: 'Cadence', value: String(c.cadence), unit: 'spm' }] : []),
    ...(c.strideM ? [{ label: 'Stride', value: String(c.strideM), unit: 'm' }] : []),
  ];

  const full = a.splits.filter(s => !s.partial);
  const maxSplit = Math.max(...a.splits.map(s => (isRide ? s.kmh : s.paceSec)), 1);
  const minSplit = Math.min(...a.splits.map(s => (isRide ? s.kmh : s.paceSec)));

  return (
    <div>
      <Headline
        trend={headline?.trend ?? 'new'}
        title={p ? `${rate(c)} · ${headline!.text} vs last ${noun}` : `First ${noun} logged`}
        subtitle={p ? `Last ${noun} on ${p.date}: ${p.km} km at ${rate(p)}` : 'Future sessions will be compared with this one.'}
      />

      <SectionTitle>This {noun}</SectionTitle>
      <StatGrid items={stats} />

      {(p || a.recent) && (
        <>
          <SectionTitle>Compared with</SectionTitle>
          <div className="rounded-2xl border border-line/60 overflow-hidden">
            <table className="w-full text-[11.5px] tabular-nums">
              <thead>
                <tr className="text-bone-dim bg-bone/[0.04]">
                  <th className="text-left font-medium px-3 py-1.5" />
                  <th className="text-right font-medium px-2 py-1.5">This</th>
                  {p && <th className="text-right font-medium px-2 py-1.5">Last</th>}
                  {a.recent && <th className="text-right font-medium px-3 py-1.5">28-day avg</th>}
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-line/60">
                  <td className="px-3 py-1.5 font-sans text-bone-dim">Distance</td>
                  <td className="px-2 py-1.5 text-right text-bone font-semibold">{c.km} km</td>
                  {p && <td className="px-2 py-1.5 text-right text-bone-dim">{p.km} km</td>}
                  {a.recent && <td className="px-3 py-1.5 text-right text-bone-dim">{a.recent.km} km</td>}
                </tr>
                <tr className="border-t border-line/60">
                  <td className="px-3 py-1.5 font-sans text-bone-dim">Time</td>
                  <td className="px-2 py-1.5 text-right text-bone font-semibold">{formatClock(c.sec)}</td>
                  {p && <td className="px-2 py-1.5 text-right text-bone-dim">{formatClock(p.sec)}</td>}
                  {a.recent && <td className="px-3 py-1.5 text-right text-bone-dim">—</td>}
                </tr>
                <tr className="border-t border-line/60">
                  <td className="px-3 py-1.5 font-sans text-bone-dim">{isRide ? 'Speed' : 'Pace'}</td>
                  <td className="px-2 py-1.5 text-right text-bone font-semibold">{rate(c)}</td>
                  {p && <td className="px-2 py-1.5 text-right text-bone-dim">{rate(p)}</td>}
                  {a.recent && <td className="px-3 py-1.5 text-right text-bone-dim">{rate(a.recent)}</td>}
                </tr>
                <tr className="border-t border-line/60">
                  <td className="px-3 py-1.5 font-sans text-bone-dim">Climb</td>
                  <td className="px-2 py-1.5 text-right text-bone font-semibold">{c.elevGain} m</td>
                  {p && <td className="px-2 py-1.5 text-right text-bone-dim">{p.elevGain} m</td>}
                  {a.recent && <td className="px-3 py-1.5 text-right text-bone-dim">—</td>}
                </tr>
              </tbody>
            </table>
          </div>
          {a.recent && <div className="mt-1 text-[10.5px] text-bone-dim">28-day average from {a.recent.count} earlier {noun}{a.recent.count > 1 ? 's' : ''}.</div>}
        </>
      )}

      <SectionTitle>Coaching insights</SectionTitle>
      <InsightList insights={a.insights} />

      {a.splits.length > 0 && (
        <>
          <SectionTitle right={a.pacing && (isRide
            ? `2nd half ${a.pacing.changePct > 0 ? `${a.pacing.changePct}% slower` : `${Math.abs(a.pacing.changePct)}% faster`}`
            : `halves ${formatPaceSec(a.pacing.firstHalfPaceSec)} / ${formatPaceSec(a.pacing.secondHalfPaceSec)}`)}>
            Splits ({a.splitKm} km)
          </SectionTitle>
          <ul className="space-y-1">
            {a.splits.map(s => {
              const value = isRide ? s.kmh : s.paceSec;
              const fastest = full.length >= 2 && a.pacing?.fastest === s.index;
              const slowest = full.length >= 2 && a.pacing?.slowest === s.index;
              // Bar length shows speed: longer = faster.
              const width = isRide ? (value / maxSplit) * 100 : (minSplit / value) * 100;
              const color = fastest ? '#059669' : slowest ? '#e11d48' : 'rgb(var(--color-bone-dim) / 0.55)';
              return (
                <li key={s.index} className="flex items-center gap-2 text-[11.5px] font-mono tabular-nums">
                  <span className="w-10 shrink-0 text-bone-dim">{s.partial ? `${s.km}` : `${s.index * a.splitKm}`}</span>
                  <div className="flex-1 h-2 rounded-full bg-bone/[0.06] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(6, width)}%`, background: color }} />
                  </div>
                  <span className={`w-16 shrink-0 text-right ${fastest || slowest ? 'font-bold' : ''} text-bone`}>{isRide ? `${s.kmh}` : formatPaceSec(s.paceSec)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 text-[10.5px] text-bone-dim">{isRide ? 'km/h per split' : 'Pace per km'} · green fastest, red slowest{a.splits.some(s => s.partial) ? ' · last split partial' : ''}</div>
        </>
      )}

      <SectionTitle>Last 7 days</SectionTitle>
      <div className="p-3 rounded-2xl border border-line/60 space-y-1.5">
        <Compare
          label={`${noun[0].toUpperCase()}${noun.slice(1)} distance`}
          before={a.weekly.prevKm ? `${a.weekly.prevKm} km` : undefined}
          after={`${a.weekly.km} km`}
          delta={a.weekly.changePct !== undefined ? `${a.weekly.changePct > 0 ? '+' : ''}${a.weekly.changePct}%` : undefined}
          trend={a.weekly.changePct !== undefined ? (a.weekly.changePct > (isRide ? 50 : 30) ? 'down' : 'up') : undefined}
        />
        <Compare label={`${noun[0].toUpperCase()}${noun.slice(1)}s`} after={String(a.weekly.sessions)} />
        <Compare label="Heart-health minutes" after={`${a.weekly.moderateMin} / 150`} />
      </div>

      {a.predictions.length > 0 && (
        <>
          <SectionTitle right="estimate">Race predictions</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {a.predictions.map(pr => (
              <div key={pr.label} className="rounded-xl px-3 py-2 bg-bone/[0.04] border border-line/50">
                <div className="text-[10.5px] text-bone-dim">{pr.label}</div>
                <div className="text-[15px] font-bold text-bone tabular-nums">{formatClock(pr.sec)}</div>
                <div className="text-[10.5px] text-bone-dim">{isRide ? `${Math.round((pr.km / (pr.sec / 3600)) * 10) / 10} km/h` : `${formatPaceSec(pr.sec / pr.km)} /km`}</div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-bone-dim leading-relaxed">
            From this {noun} using Riegel's formula. Most accurate for distances close to this one and assuming training for the distance.
          </p>
        </>
      )}
    </div>
  );
}
