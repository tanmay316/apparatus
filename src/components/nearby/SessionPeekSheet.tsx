import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Flame, Loader2, Lock, Timer, Trophy, UserRound, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useBodyScrollLock } from '@/lib/scroll-lock';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import { RouteMap } from '@/components/cardio/RouteMap';
import { formatActivityDate, formatDuration, formatPace } from '@/components/cardio/cardio-format';
import { findSessionAround, getSessionById, type PeekSession } from '@/services/session-peek';
import type { NearbyActivity } from '@/services/nearby';
import type { CardioActivity, SetData, Workout } from '@/types';
import { ACTIVITY_META, NearbyAvatar } from './nearby-ui';

export interface PeekTarget {
  uid: string;
  displayName: string;
  username?: string;
  photoURL?: string;
  activity: NearbyActivity;
  /** Their saved session, when known (finished Nearby cards). */
  activityId?: string;
  /** Otherwise: roughly when their session started. */
  aroundMs?: number;
}

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="dx-inset px-3 py-2.5 min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide dx-muted truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 min-w-0">
        <span className="text-[18px] font-semibold tabular leading-none truncate">{value}</span>
        {unit && <span className="text-[11px] dx-muted shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function CardioPeek({ data }: { data: CardioActivity }) {
  const theme = useUIStore(s => s.theme);
  const moving = data.movingDurationSec || data.durationSec || 0;
  const isCycle = data.type === 'cycle';
  const hasRoute = Array.isArray(data.route) && data.route.length > 1;
  return (
    <div className="space-y-3">
      {hasRoute && (
        <div className="relative h-[220px] rounded-2xl overflow-hidden" style={{ border: '1px solid var(--dx-border)' }}>
          <RouteMap
            route={data.route}
            theme={theme === 'dark' ? 'dark' : 'light'}
            height="100%"
            fitToContainer
            interactive={false}
            variant="card"
            cardioType={data.type}
            highlightColor={ACTIVITY_META[data.type].color}
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Distance" value={(data.distanceKm || 0).toFixed(2)} unit="km" />
        <Kpi label="Moving time" value={formatDuration(moving)} />
        {isCycle
          ? <Kpi label="Avg speed" value={(data.avgSpeedKmh || 0).toFixed(1)} unit="km/h" />
          : <Kpi label="Avg pace" value={formatPace(data.distanceKm || 0, moving)} unit="/km" />}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Elevation" value={`+${Math.round(data.elevationGainM || 0)}`} unit="m" />
        <Kpi label="Calories" value={String(Math.round(data.calories || 0))} unit="kcal" />
        {data.steps ? <Kpi label="Steps" value={Math.round(data.steps).toLocaleString()} /> : <Kpi label="Max speed" value={(data.maxSpeedKmh || 0).toFixed(1)} unit="km/h" />}
      </div>
    </div>
  );
}

function bestSet(sets: SetData[] | undefined) {
  const done = (sets || []).filter(s => s.completed !== false && (Number(s.reps) > 0 || Number(s.seconds) > 0 || Number(s.weight) > 0));
  if (!done.length) return null;
  const top = [...done].sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0) || (Number(b.reps) || 0) - (Number(a.reps) || 0))[0];
  if (top.seconds && !top.reps) return `${done.length} × ${top.seconds}s`;
  return `${done.length} × ${top.reps || 0}${top.weight ? ` @ ${top.weight} kg` : ''}`;
}

