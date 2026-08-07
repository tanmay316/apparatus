import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Pause, Square, MapPin, Clock, Flame, TrendingUp, Mountain, Zap, Footprints, Bike, Dumbbell, Navigation, Layers } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { saveCardioActivity, getUserCardioActivities } from '@/services/cardio';
import { postActivity } from '@/services/social';
import { calculateCardioCalories } from '@/lib/calories';
import { RouteMap } from '@/components/cardio/RouteMap';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import type { CardioActivityType, CardioActivity } from '@/types';

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(distKm: number, durationSec: number): string {
  if (distKm <= 0 || durationSec <= 0) return '--:--';
  const secPerKm = durationSec / distKm;
  const paceMin = Math.floor(secPerKm / 60);
  const paceSec = Math.floor(secPerKm % 60);
  return `${paceMin}:${String(paceSec).padStart(2, '0')}`;
}

const ACTIVITY_OPTIONS: { type: CardioActivityType | 'workout'; label: string; icon: React.ReactNode; color: string; description: string }[] = [
  { type: 'workout' as any, label: 'Workout', icon: <Dumbbell size={28} />, color: 'from-orange-500 to-red-500', description: 'Gym session with exercises' },
  { type: 'walk', label: 'Walk', icon: <Footprints size={28} />, color: 'from-emerald-500 to-teal-500', description: 'Track your walking route' },
  { type: 'run', label: 'Run', icon: <Zap size={28} />, color: 'from-blue-500 to-cyan-500', description: 'Track your running route' },
  { type: 'cycle', label: 'Cycle', icon: <Bike size={28} />, color: 'from-purple-500 to-pink-500', description: 'Track your cycling route' },
];

