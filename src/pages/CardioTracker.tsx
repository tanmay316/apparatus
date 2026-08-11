import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Pause, Square, MapPin, Clock, Flame, TrendingUp, Mountain, Zap, Footprints, Bike, Dumbbell, Navigation, Layers, RotateCcw, ChevronRight, ChevronUp, ChevronDown, LocateFixed } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { requestNotificationPermission, showPersistentNotification, clearNotification, showNotification, cancelRemainingTodayReminders, scheduleInactivityReminders } from '@/utils/notifications';
import { requestForegroundPermissions, startWorkoutForegroundService, updateWorkoutForegroundService, stopWorkoutForegroundService, setupForegroundServiceListeners } from '@/utils/foreground-service';
import { useUIStore } from '@/stores/ui-store';
import { useCardioStore, startGpsWatch, stopGpsWatch } from '@/stores/cardio-store';
import { usePedometerStore } from '@/stores/pedometer-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { saveCardioActivity, getUserCardioActivities } from '@/services/cardio';
import { calculateCardioCalories } from '@/lib/calories';
import { startActiveSession, updateActiveSession, endActiveSession, postActivity } from '@/services/social';
import { RouteMap, MAP_THEMES, type MapThemeKey } from '@/components/cardio/RouteMap';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { updateUserChallengeProgress } from '@/services/community';
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

function formatPaceMs(paceMs: number): string {
  if (paceMs <= 0 || !isFinite(paceMs)) return '--:--';
  const secPerKm = paceMs / 1000;
  if (secPerKm > 3600) return '>60:00'; // Cap display to > 60 min/km
  const paceMin = Math.floor(secPerKm / 60);
  const paceSec = Math.floor(secPerKm % 60);
  return `${paceMin}:${String(paceSec).padStart(2, '0')}`;
}

function formatPace(distKm: number, durationSec: number): string {
  if (distKm <= 0 || durationSec <= 0) return '--:--';
  const secPerKm = durationSec / distKm;
  const paceMin = Math.floor(secPerKm / 60);
  const paceSec = Math.floor(secPerKm % 60);
  return `${paceMin}:${String(paceSec).padStart(2, '0')}`;
}

