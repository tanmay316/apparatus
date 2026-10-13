import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight, Eye, EyeOff, Loader2, LocateFixed, MapPin, MessageCircle, Radar, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useUIStore } from '@/stores/ui-store';
import { useBodyScrollLock } from '@/lib/scroll-lock';
import { useNearby } from '@/hooks/useNearby';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import { sendLiveMessage } from '@/services/social';
import { formatNearbyDistance, nearbyVisibilityOf, type NearbyActivity, type NearbyAthlete } from '@/services/nearby';
import { NearbyMap } from '@/components/nearby/NearbyMap';
import { NearbySettingsSheet } from '@/components/nearby/NearbySettingsSheet';
import { ACTIVITY_META, NearbyAvatar, formatSince } from '@/components/nearby/nearby-ui';

const RADII = [5, 25, 100, Infinity];
const radiusLabel = (r: number) => (Number.isFinite(r) ? `${r} km` : 'Any');
const RADIUS_KEY = 'apparatus.nearby-radius.v2';
const CHEERS = ['Go go go! 🔥', "You've got this 💪", 'Crushing it ⚡', 'Keep going! 🏃'];

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function CheerSheet({ athlete, onClose }: { athlete: NearbyAthlete; onClose: () => void }) {
  useBodyScrollLock();
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const { displayName } = useLiveDisplayName(athlete.uid, athlete.displayName);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const first = (displayName || 'them').split(' ')[0];

  const send = async (message: string) => {
    const msg = message.trim().slice(0, 300);
    if (!msg || !user || !profile) return;
    setSending(true);
    try {
      await sendLiveMessage(athlete.uid, user.uid, profile.displayName || 'Athlete', profile.photoURL || '', msg);
      showToast(`Cheer sent to ${first}`, 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not send cheer', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dx pro-scope dx-overlay" style={{ zIndex: 10030 }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Cheer on ${first}`}
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        className="dx-sheet sm:max-w-md"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <NearbyAvatar athlete={athlete} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold leading-tight truncate">Cheer on {first}</h2>
            <p className="text-[12.5px] dx-muted">{ACTIVITY_META[athlete.activity].verb} now · they'll see it live</p>
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="dx-sheet-body space-y-3">
          <div className="flex flex-wrap gap-2">
            {CHEERS.map(c => (
              <button key={c} type="button" disabled={sending} onClick={() => send(c)} className="dx-chip !h-9 !text-[13px]">{c}</button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); void send(text); }} className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={300}
              placeholder={`Say something to ${first}…`}
              className="dx-input flex-1"
              aria-label="Cheer message"
            />
            <button type="submit" disabled={sending || !text.trim()} className="dx-btn !w-11 !px-0 shrink-0" aria-label="Send cheer">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function LiveCard({
  athlete, following, now, selected, onSelect, onCheer,
}: {
  athlete: NearbyAthlete; following: boolean; now: number; selected: boolean; onSelect: () => void; onCheer: () => void;
}) {
  const { displayName } = useLiveDisplayName(athlete.uid, athlete.displayName);
  const meta = ACTIVITY_META[athlete.activity];
  return (
    <li data-uid={athlete.uid} data-selected={selected} className="nb-card p-3.5" onClick={onSelect}>
      <div className="flex items-center gap-3">
        <NearbyAvatar athlete={athlete} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[15px] font-semibold truncate">{displayName || 'Athlete'}</span>
            {following && <span className="dx-pill dx-pill--accent !h-5 !px-1.5 !text-[10px] shrink-0">Following</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] min-w-0">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: meta.color }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: meta.color }} />
            </span>
            <span className="font-semibold shrink-0" style={{ color: meta.color }}>{meta.verb}</span>
            <span className="dx-muted truncate">· {formatSince(athlete.startedAt, now)}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[16px] font-semibold tabular leading-none">{formatNearbyDistance(athlete.distanceKm)}</div>
          <div className="text-[10.5px] dx-muted mt-1 uppercase tracking-wide">away</div>
        </div>
      </div>
      {athlete.place && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[12px] dx-muted min-w-0">
          <MapPin size={12} className="shrink-0" /> <span className="truncate">{athlete.place}</span>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onCheer(); }}
          className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white"
          style={{ background: meta.color }}
        >
          <MessageCircle size={15} /> Cheer
        </button>
        {athlete.username ? (
          <Link
            to={`/profile/${athlete.username}`}
            onClick={e => e.stopPropagation()}
            className="h-10 rounded-xl flex items-center justify-center gap-1 text-[13px] font-semibold"
            style={{ background: 'var(--dx-card-2)' }}
          >
            Profile <ChevronRight size={15} />
          </Link>
        ) : <span />}
      </div>
    </li>
  );
}

/** Strava-style "who's training around me right now". */
export function NearbyPage() {
  const { profile } = useAuthStore();
  const visibility = nearbyVisibilityOf(profile);
  const cardioLive = useCardioStore(s => s.isTracking);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const recording = cardioLive || workoutLive;
  const [params] = useSearchParams();
  const [radius, setRadius] = useState(() => {
    const saved = Number(localStorage.getItem(RADIUS_KEY) ?? 'Infinity');
    return RADII.includes(saved) ? saved : Infinity;
  });
  const [sport, setSport] = useState<'all' | NearbyActivity>('all');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get('focus'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cheerFor, setCheerFor] = useState<NearbyAthlete | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const now = useNow(30_000);
  const { status, viewer, athletes, loaded, following, requestLocation, retry } = useNearby(radius);

  useEffect(() => { localStorage.setItem(RADIUS_KEY, String(radius)); }, [radius]);

  const followingSet = useMemo(() => new Set(following), [following]);
  const matches = (a: NearbyAthlete) => (sport === 'all' || a.activity === sport) && (!followingOnly || followingSet.has(a.uid));
  const list = athletes.filter(matches);
  const counts = useMemo(() => {
    const c: Record<NearbyActivity, number> = { run: 0, walk: 0, cycle: 0, workout: 0 };
    for (const a of athletes) c[a.activity] += 1;
    return c;
  }, [athletes]);

  const select = (uid: string) => {
    setSelected(uid);
    window.requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-uid="${CSS.escape(uid)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const sports: { key: 'all' | NearbyActivity; label: string; count: number; color: string; Icon: typeof Radar }[] = [
    { key: 'all', label: 'All', count: athletes.length, color: 'var(--dx-ink)', Icon: Sparkles },
    ...(Object.keys(ACTIVITY_META) as NearbyActivity[]).map(k => ({
      key: k, label: k === 'workout' ? 'Gym' : ACTIVITY_META[k].label, count: counts[k], color: ACTIVITY_META[k].color, Icon: ACTIVITY_META[k].icon,
    })),
  ];

  return (
    <div className="dx pro-scope max-w-3xl mx-auto pt-1 sm:pt-4 space-y-3.5 pb-4">
      {status === 'ready' && viewer ? (
        <section className="relative rounded-[28px] overflow-hidden" style={{ border: '1px solid var(--dx-border)' }}>
          <NearbyMap viewer={viewer} radiusKm={radius} athletes={athletes.filter(matches)} selectedUid={selected} onSelect={select} height={420} />
          <div className="absolute left-3 right-3 top-3 z-[500] flex items-start justify-between gap-2 pointer-events-none">
            <div className="nb-glass rounded-2xl px-3.5 py-2.5 pointer-events-auto min-w-0">
              <div className="flex items-center gap-2 text-[17px] font-semibold leading-tight">
                Nearby
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: '#10b981' }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#10b981' }} />
                </span>
              </div>
              <div className="text-[12px] opacity-70 tabular">{athletes.length} training right now</div>
            </div>
            <button type="button" onClick={() => setSettingsOpen(true)} className="nb-glass w-11 h-11 rounded-2xl flex items-center justify-center pointer-events-auto shrink-0" aria-label="Nearby privacy">
              <Settings2 size={18} />
            </button>
          </div>
          <div className="absolute left-3 right-3 bottom-3 z-[500] flex justify-center pointer-events-none">
            <div className="nb-glass nb-seg pointer-events-auto w-full max-w-sm" role="tablist" aria-label="Distance">
              {RADII.map(r => (
                <button key={r} type="button" role="tab" aria-selected={radius === r} onClick={() => setRadius(r)} className="tabular">
                  {radiusLabel(r)}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="dx-eyebrow">Train together</div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">Nearby</h1>
            <p className="text-[13.5px] dx-muted mt-0.5">Who's running, riding and lifting around you.</p>
          </div>
          <button type="button" onClick={() => setSettingsOpen(true)} className="dx-icon-btn shrink-0" aria-label="Nearby privacy"><Settings2 size={18} /></button>
        </header>
      )}

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="w-full rounded-2xl px-3.5 py-3 flex items-center gap-3 text-left"
        style={{ background: visibility === 'off' ? 'var(--dx-card-2)' : 'var(--dx-success-soft)' }}
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={visibility === 'off' ? { background: 'var(--dx-card)', color: 'var(--dx-muted)' } : { background: 'var(--dx-success)', color: '#fff' }}
        >
          {visibility === 'off' ? <EyeOff size={17} /> : <Eye size={17} />}
        </span>
        <span className="flex-1 min-w-0 leading-snug">
          <span className="block text-[13.5px] font-semibold" style={visibility === 'off' ? undefined : { color: 'var(--dx-success)' }}>
            {visibility === 'off' ? "You're hidden" : recording ? 'You are live on Nearby' : 'Visible while you train'}
          </span>
          <span className="block text-[12px] dx-muted truncate">
            {visibility === 'off'
              ? 'Turn on so others can find and join you'
              : `${visibility === 'everyone' ? 'Everyone' : 'Your followers'} can see you from the moment you start`}
          </span>
        </span>
        <span className={visibility === 'off' ? 'dx-btn !h-9 !px-3.5 !text-[12.5px] shrink-0' : 'dx-link !text-[12.5px] shrink-0'}>
          {visibility === 'off' ? 'Turn on' : 'Manage'}
        </span>
      </button>

      {(status === 'idle' || status === 'locating') && (
        <div className="dx-card h-[340px] flex flex-col items-center justify-center gap-3">
          <Loader2 size={26} className="animate-spin dx-muted" />
          <span className="text-[13px] dx-muted">Finding athletes near you…</span>
        </div>
      )}
      {status === 'needs-permission' && (
        <section className="dx-card p-6 text-center">
          <span className="dx-badge-icon !w-16 !h-16 !rounded-3xl mx-auto"><Radar size={28} /></span>
          <h2 className="mt-3 text-[18px] font-semibold">See who's training around you</h2>
          <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto leading-snug">
            We use your location to show runs, rides and workouts near you. Looking doesn't share your location.
          </p>
          <button type="button" onClick={requestLocation} className="dx-btn mt-4 !h-11"><LocateFixed size={16} /> Use my location</button>
        </section>
      )}
      {(status === 'denied' || status === 'error') && (
        <section className="dx-card p-6 text-center">
          <span className="dx-badge-icon !w-14 !h-14 !rounded-2xl mx-auto"><MapPin size={24} /></span>
          <h2 className="mt-3 text-[17px] font-semibold">{status === 'denied' ? 'Location is off' : "Couldn't find your location"}</h2>
          <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto leading-snug">
            {status === 'denied'
              ? 'Allow location for this app in your phone settings, then try again.'
              : 'Check that location is turned on and try again.'}
          </p>
          <button type="button" onClick={retry} className="dx-btn-secondary mt-4 !h-10"><RefreshCw size={15} /> Try again</button>
        </section>
      )}

      {status === 'ready' && viewer && (
        <>
          <div className="grid grid-cols-5 gap-2" role="group" aria-label="Filter by sport">
            {sports.map(s => {
              const on = sport === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSport(on && s.key !== 'all' ? 'all' : s.key)}
                  className="nb-sport"
                  style={on ? { background: s.color, color: s.key === 'all' ? 'var(--dx-on-ink)' : '#fff' } : undefined}
                >
                  <s.Icon size={18} style={on ? undefined : { color: s.key === 'all' ? 'var(--dx-text)' : s.color }} />
                  <span className="leading-none">{s.label}</span>
                  <span className="nb-count leading-none">{s.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-[15px] font-semibold">Training now · {list.length}</h2>
            <button
              type="button"
              onClick={() => setFollowingOnly(v => !v)}
              aria-pressed={followingOnly}
              aria-label="Only people you follow"
              title="Only people you follow"
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 transition-colors"
              style={followingOnly ? { background: 'var(--dx-accent)', color: '#fff' } : { background: 'var(--dx-card-2)' }}
            >
              <Users size={16} />
            </button>
          </div>

          {!loaded ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="nb-card p-3.5 flex items-center gap-3 animate-pulse">
                  <span className="w-12 h-12 rounded-full" style={{ background: 'var(--dx-card-2)' }} />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-1/2 rounded" style={{ background: 'var(--dx-card-2)' }} />
                    <span className="block h-3 w-1/3 rounded" style={{ background: 'var(--dx-card-2)' }} />
                  </span>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            <section className="nb-card p-7 text-center">
              <span className="dx-badge-icon !w-14 !h-14 !rounded-2xl mx-auto"><Radar size={24} /></span>
              <h2 className="mt-3 text-[16px] font-semibold">No one training right now</h2>
              <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto leading-snug">
                {athletes.length > 0 && (sport !== 'all' || followingOnly)
                  ? 'No one matches these filters.'
                  : 'People appear here the moment they start a run, ride, walk or workout with Nearby on.'}
              </p>
              {Number.isFinite(radius) && athletes.length === 0 && (
                <button type="button" onClick={() => setRadius(Infinity)} className="dx-btn-secondary mt-4 !h-10">Search everywhere</button>
              )}
            </section>
          ) : (
            <ul ref={listRef} className="space-y-2.5">
              {list.map(a => (
                <LiveCard
                  key={a.uid}
                  athlete={a}
                  following={followingSet.has(a.uid)}
                  now={now}
                  selected={selected === a.uid}
                  onSelect={() => select(a.uid)}
                  onCheer={() => setCheerFor(a)}
                />
              ))}
            </ul>
          )}

          <p className="flex items-start gap-2 text-[11.5px] dx-muted leading-snug px-1">
            <ShieldCheck size={14} className="shrink-0 mt-px" style={{ color: 'var(--dx-success)' }} />
            Only people who turned Nearby on appear, from the moment they start until they finish. Routes are never shared and privacy zones are respected.
          </p>
        </>
      )}

      {settingsOpen && <NearbySettingsSheet onClose={() => setSettingsOpen(false)} />}
      <AnimatePresence>{cheerFor && <CheerSheet athlete={cheerFor} onClose={() => setCheerFor(null)} />}</AnimatePresence>
    </div>
  );
}