export function CardioTracker() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const userWeight = useUserWeight();
  const store = useCardioStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get('type') as CardioActivityType | null;

  const [screen, setScreen] = useState<'select' | 'ready' | 'tracking' | 'summary'>(() => {
    if (store.isTracking) return 'tracking';
    if (urlType) return 'ready';
    return 'select';
  });
  
  // Map layer state
  const [mapLayer, setMapLayer] = useState<'default' | 'light' | 'dark' | 'satellite' | 'street'>('default');

  // Update screen if URL changes
  useEffect(() => {
    if (urlType) {
      if (store.isTracking) {
        if (store.activityType !== urlType) {
          setScreen('ready');
        } else {
          setScreen('tracking');
          setSearchParams({}); // Clear urlType
        }
      } else if (!store.isTracking && screen !== 'ready') {
        setScreen('ready');
        store.reset(); // clear any previous state
      }
    }
  }, [urlType, store.isTracking, store.activityType, screen, store, setSearchParams]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [summaryData, setSummaryData] = useState<Partial<CardioActivity> | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [recentActivities, setRecentActivities] = useState<CardioActivity[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Fetch recent activities
  useEffect(() => {
    if (user && screen === 'select') {
      getUserCardioActivities(user.uid, 5).then(setRecentActivities).catch(console.error);
    }
  }, [user, screen]);

  // Timer
  useEffect(() => {
    if (!store.isTracking || !store.startedAt) return;
    const interval = setInterval(() => {
      if (!store.isPaused) {
        const raw = Date.now() - store.startedAt! - store.totalPausedMs;
        setElapsedSec(Math.max(0, Math.floor(raw / 1000)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [store.isTracking, store.startedAt, store.isPaused, store.totalPausedMs]);

  // GPS and WakeLock logic moved to global cardio-store.ts

  const handleBackgroundSave = async () => {
    if (!store.isTracking || !store.activityType) return;
    const durationSec = elapsedSec;
    const dist = store.distanceKm;
    const type = store.activityType;
    const startedAt = store.startedAt;
    const route = store.routePoints;
    const elevation = store.elevationGainM;
    const maxSpeed = store.maxSpeedKmh;

    store.stopTracking();

    if (user && dist > 0.01) {
      const durationMin = Math.max(1, Math.round(durationSec / 60));
      const avgSpeed = durationSec > 0 ? (dist / durationSec) * 3600 : 0;
      const pace = formatPace(dist, durationSec);
      const calories = calculateCardioCalories(type, dist, durationMin, userWeight || 70, avgSpeed);

      saveCardioActivity(user.uid, {
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        type,
        date: localDateKey(new Date()),
        startedAt: startedAt ? Timestamp.fromMillis(startedAt) : Timestamp.now(),
        finishedAt: Timestamp.now(),
        durationSec,
        distanceKm: Math.round(dist * 1000) / 1000,
        avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
        maxSpeedKmh: Math.round(maxSpeed * 10) / 10,
        avgPace: `${pace} /km`,
        calories,
        elevationGainM: Math.round(elevation),
        route,
        visibility: 'followers',
        notes: 'Auto-saved session',
      }).catch(console.error);
    }
  };

  const handleStartTracking = async () => {
    const type = urlType || store.activityType;
    if (!type) return;
    
    if (store.isTracking && store.activityType !== type) {
      await handleBackgroundSave();
      store.reset();
    }
    
    // Clear the URL param so a refresh stays in tracking
    setSearchParams({});
    
    store.startTracking(type);
    setScreen('tracking');
    setElapsedSec(0);
  };

  const handleStartActivity = (type: CardioActivityType | 'workout') => {
    if (type === 'workout') {
      navigate('/plans');
      return;
    }
    // Navigate to ready screen
    setSearchParams({ type });
  };

  const handlePause = () => {
    store.pauseTracking();
  };

  const handleResume = () => {
    store.resumeTracking();
  };

  const handleStop = async () => {
    store.stopTracking();

    const durationSec = elapsedSec;
    const durationMin = Math.max(1, Math.round(durationSec / 60));
    const dist = store.distanceKm;
    const avgSpeed = durationSec > 0 ? (dist / durationSec) * 3600 : 0;
    const pace = formatPace(dist, durationSec);
    const calories = calculateCardioCalories(
      store.activityType!,
      dist,
      durationMin,
      userWeight || 70,
      avgSpeed
    );

    const data: Partial<CardioActivity> = {
      type: store.activityType!,
      durationSec,
      distanceKm: Math.round(dist * 1000) / 1000,
      avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
      maxSpeedKmh: Math.round(store.maxSpeedKmh * 10) / 10,
      avgPace: `${pace} /km`,
      calories,
      elevationGainM: Math.round(store.elevationGainM),
      route: store.routePoints,
    };

    setSummaryData(data);
    setScreen('summary');

    // Auto-save
    if (user && dist > 0.01) {
      setIsSaving(true);
      try {
        await saveCardioActivity(user.uid, {
          userId: user.uid,
          userName: user.displayName || 'Athlete',
          userPhoto: user.photoURL || '',
          type: data.type!,
          date: localDateKey(new Date()),
          startedAt: store.startedAt ? Timestamp.fromMillis(store.startedAt) : Timestamp.now(),
          finishedAt: Timestamp.now(),
          durationSec: data.durationSec!,
          distanceKm: data.distanceKm!,
          avgSpeedKmh: data.avgSpeedKmh!,
          maxSpeedKmh: data.maxSpeedKmh!,
          avgPace: data.avgPace!,
          calories: data.calories!,
          elevationGainM: data.elevationGainM!,
          route: data.route!,
          visibility: 'followers',
          notes: '',
        });

        // Post to activity feed
        try {
          const typeLabel = data.type === 'walk' ? 'Walk' : data.type === 'run' ? 'Run' : 'Cycle';
          await postActivity({
            userId: user.uid,
            userName: user.displayName || 'Athlete',
            username: profile?.username || '',
            userPhoto: user.photoURL || '',
            type: 'workout',
            workoutId: null,
            summary: `Completed a ${data.distanceKm!.toFixed(2)} km ${typeLabel} in ${formatDuration(data.durationSec!)}`,
            details: {
              activityType: data.type,
              distanceKm: data.distanceKm,
              durationSec: data.durationSec,
              calories: data.calories,
              avgPace: data.avgPace,
            },
            visibility: 'followers',
            likesCount: 0,
            commentsCount: 0,
          });
        } catch { /* silent */ }

        showToast('Activity saved!');
      } catch (err) {
        console.error('Failed to save activity:', err);
        showToast('Failed to save activity', 'error');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDone = () => {
    store.reset();
    setSummaryData(null);
    setScreen('select');
  };

  const calories = store.activityType
    ? calculateCardioCalories(
        store.activityType,
        store.distanceKm,
        Math.max(1, Math.round(elapsedSec / 60)),
        userWeight || 70,
        store.currentSpeedKmh
      )
    : 0;

  // ─── Select Screen ───
  if (screen === 'select') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-24">
        <div className="mb-8">
          <div className="font-mono text-amber text-xs tracking-widest mb-1">ACTIVITY</div>
          <h1 className="font-display text-2xl">Start Activity</h1>
          <p className="text-sm text-bone-dim mt-1">Choose your activity type to begin tracking</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {ACTIVITY_OPTIONS.map((opt) => (
            <motion.button
              key={opt.type}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleStartActivity(opt.type)}
              className="card p-5 text-left group hover:border-sienna/40 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform`}>
                {opt.icon}
              </div>
              <h3 className="font-display text-lg mb-0.5">{opt.label}</h3>
              <p className="text-xs text-bone-dim">{opt.description}</p>
            </motion.button>
          ))}
        </div>

        {/* Recent Activities */}
        {recentActivities.length > 0 && (
          <div>
            <h2 className="font-display text-lg mb-4">Recent Activities</h2>
            <div className="space-y-3">
              {recentActivities.map((act) => {
                const typeLabel = act.type === 'walk' ? '🚶 Walk' : act.type === 'run' ? '🏃 Run' : '🚴 Cycle';
                return (
                  <div key={act.id} className="card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{typeLabel.split(' ')[0]}</span>
                      <div>
                        <div className="font-semibold text-sm">{typeLabel.split(' ')[1]} — {act.distanceKm.toFixed(2)} km</div>
                        <div className="text-xs text-bone-dim font-mono">
                          {formatDuration(act.durationSec)} · {act.avgPace} · {act.calories} kcal
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-bone-dim font-mono">{act.date}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // ─── Ready Screen ───
  if (screen === 'ready' && urlType) {
    const typeLabel = urlType === 'walk' ? 'Walking' : urlType === 'run' ? 'Running' : 'Cycling';
    const isDark = useUIStore.getState().theme === 'dark';
    const effectiveTheme = mapLayer === 'default' ? (isDark ? 'dark' : 'light') : mapLayer;

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col h-screen overflow-hidden">
        
        {/* Background Map */}
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} isLive={false} height="100%" theme={effectiveTheme} />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent z-[1]" />
        </div>

        {/* Header Overlay */}
        <div className="relative z-10 flex items-start justify-between p-6 safe-top pointer-events-none">
          <button 
            onClick={() => { setSearchParams({}); setScreen('select'); }}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--card)]/80 backdrop-blur-md shadow-sm border border-[var(--border)] text-[var(--text)] pointer-events-auto transition-transform active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--card)]/80 backdrop-blur-md shadow-sm border border-[var(--border)] pointer-events-auto">
              {gpsError ? (
                <><Navigation size={14} className="text-red-500" /><span className="text-xs font-bold text-[var(--text)]">GPS Error</span></>
              ) : (
                <><Navigation size={14} className="text-emerald-500" /><span className="text-xs font-bold text-[var(--text)]">GPS Ready</span></>
              )}
            </div>
            
            <button
              onClick={() => {
                const layers = ['default', 'light', 'dark', 'street', 'satellite'] as const;
                const nextIdx = (layers.indexOf(mapLayer) + 1) % layers.length;
                setMapLayer(layers[nextIdx]);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--card)]/80 backdrop-blur-md shadow-sm border border-[var(--border)] text-[var(--text)] pointer-events-auto transition-transform active:scale-95"
            >
              <Layers size={18} />
            </button>
          </div>
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 flex-1 flex flex-col justify-end p-8 pb-[100px] pointer-events-none">
          <div className="pointer-events-auto text-center mb-8">
            <h1 className="font-sans text-5xl font-black tracking-tight text-[var(--text)] drop-shadow-md mb-2">{typeLabel}</h1>
            <p className="text-sm font-semibold text-[var(--muted)] tracking-widest uppercase bg-[var(--bg)]/50 backdrop-blur-sm px-4 py-1.5 rounded-full inline-block">Tap to begin</p>
          </div>
          
          <button
            onClick={handleStartTracking}
            className="w-24 h-24 rounded-full bg-[var(--text)] text-[var(--bg)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 shadow-[0_10px_40px_rgba(0,0,0,0.3)] mx-auto pointer-events-auto"
          >
            <Play size={40} fill="currentColor" className="ml-2" />
          </button>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Tracking Screen ───
  if (screen === 'tracking') {
    const isDark = useUIStore.getState().theme === 'dark';
    const effectiveTheme = mapLayer === 'default' ? (isDark ? 'dark' : 'light') : mapLayer;

    const isDarkMap = effectiveTheme === 'dark' || effectiveTheme === 'satellite';
    const textColor = isDarkMap ? 'text-white drop-shadow-md' : 'text-black';
    const labelColor = isDarkMap ? 'text-white/80' : 'text-[var(--muted)]';

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col h-screen overflow-hidden">
        
        {/* Full Screen Map Background */}
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} isLive height="100%" theme={effectiveTheme} />
        </div>

        {/* Header (Top Right) */}
        <div className="absolute top-6 right-6 z-20 safe-top pointer-events-none flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--card)]/90 backdrop-blur-md shadow-sm border border-[var(--border)] pointer-events-auto">
            {gpsError ? (
              <><Navigation size={14} className="text-red-500" /><span className="text-xs font-bold text-[var(--text)]">GPS Error</span></>
            ) : store.isPaused ? (
              <><Navigation size={14} className="text-orange-500" /><span className="text-xs font-bold text-[var(--text)]">Paused</span></>
            ) : (
              <><Navigation size={14} className="text-[var(--text)]" /><span className="text-xs font-bold text-[var(--text)]">GPS On</span></>
            )}
          </div>
          
          <button
            onClick={() => {
              const layers = ['default', 'light', 'dark', 'street', 'satellite'] as const;
              const nextIdx = (layers.indexOf(mapLayer) + 1) % layers.length;
              setMapLayer(layers[nextIdx]);
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--card)]/90 backdrop-blur-md shadow-sm border border-[var(--border)] text-[var(--text)] pointer-events-auto transition-transform active:scale-95"
          >
            <Layers size={18} />
          </button>
        </div>

        {/* Top Left Metrics Overlay & Back Button */}
        <div className="absolute top-6 left-6 z-20 safe-top pointer-events-none flex flex-col items-start">
          
          {/* Back Button */}
          <button 
            onClick={() => {
              setSearchParams({});
              navigate('/');
            }}
            className="w-10 h-10 mb-6 flex items-center justify-center rounded-full bg-[var(--card)]/90 backdrop-blur-md shadow-sm border border-[var(--border)] text-[var(--text)] pointer-events-auto transition-transform active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>

          {/* Big Timer */}
          <div className="mb-8">
            <div className={`font-sans text-[3.5rem] leading-none font-black tracking-tighter ${textColor}`}>
              {formatDuration(elapsedSec)}
            </div>
            <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-wider mt-1`}>Duration</div>
          </div>

          {/* Left Aligned Stats */}
          <div className="flex flex-col gap-3 max-w-[120px]">
            <div>
              <div className={`font-sans text-3xl font-black ${textColor}`}>{store.distanceKm.toFixed(2)}</div>
              <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-wider mt-0.5`}>Distance (Km)</div>
            </div>
            <div className="w-6 h-px bg-[var(--border)] opacity-50"></div>
            <div>
              <div className={`font-sans text-3xl font-black ${textColor}`}>{calories}</div>
              <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-wider mt-0.5`}>Calories</div>
            </div>
            <div className="w-6 h-px bg-[var(--border)] opacity-50"></div>
            <div>
              <div className={`font-sans text-3xl font-black ${textColor}`}>{formatPace(store.distanceKm, elapsedSec)}</div>
              <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-wider mt-0.5`}>Avg. Pace (Min/Km)</div>
            </div>
            <div className="w-6 h-px bg-[var(--border)] opacity-50"></div>
            <div>
              <div className={`font-sans text-2xl font-black ${textColor}`}>
                {elapsedSec > 0 ? (store.distanceKm / (elapsedSec / 3600)).toFixed(1) : '0.0'}
              </div>
              <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-wider mt-0.5`}>Avg. Speed (Km/h)</div>
            </div>
            <div className="w-6 h-px bg-[var(--border)] opacity-50"></div>
            <div>
              <div className={`font-sans text-2xl font-black ${textColor}`}>{store.maxSpeedKmh.toFixed(1)}</div>
              <div className={`text-[10px] font-bold ${labelColor} uppercase tracking-wider mt-0.5`}>Max Speed (Km/h)</div>
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="relative z-10 mt-auto pb-[100px] pt-8 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent pointer-events-none flex items-center justify-center gap-12 w-full px-8">
          
          <button
            onClick={store.isPaused ? handleResume : handlePause}
            className="w-12 h-12 flex items-center justify-center text-[var(--text)] pointer-events-auto hover:scale-110 transition-transform active:scale-95"
          >
            {store.isPaused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}
          </button>
          
          <button
            onClick={handleStop}
            className="w-24 h-24 rounded-full bg-[var(--text)] text-[var(--bg)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 shadow-[0_10px_40px_rgba(0,0,0,0.3)] pointer-events-auto"
          >
            <span className="font-sans font-black tracking-widest uppercase text-sm">Finish</span>
          </button>
          
          {/* Spacer to balance the pause button */}
          <div className="w-12 h-12" />
          
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Summary Screen ───
  if (screen === 'summary' && summaryData) {
    const typeLabel = summaryData.type === 'walk' ? 'Walk' : summaryData.type === 'run' ? 'Run' : 'Cycle';
    const typeEmoji = summaryData.type === 'walk' ? '🚶' : summaryData.type === 'run' ? '🏃' : '🚴';

    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pb-24">
        {/* Celebration */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">{typeEmoji}</div>
          <h1 className="font-display text-3xl mb-1">{typeLabel} Complete!</h1>
          <p className="text-sm text-bone-dim font-mono">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
        </div>

        {/* Map */}
        {summaryData.route && summaryData.route.length > 1 && (
          <div className="mb-6 rounded-xl overflow-hidden border border-line">
            <RouteMap route={summaryData.route} height="200px" />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card p-4 text-center">
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider mb-1">Distance</div>
            <div className="font-mono text-xl font-bold">{summaryData.distanceKm?.toFixed(2)}</div>
            <div className="text-[10px] text-bone-dim">km</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider mb-1">Duration</div>
            <div className="font-mono text-xl font-bold">{formatDuration(summaryData.durationSec || 0)}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider mb-1">Calories</div>
            <div className="font-mono text-xl font-bold">{summaryData.calories}</div>
            <div className="text-[10px] text-bone-dim">kcal</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="card p-4 text-center">
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider mb-1">Avg Speed</div>
            <div className="font-mono text-xl font-bold">{summaryData.avgSpeedKmh?.toFixed(1)}</div>
            <div className="text-[10px] text-bone-dim">km/h</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider mb-1">Avg Pace</div>
            <div className="font-mono text-xl font-bold">{summaryData.avgPace?.replace(' /km', '')}</div>
            <div className="text-[10px] text-bone-dim">/km</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider mb-1">Max Speed</div>
            <div className="font-mono text-xl font-bold">{summaryData.maxSpeedKmh?.toFixed(1)}</div>
            <div className="text-[10px] text-bone-dim">km/h</div>
          </div>
        </div>

        {isSaving ? (
          <div className="text-center text-sm text-bone-dim font-mono mb-4">Saving...</div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center justify-center gap-2 bg-sienna/10 text-sienna rounded-xl py-3.5 hover:bg-sienna/20 transition-colors font-bold tracking-wider"
          >
            Share
          </button>
          <button
            onClick={handleDone}
            className="btn-primary py-3.5 text-base font-bold tracking-wider"
          >
            Done
          </button>
        </div>
        
        {showShare && summaryData && (
          <CardioShareModal
            data={{
              type: summaryData.type as any,
              date: new Date().toISOString(),
              distanceKm: summaryData.distanceKm || 0,
              durationSec: summaryData.durationSec || 0,
              calories: summaryData.calories || 0,
              avgPace: summaryData.avgPace || '0:00 /km',
              route: summaryData.route,
            }}
            onClose={() => setShowShare(false)}
          />
        )}
      </motion.div>
    );
  }

  return null;
}
