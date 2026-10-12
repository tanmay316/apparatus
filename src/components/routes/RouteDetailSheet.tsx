import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Bookmark, BookmarkCheck, CloudOff, Download, Mountain, Pencil, Play, Timer, Trash2, X } from 'lucide-react';
import { RouteMap } from '@/components/cardio/RouteMap';
import { Switch } from '@/components/ui/Toggle';
import { useBodyScrollLock } from '@/lib/scroll-lock';
import { estimateRouteSec, type PlannedRoute, type SavedRoute } from '@/services/routes';
import { ElevationProfile } from './ElevationProfile';
import { formatDuration } from './route-format';

const TYPE_LABEL = { run: 'Run', walk: 'Walk', cycle: 'Ride' } as const;

export function RouteStats({ route, paceSecPerKm }: { route: PlannedRoute; paceSecPerKm?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="dx-inset p-2.5">
        <div className="text-[11px] dx-muted">Distance</div>
        <div className="text-[17px] font-bold tabular-nums">{route.distanceKm.toFixed(1)}<span className="text-[11px] dx-muted ml-0.5">km</span></div>
      </div>
      <div className="dx-inset p-2.5">
        <div className="text-[11px] dx-muted flex items-center gap-1"><Mountain size={11} /> Climb</div>
        <div className="text-[17px] font-bold tabular-nums">{route.elevationGainM != null ? Math.round(route.elevationGainM) : '–'}<span className="text-[11px] dx-muted ml-0.5">m</span></div>
      </div>
      <div className="dx-inset p-2.5">
        <div className="text-[11px] dx-muted flex items-center gap-1"><Timer size={11} /> Est. time</div>
        <div className="text-[17px] font-bold tabular-nums">{formatDuration(estimateRouteSec(route, paceSecPerKm))}</div>
      </div>
    </div>
  );
}

/** Route details: map, stats, elevation and the Strava-style actions (save, offline, start). */
export function RouteDetailSheet({ route, saved, darkMap, paceSecPerKm, onClose, onStart, onSave, onToggleOffline, onRename, onDelete }: {
  route: PlannedRoute | SavedRoute;
  saved: boolean;
  darkMap: boolean;
  paceSecPerKm?: number;
  onClose: () => void;
  onStart: () => void;
  onSave?: () => void;
  onToggleOffline?: (on: boolean) => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  useBodyScrollLock();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(route.name);
  const offline = 'offline' in route && !!route.offline;
  const points = route.points.map(([lat, lng]) => ({ lat, lng, ts: 0 }));

  return createPortal(
    <div className="dx pro-scope dx-overlay" style={{ zIndex: 700 }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={route.name}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <div className="min-w-0 flex-1">
            <div className="dx-eyebrow">{TYPE_LABEL[route.type]} · {route.source === 'drawn' ? 'Your route' : 'Made for you'}</div>
            {editing ? (
              <form onSubmit={e => { e.preventDefault(); onRename?.(name); setEditing(false); }} className="flex gap-2 mt-1">
                <input className="dx-input flex-1 !h-10" value={name} onChange={e => setName(e.target.value.slice(0, 80))} autoFocus aria-label="Route name" />
                <button type="submit" className="dx-btn !h-10 !px-4 !text-[13px]">Save</button>
              </form>
            ) : (
              <h2 className="text-[18px] font-semibold leading-tight truncate flex items-center gap-2">
                {route.name}
                {saved && onRename && (
                  <button type="button" onClick={() => setEditing(true)} className="dx-muted" aria-label="Rename route"><Pencil size={14} /></button>
                )}
              </h2>
            )}
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>

        <div className="dx-sheet-body space-y-4">
          <div className="rounded-2xl overflow-hidden" style={{ height: 260 }}>
            <RouteMap route={points} height="260px" theme={darkMap ? 'dark' : 'street'} variant="card" highlightColor="#2563eb" cardioType={route.type} />
          </div>
          <RouteStats route={route} paceSecPerKm={paceSecPerKm} />
          {route.elevationProfile && route.elevationProfile.length > 1 && (
            <ElevationProfile profile={route.elevationProfile} distanceKm={route.distanceKm} />
          )}

          {saved && onToggleOffline && (
            <div className="dx-inset p-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
                {offline ? <Download size={17} /> : <CloudOff size={17} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold">Available offline</div>
                <div className="text-[12px] dx-muted leading-snug">Keeps this route on your phone so you can open and follow it without signal.</div>
              </div>
              <Switch checked={offline} onChange={onToggleOffline} label="Available offline" />
            </div>
          )}

          {saved && onDelete && (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose-500">
              <Trash2 size={15} /> Delete route
            </button>
          )}
        </div>

        <div className="dx-sheet-footer flex gap-2.5">
          {!saved && onSave && (
            <button type="button" onClick={onSave} className="dx-btn-secondary px-4 gap-1.5"><Bookmark size={16} /> Save</button>
          )}
          {saved && (
            <span className="dx-btn-secondary px-4 gap-1.5 pointer-events-none opacity-80"><BookmarkCheck size={16} /> Saved</span>
          )}
          <button type="button" onClick={onStart} className="dx-btn flex-1 gap-1.5"><Play size={16} fill="currentColor" /> Start this route</button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
