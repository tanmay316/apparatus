import { lazy, Suspense, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import type { CardioActivity, CardioActivityType } from '@/types';
import { useHasPro } from '@/stores/subscription-store';
import { useUIStore } from '@/stores/ui-store';
import { RANGE_LABEL, type TimeRange } from '@/lib/time-range';
import { BRAND } from '@/lib/brand';
import { ProBadge, ProLock } from './ProLock';
import { Pills } from './TrainingTools';
import type { HeatRoute } from './PersonalHeatmap';

const PersonalHeatmap = lazy(() => import('./PersonalHeatmap'));
const HEAT = '#ff5a1f';
const MAX_POINTS = 250;
type Filter = 'all' | CardioActivityType;

function toRoute(a: CardioActivity): HeatRoute | null {
  const pts = (a.route || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  if (pts.length < 2) return null;
  const stride = Math.max(1, Math.ceil(pts.length / MAX_POINTS));
  const out: HeatRoute = [];
  for (let i = 0; i < pts.length; i += stride) out.push([pts[i].lat, pts[i].lng]);
  const last = pts[pts.length - 1];
  out.push([last.lat, last.lng]);
  return out;
}

/** Groups routes by the ~25 km area they start in, busiest area first. */
function areas(routes: HeatRoute[]): HeatRoute[][] {
  const map = new Map<string, HeatRoute[]>();
  for (const r of routes) {
    const key = `${Math.round(r[0][0] / 0.25)}:${Math.round(r[0][1] / 0.25)}`;
    map.set(key, [...(map.get(key) || []), r]);
  }
  return [...map.values()].sort((a, b) => b.length - a.length);
}

/** Static SVG of the routes for the locked preview (no map tiles are loaded). */
function Sketch({ routes }: { routes: HeatRoute[] }) {
  const all = routes.flat();
  const lats = all.map(p => p[0]);
  const lngs = all.map(p => p[1]);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng, 1e-4);
  const xy = (p: [number, number]) => `${((p[1] - minLng) / span) * 300 + 10},${((maxLat - p[0]) / span) * 300 + 10}`;
  return (
    <svg viewBox="0 0 320 320" className="w-full rounded-2xl" style={{ height: 320, background: '#121212' }} preserveAspectRatio="xMidYMid meet">
      {routes.map((r, i) => <polyline key={i} points={r.map(xy).join(' ')} fill="none" stroke={HEAT} strokeOpacity={0.4} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
    </svg>
  );
}

export function HeatmapPanel({ activities, range }: { activities: CardioActivity[]; range: TimeRange }) {
  const hasPro = useHasPro();
  const dark = useUIStore(s => s.theme) === 'dark';
  const [filter, setFilter] = useState<Filter>('all');
  const [area, setArea] = useState(0);
  const types = useMemo(() => (['run', 'walk', 'cycle'] as const).filter(t => activities.some(a => a.type === t)), [activities]);
  const { groups, km, count } = useMemo(() => {
    const list = activities.filter(a => filter === 'all' || a.type === filter);
    const routes = list.map(toRoute).filter((r): r is HeatRoute => !!r);
    return { groups: areas(routes), km: Math.round(list.reduce((s, a) => s + (a.distanceKm || 0), 0)), count: routes.length };
  }, [activities, filter]);
  if (!activities.some(a => (a.route?.length || 0) > 1)) return null;
  const shown = groups[Math.min(area, groups.length - 1)] || [];

  return (
    <section className="pro-panel p-3 sm:p-5">
      <div className="mb-3 px-1 sm:px-0">
        <h3 className="text-[17px] font-semibold text-bone flex items-center gap-2"><Flame size={17} style={{ color: HEAT }} /> Personal heatmap <ProBadge /></h3>
        <p className="text-[12px] text-bone-dim mt-0.5">{RANGE_LABEL[range]} · {count} route{count === 1 ? '' : 's'} · {km} km. Brighter lines are the paths you use most.</p>
      </div>
      <ProLock title="Personal heatmap" reason={`See every route you've run, walked and ridden on one map with ${BRAND.name} Pro.`} maxHeight={400}>
        <div className="space-y-2.5">
          {types.length > 1 && (
            <Pills label="Activity" value={filter} onChange={v => { setFilter(v); setArea(0); }}
              options={[{ value: 'all', label: 'All' }, ...types.map(t => ({ value: t, label: t === 'cycle' ? 'Ride' : t === 'run' ? 'Run' : 'Walk' }))]} />
          )}
          {shown.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-bone-dim">No GPS routes in this period.</p>
          ) : hasPro ? (
            <Suspense fallback={<div className="rounded-2xl pro-track animate-pulse" style={{ height: 360 }} />}>
              <PersonalHeatmap key={`${filter}-${area}`} routes={shown} dark={dark} color={HEAT} />
            </Suspense>
          ) : (
            <Sketch routes={shown} />
          )}
          {groups.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups.map((g, i) => (
                <button key={i} type="button" onClick={() => setArea(i)}
                  className={`h-8 px-3 shrink-0 rounded-full text-[12.5px] font-semibold ${i === area ? 'text-white' : 'pro-track text-bone-dim'}`}
                  style={i === area ? { background: HEAT } : undefined}>
                  Area {i + 1} · {g.length}
                </button>
              ))}
            </div>
          )}
        </div>
      </ProLock>
    </section>
  );
}
