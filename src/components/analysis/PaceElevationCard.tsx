import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CardioActivity } from '@/types';
import type { SessionProfile } from '@/lib/pro-insights';
import { formatPaceSec } from '@/lib/cardio-analysis';

const tick = { fontSize: 10.5, fill: 'rgb(var(--color-bone-dim))' };
const tooltipStyle = { borderRadius: 12, border: '1px solid rgb(var(--color-bone) / 0.1)', background: 'rgb(var(--color-ink-2))', color: 'rgb(var(--color-bone))', fontSize: 12 };

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2 bg-bone/[0.04] border border-line/50 min-w-0">
      <div className="text-[10.5px] text-bone-dim">{label}</div>
      <div className="text-[17px] font-bold tabular-nums leading-tight" style={{ color: color || 'rgb(var(--color-bone))' }}>{value}</div>
      {sub && <div className="text-[10.5px] text-bone-dim truncate">{sub}</div>}
    </div>
  );
}

/** Pace (or speed) and elevation along the route, with grade-adjusted pace for runs. */
export function PaceElevationCard({ activity, profile: p }: { activity: CardioActivity; profile: SessionProfile }) {
  const isRide = activity.type === 'cycle';
  const data = p.points.map(x => ({ ...x, pace: x.paceSec ? x.paceSec / 60 : null, gap: x.gapSec ? x.gapSec / 60 : null }));
  const paces = data.map(d => d.pace).filter((v): v is number => v !== null);
  // Clip GPS spikes so one bad sample doesn't flatten the line.
  const sorted = [...paces].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.03)] ?? 0;
  const hi = sorted[Math.ceil(sorted.length * 0.97) - 1] ?? 10;
  const kmhs = data.map(d => d.kmh).filter((v): v is number => v !== null);
  const fmtPace = (m: number) => formatPaceSec(Math.round(m * 60));
  const hill = p.hillCostSec;

  return (
    <div className="p-3 rounded-2xl border border-line/60">
      <div className="grid grid-cols-2 gap-2">
        {isRide
          ? <Stat label="Avg speed" value={`${Math.round((3600 / p.paceSec) * 10) / 10} km/h`} />
          : <Stat label="Avg pace" value={`${formatPaceSec(p.paceSec)} /km`} />}
        {p.gapPaceSec !== null
          ? <Stat label="Grade-adjusted pace" value={`${formatPaceSec(p.gapPaceSec)} /km`} sub={hill && Math.abs(hill) >= 2 ? (hill > 0 ? `Hills cost you ${hill} s/km` : `Downhill gave you ${-hill} s/km`) : 'Flat-ground equivalent'} color="#059669" />
          : <Stat label="Climb" value={`${p.climbM} m`} sub={p.hasElevation ? `${p.descentM} m down` : 'No altitude data'} />}
        {p.gapPaceSec !== null && <Stat label="Climb" value={`${p.climbM} m`} sub={`${p.descentM} m down`} />}
        {p.hasElevation && <Stat label="Steepest" value={`${p.maxGradePct}%`} sub="grade" />}
      </div>

      <div className="mt-3 text-[11px] font-semibold text-bone-dim">{isRide ? 'Speed (km/h)' : 'Pace (min/km)'}{p.gapPaceSec !== null ? ' · green = grade-adjusted' : ''}</div>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} syncId={`profile-${activity.id || 'x'}`} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
            <XAxis dataKey="km" type="number" domain={[0, 'dataMax']} hide />
            {isRide ? (
              <YAxis tick={tick} axisLine={false} tickLine={false} width={40} domain={[Math.floor(Math.min(...kmhs)), Math.ceil(Math.max(...kmhs))]} allowDataOverflow />
            ) : (
              <YAxis tick={tick} axisLine={false} tickLine={false} width={40} reversed domain={[Math.floor(lo * 4) / 4, Math.ceil(hi * 4) / 4]} allowDataOverflow tickFormatter={fmtPace} />
            )}
            <Tooltip contentStyle={tooltipStyle} labelFormatter={k => `${Number(k).toFixed(2)} km`}
              formatter={(v: number, name: string) => [isRide ? `${v} km/h` : `${fmtPace(v)} /km`, name]} />
            {p.gapPaceSec !== null && <Line isAnimationActive={false} type="monotone" dataKey="gap" name="Grade-adjusted" stroke="#059669" strokeWidth={1.6} strokeDasharray="4 3" dot={false} connectNulls />}
            <Line isAnimationActive={false} type="monotone" dataKey={isRide ? 'kmh' : 'pace'} name={isRide ? 'Speed' : 'Pace'} stroke="rgb(var(--viz-cardio))" strokeWidth={2.4} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {p.hasElevation && (
        <>
          <div className="mt-2 text-[11px] font-semibold text-bone-dim">Elevation (m)</div>
          <div style={{ height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} syncId={`profile-${activity.id || 'x'}`} margin={{ top: 4, right: 6, bottom: 0, left: -14 }}>
                <XAxis dataKey="km" type="number" domain={[0, 'dataMax']} tick={tick} axisLine={false} tickLine={false} height={22} tickFormatter={k => `${k} km`} minTickGap={30} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={40} domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={v => String(Math.round(v))} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={k => `${Number(k).toFixed(2)} km`} formatter={(v: number, name: string, item) => [name === 'Elevation' ? `${Math.round(v)} m · ${item.payload.grade > 0 ? '+' : ''}${item.payload.grade}%` : v, name]} />
                <Area isAnimationActive={false} type="monotone" dataKey="elev" name="Elevation" stroke="rgb(var(--viz-elev))" strokeWidth={1.8} fill="rgb(var(--viz-elev))" fillOpacity={0.22} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {p.gapPaceSec !== null && (
        <p className="mt-2 text-[10.5px] text-bone-dim leading-relaxed">Grade-adjusted pace is your pace converted to flat ground, so hilly and flat runs can be compared fairly.</p>
      )}
    </div>
  );
}
