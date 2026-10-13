import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeftRight, Bike, Footprints, Loader2, LocateFixed, Magnet, RotateCcw, Save, Trash2, Undo2, Zap } from 'lucide-react';
import type { CardioActivityType } from '@/types';
import { MAP_THEMES, MapAttribution } from '@/components/cardio/RouteMap';
import { pathKm, type LatLng } from '@/lib/polyline';
import { simplifyRoute } from '@/lib/route-simplify';
import { routeElevation, snapRoute, estimateRouteSec, type PlannedRoute } from '@/services/routes';
import { useUIStore } from '@/stores/ui-store';
import { ElevationProfile } from './ElevationProfile';
import { formatDuration } from './route-format';

const TYPES: { value: CardioActivityType; label: string; icon: typeof Zap }[] = [
  { value: 'run', label: 'Run', icon: Zap },
  { value: 'walk', label: 'Walk', icon: Footprints },
  { value: 'cycle', label: 'Ride', icon: Bike },
];

const dot = (color: string, size = 14) => new L.DivIcon({
  html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></div>`,
  className: '',
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});
const START_ICON = dot('#16a34a', 18);
const POINT_ICON = dot('#2563eb', 12);
const END_ICON = dot('#dc2626', 16);

function ClickToAdd({ onAdd }: { onAdd: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.setView(target, Math.max(map.getZoom(), 15), { animate: true }); }, [target, map]);
  return null;
}

function FitOnce({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], animate: false });
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function joinLegs(legs: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const leg of legs) {
    for (let i = 0; i < leg.length; i++) {
      if (i === 0 && out.length) continue;
      out.push(leg[i]);
    }
  }
  return out;
}

/**
 * Strava-style route builder: tap the map to add points; with "Snap to paths" each leg follows
 * roads and trails. Drag any point to reshape the route (e.g. a suggested A→B route).
 */
export function RouteBuilder({ start, darkMap, onSave, initial }: {
  start: LatLng | null;
  darkMap: boolean;
  onSave: (route: PlannedRoute) => void;
  /** Pre-filled route to edit: waypoints and the path between each pair. */
  initial?: { type: CardioActivityType; waypoints: LatLng[]; legs: LatLng[][]; name?: string } | null;
}) {
  const showToast = useUIStore(s => s.showToast);
  const [type, setType] = useState<CardioActivityType>(initial?.type ?? 'run');
  const [snap, setSnap] = useState(true);
  const [waypoints, setWaypoints] = useState<LatLng[]>(initial?.waypoints ?? []);
  const [legs, setLegs] = useState<LatLng[][]>(initial?.legs ?? []);
  const [pending, setPending] = useState(0);
  const [elevation, setElevation] = useState<{ gain: number | null; profile: number[] | null } | null>(null);
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null);
  const warnedRef = useRef(false);
  const theme = MAP_THEMES[darkMap ? 'dark' : 'street'];

  const path = useMemo(() => joinLegs(legs), [legs]);
  const distanceKm = useMemo(() => pathKm(path), [path]);

  // Location usually arrives after the map mounts: move there before the first tap.
  const startKey = start ? `${start[0]},${start[1]}` : '';
  useEffect(() => {
    if (start && waypoints.length === 0) setFlyTarget(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  const legFor = useCallback(async (a: LatLng, b: LatLng): Promise<LatLng[]> => {
    if (!snap) return [a, b];
    try {
      const r = await snapRoute([a, b], type);
      return r.points.length > 1 ? r.points : [a, b];
    } catch (err: any) {
      if (err?.status !== 402 && !warnedRef.current) {
        warnedRef.current = true;
        showToast('Couldn\'t follow a path there, drew a straight line instead.', 'info');
      }
      return [a, b];
    }
  }, [snap, type, showToast]);

  const addPoint = useCallback(async (p: LatLng) => {
    if (pending > 0) return;
    const last = waypoints[waypoints.length - 1];
    setWaypoints(w => [...w, p]);
    if (!last) return;
    setPending(n => n + 1);
    const leg = await legFor(last, p);
    setLegs(l => [...l, leg]);
    setPending(n => n - 1);
  }, [waypoints, legFor, pending]);

  const undo = () => {
    if (pending) return;
    setWaypoints(w => w.slice(0, -1));
    setLegs(l => l.slice(0, Math.max(0, waypoints.length - 2)));
  };

  // Dragging a point re-plans only the two legs that touch it.
  const movePoint = useCallback(async (i: number, p: LatLng) => {
    if (pending > 0) return;
    const next = waypoints.map((w, j) => (j === i ? p : w));
    setWaypoints(next);
    setPending(n => n + 1);
    const [before, after] = await Promise.all([
      i > 0 ? legFor(next[i - 1], p) : Promise.resolve(null),
      i < next.length - 1 ? legFor(p, next[i + 1]) : Promise.resolve(null),
    ]);
    setLegs(l => l.map((leg, j) => (j === i - 1 && before ? before : j === i && after ? after : leg)));
    setPending(n => n - 1);
  }, [waypoints, legFor, pending]);
  const clear = () => { if (!pending) { setWaypoints([]); setLegs([]); setElevation(null); } };
  const backToStart = () => { if (waypoints.length > 1 && !pending) addPoint(waypoints[0]); };
  const outAndBack = () => {
    if (waypoints.length < 2 || pending) return;
    const back = [...legs].reverse().map(leg => [...leg].reverse());
    setLegs(l => [...l, ...back]);
    setWaypoints(w => [...w, ...[...w].reverse().slice(1)]);
  };

  // Elevation for the finished shape, once drawing pauses.
  useEffect(() => {
    if (path.length < 2 || pending) { if (path.length < 2) setElevation(null); return; }
    const t = setTimeout(() => {
      const sample = simplifyRoute(path.map(([lat, lng]) => ({ lat, lng })), 400).map(p => [p.lat, p.lng] as LatLng);
      routeElevation(sample)
        .then(r => setElevation({ gain: r.elevationGainM, profile: r.elevationProfile }))
        .catch(() => setElevation(null));
    }, 1200);
    return () => clearTimeout(t);
  }, [path, pending]);

  const save = () => {
    if (path.length < 2) return;
    const pts = simplifyRoute(path.map(([lat, lng]) => ({ lat, lng })), 1500).map(p => [p.lat, p.lng] as LatLng);
    onSave({
      name: initial?.name || `${distanceKm.toFixed(1)} km ${TYPES.find(t => t.value === type)?.label.toLowerCase()} route`,
      type,
      distanceKm: Math.round(distanceKm * 100) / 100,
      elevationGainM: elevation?.gain ?? null,
      elevationProfile: elevation?.profile ?? null,
      points: pts,
      source: 'drawn',
    });
  };

  const center: LatLng = start || waypoints[0] || [20.5937, 78.9629];
  const tool = 'flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-2xl text-[10.5px] font-semibold active:scale-95 transition-transform disabled:opacity-35';

  return (
    <div className="space-y-3">
      <div className="dx-segment w-full" role="tablist" aria-label="Sport">
        {TYPES.map(t => (
          <button key={t.value} role="tab" aria-selected={type === t.value} onClick={() => setType(t.value)}>
            <t.icon size={14} className="inline -mt-0.5 mr-1" />{t.label}
          </button>
        ))}
      </div>

      <div className="relative rounded-3xl overflow-hidden border" style={{ height: '58vh', minHeight: 360, borderColor: 'var(--dx-border)', background: theme.bg }}>
        <MapContainer center={center} zoom={start ? 15 : 5} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url={theme.url} maxNativeZoom={theme.maxNativeZoom} maxZoom={19} />
          <ClickToAdd onAdd={addPoint} />
          <FlyTo target={flyTarget} />
          {initial && <FitOnce points={initial.legs.flat()} />}
          {path.length > 1 && (
            <>
              <Polyline positions={path} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.9 }} />
              <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 5 }} />
            </>
          )}
          {waypoints.map((p, i) => (
            <Marker
              key={`${i}-${p[0]}-${p[1]}`}
              position={p}
              draggable={pending === 0}
              eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); void movePoint(i, [ll.lat, ll.lng]); } }}
              icon={i === 0 ? START_ICON : i === waypoints.length - 1 ? END_ICON : POINT_ICON}
            />
          ))}
        </MapContainer>
        <MapAttribution text={theme.attribution} className="left-2 bottom-2" />

        {waypoints.length === 0 ? (
          <div className="absolute top-3 inset-x-3 z-[500] pointer-events-none flex justify-center">
            <span className="px-3.5 py-2 rounded-full text-[12.5px] font-semibold shadow-md" style={{ background: 'var(--dx-card)', color: 'var(--dx-text)' }}>
              Tap the map to start drawing
            </span>
          </div>
        ) : waypoints.length > 1 && pending === 0 && (
          <div className="absolute bottom-3 inset-x-3 z-[500] pointer-events-none flex justify-center">
            <span className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold shadow-md" style={{ background: 'var(--dx-card)', color: 'var(--dx-text)' }}>
              Drag a point to change the route · tap to extend
            </span>
          </div>
        )}

        <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
          <button type="button" onClick={() => setSnap(s => !s)} className="h-10 px-3 rounded-full text-[12px] font-semibold shadow-md inline-flex items-center gap-1.5"
            style={{ background: snap ? '#2563eb' : 'var(--dx-card)', color: snap ? '#fff' : 'var(--dx-text)' }} aria-pressed={snap}>
            <Magnet size={14} /> {snap ? 'Snap on' : 'Snap off'}
          </button>
          {start && (
            <button type="button" onClick={() => setFlyTarget([...start] as LatLng)} className="w-10 h-10 self-end rounded-full shadow-md flex items-center justify-center" style={{ background: 'var(--dx-card)', color: 'var(--dx-text)' }} aria-label="Go to my location">
              <LocateFixed size={17} />
            </button>
          )}
        </div>

        {pending > 0 && (
          <div className="absolute top-3 left-3 z-[500] h-9 px-3 rounded-full shadow-md inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ background: 'var(--dx-card)', color: 'var(--dx-text)' }}>
            <Loader2 size={14} className="animate-spin" /> Finding path…
          </div>
        )}
      </div>

      <div className="dx-card p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[20px] font-bold tabular-nums">{distanceKm.toFixed(2)}</div>
            <div className="text-[11px] dx-muted">km</div>
          </div>
          <div>
            <div className="text-[20px] font-bold tabular-nums">{elevation?.gain != null ? Math.round(elevation.gain) : '–'}</div>
            <div className="text-[11px] dx-muted">m climb</div>
          </div>
          <div>
            <div className="text-[20px] font-bold tabular-nums">{distanceKm > 0 ? formatDuration(estimateRouteSec({ distanceKm, elevationGainM: elevation?.gain ?? null, type })) : '–'}</div>
            <div className="text-[11px] dx-muted">est. time</div>
          </div>
        </div>
        {elevation?.profile && elevation.profile.length > 1 && (
          <div className="mt-3"><ElevationProfile profile={elevation.profile} distanceKm={distanceKm} height={70} /></div>
        )}
        <div className="mt-3 flex items-center justify-between gap-1">
          <button type="button" className={tool} onClick={undo} disabled={!waypoints.length || pending > 0}><Undo2 size={18} />Undo</button>
          <button type="button" className={tool} onClick={backToStart} disabled={waypoints.length < 2 || pending > 0}><RotateCcw size={18} />To start</button>
          <button type="button" className={tool} onClick={outAndBack} disabled={waypoints.length < 2 || pending > 0}><ArrowLeftRight size={18} />Out & back</button>
          <button type="button" className={tool} onClick={clear} disabled={!waypoints.length || pending > 0}><Trash2 size={18} />Clear</button>
        </div>
        <button type="button" onClick={save} disabled={path.length < 2 || pending > 0} className="dx-btn w-full mt-3 !h-12 !text-[15px]">
          <Save size={17} /> Save route
        </button>
      </div>
    </div>
  );
}
