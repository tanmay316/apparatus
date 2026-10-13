import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Geolocation } from '@capacitor/geolocation';
import { Bike, Bookmark, ChevronRight, Download, Footprints, Loader2, LocateFixed, Map as MapIcon, Mountain, Navigation, PenLine, RefreshCw, Sparkles, Timer, Zap } from 'lucide-react';
import type { CardioActivity, CardioActivityType } from '@/types';
import { RouteMap } from '@/components/cardio/RouteMap';
import { ProBadge, ProLock } from '@/components/insights/ProLock';
import { RouteBuilder } from '@/components/routes/RouteBuilder';
import { DirectionsPlanner } from '@/components/routes/DirectionsPlanner';
import { RouteDetailSheet } from '@/components/routes/RouteDetailSheet';
import { formatDuration } from '@/components/routes/route-format';
import type { LatLng } from '@/lib/polyline';
import { BRAND } from '@/lib/brand';
import { historyQuery } from '@/services/history';
import {
  deleteRoute, estimateRouteSec, getSavedRoutes, renameRoute, saveRoute, setRouteOffline, suggestRoutes,
  type PlannedRoute, type SavedRoute,
} from '@/services/routes';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { requirePro, useHasPro } from '@/stores/subscription-store';
import { useUIStore } from '@/stores/ui-store';

type Tab = 'suggested' | 'directions' | 'saved' | 'create';
type Hills = 'any' | 'flat' | 'hilly';

const SPORTS: { value: CardioActivityType; label: string; icon: typeof Zap }[] = [
  { value: 'run', label: 'Run', icon: Zap },
  { value: 'walk', label: 'Walk', icon: Footprints },
  { value: 'cycle', label: 'Ride', icon: Bike },
];
const DISTANCES: Record<CardioActivityType, number[]> = {
  run: [3, 5, 8, 10, 15, 21],
  walk: [2, 3, 5, 8, 10],
  cycle: [10, 20, 30, 50, 80],
};

/** Typical recent pace (s/km) for a sport, from the last 10 sessions. */
function usualPace(cardio: CardioActivity[], type: CardioActivityType): number | undefined {
  const recent = cardio.filter(a => a.type === type && (a.distanceKm || 0) > 0.5).slice(0, 10);
  const km = recent.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const sec = recent.reduce((s, a) => s + (a.movingDurationSec || a.durationSec || 0), 0);
  return km > 0 && sec > 0 ? sec / km : undefined;
}

function RouteCard({ route, darkMap, pace, onOpen }: { route: PlannedRoute | SavedRoute; darkMap: boolean; pace?: number; onOpen: () => void }) {
  const offline = 'offline' in route && route.offline;
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }} className="dx-card overflow-hidden text-left w-full cursor-pointer active:scale-[0.99] transition-transform">
      <div className="relative h-[150px] pointer-events-none">
        <RouteMap route={route.points.map(([lat, lng]) => ({ lat, lng, ts: 0 }))} height="150px" theme={darkMap ? 'dark' : 'street'} variant="card" interactive={false} highlightColor="#2563eb" cardioType={route.type} />
        {offline && (
          <span className="absolute top-2 left-2 z-[450] h-6 px-2 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1 bg-black/60 text-white">
            <Download size={11} /> Offline
          </span>
        )}
      </div>
      <div className="p-3.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{route.name}</div>
          <div className="mt-0.5 flex items-center gap-3 text-[12.5px] dx-muted tabular-nums">
            <span>{route.distanceKm.toFixed(1)} km</span>
            <span className="inline-flex items-center gap-1"><Mountain size={12} />{route.elevationGainM != null ? `${Math.round(route.elevationGainM)} m` : '–'}</span>
            <span className="inline-flex items-center gap-1"><Timer size={12} />{formatDuration(estimateRouteSec(route, pace))}</span>
          </div>
        </div>
        <ChevronRight size={18} className="dx-muted shrink-0" />
      </div>
    </div>
  );
}

