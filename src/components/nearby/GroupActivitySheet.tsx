import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Loader2, Lock, Users, X } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useBodyScrollLock } from '@/lib/scroll-lock';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import { RouteMap } from '@/components/cardio/RouteMap';
import { formatDuration, formatPace } from '@/components/cardio/cardio-format';
import { ACTIVITY_META, NearbyAvatar } from './nearby-ui';
import { SessionPeekSheet, sessionTitle, usePeekSession, type PeekTarget } from './SessionPeekSheet';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] dx-muted truncate">{label}</div>
      <div className="text-[14.5px] font-semibold tabular leading-tight truncate">{value}</div>
    </div>
  );
}

/** One athlete in the group: their own session title, stats and route thumbnail, like Strava. */
function MemberRow({ target, onOpen }: { target: PeekTarget; onOpen: () => void }) {
  const theme = useUIStore(s => s.theme);
  const { displayName } = useLiveDisplayName(target.uid, target.displayName, target.photoURL);
  const { data: session, isLoading } = usePeekSession(target);
  const meta = ACTIVITY_META[target.activity];

  let stats: { label: string; value: string }[] = [];
  if (session?.kind === 'cardio') {
    const d = session.data;
    const moving = d.movingDurationSec || d.durationSec || 0;
    stats = [
      { label: 'Distance', value: `${(d.distanceKm || 0).toFixed(2)} km` },
      d.type === 'cycle'
        ? { label: 'Speed', value: `${(d.avgSpeedKmh || 0).toFixed(1)} km/h` }
        : { label: 'Pace', value: `${formatPace(d.distanceKm || 0, moving)} /km` },
      { label: 'Time', value: formatDuration(moving) },
    ];
  } else if (session?.kind === 'workout') {
    const d = session.data;
    const sets = (d.exercises || []).reduce((n, e) => n + (e.sets || []).filter(s => s.completed !== false).length, 0);
    stats = [
      { label: 'Time', value: `${d.durationMin || 0} min` },
      { label: 'Volume', value: `${Math.round(d.volume || 0).toLocaleString()} kg` },
      { label: 'Sets', value: String(sets) },
    ];
  }
  const route = session?.kind === 'cardio' && (session.data.route?.length ?? 0) > 1 ? session.data.route : null;

  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full text-left px-4 py-3.5 flex items-center gap-3">
        <NearbyAvatar athlete={target} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-semibold truncate">{displayName || 'Athlete'}</div>
          <div className="text-[12.5px] truncate" style={{ color: meta.color }}>
            {isLoading ? 'Loading…' : session ? sessionTitle(session, target.activity) : meta.label}
          </div>
          {isLoading ? (
            <Loader2 size={14} className="animate-spin dx-muted mt-1.5" />
          ) : session ? (
            <div className="mt-1.5 grid grid-cols-3 gap-2">{stats.map(s => <Stat key={s.label} {...s} />)}</div>
          ) : (
            <div className="mt-1 text-[12px] dx-muted inline-flex items-center gap-1"><Lock size={11} /> Not shared with you yet</div>
          )}
        </div>
        {route ? (
          <span className="w-[72px] h-[72px] rounded-xl overflow-hidden shrink-0 pointer-events-none" style={{ border: '1px solid var(--dx-border)' }}>
            <RouteMap route={route} height="72px" theme={theme === 'dark' ? 'dark' : 'light'} variant="card" interactive={false} hideMarkers fitToContainer highlightColor={meta.color} cardioType={session!.kind === 'cardio' ? session!.data.type : undefined} />
          </span>
        ) : (
          <ChevronRight size={18} className="dx-muted shrink-0" />
        )}
      </button>
    </li>
  );
}

/** Strava-style "Group activity": everyone who trained with you, each with their own session. */
export function GroupActivitySheet({ members, onClose }: { members: PeekTarget[]; onClose: () => void }) {
  useBodyScrollLock();
  const [open, setOpen] = useState<PeekTarget | null>(null);

  return createPortal(
    <div className="dx pro-scope dx-overlay" style={{ zIndex: 10035 }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Group activity"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <span className="dx-badge-icon !w-10 !h-10 !rounded-xl"><Users size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold leading-tight">Group activity</h2>
            <p className="text-[12.5px] dx-muted">{members.length + 1} athletes trained together</p>
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="dx-sheet-body !px-0 !pt-1">
          <ul className="divide-y" style={{ borderColor: 'var(--dx-border)' }}>
            {members.map(m => <MemberRow key={m.uid} target={m} onOpen={() => setOpen(m)} />)}
          </ul>
        </div>
      </motion.div>
      {open && <SessionPeekSheet target={open} onClose={() => setOpen(null)} />}
    </div>,
    document.body,
  );
}
