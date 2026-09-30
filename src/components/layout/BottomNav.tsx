import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { Activity as ActivityIcon, Apple, ArrowRight, Bike, ChevronRight, Dumbbell, Footprints, MapPin, TrendingUp, Users, X, Zap, type LucideIcon } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { format, isToday, isYesterday } from 'date-fns';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import type { Activity } from '@/types';
import { BOTTOM_TAB_PATHS } from './nav-config';

interface Tab { id: string; path: string; label: string; icon: LucideIcon; match: (p: string) => boolean }

const TABS: Tab[] = [
  { id: 'home', path: '/', label: 'Home', icon: Dumbbell, match: p => p === '/' },
  { id: 'nutrition', path: '/nutrition', label: 'Nutrition', icon: Apple, match: p => p.startsWith('/nutrition') },
  { id: 'progress', path: '/progress', label: 'Progress', icon: TrendingUp, match: p => p.startsWith('/progress') },
  { id: 'community', path: '/community', label: 'Community', icon: Users, match: p => p.startsWith('/community') },
];

interface StartOption {
  id: 'workout' | 'run' | 'walk' | 'cycle';
  title: string;
  subtitle: string;
  liveText: string;
  icon: LucideIcon;
  tint: string;
}

const START_OPTIONS: StartOption[] = [
  { id: 'workout', title: 'Weight training', subtitle: 'Log sets, reps & PRs', liveText: 'Workout in progress', icon: Dumbbell, tint: 'text-orange-500 bg-orange-500/10' },
  { id: 'run', title: 'Run', subtitle: 'GPS · pace · distance', liveText: 'Run in progress', icon: Zap, tint: 'text-cyan-500 bg-cyan-500/10' },
  { id: 'walk', title: 'Walk', subtitle: 'Steps · route · hiking', liveText: 'Walk in progress', icon: Footprints, tint: 'text-emerald-500 bg-emerald-500/10' },
  { id: 'cycle', title: 'Ride', subtitle: 'Speed · route · elevation', liveText: 'Ride in progress', icon: Bike, tint: 'text-purple-500 bg-purple-500/10' },
];

const ACTIVITY_EMOJI: Record<string, string> = { walk: '🚶', run: '🏃', cycle: '🚴' };