function WorkoutPeek({ data }: { data: Workout }) {
  const exercises = (data.exercises || []).filter(e => (e.sets || []).some(s => s.completed !== false));
  const sets = exercises.reduce((n, e) => n + (e.sets || []).filter(s => s.completed !== false).length, 0);
  const prs = exercises.filter(e => e.isPR).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Duration" value={String(data.durationMin || 0)} unit="min" />
        <Kpi label="Volume" value={Math.round(data.volume || 0).toLocaleString()} unit="kg" />
        <Kpi label="Sets" value={String(sets)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="dx-pill"><Flame size={13} /> {Math.round(data.calories || 0)} kcal</span>
        <span className="dx-pill"><Timer size={13} /> {exercises.length} exercises</span>
        {prs > 0 && <span className="dx-pill dx-pill--accent"><Trophy size={13} /> {prs} PR{prs > 1 ? 's' : ''}</span>}
      </div>
      {exercises.length > 0 && (
        <ul className="dx-inset divide-y" style={{ borderColor: 'var(--dx-border)' }}>
          {exercises.slice(0, 12).map((e, i) => (
            <li key={`${e.name}-${i}`} className="px-3 py-2.5 flex items-center gap-3 text-[13.5px]">
              <span className="flex-1 min-w-0 truncate font-medium">{e.name}</span>
              {e.isPR && <Trophy size={13} className="shrink-0" style={{ color: 'var(--dx-accent)' }} />}
              <span className="dx-muted tabular shrink-0">{bestSet(e.sets)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Another athlete's session (stats, map, KPIs) opened from Nearby or a "with …" line. */
/** The partner's saved session (shared cache between the group list and the detail sheet). */
export function usePeekSession(target: PeekTarget) {
  const viewer = useAuthStore(s => s.user?.uid);
  const kind = target.activity === 'workout' ? 'workout' : 'cardio';
  return useQuery<PeekSession | null>({
    queryKey: ['session-peek', target.uid, kind, target.activityId ?? target.aroundMs ?? 0],
    queryFn: async () => {
      if (target.activityId) {
        const byId = await getSessionById(kind, target.activityId);
        if (byId) return byId;
      }
      return target.aroundMs ? findSessionAround(target.uid, kind, target.aroundMs, viewer) : null;
    },
    staleTime: 5 * 60_000,
  });
}

export function sessionTitle(session: PeekSession | null | undefined, activity: PeekTarget['activity']): string {
  if (session?.kind === 'workout') return session.data.dayTitle || session.data.planTitle || 'Workout';
  const start = session ? (session.data.startedAt as any)?.toMillis?.() ?? 0 : 0;
  const label = ACTIVITY_META[activity].label;
  if (!start) return label;
  const h = new Date(start).getHours();
  return `${h >= 5 && h < 12 ? 'Morning' : h >= 12 && h < 17 ? 'Afternoon' : h >= 17 && h < 21 ? 'Evening' : 'Night'} ${label}`;
}

export function SessionPeekSheet({ target, onClose }: { target: PeekTarget; onClose: () => void }) {
  useBodyScrollLock();
  const { displayName } = useLiveDisplayName(target.uid, target.displayName, target.photoURL);
  const meta = ACTIVITY_META[target.activity];
  const { data: session, isLoading } = usePeekSession(target);

  const startedMs = session ? (session.data.startedAt as any)?.toMillis?.() ?? 0 : 0;
  const title = sessionTitle(session, target.activity);

  return createPortal(
    <div className="dx pro-scope dx-overlay" style={{ zIndex: 10040 }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName}'s session`}
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <NearbyAvatar athlete={target} size={42} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold leading-tight truncate">{displayName || 'Athlete'}</h2>
            <p className="text-[12.5px] dx-muted truncate">
              <span style={{ color: meta.color }} className="font-semibold">{title}</span>
              {startedMs ? ` · ${formatActivityDate(startedMs)}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>

        <div className="dx-sheet-body space-y-4">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center"><Loader2 size={22} className="animate-spin dx-muted" /></div>
          ) : !session ? (
            <div className="py-8 text-center">
              <span className="dx-badge-icon !w-12 !h-12 !rounded-2xl mx-auto"><Lock size={20} /></span>
              <h3 className="mt-3 text-[15px] font-semibold">Session not available</h3>
              <p className="mt-1 text-[12.5px] dx-muted max-w-xs mx-auto leading-snug">
                {displayName?.split(' ')[0] || 'They'} hasn't saved it yet, or only shares it with followers.
              </p>
            </div>
          ) : session.kind === 'cardio' ? (
            <CardioPeek data={session.data} />
          ) : (
            <WorkoutPeek data={session.data} />
          )}

          {target.username && (
            <Link to={`/profile/${target.username}`} onClick={onClose} className="dx-card p-3.5 flex items-center gap-3">
              <UserRound size={17} className="dx-muted shrink-0" />
              <span className="flex-1 text-[13.5px] font-semibold">View profile and stats</span>
              <ChevronRight size={17} className="dx-muted" />
            </Link>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
