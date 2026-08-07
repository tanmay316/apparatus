import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Pause, Square, MapPin, Clock, Flame, TrendingUp, Mountain, Zap, Footprints, Bike, Dumbbell, Navigation } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { saveCardioActivity, getUserCardioActivities } from '@/services/cardio';
import { postActivity } from '@/services/social';
import { calculateCardioCalories } from '@/lib/calories';
import { RouteMap } from '@/components/cardio/RouteMap';
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

  const [screen, setScreen] = useState<'select' | 'tracking' | 'summary'>(() => {
    return store.isTracking ? 'tracking' : 'select';
  });
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [summaryData, setSummaryData] = useState<Partial<CardioActivity> | null>(null);
  const [recentActivities, setRecentActivities] = useState<CardioActivity[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

  // Wake lock
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch { /* silent */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // GPS watcher
  const startGpsWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        store.addPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude ?? undefined,
          speed: pos.coords.speed ?? undefined,
          ts: Date.now(),
        });
      },
      (err) => {
        setGpsError(err.message || 'GPS error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );
  }, [store]);

  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopGpsWatch();
      releaseWakeLock();
    };
  }, [stopGpsWatch, releaseWakeLock]);

  // Resume GPS if returning to a tracking session
  useEffect(() => {
    if (store.isTracking && !store.isPaused && watchIdRef.current === null) {
      startGpsWatch();
      requestWakeLock();
    }
  }, [store.isTracking, store.isPaused, startGpsWatch, requestWakeLock]);

  const handleStartActivity = (type: CardioActivityType | 'workout') => {
    if (type === 'workout') {
      navigate('/plans');
      return;
    }
    store.startTracking(type);
    startGpsWatch();
    requestWakeLock();
    setScreen('tracking');
    setElapsedSec(0);
  };

  const handlePause = () => {
    store.pauseTracking();
    stopGpsWatch();
  };

  const handleResume = () => {
    store.resumeTracking();
    startGpsWatch();
  };

  const handleStop = async () => {
    stopGpsWatch();
    releaseWakeLock();
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

  // ─── Tracking Screen ───
  if (screen === 'tracking') {
    const typeLabel = store.activityType === 'walk' ? 'Walking' : store.activityType === 'run' ? 'Running' : 'Cycling';
    const typeEmoji = store.activityType === 'walk' ? '🚶' : store.activityType === 'run' ? '🏃' : '🚴';

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{typeEmoji}</span>
            <div>
              <h1 className="font-display text-xl">{typeLabel}</h1>
              {store.isPaused && <span className="text-xs text-amber font-mono animate-pulse">PAUSED</span>}
            </div>
          </div>
          {gpsError && (
            <div className="text-xs text-danger font-mono flex items-center gap-1">
              <Navigation size={12} /> GPS Error
            </div>
          )}
        </div>

        {/* Map */}
        <div className="mb-4 rounded-xl overflow-hidden border border-line">
          <RouteMap route={store.routePoints} isLive height="250px" />
        </div>

        {/* Big Timer */}
        <div className="text-center mb-6">
          <div className="font-mono text-5xl font-bold text-bone tracking-wider">
            {formatDuration(elapsedSec)}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="card p-4 text-center">
            <MapPin size={16} className="mx-auto text-sienna mb-1" />
            <div className="font-mono text-2xl font-bold">{store.distanceKm.toFixed(2)}</div>
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider">KM</div>
          </div>
          <div className="card p-4 text-center">
            <TrendingUp size={16} className="mx-auto text-sienna mb-1" />
            <div className="font-mono text-2xl font-bold">{store.currentSpeedKmh.toFixed(1)}</div>
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider">KM/H</div>
          </div>
          <div className="card p-4 text-center">
            <Clock size={16} className="mx-auto text-sienna mb-1" />
            <div className="font-mono text-2xl font-bold">{formatPace(store.distanceKm, elapsedSec)}</div>
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider">PACE /KM</div>
          </div>
          <div className="card p-4 text-center">
            <Flame size={16} className="mx-auto text-sienna mb-1" />
            <div className="font-mono text-2xl font-bold">{calories}</div>
            <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider">KCAL</div>
          </div>
          {store.elevationGainM > 0 && (
            <div className="card p-4 text-center col-span-2">
              <Mountain size={16} className="mx-auto text-sienna mb-1" />
              <div className="font-mono text-2xl font-bold">{Math.round(store.elevationGainM)}</div>
              <div className="text-[10px] text-bone-dim font-mono uppercase tracking-wider">ELEVATION (M)</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {store.isPaused ? (
            <>
              <button
                onClick={handleResume}
                className="w-16 h-16 rounded-full bg-sienna text-bone flex items-center justify-center hover:bg-sienna/90 transition-colors shadow-lg"
              >
                <Play size={28} fill="currentColor" />
              </button>
              <button
                onClick={handleStop}
                className="w-16 h-16 rounded-full bg-danger text-bone flex items-center justify-center hover:bg-danger/90 transition-colors shadow-lg"
              >
                <Square size={24} fill="currentColor" />
              </button>
            </>
          ) : (
            <button
              onClick={handlePause}
              className="w-20 h-20 rounded-full bg-amber text-ink flex items-center justify-center hover:bg-amber/90 transition-colors shadow-lg"
            >
              <Pause size={32} fill="currentColor" />
            </button>
          )}
        </div>
      </motion.div>
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

        <button
          onClick={handleDone}
          className="btn-primary w-full py-3.5 text-base font-bold tracking-wider"
        >
          Done
        </button>
      </motion.div>
    );
  }

  return null;
}