/**
 * Routes (Pro), modelled on Strava: routes made for you around where you are, saved routes you can
 * keep offline, and a route builder to draw your own. Any route can be followed live in the tracker.
 */
export function RoutesPage() {
  const { user } = useAuthStore();
  const darkMap = useUIStore(s => s.theme) === 'dark';
  const showToast = useUIStore(s => s.showToast);
  const confirm = useUIStore(s => s.confirm);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPro = useHasPro();
  const [params, setParams] = useSearchParams();
  const tab = (['suggested', 'directions', 'saved', 'create'].includes(params.get('tab') || '') ? params.get('tab') : 'suggested') as Tab;
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const [draft, setDraft] = useState<{ type: CardioActivityType; waypoints: LatLng[]; legs: LatLng[][]; name: string; key: number } | null>(null);

  const [here, setHere] = useState<LatLng | null>(() => {
    const loc = useCardioStore.getState().currentLocation;
    return loc ? [loc.lat, loc.lng] : null;
  });
  const [locating, setLocating] = useState(false);
  const locate = async (): Promise<LatLng | null> => {
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
      setHere(p);
      return p;
    } catch {
      return null;
    } finally {
      setLocating(false);
    }
  };
  useEffect(() => { void locate(); }, []);

  const { data: cardio = [] } = useQuery(historyQuery('cardio', user?.uid));
  const savedQ = useQuery({
    queryKey: ['routes', user?.uid],
    queryFn: () => getSavedRoutes(user!.uid),
    enabled: !!user && hasPro,
  });
  const saved = savedQ.data || [];

  const [sport, setSport] = useState<CardioActivityType>('run');
  const [distance, setDistance] = useState(5);
  const [hills, setHills] = useState<Hills>('any');
  const [seed, setSeed] = useState(0);
  const [suggestions, setSuggestions] = useState<PlannedRoute[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ route: PlannedRoute | SavedRoute; saved: boolean } | null>(null);

  const pace = usualPace(cardio, sport);
  const sorted = useMemo(() => {
    if (!suggestions) return null;
    const climb = (r: PlannedRoute) => (r.elevationGainM ?? 0) / Math.max(0.5, r.distanceKm);
    if (hills === 'flat') return [...suggestions].sort((a, b) => climb(a) - climb(b));
    if (hills === 'hilly') return [...suggestions].sort((a, b) => climb(b) - climb(a));
    return suggestions;
  }, [suggestions, hills]);

  const find = async (nextSeed = seed) => {
    if (!requirePro(`Routes made for you are part of ${BRAND.name} Pro.`)) return;
    const start = here || (await locate());
    if (!start) {
      setFindError('Turn on location so we can plan routes from where you are.');
      return;
    }
    setFinding(true);
    setFindError(null);
    setSeed(nextSeed);
    try {
      setSuggestions(await suggestRoutes(start[0], start[1], distance, sport, nextSeed));
    } catch (err: any) {
      setSuggestions(null);
      if (err?.status !== 402) setFindError(err?.message || 'Could not plan routes right now.');
    } finally {
      setFinding(false);
    }
  };

  const startRoute = (route: PlannedRoute) => {
    useCardioStore.getState().setPlannedRoute({ name: route.name, distanceKm: route.distanceKm, points: route.points });
    setDetail(null);
    navigate(`/cardio?type=${route.type}`);
  };

  const save = async (route: PlannedRoute) => {
    if (!user || !requirePro(`Saving routes is part of ${BRAND.name} Pro.`)) return;
    try {
      const s = await saveRoute(user.uid, route, true);
      queryClient.setQueryData<SavedRoute[]>(['routes', user.uid], old => [s, ...(old || [])]);
      setDetail(d => (d ? { route: s, saved: true } : d));
      showToast('Route saved and available offline', 'success');
    } catch {
      showToast('Could not save the route. Check your connection.', 'error');
    }
  };

  const updateSaved = (id: string, patch: Partial<SavedRoute>) => {
    if (!user) return;
    queryClient.setQueryData<SavedRoute[]>(['routes', user.uid], old => (old || []).map(r => (r.id === id ? { ...r, ...patch } : r)));
    setDetail(d => (d && 'id' in d.route && d.route.id === id ? { ...d, route: { ...d.route, ...patch } } : d));
  };

  const content = (
    <div className="space-y-4">
      {tab === 'suggested' && (
        <>
          <section className="dx-card p-4 space-y-3">
            <div className="dx-segment w-full" role="tablist" aria-label="Sport">
              {SPORTS.map(s => (
                <button key={s.value} role="tab" aria-selected={sport === s.value} onClick={() => { setSport(s.value); setDistance(DISTANCES[s.value][1]); setSuggestions(null); }}>
                  <s.icon size={14} className="inline -mt-0.5 mr-1" />{s.label}
                </button>
              ))}
            </div>
            <div>
              <div className="dx-label">Distance</div>
              <div className="flex flex-wrap gap-2">
                {DISTANCES[sport].map(km => (
                  <button key={km} type="button" onClick={() => setDistance(km)}
                    className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border ${distance === km ? 'text-[var(--dx-on-accent)]' : ''}`}
                    style={distance === km ? { background: 'var(--dx-accent)', borderColor: 'var(--dx-accent)' } : { borderColor: 'var(--dx-border)' }}>
                    {km} km
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="dx-label">Elevation</div>
              <div className="dx-segment w-full" role="tablist" aria-label="Elevation">
                {(['any', 'flat', 'hilly'] as Hills[]).map(h => (
                  <button key={h} role="tab" aria-selected={hills === h} onClick={() => setHills(h)}>
                    {h === 'any' ? 'Any' : h === 'flat' ? 'Flatter' : 'Hillier'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12.5px] dx-muted">
              <LocateFixed size={14} />
              <span className="flex-1">{here ? 'Starting from your current location' : locating ? 'Finding your location…' : 'Location unavailable'}</span>
              {!here && !locating && <button type="button" onClick={() => locate()} className="dx-link !text-[12.5px]">Retry</button>}
            </div>
            <button type="button" onClick={() => find(suggestions ? seed + 1 : seed)} disabled={finding} className="dx-btn w-full !h-12 !text-[15px]">
              {finding ? <Loader2 size={17} className="animate-spin" /> : suggestions ? <RefreshCw size={17} /> : <Sparkles size={17} />}
              {finding ? 'Planning routes…' : suggestions ? 'Show different routes' : 'Find routes for me'}
            </button>
            {findError && <p className="text-[12.5px] text-rose-500">{findError}</p>}
          </section>

          {sorted && sorted.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {sorted.map((r, i) => (
                <RouteCard key={`${seed}-${i}`} route={r} darkMap={darkMap} pace={pace} onOpen={() => setDetail({ route: r, saved: false })} />
              ))}
            </div>
          )}
          {!sorted && !finding && (
            <div className="dx-card p-6 text-center">
              <MapIcon size={28} className="mx-auto" style={{ color: 'var(--dx-accent)' }} />
              <div className="mt-2 text-[15px] font-semibold">Loops that start at your door</div>
              <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto">Pick a sport and distance. We plan loops on real paths around you, with the climb and how long they'll take you.</p>
            </div>
          )}
        </>
      )}

      {tab === 'saved' && (
        savedQ.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="dx-card h-[220px] animate-pulse" />)}</div>
        ) : saved.length === 0 ? (
          <div className="dx-card p-6 text-center">
            <Bookmark size={28} className="mx-auto" style={{ color: 'var(--dx-accent)' }} />
            <div className="mt-2 text-[15px] font-semibold">No saved routes yet</div>
            <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto">Save a route made for you, or draw your own. Saved routes are kept on your phone so they open without signal.</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
              <button type="button" onClick={() => setTab('suggested')} className="dx-btn"><Sparkles size={16} /> Routes for me</button>
              <button type="button" onClick={() => setTab('create')} className="dx-btn-secondary"><PenLine size={16} /> Draw a route</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {saved.map(r => (
              <RouteCard key={r.id} route={r} darkMap={darkMap} pace={usualPace(cardio, r.type)} onOpen={() => setDetail({ route: r, saved: true })} />
            ))}
          </div>
        )
      )}

      {tab === 'directions' && (
        <DirectionsPlanner
          here={here}
          darkMap={darkMap}
          pace={type => usualPace(cardio, type)}
          onStart={route => { if (requirePro(`Routes are part of ${BRAND.name} Pro.`)) startRoute(route); }}
          onSave={route => void save(route)}
          onEdit={d => { setDraft({ ...d, key: Date.now() }); setTab('create'); }}
        />
      )}

      {tab === 'create' && (
        <RouteBuilder
          key={draft?.key ?? 'blank'}
          start={here}
          darkMap={darkMap}
          initial={draft}
          onSave={async (route) => {
            await save(route);
            setDraft(null);
            setTab('saved');
          }}
        />
      )}
    </div>
  );

  return (
    <div className="dx pro-scope max-w-3xl mx-auto pt-1 sm:pt-3 space-y-4">
      <header>
        <div className="dx-eyebrow flex items-center gap-1.5"><MapIcon size={11} /> Plan · Explore · Follow</div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight flex items-center gap-2">Routes <ProBadge /></h1>
      </header>

      <div className="dx-segment w-full" role="tablist" aria-label="Routes">
        <button role="tab" aria-selected={tab === 'suggested'} onClick={() => setTab('suggested')}><Sparkles size={14} className="inline -mt-0.5 mr-1" />For you</button>
        <button role="tab" aria-selected={tab === 'directions'} onClick={() => setTab('directions')}><Navigation size={14} className="inline -mt-0.5 mr-1" />A to B</button>
        <button role="tab" aria-selected={tab === 'saved'} onClick={() => setTab('saved')}><Bookmark size={14} className="inline -mt-0.5 mr-1" />Saved{saved.length ? ` ${saved.length}` : ''}</button>
        <button role="tab" aria-selected={tab === 'create'} onClick={() => { setDraft(null); setTab('create'); }}><PenLine size={14} className="inline -mt-0.5 mr-1" />Draw</button>
      </div>

      {hasPro ? content : (
        <ProLock title="Routes" reason={`Try routes made for you, save routes for offline use and draw your own with ${BRAND.name} Pro.`} maxHeight={640}>
          {content}
        </ProLock>
      )}

      <AnimatePresence>
        {detail && (
          <RouteDetailSheet
            route={detail.route}
            saved={detail.saved}
            darkMap={darkMap}
            paceSecPerKm={usualPace(cardio, detail.route.type)}
            onClose={() => setDetail(null)}
            onStart={() => startRoute(detail.route)}
            onSave={() => save(detail.route)}
            onToggleOffline={async (on) => {
              if (!user || !('id' in detail.route)) return;
              const r = detail.route as SavedRoute;
              await setRouteOffline(user.uid, r, on);
              updateSaved(r.id, { offline: on });
              showToast(on ? 'Route available offline' : 'Removed from this phone', 'info');
            }}
            onRename={async (name) => {
              if (!user || !('id' in detail.route)) return;
              const id = (detail.route as SavedRoute).id;
              try {
                await renameRoute(user.uid, id, name);
                updateSaved(id, { name: name.trim().slice(0, 80) || 'Route' });
              } catch {
                showToast('Could not rename the route.', 'error');
              }
            }}
            onDelete={async () => {
              if (!user || !('id' in detail.route)) return;
              const id = (detail.route as SavedRoute).id;
              const ok = await confirm({ title: 'Delete route', message: `Delete "${detail.route.name}"?`, confirmText: 'Delete', type: 'danger', icon: 'trash' });
              if (!ok) return;
              try {
                await deleteRoute(user.uid, id);
                queryClient.setQueryData<SavedRoute[]>(['routes', user.uid], old => (old || []).filter(r => r.id !== id));
                setDetail(null);
                showToast('Route deleted');
              } catch {
                showToast('Could not delete the route.', 'error');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
