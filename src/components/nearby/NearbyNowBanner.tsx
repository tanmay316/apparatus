import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { useNearby } from '@/hooks/useNearby';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { formatNearbyDistance, type NearbyAthlete } from '@/services/nearby';
import { ACTIVITY_META, NearbyAvatar, formatSince } from './nearby-ui';

function Row({ athlete }: { athlete: NearbyAthlete }) {
  const { displayName } = useLiveDisplayName(athlete.uid, athlete.displayName, athlete.photoURL);
  const meta = ACTIVITY_META[athlete.activity];
  return (
    <Link to={`/nearby?focus=${encodeURIComponent(athlete.uid)}`} className="flex items-center gap-2.5 py-2">
      <NearbyAvatar athlete={athlete} size={34} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold truncate">{displayName || 'Athlete'}</span>
        <span className="block text-[12px] truncate">
          <span style={{ color: meta.color }} className="font-semibold">{meta.verb}</span>
          <span className="opacity-60"> · {formatSince(athlete.startedAt)}</span>
        </span>
      </span>
      <span className="text-[12px] font-semibold tabular opacity-70 shrink-0">{formatNearbyDistance(athlete.distanceKm)}</span>
    </Link>
  );
}

/**
 * Collapsible "training near you right now" card. Only while you are recording a session yourself,
 * and only for people recording at the same time.
 */
export function NearbyNowBanner({ id, tone = 'card', className = '' }: { id: string; tone?: 'card' | 'glass'; className?: string }) {
  const storageKey = `apparatus.nearby-banner.${id}`;
  const cardioLive = useCardioStore(s => s.isTracking);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const recording = cardioLive || workoutLive;
  const { status, athletes } = useNearby(Infinity, { enabled: recording });
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) === 'open');
  useEffect(() => { localStorage.setItem(storageKey, open ? 'open' : 'closed'); }, [open, storageKey]);

  if (!recording || status !== 'ready' || athletes.length === 0) return null;

  const surface = tone === 'glass'
    ? { background: 'rgba(14, 12, 11, 0.72)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }
    : undefined;

  return (
    <section className={`${tone === 'card' ? 'dx dx-card' : ''} rounded-[22px] overflow-hidden ${className}`} style={surface}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full px-3.5 py-3 flex items-center gap-3 text-left">
        <span className="flex -space-x-2.5 shrink-0">
          {athletes.slice(0, 3).map(a => <NearbyAvatar key={a.uid} athlete={a} size={30} />)}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 text-[14px] font-semibold">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: '#10b981' }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#10b981' }} />
            </span>
            <span className="truncate">{athletes.length} training with you now</span>
          </span>
          <span className="block text-[12px] opacity-65 truncate">Closest {formatNearbyDistance(athletes[0].distanceKm)} away</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-1 divide-y" style={{ borderColor: tone === 'glass' ? 'rgba(255,255,255,0.1)' : 'var(--dx-border)' }}>
              {athletes.slice(0, tone === 'glass' ? 3 : 5).map(a => <Row key={a.uid} athlete={a} />)}
            </div>
            <Link
              to="/nearby"
              className="mx-3.5 mb-3 mt-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold"
              style={{ background: tone === 'glass' ? 'rgba(255,255,255,0.1)' : 'var(--dx-card-2)' }}
            >
              <MapPin size={14} /> Open Nearby map <ChevronRight size={14} />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
