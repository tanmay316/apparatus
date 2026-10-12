import { Bike, Dumbbell, Footprints, Zap, type LucideIcon } from 'lucide-react';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import { getAvatarUrl } from '@/lib/avatar';
import { useUIStore } from '@/stores/ui-store';
import type { NearbyActivity, NearbyPresence } from '@/services/nearby';

export const ACTIVITY_META: Record<NearbyActivity, { label: string; verb: string; icon: LucideIcon; color: string; soft: string }> = {
  run: { label: 'Run', verb: 'Running', icon: Zap, color: '#0891b2', soft: 'rgba(8, 145, 178, 0.12)' },
  walk: { label: 'Walk', verb: 'Walking', icon: Footprints, color: '#059669', soft: 'rgba(5, 150, 105, 0.12)' },
  cycle: { label: 'Ride', verb: 'Riding', icon: Bike, color: '#7c3aed', soft: 'rgba(124, 58, 237, 0.12)' },
  workout: { label: 'Workout', verb: 'Working out', icon: Dumbbell, color: '#ea580c', soft: 'rgba(234, 88, 12, 0.12)' },
};

export function formatSince(startedAt?: { toMillis?: () => number } | null, now = Date.now()): string {
  const start = startedAt?.toMillis?.();
  if (!start) return 'just now';
  const min = Math.max(0, Math.round((now - start) / 60_000));
  if (min < 1) return 'just started';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

/** Avatar with a ring and badge in the activity's colour. */
export function NearbyAvatar({ athlete, size = 48 }: { athlete: Pick<NearbyPresence, 'uid' | 'displayName' | 'photoURL' | 'activity'>; size?: number }) {
  const theme = useUIStore(s => s.theme);
  const { displayName, photoURL } = useLiveDisplayName(athlete.uid, athlete.displayName, athlete.photoURL);
  const meta = ACTIVITY_META[athlete.activity];
  const badge = Math.round(size * 0.42);
  return (
    <span className="relative shrink-0 inline-block" style={{ width: size, height: size }}>
      <img
        src={photoURL || getAvatarUrl(displayName, theme, size * 2)}
        alt=""
        referrerPolicy="no-referrer"
        className="w-full h-full rounded-full object-cover"
        style={{ boxShadow: `0 0 0 2.5px var(--dx-card), 0 0 0 4.5px ${meta.color}` }}
        onError={e => { (e.target as HTMLImageElement).src = getAvatarUrl(displayName, theme, size * 2); }}
      />
      <span
        className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center text-white"
        style={{ width: badge, height: badge, background: meta.color, boxShadow: '0 0 0 2px var(--dx-card)' }}
      >
        <meta.icon size={Math.round(badge * 0.6)} strokeWidth={2.6} />
      </span>
    </span>
  );
}
