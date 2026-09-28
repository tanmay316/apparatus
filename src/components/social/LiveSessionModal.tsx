import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  X, Send, Flame, Footprints, Bike, Zap, Dumbbell, Mountain, Gauge, Timer, Route, Layers, TrendingUp, Activity, Pause,
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { sendLiveMessage, type ActiveSession } from '@/services/social';
import type { GroupedLiveSession } from './LiveTrainingHub';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { LiveUserName } from '@/components/ui/LiveUser';

interface Props {
  groupedSession: GroupedLiveSession | null;
  isOpen: boolean;
  onClose: () => void;
}

type Kpi = { label: string; value: string; unit?: string; icon: typeof Flame };

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return typeof v === 'number' ? v : 0;
};

function formatClock(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function formatPace(secPerKm?: number) {
  if (!secPerKm || secPerKm <= 0 || secPerKm > 3600) return '--:--';
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;
}

function buildKpis(s: ActiveSession): Kpi[] {
  if (s.sessionType === 'cardio') {
    const distance: Kpi = { label: 'Distance', value: (s.distanceKm ?? 0).toFixed(2), unit: 'km', icon: Route };
    const calories: Kpi = { label: 'Calories', value: String(s.caloriesBurned || 0), unit: 'kcal', icon: Flame };
    const elevation: Kpi = { label: 'Elevation', value: `+${Math.round(s.elevationGainM ?? 0)}`, unit: 'm', icon: Mountain };
    const moving: Kpi = { label: 'Moving time', value: formatClock(s.movingSec ?? 0), icon: Timer };
    if (s.activityType === 'cycle') {
      return [
        distance,
        { label: 'Speed', value: (s.currentSpeedKmh ?? 0).toFixed(1), unit: 'km/h', icon: Gauge },
        { label: 'Avg speed', value: (s.avgSpeedKmh ?? 0).toFixed(1), unit: 'km/h', icon: TrendingUp },
        calories, elevation, moving,
      ];
    }
    const pace: Kpi = { label: 'Avg pace', value: formatPace(s.paceSecPerKm), unit: '/km', icon: Gauge };
    return s.steps !== undefined
      ? [distance, pace, calories, { label: 'Steps', value: s.steps.toLocaleString(), icon: Footprints }, elevation, moving]
      : [distance, pace, calories, elevation, moving];
  }
  return [
    { label: 'Sets done', value: String(s.setsCompleted ?? 0), icon: Layers },
    { label: 'Exercises', value: String(s.exercisesDone ?? 0), icon: Dumbbell },
    { label: 'Volume', value: (s.volumeKg ?? 0).toLocaleString(), unit: 'kg', icon: TrendingUp },
    { label: 'Calories', value: String(s.caloriesBurned || 0), unit: 'kcal', icon: Flame },
  ];
}

const STATUS_META = {
  active: { label: 'Live', dot: 'bg-emerald-600', pill: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/25' },
  paused: { label: 'Paused', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  auto_paused: { label: 'Auto-paused', dot: 'bg-amber-500', pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
} as const;

export function LiveSessionModal({ groupedSession, isOpen, onClose }: Props) {
  const { user, profile } = useAuthStore();
  const { theme, showToast } = useUIStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [now, setNow] = useState(Date.now());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'workout' | 'cardio'>(groupedSession?.cardio ? 'cardio' : 'workout');

  useEffect(() => {
    if (!groupedSession) return;
    if (activeTab === 'workout' && !groupedSession.workout && groupedSession.cardio) setActiveTab('cardio');
    if (activeTab === 'cardio' && !groupedSession.cardio && groupedSession.workout) setActiveTab('workout');
  }, [groupedSession, activeTab]);

  const session = groupedSession?.[activeTab];
  const status = session?.status ?? 'active';
  const isLive = status === 'active';

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Chat listener (listens to the user's unified chat)
  useEffect(() => {
    if (!groupedSession?.uid) return;

    const chatColl = collection(db, 'activeSessions', groupedSession.uid, 'chat');
    const q = query(chatColl, orderBy('createdAt', 'asc'));
    const toMessages = (docs: any[]) => docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          _timestamp: data.createdAt?.toMillis
            ? data.createdAt.toMillis()
            : (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : (typeof data.createdAt === 'number' ? data.createdAt : Date.now())),
        };
      })
      // Pending local writes (null serverTimestamp) sort to "now" so they appear at the bottom.
      .sort((a, b) => a._timestamp - b._timestamp);

    let fallbackUnsub: (() => void) | null = null;
    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(toMessages(snap.docs));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }, (err) => {
      console.warn('[LiveSessionModal] orderBy error, falling back to unordered listener:', err);
      fallbackUnsub = onSnapshot(chatColl, (fallbackSnap) => {
        setMessages(toMessages(fallbackSnap.docs));
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      });
    });

    return () => {
      unsubscribe();
      fallbackUnsub?.();
    };
  }, [groupedSession?.uid]);

  const activeSeconds = useMemo(() => {
    if (!session) return 0;
    if (typeof session.activeSec === 'number') {
      const updatedAtMs = toMillis(session.updatedAt);
      const drift = isLive && updatedAtMs ? Math.max(0, (now - updatedAtMs) / 1000) : 0;
      return session.activeSec + drift;
    }
    // Sessions published by older app versions only carry startedAt.
    const startedAtMs = toMillis(session.startedAt);
    return startedAtMs ? (now - startedAtMs) / 1000 : 0;
  }, [session, now, isLive]);

  const updatedAgoSec = session ? Math.max(0, Math.round((now - toMillis(session.updatedAt)) / 1000)) : 0;
  const kpis = session ? buildKpis(session) : [];
  const isCardio = session?.sessionType === 'cardio';
  const TypeIcon = isCardio ? (session?.activityType === 'cycle' ? Bike : session?.activityType === 'walk' ? Footprints : Zap) : Dumbbell;
  const startedLabel = session?.startedAt
    ? new Date(toMillis(session.startedAt)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;
  const firstName = groupedSession?.displayName.split(' ')[0] || 'them';
  const presets = isCardio
    ? (session?.activityType === 'cycle' ? ['Ride strong 🚴', 'Keep the cadence 💨', "Let's go! 🔥"] : ['Keep that pace 🏃', 'Strong finish 💪', "Let's go! 🔥"])
    : ['Light weight 😤', 'One more rep 💪', "Let's go! 🔥"];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !profile || !groupedSession) return;

    const msg = inputText.trim();
    setInputText('');
    try {
      await sendLiveMessage(groupedSession.uid, user.uid, profile.displayName || 'Athlete', profile.photoURL || '', msg);
    } catch {
      setInputText(msg);
      showToast('Failed to send message', 'error');
    }
  };

  if (!isOpen || !groupedSession) return null;
  const meta = STATUS_META[status];

  return createPortal(
    <div className="cx pro-scope fixed inset-0 z-[999] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/55"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        role="dialog"
        aria-label={`${groupedSession.displayName} live session`}
        className="relative w-full sm:max-w-[440px] h-[92dvh] sm:h-[680px] flex flex-col overflow-hidden bg-ink text-bone rounded-t-[28px] sm:rounded-[28px] border border-line shadow-[0_-12px_40px_rgba(0,0,0,0.25)]"
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <span className="w-10 h-1 rounded-full bg-line-solid" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-2 pb-4 shrink-0">
          <div className={`relative w-12 h-12 rounded-full p-[2.5px] shrink-0 ${isLive ? 'bg-emerald-600' : 'bg-amber-500'}`}>
            <div className="w-full h-full rounded-full bg-ink p-[2px]">
              <img
                src={groupedSession.photoURL || getAvatarUrl(groupedSession.displayName, theme)}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold leading-tight truncate">{groupedSession.displayName}</h2>
            <p className="text-[12px] text-bone-dim mt-0.5 truncate">
              {session?.dayTitle || (isCardio ? 'Cardio' : 'Workout')}{startedLabel ? ` · Started ${startedLabel}` : ''}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-semibold shrink-0 ${meta.pill}`}>
            <span className="relative flex h-1.5 w-1.5">
              {isLive && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-60`} />}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            </span>
            {meta.label}
          </span>
          <button type="button" onClick={onClose} className="cx-icon-btn !w-9 !h-9 !rounded-full" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groupedSession.workout && groupedSession.cardio && (
            <div className="cx-segment w-full mb-3" role="tablist">
              {(['cardio', 'workout'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 ${activeTab === tab ? '!bg-ink !text-bone shadow-sm' : ''}`}
                >
                  {tab === 'cardio' ? 'Cardio' : 'Workout'}
                </button>
              ))}
            </div>
          )}

          {session && (
            <>
              {/* Hero timer */}
              <div className="cx-surface p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bone-dim">Active time</div>
                  <div className={`mt-1 text-[40px] leading-none font-bold tracking-tight tabular-nums ${isLive ? 'text-bone' : 'text-amber-600 dark:text-amber-400'}`}>
                    {formatClock(activeSeconds)}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-bone-dim">
                    {isLive ? (
                      <><Activity size={12} className="text-emerald-600" /> Updated {updatedAgoSec < 5 ? 'just now' : `${updatedAgoSec}s ago`}</>
                    ) : (
                      <><Pause size={12} className="text-amber-500" /> {status === 'auto_paused' ? 'Stopped moving · timer on hold' : 'Session paused'}</>
                    )}
                  </div>
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isLive ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600'}`}>
                  <TypeIcon size={26} strokeWidth={2.2} />
                </div>
              </div>

              {!isCardio && session.currentExercise && (
                <div className="mt-3 cx-card px-4 py-3 flex items-center gap-3">
                  <Dumbbell size={16} className="text-bone-dim shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone-dim">Now training</div>
                    <div className="text-[14px] font-semibold truncate">{session.currentExercise}</div>
                  </div>
                </div>
              )}

              {/* KPI grid */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {kpis.map((k) => (
                  <div key={k.label} className="cx-card px-3 py-2.5 min-w-0">
                    <div className="flex items-center gap-1 text-[10.5px] font-medium text-bone-dim whitespace-nowrap">
                      <k.icon size={11} className="shrink-0" /> {k.label}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-0.5 min-w-0">
                      <span className="text-[17px] font-bold leading-none tabular-nums truncate">{k.value}</span>
                      {k.unit && <span className="text-[10px] text-bone-dim leading-none shrink-0">{k.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Cheers */}
          <div className="mt-5 mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">Cheers</h3>
            {messages.length > 0 && <span className="text-[11px] text-bone-dim tabular-nums">{messages.length}</span>}
          </div>

          {messages.length === 0 ? (
            <div className="cx-surface px-4 py-6 text-center">
              <p className="text-[13px] font-semibold">No cheers yet</p>
              <p className="text-[12px] text-bone-dim mt-1">Send {firstName} some motivation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, i) => {
                const mine = msg.senderUid === user?.uid;
                return (
                  <div key={msg.id || i} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <img
                      src={msg.senderPhoto || getAvatarUrl(msg.senderName, theme)}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                    <div className={`flex flex-col max-w-[75%] ${mine ? 'items-end' : 'items-start'}`}>
                      {!mine && <LiveUserName userId={msg.senderUid} fallbackName={msg.senderName} className="text-[10.5px] text-bone-dim mb-0.5 px-1" />}
                      <div className={`px-3 py-2 rounded-2xl text-[13.5px] leading-snug ${mine ? 'cx-bubble-out rounded-br-md' : 'cx-bubble-in rounded-bl-md'}`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-line bg-ink px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2 mb-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setInputText(preset)}
                className="cx-chip shrink-0"
              >
                {preset}
              </button>
            ))}
          </div>
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Cheer on ${firstName}…`}
              aria-label="Cheer message"
              maxLength={200}
              className="flex-1 h-11 rounded-full bg-ink-2 border border-line px-4 text-[14px] text-bone placeholder:text-bone-dim outline-none focus:border-sienna/60"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-11 h-11 rounded-full bg-sienna flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
              aria-label="Send cheer"
            >
              <Send size={16} className="ml-0.5" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
