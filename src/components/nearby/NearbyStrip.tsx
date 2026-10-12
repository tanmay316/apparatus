import { Link } from 'react-router-dom';
import { ChevronRight, Radar } from 'lucide-react';
import { useNearby } from '@/hooks/useNearby';
import type { NearbyActivity } from '@/services/nearby';
import { ACTIVITY_META, NearbyAvatar } from './nearby-ui';

const RADIUS_KM = 5;

/**
 * Entry to /nearby. `liveOnly` (dashboard) renders only when athletes are actually nearby and
 * location was already allowed; otherwise it doubles as a discovery card (community page).
 */
export function NearbyStrip({ liveOnly = false, className = '' }: { liveOnly?: boolean; className?: string }) {
  const { status, athletes } = useNearby(RADIUS_KM);
  const live = status === 'ready' && athletes.length > 0;
  if (liveOnly && !live) return null;

  if (!live) {
    return (
      <Link to="/nearby" className={`dx dx-card p-3.5 flex items-center gap-3 ${className}`}>
        <span className="dx-badge-icon !w-11 !h-11 !rounded-2xl"><Radar size={19} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold">Nearby</span>
          <span className="block text-[12.5px] dx-muted truncate">See who's running, riding or working out around you</span>
        </span>
        <ChevronRight size={18} className="dx-muted shrink-0" />
      </Link>
    );
  }

  const counts = athletes.reduce<Partial<Record<NearbyActivity, number>>>((c, a) => ({ ...c, [a.activity]: (c[a.activity] || 0) + 1 }), {});
  const summary = (Object.keys(counts) as NearbyActivity[])
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
    .slice(0, 2)
    .map(k => `${counts[k]} ${ACTIVITY_META[k].verb.toLowerCase()}`)
    .join(' · ');

  return (
    <Link to="/nearby" className={`dx dx-card p-3.5 flex items-center gap-3 ${className}`}>
      <span className="flex -space-x-3 shrink-0">
        {athletes.slice(0, 3).map(a => <NearbyAvatar key={a.uid} athlete={a} size={38} />)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: 'var(--dx-success)' }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--dx-success)' }} />
          </span>
          {athletes.length} training near you
        </span>
        <span className="block text-[12.5px] dx-muted truncate">{summary} · within {RADIUS_KM} km</span>
      </span>
      <ChevronRight size={18} className="dx-muted shrink-0" />
    </Link>
  );
}
