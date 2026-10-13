import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowDownUp, ArrowLeft, ArrowRight, ArrowUp, Bike, CornerUpLeft, CornerUpRight, Flag, Footprints, Loader2, LocateFixed,
  MapPin, Mountain, Navigation, PenLine, Play, RotateCw, Save, Search, Timer, X, Zap,
} from 'lucide-react';
import type { CardioActivityType } from '@/types';
import { MAP_THEMES, MapAttribution } from '@/components/cardio/RouteMap';
import type { LatLng } from '@/lib/polyline';
import {
  estimateRouteSec, getDirections, routeElevation, searchPlaces, type DirectionStep, type DirectionsRoute, type PlaceResult, type PlannedRoute,
} from '@/services/routes';
import { ElevationProfile } from './ElevationProfile';
import { formatDuration } from './route-format';

const SPORTS: { value: CardioActivityType; label: string; icon: typeof Zap }[] = [
  { value: 'run', label: 'Run', icon: Zap },
  { value: 'walk', label: 'Walk', icon: Footprints },
  { value: 'cycle', label: 'Ride', icon: Bike },
];

interface Place { name: string; point: LatLng; mine?: boolean }

const pin = (color: string, size = 18) => new L.DivIcon({
  html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></div>`,
  className: '',
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});
const START = pin('#16a34a');
const END = pin('#dc2626');

function FitRoutes({ routes, start, end }: { routes: DirectionsRoute[]; start: LatLng | null; end: LatLng | null }) {
  const map = useMap();
  const key = routes.map(r => r.id + r.points.length).join('|') + (start?.join() ?? '') + (end?.join() ?? '');
  useEffect(() => {
    const pts: LatLng[] = routes.flatMap(r => r.points);
    if (start) pts.push(start);
    if (end) pts.push(end);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 15);
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function stepIcon(s: DirectionStep) {
  if (s.type === 'arrive') return Flag;
  if (s.type === 'depart') return Navigation;
  if (s.type.includes('roundabout') || s.type === 'rotary') return RotateCw;
  if (s.modifier === 'uturn') return RotateCw;
  if (s.modifier.includes('sharp left') || s.modifier === 'left') return CornerUpLeft;
  if (s.modifier.includes('sharp right') || s.modifier === 'right') return CornerUpRight;
  if (s.modifier.includes('left')) return ArrowLeft;
  if (s.modifier.includes('right')) return ArrowRight;
  return ArrowUp;
}

const formatStepDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(5, Math.round(m / 5) * 5)} m`);

/** Search-as-you-type place field (OpenStreetMap places, biased to where the user is). */
function PlaceField({ label, value, near, onPick, onUseMine, color }: {
  label: string;
  value: Place | null;
  near: LatLng | null;
  onPick: (p: Place | null) => void;
  onUseMine?: () => void;
  color: string;
}) {
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setText(value?.name ?? ''); }, [value?.name]);

  useEffect(() => {
    if (!open || text.trim().length < 3 || text === value?.name) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      searchPlaces(text, near, ctrl.signal)
        .then(setResults)
        .catch(() => { if (!ctrl.signal.aborted) setResults([]); })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 h-12 px-3 rounded-2xl" style={{ background: 'var(--dx-card-2)' }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: '0 0 0 3px var(--dx-card)' }} />
        <input
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true); if (value) onPick(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={label}
          aria-label={label}
          className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px]"
          style={value?.mine ? { color: '#2563eb', fontWeight: 600 } : undefined}
        />
        {loading && <Loader2 size={15} className="animate-spin dx-muted shrink-0" />}
        {text && !loading && (
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setText(''); onPick(null); }} className="dx-muted shrink-0" aria-label={`Clear ${label}`}>
            <X size={15} />
          </button>
        )}
      </div>
      {open && (results.length > 0 || onUseMine) && (
        <ul className="absolute z-[700] left-0 right-0 mt-1.5 rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}>
          {onUseMine && (
            <li>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onUseMine(); setOpen(false); }} className="w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 text-[13.5px] font-semibold" style={{ color: '#2563eb' }}>
                <LocateFixed size={15} /> Your location
              </button>
            </li>
          )}
          {results.map(r => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onPick({ name: r.name, point: r.point }); setOpen(false); }}
                className="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5"
                style={{ borderTop: '1px solid var(--dx-border)' }}
              >
                <MapPin size={15} className="mt-0.5 dx-muted shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold truncate">{r.name}</span>
                  {r.detail && <span className="block text-[12px] dx-muted truncate">{r.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A → B directions for runs, walks and rides: type where from and where to, compare up to three
 * routes, read turn-by-turn steps, then follow it, save it, or reshape it in the route builder.
 */
export function DirectionsPlanner({ here, darkMap, pace, onStart, onSave, onEdit }: {
  here: LatLng | null;
  darkMap: boolean;
  pace?: (type: CardioActivityType) => number | undefined;
  onStart: (route: PlannedRoute) => void;
  onSave: (route: PlannedRoute) => void;
  onEdit: (draft: { type: CardioActivityType; waypoints: LatLng[]; legs: LatLng[][]; name: string }) => void;
}) {
  const [sport, setSport] = useState<CardioActivityType>('run');
  const [from, setFrom] = useState<Place | null>(here ? { name: 'Your location', point: here, mine: true } : null);
  const [to, setTo] = useState<Place | null>(null);
  const [routes, setRoutes] = useState<DirectionsRoute[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elevation, setElevation] = useState<{ gain: number | null; profile: number[] | null } | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const reqId = useRef(0);
  const theme = MAP_THEMES[darkMap ? 'dark' : 'street'];

  // Location usually arrives after mount.
  useEffect(() => { if (here && !from) setFrom({ name: 'Your location', point: here, mine: true }); }, [here]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!from || !to) { setRoutes([]); setError(null); return; }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    setElevation(null);
    getDirections(from.point, to.point, sport)
      .then(r => { if (id === reqId.current) { setRoutes(r); setSelected(0); } })
      .catch((err: any) => {
        if (id !== reqId.current) return;
        setRoutes([]);
        if (err?.status !== 402) setError(err?.message || 'Could not find a route right now.');
      })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [from?.point.join(), to?.point.join(), sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = routes[selected] ?? null;
  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    setElevation(null);
    routeElevation(route.points.slice(0, 2000))
      .then(r => { if (!cancelled) setElevation({ gain: r.elevationGainM, profile: r.elevationProfile }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [route?.id, route?.points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const eta = route ? estimateRouteSec({ distanceKm: route.distanceKm, elevationGainM: elevation?.gain ?? null, type: sport }, pace?.(sport)) : 0;
  const name = to ? `To ${to.name}`.slice(0, 80) : 'Route';
  const planned = useMemo<PlannedRoute | null>(() => route && {
    name,
    type: sport,
    distanceKm: route.distanceKm,
    elevationGainM: elevation?.gain ?? null,
    elevationProfile: elevation?.profile ?? null,
    points: route.points,
    source: 'suggested',
  }, [route, name, sport, elevation]);

  const swap = () => { setFrom(to); setTo(from); };
  const center: LatLng = from?.point || here || [20.5937, 78.9629];

  return (
    <div className="space-y-3">
      <section className="dx-card p-3.5 space-y-2.5">
        <div className="dx-segment w-full" role="tablist" aria-label="Sport">
          {SPORTS.map(s => (
            <button key={s.value} role="tab" aria-selected={sport === s.value} onClick={() => setSport(s.value)}>
              <s.icon size={14} className="inline -mt-0.5 mr-1" />{s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 space-y-2">
            <PlaceField label="Starting point" value={from} near={here} onPick={setFrom} color="#16a34a"
              onUseMine={here ? () => setFrom({ name: 'Your location', point: here, mine: true }) : undefined} />
            <PlaceField label="Where to?" value={to} near={from?.point ?? here} onPick={setTo} color="#dc2626"
              onUseMine={here ? () => setTo({ name: 'Your location', point: here, mine: true }) : undefined} />
          </div>
          <button type="button" onClick={swap} className="dx-icon-btn shrink-0" aria-label="Swap start and destination"><ArrowDownUp size={17} /></button>
        </div>
      </section>

      <div className="relative rounded-3xl overflow-hidden border" style={{ height: '46vh', minHeight: 300, borderColor: 'var(--dx-border)', background: theme.bg }}>
        <MapContainer center={center} zoom={here ? 14 : 5} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url={theme.url} maxNativeZoom={theme.maxNativeZoom} maxZoom={19} />
          <FitRoutes routes={routes} start={from?.point ?? null} end={to?.point ?? null} />
          {routes.map((r, i) => i !== selected && (
            <Polyline key={r.id} positions={r.points} pathOptions={{ color: '#64748b', weight: 6, opacity: 0.55 }} eventHandlers={{ click: () => setSelected(i) }} />
          ))}
          {route && (
            <>
              <Polyline positions={route.points} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.95 }} interactive={false} />
              <Polyline positions={route.points} pathOptions={{ color: '#2563eb', weight: 5.5 }} interactive={false} />
            </>
          )}
          {from && <Marker position={from.point} icon={START} interactive={false} />}
          {to && <Marker position={to.point} icon={END} interactive={false} />}
        </MapContainer>
        <MapAttribution text={theme.attribution} className="left-2 bottom-2" />
        {loading && (
          <div className="absolute top-3 left-3 z-[500] h-9 px-3 rounded-full shadow-md inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ background: 'var(--dx-card)', color: 'var(--dx-text)' }}>
            <Loader2 size={14} className="animate-spin" /> Finding the best route…
          </div>
        )}
        {!from || !to ? (
          <div className="absolute inset-x-3 top-3 z-[500] pointer-events-none flex justify-center">
            <span className="px-3.5 py-2 rounded-full text-[12.5px] font-semibold shadow-md inline-flex items-center gap-1.5" style={{ background: 'var(--dx-card)', color: 'var(--dx-text)' }}>
              <Search size={13} /> Search a destination to get directions
            </span>
          </div>
        ) : null}
      </div>

      {error && <p className="text-[12.5px] text-rose-500 px-1">{error}</p>}

      {routes.length > 1 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${routes.length}, minmax(0, 1fr))` }}>
          {routes.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(i)}
              className="rounded-2xl p-2.5 text-left transition-colors"
              style={i === selected ? { background: 'rgba(37, 99, 235, 0.12)', boxShadow: 'inset 0 0 0 1.5px #2563eb' } : { background: 'var(--dx-card-2)' }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide dx-muted">{i === 0 ? 'Best' : `Option ${i + 1}`}</div>
              <div className="text-[15px] font-semibold tabular">{r.distanceKm.toFixed(1)} km</div>
              <div className="text-[11.5px] dx-muted tabular">{formatDuration(estimateRouteSec({ distanceKm: r.distanceKm, elevationGainM: null, type: sport }, pace?.(sport)))}</div>
            </button>
          ))}
        </div>
      )}

      {route && planned && (
        <section className="dx-card p-3.5 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[20px] font-bold tabular-nums">{route.distanceKm.toFixed(2)}</div>
              <div className="text-[11px] dx-muted">km</div>
            </div>
            <div>
              <div className="text-[20px] font-bold tabular-nums inline-flex items-center gap-1"><Timer size={15} className="dx-muted" />{formatDuration(eta)}</div>
              <div className="text-[11px] dx-muted">at your pace</div>
            </div>
            <div>
              <div className="text-[20px] font-bold tabular-nums inline-flex items-center gap-1"><Mountain size={15} className="dx-muted" />{elevation?.gain != null ? Math.round(elevation.gain) : '–'}</div>
              <div className="text-[11px] dx-muted">m climb</div>
            </div>
          </div>
          {elevation?.profile && elevation.profile.length > 1 && (
            <ElevationProfile profile={elevation.profile} distanceKm={route.distanceKm} height={64} />
          )}

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => onStart(planned)} className="dx-btn !h-11 !text-[13.5px]"><Play size={15} /> Start</button>
            <button type="button" onClick={() => onSave(planned)} className="dx-btn-secondary !h-11 !text-[13.5px]"><Save size={15} /> Save</button>
            <button
              type="button"
              onClick={() => from && to && onEdit({ type: sport, waypoints: [from.point, to.point], legs: [route.points], name })}
              className="dx-btn-secondary !h-11 !text-[13.5px]"
            >
              <PenLine size={15} /> Edit
            </button>
          </div>

          {route.steps.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowSteps(v => !v)} className="dx-link !text-[13px]">
                {showSteps ? 'Hide' : 'Show'} {route.steps.length} turn-by-turn steps
              </button>
              {showSteps && (
                <ol className="mt-2 rounded-2xl overflow-hidden" style={{ background: 'var(--dx-card-2)' }}>
                  {route.steps.map((s, i) => {
                    const Icon = stepIcon(s);
                    return (
                      <li key={i} className="px-3 py-2.5 flex items-center gap-3 text-[13px]" style={i ? { borderTop: '1px solid var(--dx-border)' } : undefined}>
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--dx-card)' }}><Icon size={14} /></span>
                        <span className="flex-1 min-w-0">{s.instruction}</span>
                        {s.distanceM > 0 && s.type !== 'arrive' && <span className="dx-muted tabular shrink-0 text-[12px]">{formatStepDistance(s.distanceM)}</span>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