function getLiveSteps(
  type: CardioActivityType | null, 
  distKm: number, 
  pedStore: { isSessionActive: boolean, sessionSteps: number }
): number | undefined {
  if (type !== 'walk' && type !== 'run') return undefined;
  // Estimate steps based on average stride length (1m for run, 0.762m for walk)
  const estSteps = Math.round(distKm * 1000 / (type === 'run' ? 1.0 : 0.762));
  
  // If native pedometer works, use it, but fallback to distance if pedometer is heavily undercounting (e.g. background PWA suspension)
  if (pedStore.isSessionActive && pedStore.sessionSteps > estSteps * 0.2) {
    return pedStore.sessionSteps;
  }
  return estSteps;
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
  const [elapsedSec, setElapsedSec] = useState(0);

  const pedometerStore = usePedometerStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get('type') as CardioActivityType | null;

  const [screen, setScreen] = useState<'select' | 'ready' | 'tracking' | 'summary'>(() => {
    if (store.isTracking) return 'tracking';
    if (urlType) return 'ready';
    return 'select';
  });
  
  // Map layer state — default to street, persist in localStorage
  const [mapLayer, _setMapLayer] = useState<MapThemeKey>(() => {
    const saved = localStorage.getItem('apparatus_map_layer');
    return (saved as MapThemeKey) || 'street';
  });

  const setMapLayer = (layer: MapThemeKey) => {
    localStorage.setItem('apparatus_map_layer', layer);
    _setMapLayer(layer);
  };

  // Update screen based on URL params and tracking state
  useEffect(() => {
    if (urlType) {
      if (store.isTracking) {
        if (store.activityType === urlType) {
          // Returning to the same activity that's running — go straight to tracking
          setScreen('tracking');
          setSearchParams({}, { replace: true });
        } else {
          // Different activity selected — show ready screen for new type
          setScreen('ready');
        }
      } else {
        // Not tracking — show ready screen
        if (screen !== 'ready') {
          store.reset();
        }
        setScreen('ready');
      }
    } else {
      // No urlType — if not tracking and not on summary, show select screen
      if (!store.isTracking && screen !== 'summary' && screen !== 'tracking') {
        setScreen('select');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlType]);

  // Start GPS for preview on the ready screen or resume if tracking
  useEffect(() => {
    if (screen === 'ready' || (screen === 'tracking' && !store.isPaused)) {
      startGpsWatch();
    }
  }, [screen, store.isPaused]);
  const [isSaving, setIsSaving] = useState(false);
  const [summaryData, setSummaryData] = useState<Partial<CardioActivity> | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [recentActivities, setRecentActivities] = useState<CardioActivity[]>([]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // Fetch recent activities
  useEffect(() => {
    if (user && screen === 'select') {
      getUserCardioActivities(user.uid, 5).then(setRecentActivities).catch(console.error);
    }
  }, [user, screen]);

  // Timer — pauses when manually paused OR auto-paused
  useEffect(() => {
    if (!store.isTracking || !store.startedAt) return;
    const interval = setInterval(() => {
      if (!store.isPaused && store.autoPauseStatus !== 'PAUSED') {
        // Timer is frozen when paused. We only need total accumulated paused ms.
        const totalPause = store.totalPausedMs;
        const raw = Date.now() - store.startedAt! - totalPause;
        const currentSec = Math.max(0, Math.floor(raw / 1000));
        setElapsedSec(currentSec);

        // Update Foreground Service (Throttle to every 5s to prevent massive Android OS lag)
        if (currentSec % 5 === 0) {
          const st = useCardioStore.getState();
          const type = st.activityType;
          if (type) {
            const title = st.isPaused ? 'Workout Paused' : `${type === 'walk' ? 'Walking' : type === 'run' ? 'Running' : 'Cycling'} Live`;
            updateWorkoutForegroundService('cardio', title, `${formatDuration(currentSec)} • ${st.distanceKm.toFixed(2)} km`, st.isPaused);
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [store.isTracking, store.startedAt, store.isPaused, store.autoPauseStatus, store.totalPausedMs, store.autoPausedAt]);

  // Update live session periodically
  useEffect(() => {
    if (!store.isTracking || !user || !store.activityType) return;
    const interval = setInterval(() => {
      // Fetch latest state to avoid closure staleness and interval reset bugs
      const st = useCardioStore.getState();
      const currentElapsedSec = Math.floor((Date.now() - (st.startedAt || Date.now()) - st.totalPausedMs) / 1000);
      
      const cals = calculateCardioCalories(
        st.activityType!,
        st.distanceKm,
        currentElapsedSec / 60,
        userWeight || 70,
        st.currentSpeedKmh
      );
      updateActiveSession(user.uid, {
        currentExercise: `${st.distanceKm.toFixed(2)} km`,
        caloriesBurned: cals,
        steps: getLiveSteps(st.activityType, st.distanceKm, pedometerStore)
      }).catch(console.error);
    }, 10000);
    return () => clearInterval(interval);
  }, [store.isTracking, user, store.activityType, userWeight, pedometerStore.isSessionActive]);

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
    stopWorkoutForegroundService();

    if (user) {
      endActiveSession(user.uid).catch(console.error);
    }

    if (user && dist > 0.01) {
      const durationMin = durationSec / 60;
      const avgSpeedKmh = durationSec > 0 ? (dist / durationSec) * 3600 : 0;
      const calories = calculateCardioCalories(type, dist, durationMin, userWeight || 70, avgSpeedKmh);

      await saveCardioActivity(user.uid, {
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        type,
        date: localDateKey(new Date(startedAt || Date.now())),
        startedAt: startedAt ? Timestamp.fromMillis(startedAt) : Timestamp.now(),
        finishedAt: Timestamp.now(),
        durationSec,
        distanceKm: dist,
        avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
        maxSpeedKmh: Math.round(maxSpeed * 10) / 10,
        avgPace: formatPace(dist, durationSec),
        calories,
        elevationGainM: Math.round(elevation),
        route,
        visibility: 'followers',
        notes: 'Auto-saved session',
        steps: getLiveSteps(type, dist, usePedometerStore.getState()),
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
    

    if (type === 'walk' || type === 'run') {
      await pedometerStore.startSession();
    }

    // Request permission and show ongoing notification
    await requestNotificationPermission();
    await requestForegroundPermissions();
    showPersistentNotification(
      1001,
      `${type === 'walk' ? 'Walking' : type === 'run' ? 'Running' : 'Cycling'} Session Active`,
      'Apparatus is tracking your cardio session.'
    );
    
    startWorkoutForegroundService('cardio', `${type === 'walk' ? 'Walking' : type === 'run' ? 'Running' : 'Cycling'} Live`, '0:00 • 0.00 km', false);
    setupForegroundServiceListeners(
      () => {
        const st = useCardioStore.getState();
        if (st.isPaused) st.resumeTracking();
        else st.pauseTracking();
      },
      () => {
        // In a true headless setup we would save here, but for now just stop tracking.
        const st = useCardioStore.getState();
        st.pauseTracking();
        stopWorkoutForegroundService();
      }
    );
    
    store.startTracking(type);
    setScreen('tracking');
    setElapsedSec(0);

    // Clear the URL param so a refresh stays in tracking
    // Done here synchronously AFTER state updates so useEffect doesn't misfire
    setSearchParams({}, { replace: true });

    if (user) {
      startActiveSession(user.uid, {
        planId: 'cardio',
        dayId: type,
        dayTitle: type === 'walk' ? 'Walking' : type === 'run' ? 'Running' : 'Cycling',
        currentExercise: '0.00 km',
        caloriesBurned: 0,
        startedAt: Timestamp.now()
      }).catch(console.error);
    }
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
    // Clear the ongoing notification
    clearNotification(1001);
    
    if (store.activityType === 'walk') {
      pedometerStore.stopSession();
    }

    store.stopTracking();
    stopWorkoutForegroundService();

    if (user) {
      endActiveSession(user.uid).catch(console.error);
    }

    const durationSec = elapsedSec;
    const durationMin = durationSec / 60;
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
          type: store.activityType!,
          date: localDateKey(new Date()),
          startedAt: store.startedAt ? Timestamp.fromMillis(store.startedAt) : Timestamp.now(),
          finishedAt: Timestamp.now(),
          durationSec: durationSec,
          distanceKm: dist,
          avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
          maxSpeedKmh: Math.round(store.maxSpeedKmh * 10) / 10,
          avgPace: `${pace} /km`,
          calories: calories,
          elevationGainM: Math.round(store.elevationGainM),
          route: store.routePoints,
          visibility: 'followers',
          notes: '',
          steps: getLiveSteps(store.activityType, dist, usePedometerStore.getState()),
        });

        // Post to activity feed
        try {
          const typeLabel = data.type === 'walk' ? 'Walk' : data.type === 'run' ? 'Run' : 'Cycle';
          await postActivity({
            userId: user.uid,
            userName: user.displayName || 'Athlete',
            username: profile?.username || '',
            userPhoto: user.photoURL || '',
            type: data.type as any,
            workoutId: null,
            summary: `Completed a ${data.distanceKm!.toFixed(2)} km ${typeLabel} in ${formatDuration(data.durationSec!)}`,
            details: {
              activityType: data.type,
              distanceKm: data.distanceKm,
              durationSec: data.durationSec,
              calories: data.calories,
              avgPace: data.avgPace,
              avgSpeedKmh: data.avgSpeedKmh,
              maxSpeedKmh: data.maxSpeedKmh,
              elevationGainM: data.elevationGainM,
              route: data.route,
            },
            visibility: 'followers',
            likesCount: 0,
            commentsCount: 0,
          });
        } catch { /* silent */ }
        
        // Auto-update community challenges
        try {
          await updateUserChallengeProgress(user.uid, [
            { metric: 'distance', amount: data.distanceKm! },
            { metric: 'calories', amount: data.calories! },
            { metric: 'duration', amount: data.durationSec! / 60 },
            { metric: 'workouts', amount: 1 }
          ]);
        } catch (err) {
          console.error('Failed to update challenges:', err);
        }

        // Smart Background Reminders
        cancelRemainingTodayReminders().catch(() => {});
        scheduleInactivityReminders().catch(() => {});

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
        elapsedSec / 60,
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

        <div className="flex flex-col gap-3 mb-10">
          {ACTIVITY_OPTIONS.map((opt) => (
            <motion.button
              key={opt.type}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleStartActivity(opt.type)}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-white/5 border border-line hover:border-sienna/40 transition-colors text-left group shadow-sm"
            >
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${opt.color} flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform shadow-md`}>
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[17px] text-[var(--text)] tracking-tight">{opt.label}</h3>
                <p className="text-[13px] text-bone-dim">{opt.description}</p>
              </div>
              <ChevronRight size={20} className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500 transition-colors" />
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

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cardio-ready-screen fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col h-screen overflow-hidden">
        
        {/* Background Map */}
        <div className="absolute inset-0 z-0">
          {store.gpsStatus === 'active' && (
            <RouteMap route={store.routePoints} currentLocation={store.currentLocation} isLive={false} height="100%" theme={mapLayer} cardioType={store.activityType as any} />
          )}
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
              {store.gpsStatus === 'error' || store.gpsStatus === 'denied' ? (
                <><Navigation size={14} className="text-red-500" /><span className="text-xs font-bold text-[var(--text)]">{store.gpsStatus === 'denied' ? 'GPS Denied' : 'GPS Error'}</span></>
              ) : store.gpsStatus === 'active' ? (
                <><Navigation size={14} className="text-emerald-500" /><span className="text-xs font-bold text-[var(--text)]">GPS Active</span></>
              ) : store.gpsStatus === 'waiting' ? (
                <><Navigation size={14} className="text-yellow-500 animate-pulse" /><span className="text-xs font-bold text-[var(--text)]">Locating...</span></>
              ) : (
                <><Navigation size={14} className="text-gray-400" /><span className="text-xs font-bold text-[var(--text)]">GPS Ready</span></>
              )}
            </div>
            
            <button
              onClick={() => {
                const themes = Object.keys(MAP_THEMES) as MapThemeKey[];
                const nextIdx = (themes.indexOf(mapLayer) + 1) % themes.length;
                setMapLayer(themes[nextIdx]);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--card)]/80 backdrop-blur-md shadow-sm border border-[var(--border)] text-[var(--text)] pointer-events-auto transition-transform active:scale-95"
              title={MAP_THEMES[mapLayer].label}
            >
              <Layers size={18} />
            </button>
          </div>
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 flex-1 flex flex-col justify-end p-8 pb-[100px] pointer-events-none">
          <div className="pointer-events-auto text-center mb-8">
            <h1 className="cardio-ready-title font-sans text-5xl font-black tracking-tight text-[var(--text)] drop-shadow-md mb-2">{typeLabel}</h1>
            <p className="text-sm font-semibold text-[var(--muted)] tracking-widest uppercase bg-[var(--bg)]/50 backdrop-blur-sm px-4 py-1.5 rounded-full inline-block">Tap to begin</p>
          </div>
          
          <button
            onClick={handleStartTracking}
            className={`cardio-ready-start w-24 h-24 rounded-full flex items-center justify-center hover:scale-105 transition-transform active:scale-95 shadow-[0_10px_40px_rgba(0,0,0,0.3)] mx-auto pointer-events-auto ${
              isDark ? 'bg-white text-black' : 'bg-black text-white'
            }`}
          >
            <Play size={40} fill="currentColor" className="ml-1" />
          </button>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Tracking Screen ───
  if (screen === 'tracking') {
    const isDark = useUIStore.getState().theme === 'dark';
    const isDarkMap = mapLayer === 'dark' || mapLayer === 'satellite' || mapLayer === 'toner';
    
    const avgSpeed = elapsedSec > 0 ? (store.distanceKm / (elapsedSec / 3600)).toFixed(1) : '0.0';
    const currentPace = formatPaceMs(store.currentPaceMs);
    const activityType = store.activityType || 'run';
    const typeLabel = activityType === 'walk' ? 'Walk' : activityType === 'run' ? 'Run' : 'Cycle';

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[9999] bg-ink flex flex-col h-screen overflow-hidden">
        
        {/* Full Screen Map Background */}
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} currentLocation={store.currentLocation} isLive height="100%" theme={mapLayer} recenterTrigger={recenterTrigger} cardioType={store.activityType as any} />
        </div>

        {/* Top Header */}
        <div className="absolute top-6 left-4 right-4 z-20 safe-top pointer-events-none flex justify-between items-start">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button 
              onClick={() => {
                setSearchParams({});
                navigate('/');
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-ink/90 backdrop-blur-md shadow-sm border border-line text-bone pointer-events-auto transition-transform active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>

            {/* Activity Type */}
            <div className="flex items-center px-4 py-2 h-10 rounded-full bg-ink/90 backdrop-blur-md shadow-sm border border-line pointer-events-auto">
               <span className="text-sm font-bold text-bone tracking-wide">{typeLabel}</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 items-end">
            <div className="flex items-center gap-2 px-4 py-2 h-10 rounded-full bg-ink/90 backdrop-blur-md shadow-sm border border-line pointer-events-auto">
              {store.gpsStatus === 'error' || store.gpsStatus === 'denied' ? (
                <><Navigation size={14} className="text-red-500" /><span className="text-xs font-bold text-bone">{store.gpsStatus === 'denied' ? 'GPS Denied' : 'GPS Error'}</span></>
              ) : store.gpsStatus === 'active' ? (
                <>
                  <Navigation size={14} className="text-emerald-500" />
                  <span className="text-xs font-bold text-bone">GPS Active</span>
                  {/* GPS accuracy quality dot */}
                  <div className={`w-2 h-2 rounded-full ${store.gpsAccuracy > 0 && store.gpsAccuracy <= 10 ? 'bg-emerald-400' : store.gpsAccuracy <= 30 ? 'bg-yellow-400' : store.gpsAccuracy <= 80 ? 'bg-orange-400' : 'bg-red-400'}`} title={`±${Math.round(store.gpsAccuracy)}m`} />
                </>
              ) : store.gpsStatus === 'waiting' ? (
                <><Navigation size={14} className="text-yellow-500 animate-pulse" /><span className="text-xs font-bold text-bone">Locating...</span></>
              ) : (
                <><Navigation size={14} className="text-bone-dim" /><span className="text-xs font-bold text-bone">GPS Ready</span></>
              )}
            </div>
            
            {/* Layers Button */}
            <button
              onClick={() => {
                const themes = Object.keys(MAP_THEMES) as MapThemeKey[];
                const nextIdx = (themes.indexOf(mapLayer) + 1) % themes.length;
                setMapLayer(themes[nextIdx]);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-ink/90 backdrop-blur-md shadow-sm border border-line text-bone pointer-events-auto transition-transform active:scale-95"
              title={MAP_THEMES[mapLayer].label}
            >
              <Layers size={18} />
            </button>
          </div>
        </div>

        {/* Floating Actions (above the bottom sheet) */}
        <div className="absolute right-4 bottom-[200px] z-10 pointer-events-auto flex flex-col gap-3 transition-all" style={{ transform: isExpanded ? 'translateY(-240px)' : 'translateY(0)' }}>
          <button
            onClick={() => setRecenterTrigger(t => t + 1)}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-ink/90 text-blue-500 shadow-lg border border-line active:scale-95 transition-transform backdrop-blur-md"
          >
            <LocateFixed size={22} />
          </button>
        </div>

        {/* Expandable Bottom Sheet */}
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
          <motion.div 
            animate={{ height: isExpanded ? 440 : 180 }}
            className={`cardio-live-panel
              ${isDarkMap 
                ? 'bg-black/40 text-white border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_0_20px_rgba(255,255,255,0.1)]' 
                : 'bg-white/50 text-black border-t border-white/60 shadow-[0_-10px_40px_rgba(0,0,0,0.1),inset_0_2px_6px_rgba(255,255,255,0.9),inset_0_0_20px_rgba(255,255,255,0.5)]'} 
              backdrop-blur-[80px] backdrop-saturate-[200%]
              rounded-t-[24px] 
              flex flex-col overflow-hidden
            `}
          >
            {/* Drag Handle & Toggle */}
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full h-8 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <div className={`w-12 h-1.5 rounded-full ${isDarkMap ? 'bg-white/30' : 'bg-black/20'}`}></div>
            </button>

            {/* Auto-Pause Indicator */}
            {store.autoPauseStatus === 'PAUSED' && (
              <div className="flex items-center justify-center gap-2 py-1.5 bg-amber-500/20 backdrop-blur-sm border-b border-amber-500/30">
                <Pause size={12} className="text-amber-400 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 animate-pulse">Auto-Paused · Standing Still</span>
              </div>
            )}

            {/* Core Stats (Always Visible) */}
            <div className="px-6 pb-4 shrink-0" onClick={() => !isExpanded && setIsExpanded(true)}>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <div className={`text-[2.5rem] leading-none font-black tracking-tighter drop-shadow-md ${store.autoPauseStatus === 'PAUSED' ? 'opacity-50' : ''}`}>
                    {formatDuration(elapsedSec)}
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDarkMap ? 'text-white/70' : 'text-black/60'}`}>{store.autoPauseStatus === 'PAUSED' ? 'Paused' : 'Timer'}</div>
                </div>
                <div className="text-right">
                  <div className="text-[2rem] leading-none font-black tracking-tighter drop-shadow-md">
                    {store.distanceKm.toFixed(2)}
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDarkMap ? 'text-white/70' : 'text-black/60'}`}>Km</div>
                </div>
              </div>
            </div>

            {/* Expanded Stats (Only visible when expanded) */}
            <div className={`px-6 flex-1 overflow-hidden transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
              <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-6">
                <div>
                  <div className="text-2xl font-black drop-shadow-sm">{currentPace}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isDarkMap ? 'text-white/70' : 'text-black/60'}`}>Pace (min/km)</div>
                </div>
                <div>
                  <div className="text-2xl font-black drop-shadow-sm">{calories}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isDarkMap ? 'text-white/70' : 'text-black/60'}`}>Calories</div>
                </div>
                <div>
                  <div className="text-2xl font-black drop-shadow-sm">{avgSpeed}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isDarkMap ? 'text-white/70' : 'text-black/60'}`}>Avg Speed (km/h)</div>
                </div>
                <div>
                  <div className="text-2xl font-black drop-shadow-sm">{store.maxSpeedKmh.toFixed(1)}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isDarkMap ? 'text-white/70' : 'text-black/60'}`}>Max Speed</div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6 mt-4">
                <button
                  onClick={store.isPaused ? handleResume : handlePause}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-xl backdrop-blur-2xl ${isDarkMap ? 'bg-[#1a1a1a]/30 hover:bg-[#1a1a1a]/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'bg-white/40 hover:bg-white/60 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.4)]'}`}
                >
                  {store.isPaused ? <Play size={28} fill="currentColor" className="ml-1" /> : <Pause size={28} fill="currentColor" />}
                </button>
                
                <button
                  onClick={handleStop}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center hover:scale-105 transition-all shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_0_0_1px_rgba(255,255,255,0.2),0_8px_30px_rgba(239,68,68,0.6)] active:scale-95"
                >
                  <Square size={28} fill="currentColor" />
                </button>
                
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to discard this session?')) {
                      if (user) endActiveSession(user.uid).catch(console.error);
                      store.reset();
                      setSearchParams({});
                      setScreen('select');
                    }
                  }}
                  className={`w-16 h-16 flex items-center justify-center rounded-full transition-all active:scale-95 shadow-xl backdrop-blur-2xl ${isDarkMap ? 'bg-[#1a1a1a]/30 hover:bg-[#1a1a1a]/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'bg-white/40 hover:bg-white/60 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.4)]'}`}
                  title="Discard"
                >
                  <RotateCcw size={28} />
                </button>
              </div>

              {(store.activityType === 'walk' || store.activityType === 'run') && (
                <div className="cardio-steps-card card p-5 mt-4 bg-white/5 backdrop-blur border-white/10 flex items-center justify-between pointer-events-auto">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sienna/20 flex items-center justify-center text-sienna">
                      <Footprints size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[var(--text)]">Steps</div>
                      <div className="text-xs text-bone-dim">{store.activityType === 'walk' ? 'Walking' : 'Running'} Session</div>
                    </div>
                  </div>
                  <div className="font-serif text-3xl font-medium tracking-tight">
                    {getLiveSteps(store.activityType, store.distanceKm, pedometerStore)?.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
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

        {/* Glassmorphism Summary Card */}
        <div className="relative rounded-3xl overflow-hidden mb-8 shadow-2xl bg-ink-2/30 backdrop-blur-xl border border-line/50">
          
          {/* Map (if exists) */}
          {summaryData.route && summaryData.route.length > 1 && (
            <div className="h-[250px] w-full border-b border-line/30 relative">
              <RouteMap route={summaryData.route} height="100%" cardioType={summaryData.type as any} />
              <div className="absolute inset-0 pointer-events-none shadow-[inset_0_-20px_40px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_-20px_40px_rgba(0,0,0,0.5)] z-10" />
            </div>
          )}

          <div className="p-6">
            {/* Main Stats: Distance and Duration */}
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="text-[10px] text-sienna font-mono uppercase tracking-widest mb-1 font-bold">Distance</div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-5xl md:text-6xl tracking-tight leading-none">{summaryData.distanceKm?.toFixed(2)}</span>
                  <span className="font-mono text-bone-dim text-sm mb-1">km</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-amber font-mono uppercase tracking-widest mb-1 font-bold">Time</div>
                <div className="font-mono text-3xl font-light tracking-tight">{formatDuration(summaryData.durationSec || 0)}</div>
              </div>
            </div>

            {/* Secondary Stats Grid */}
            <div className="grid grid-cols-4 gap-2 pt-6 border-t border-line/30 text-center md:text-left">
              <div>
                <div className="text-[9px] text-bone-dim font-mono uppercase tracking-wider mb-1">Calories</div>
                <div className="font-mono text-base font-medium">{summaryData.calories}</div>
              </div>
              <div>
                <div className="text-[9px] text-bone-dim font-mono uppercase tracking-wider mb-1">Avg Pace</div>
                <div className="font-mono text-base font-medium">{summaryData.avgPace?.replace(' /km', '')}</div>
              </div>
              <div>
                <div className="text-[9px] text-bone-dim font-mono uppercase tracking-wider mb-1">Avg Spd</div>
                <div className="font-mono text-base font-medium">{summaryData.avgSpeedKmh?.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-[9px] text-bone-dim font-mono uppercase tracking-wider mb-1">Max Spd</div>
                <div className="font-mono text-base font-medium">{summaryData.maxSpeedKmh?.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>

        {isSaving ? (
          <div className="text-center text-sm text-bone-dim font-mono mb-4">Saving...</div>
        ) : null}

        <div className="flex flex-col gap-3 mt-4">
          <button
            onClick={handleDone}
            className="w-full bg-sienna text-white py-4 rounded-2xl font-bold text-lg shadow-[0_4px_14px_0_rgba(235,89,60,0.39)] hover:shadow-[0_6px_20px_rgba(235,89,60,0.23)] transition-all active:scale-[0.98]"
          >
            Finish Workout
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="w-full bg-ink-2/30 backdrop-blur-md border border-line text-bone py-4 rounded-2xl font-bold text-lg hover:bg-ink-3 transition-all active:scale-[0.98]"
          >
            Share Activity
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
              avgSpeedKmh: summaryData.avgSpeedKmh || 0,
              maxSpeedKmh: summaryData.maxSpeedKmh || 0,
              elevationGainM: summaryData.elevationGainM || 0,
              route: summaryData.route,
              currentLocation: store.currentLocation,
            }}
            mapTheme={mapLayer}
            onClose={() => setShowShare(false)}
          />
        )}
      </motion.div>
    );
  }

  return null;
}