function formatActivityDate(ts: any) {
  if (!ts?.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE');
}

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recent, setRecent] = useState<Activity[]>([]);
  const dragControls = useDragControls();

  const cardioLive = useCardioStore(s => s.isTracking);
  const cardioType = useCardioStore(s => s.activityType);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const workoutPlanId = useWorkoutStore(s => s.planId);
  const workoutDayId = useWorkoutStore(s => s.dayId);
  const hasLive = cardioLive || workoutLive;

  useEffect(() => {
    if (!sheetOpen || !user) return;
    getDocs(query(collection(db, 'activities'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(3)))
      .then(snap => setRecent(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Activity)))
      .catch(() => {});
  }, [sheetOpen, user]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  useEffect(() => { setSheetOpen(false); }, [pathname]);

  const activeId = useMemo(() => TABS.find(t => t.match(pathname))?.id, [pathname]);

  if (!BOTTOM_TAB_PATHS.includes(pathname)) return null;

  const isOptionLive = (id: StartOption['id']) => (id === 'workout' ? workoutLive : cardioLive && cardioType === id);

  const pick = (id: StartOption['id']) => {
    setSheetOpen(false);
    if (id === 'workout') {
      navigate(workoutLive && workoutPlanId && workoutDayId ? `/workout/${workoutPlanId}/day/${workoutDayId}` : '/plans');
    } else {
      navigate(isOptionLive(id) ? '/cardio' : `/cardio?type=${id}`);
    }
  };

  const renderTab = (tab: Tab) => {
    const active = tab.id === activeId;
    const Icon = tab.icon;
    return (
      <Link
        key={tab.id}
        to={tab.path}
        aria-current={active ? 'page' : undefined}
        className="bn-tab flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-full"
      >
        <span className="bn-pill flex items-center justify-center w-14 h-8 rounded-full">
          <Icon size={21} strokeWidth={active ? 2.4 : 2} />
        </span>
        <span className={`text-[10.5px] leading-none tracking-tight truncate ${active ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
      </Link>
    );
  };

  return (
    <>
      <style>{`
        .bottom-app-nav {
          background: #ffffff;
          border: 1px solid rgba(23, 25, 28, 0.07);
          box-shadow: 0 12px 32px -10px rgba(23, 25, 28, 0.22), 0 2px 8px rgba(23, 25, 28, 0.06);
        }
        .bn-tab { color: #7a7e88; -webkit-tap-highlight-color: transparent; }
        .bn-tab .bn-pill { transition: background-color .2s ease, transform .2s ease; }
        .bn-tab[aria-current='page'] { color: rgb(var(--color-sienna)); }
        .bn-tab[aria-current='page'] .bn-pill { background: rgb(var(--color-sienna) / 0.1); }
        .bn-tab:active .bn-pill { transform: scale(0.92); }
        [data-theme='dark'] .bn-tab { color: #8b8b96; }
        [data-theme='dark'] .bn-tab[aria-current='page'] { color: #e3bda6; }
        [data-theme='dark'] .bn-tab[aria-current='page'] .bn-pill { background: rgba(122, 58, 36, 0.35); box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.7), inset -1px -1px 3px rgba(255, 255, 255, 0.04); }
        @keyframes bnLiveGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(4, 120, 87, 0.5); } 50% { box-shadow: 0 0 0 6px rgba(4, 120, 87, 0); } }
        .bn-live-glow { animation: bnLiveGlow 2s infinite ease-in-out; }
      `}</style>

      <div className="bottom-nav-shell lg:hidden fixed left-1/2 -translate-x-1/2 w-[calc(100%-20px)] max-w-[440px] z-[500]" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
        <nav className="bottom-app-nav rounded-[26px] px-1.5 py-1.5" aria-label="Primary">
          <div className="flex items-center h-[60px]">
            {TABS.slice(0, 2).map(renderTab)}
            <div className="flex-1 flex items-center justify-center h-full">
              <button onClick={() => setSheetOpen(true)} aria-label="Start activity" className="active:scale-95 transition-transform">
                <span
                  className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white ${hasLive ? 'bg-emerald-700 bn-live-glow' : 'bg-sienna'}`}
                  style={hasLive ? undefined : { boxShadow: '0 6px 16px -4px rgb(var(--color-sienna) / 0.55)' }}
                >
                  <MapPin size={21} strokeWidth={2.4} />
                  {hasLive && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />}
                </span>
              </button>
            </div>
            {TABS.slice(2).map(renderTab)}
          </div>
        </nav>
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 bg-black/50 z-[510]"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Start activity"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 100 || info.velocity.y > 500) setSheetOpen(false); }}
              className="fixed bottom-0 left-0 right-0 z-[520] bg-ink rounded-t-[28px] max-w-[600px] mx-auto shadow-[0_-10px_40px_rgba(0,0,0,0.2)] max-h-[88dvh] overflow-y-auto"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
            >
              <div className="flex justify-center pt-2.5 pb-1 touch-none cursor-grab" onPointerDown={e => dragControls.start(e)}>
                <span className="w-10 h-1 rounded-full bg-bone/20" />
              </div>
              <div className="px-5 pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-bone-dim uppercase tracking-widest flex items-center gap-1.5">
                    <ActivityIcon size={12} className="text-sienna" /> Start activity
                  </div>
                  <button onClick={() => setSheetOpen(false)} className="w-8 h-8 rounded-full bg-bone/5 flex items-center justify-center text-bone-dim hover:text-bone" aria-label="Close">
                    <X size={17} />
                  </button>
                </div>
                <h3 className="text-[24px] font-semibold tracking-tight text-bone mt-1 mb-4">What are you training?</h3>

                <div className="flex flex-col gap-2.5">
                  {START_OPTIONS.map(opt => {
                    const live = isOptionLive(opt.id);
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => pick(opt.id)}
                        className={`flex items-center gap-3.5 p-3.5 rounded-2xl text-left transition-colors active:scale-[0.99] ${
                          live ? 'bg-emerald-500/12 border-2 border-emerald-500' : 'bg-bone/[0.04] border border-line/60 hover:bg-bone/[0.07]'
                        }`}
                      >
                        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${live ? 'text-emerald-500 bg-emerald-500/15' : opt.tint}`}>
                          <Icon size={21} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-[16px] text-bone">{opt.title}</span>
                            {live && <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase bg-emerald-500 text-white">Live</span>}
                          </span>
                          <span className={`block text-[13px] ${live ? 'text-emerald-600 dark:text-emerald-300 font-medium' : 'text-bone-dim'}`}>{live ? opt.liveText : opt.subtitle}</span>
                        </span>
                        {live
                          ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">Resume <ArrowRight size={15} /></span>
                          : <ChevronRight size={19} className="text-bone-dim/50" />}
                      </button>
                    );
                  })}
                </div>

                {recent.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-[11px] font-semibold text-bone-dim uppercase tracking-widest mb-2 px-1">Recent</h4>
                    <div className="flex flex-col gap-1.5">
                      {recent.map(act => (
                        <Link key={act.id} to={`/post/${act.id}`} onClick={() => setSheetOpen(false)} className="flex items-center gap-3 p-3 rounded-xl bg-bone/[0.03] border border-line/50">
                          <span className="text-lg">{ACTIVITY_EMOJI[act.type] || '🏋️'}</span>
                          <span className="flex-1 min-w-0 text-sm font-medium text-bone truncate">{act.summary}</span>
                          <span className="text-[11px] text-bone-dim shrink-0">{formatActivityDate(act.createdAt)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
