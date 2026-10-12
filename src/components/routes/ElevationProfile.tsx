import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

/** Small elevation profile (evenly spaced samples along the route). */
export function ElevationProfile({ profile, distanceKm, height = 90 }: { profile: number[]; distanceKm: number; height?: number }) {
  const data = profile.map((elev, i) => ({ km: Math.round((distanceKm * i) / Math.max(1, profile.length - 1) * 10) / 10, elev }));
  const min = Math.min(...profile);
  const max = Math.max(...profile);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-[var(--dx-muted)] mb-1">
        <span>Elevation</span>
        <span className="tabular-nums">{Math.round(min)}–{Math.round(max)} m</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[Math.floor(min - 5), Math.ceil(max + 5)]} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid var(--dx-border)', background: 'var(--dx-card)', color: 'var(--dx-text)', fontSize: 12 }}
              labelFormatter={(_, p) => `${p?.[0]?.payload?.km ?? ''} km`}
              formatter={(v: number) => [`${Math.round(v)} m`, 'Elevation']}
            />
            <Area isAnimationActive={false} type="monotone" dataKey="elev" stroke="#2563eb" strokeWidth={2} fill="url(#elev-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
