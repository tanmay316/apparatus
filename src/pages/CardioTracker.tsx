import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Play, Pause, Square, MapPin, Clock, Flame, TrendingUp, 
  Mountain, Zap, Footprints, Bike, Dumbbell, Navigation, Layers, 
  RotateCcw, ChevronRight, ChevronUp, ChevronDown, LocateFixed, 
  Compass, Loader2, Trophy, Sparkles, Share2, Check, Activity, Award
} from 'lucide-react';
import { useCompassHeading } from '@/hooks/useCompassHeading';
import { Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { requestNotificationPermission } from '@/utils/notifications';
import { 
  requestForegroundPermissions, startWorkoutForegroundService, 
  updateWorkoutForegroundService, stopWorkoutForegroundService, 
  setupForegroundServiceListeners 
} from '@/utils/foreground-service';
import { useUIStore } from '@/stores/ui-store';
import { useCardioStore, startGpsWatch, stopGpsWatch, finishTracking } from '@/stores/cardio-store';
import { usePedometerStore } from '@/stores/pedometer-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { saveCardioActivity, getUserCardioActivities } from '@/services/cardio';
import { calculateCardioCalories } from '@/lib/calories';
import { startActiveSession, endActiveSession, postActivity } from '@/services/social';
import { RouteMap, MAP_THEMES, type MapThemeKey } from '@/components/cardio/RouteMap';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { updateUserChallengeProgress } from '@/services/community';
import { calculateCorrectedElevation } from '@/services/elevation-service';
import { NativeWorkoutLocation } from '@/utils/native-workout-location';
import { Capacitor } from '@capacitor/core';
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
  if (secPerKm > 3600) return '>60:00';
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

function getCardioNotificationContent(st: ReturnType<typeof useCardioStore.getState>, elapsed: number) {
  const typeLabel = st.activityType === 'walk' ? 'Walking' : st.activityType === 'run' ? 'Running' : 'Cycling';
  const isPaused = st.isPaused || st.autoPauseStatus === 'PAUSED';
  const title = isPaused 
    ? (st.autoPauseStatus === 'PAUSED' ? `${typeLabel} • Auto-Paused` : `${typeLabel} • Paused`) 
    : `Apparatus • ${typeLabel}`;
  
  const paceStr = st.activityType === 'cycle'
    ? `${st.currentSpeedKmh.toFixed(1)} km/h`
    : (st.currentPaceMs > 0 ? `${formatPaceMs(st.currentPaceMs)} /km` : `${formatPace(st.distanceKm, elapsed)} /km`);

  const body = `${formatDuration(elapsed)}  •  ${st.distanceKm.toFixed(2)} km  •  ${paceStr}`;
  return { title, body, isPaused };
}

function getLiveSteps(
  type: CardioActivityType | null, 
  distKm: number, 
  pedStore: { isSessionActive: boolean, sessionSteps: number, stepSource: string }
): number | undefined {
  if (type !== 'walk' && type !== 'run') return undefined;
  
  if (pedStore.isSessionActive && (pedStore.stepSource === 'native' || pedStore.stepSource === 'motion_estimate') && pedStore.sessionSteps > 0) {
    return pedStore.sessionSteps;
  }
  
  const estSteps = Math.round(distKm * 1000 / (type === 'run' ? 1.0 : 0.762));
  return estSteps;
}

const ACTIVITY_OPTIONS: { type: CardioActivityType | 'workout'; label: string; tag: string; icon: React.ReactNode; color: string; bgGradient: string; description: string }[] = [
  { 
    type: 'workout' as any, 
    label: 'Strength Workout', 
    tag: 'GYM & REPS',
    icon: <Dumbbell size={28} />, 
    color: 'from-orange-500 to-amber-500', 
    bgGradient: 'from-orange-500/10 via-amber-500/5 to-transparent',
    description: 'Weight training, routines and logged sets' 
  },
  { 
    type: 'walk', 
    label: 'Outdoor Walk', 
    tag: 'STEPS & GPS',
    icon: <Footprints size={28} />, 
    color: 'from-emerald-500 to-teal-500', 
    bgGradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
    description: 'Track steps, pace and scenic walking route' 
  },
  { 
    type: 'run', 
    label: 'Running Session', 
    tag: 'TEMPO & DISTANCE',
    icon: <Zap size={28} />, 
    color: 'from-cyan-500 to-blue-600', 
    bgGradient: 'from-cyan-500/10 via-blue-600/5 to-transparent',
    description: 'Live pace, interval splits and GPS track' 
  },
  { 
    type: 'cycle', 
    label: 'Cycling & Ride', 
    tag: 'SPEED & ELEVATION',
    icon: <Bike size={28} />, 
    color: 'from-purple-500 to-rose-500', 
    bgGradient: 'from-purple-500/10 via-rose-500/5 to-transparent',
    description: 'Speedometer, max speed and elevation gain' 
  },
];

const EFFORT_LEVELS = [
  { id: 'easy', emoji: '😴', label: 'Easy', color: 'text-emerald-400' },
  { id: 'moderate', emoji: '😊', label: 'Moderate', color: 'text-cyan-400' },
  { id: 'hard', emoji: '😅', label: 'Hard', color: 'text-amber-400' },
  { id: 'brutal', emoji: '🥵', label: 'Brutal', color: 'text-orange-500' },
  { id: 'max_effort', emoji: '💀', label: 'Max Effort', color: 'text-rose-500' },
];

export function CardioTracker() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { showToast, theme } = useUIStore();
  const userWeight = useUserWeight();
  const store = useCardioStore();
  const [elapsedSec, setElapsedSec] = useState(0);
  const processingRef = useRef(false); // Guard against double-clicks during recovery

  const themeStyles = theme === 'dark' ? {
    '--bg': '#090605',
    '--card': '#1a100d',
    '--border': '#42241b',
    '--text': '#fff3eb',
    '--muted': '#c4a696',
    '--teal': '#d7b29d',
    '--amber': '#d9a441',
    '--sienna': '#eb593c',
  } as React.CSSProperties : {
    '--bg': '#f7f8fb',
    '--card': '#ffffff',
    '--border': '#e5e7eb',
    '--text': '#111827',
    '--muted': '#6b7280',
    '--teal': '#2f7a6d',
    '--amber': '#c98a1f',
    '--sienna': '#d9532f',
  } as React.CSSProperties;

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

  // Keep a ref to handleStop for foreground service button listeners
  const handleStopRef = useRef<() => Promise<void>>();

  // Update screen based on URL params and tracking state
  useEffect(() => {
    if (urlType) {
      if (store.isTracking) {
        if (store.activityType === urlType) {
          setScreen('tracking');
          setSearchParams({}, { replace: true });
        } else {
          setScreen('ready');
        }
      } else {
        if (screen !== 'ready') {
          store.reset();
        }
        setScreen('ready');
      }
    } else {
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
    // Check if there is an active native session to hydrate immediately
    store.syncWithNativeSession().then(hasActive => {
      if (hasActive) {
        setScreen('tracking');
      }
    });
  }, [screen, store.isPaused]);

  const [isSaving, setIsSaving] = useState(false);
  const [summaryData, setSummaryData] = useState<Partial<CardioActivity> | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [shareDataOverride, setShareDataOverride] = useState<CardioShareData | null>(null);
  const [recentActivities, setRecentActivities] = useState<CardioActivity[]>([]);
  const [workoutEffort, setWorkoutEffort] = useState<string>('moderate');
  const [workoutNotes, setWorkoutNotes] = useState<string>('');

  const [isExpanded, setIsExpanded] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const { heading, requestPermission, visualHeadingRef } = useCompassHeading({
    movementBearing: store.currentLocation?.heading,
    speedKmh: store.currentSpeedKmh
  });
  const [mapRotationMode, setMapRotationMode] = useState(false);

  const toggleMapRotation = async () => {
    if (!mapRotationMode) {
      const granted = await requestPermission();
      if (granted) setMapRotationMode(true);
    } else {
      setMapRotationMode(false);
    }
  };

  // Fetch recent activities
  useEffect(() => {
    if (user && (screen === 'select' || screen === 'summary')) {
      getUserCardioActivities(user.uid, 6).then(setRecentActivities).catch(console.error);
    }
  }, [user, screen]);

  // Weekly Stats Calculation
  const weeklyStats = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const pastWeek = recentActivities.filter(a => {
      const ts = a.startedAt?.toDate ? a.startedAt.toDate().getTime() : new Date(a.date).getTime();
      return ts >= oneWeekAgo;
    });

    const totalKm = pastWeek.reduce((acc, curr) => acc + (curr.distanceKm || 0), 0);
    const totalTimeSec = pastWeek.reduce((acc, curr) => acc + (curr.durationSec || 0), 0);
    const totalCalories = pastWeek.reduce((acc, curr) => acc + (curr.calories || 0), 0);

    return {
      totalKm: totalKm.toFixed(1),
      totalSessions: pastWeek.length,
      totalHours: (totalTimeSec / 3600).toFixed(1),
      totalCalories,
    };
  }, [recentActivities]);

  // Timer — pauses when manually paused OR auto-paused
  useEffect(() => {
    if (!store.isTracking || !store.startedAt) return;
    const interval = setInterval(() => {
      if (!store.isPaused && store.autoPauseStatus !== 'PAUSED') {
        const totalPause = store.totalPausedMs;
        const raw = Date.now() - store.startedAt! - totalPause;
        const currentSec = Math.max(0, Math.floor(raw / 1000));
        setElapsedSec(currentSec);

        // Update Foreground Service with live Strava-style stats every 3s
        if (currentSec % 3 === 0) {
          const st = useCardioStore.getState();
          if (st.activityType) {
            const { title, body, isPaused } = getCardioNotificationContent(st, currentSec);
            updateWorkoutForegroundService('cardio', title, body, isPaused);
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [store.isTracking, store.startedAt, store.isPaused, store.autoPauseStatus, store.totalPausedMs, store.autoPausedAt]);

  const handleBackgroundSave = async () => {
    if (!store.isTracking || !store.activityType) return;
    const finalStore = await finishTracking();
    const startedAt = finalStore.startedAt;
    const durationSec = startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt - finalStore.totalPausedMs) / 1000))
      : elapsedSec;
    const dist = finalStore.distanceKm;
    const type = finalStore.activityType;
    if (!type) return;
    const route = finalStore.routePoints;
    const elevation = finalStore.elevationGainM;
    const maxSpeed = finalStore.maxSpeedKmh;
    stopWorkoutForegroundService('cardio');

    if (user) {
      endActiveSession(user.uid).catch(console.error);
    }

    if (user && dist > 0.01) {
      const durationMin = durationSec / 60;
      const movingDurationSec = durationSec;
      const elapsedDurationSec = Math.max(0, Math.floor((Date.now() - startedAt!) / 1000));
      const pausedDurationSec = Math.floor(finalStore.totalPausedMs / 1000);
      const avgSpeedKmh = movingDurationSec > 0 ? (dist / movingDurationSec) * 3600 : 0;
      const calories = calculateCardioCalories(type, dist, durationMin, userWeight || 70, avgSpeedKmh);

      await saveCardioActivity(user.uid, {
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        type,
        date: localDateKey(new Date(startedAt || Date.now())),
        startedAt: startedAt ? Timestamp.fromMillis(startedAt) : Timestamp.now(),
        finishedAt: Timestamp.now(),
        durationSec: movingDurationSec,
        movingDurationSec,
        elapsedDurationSec,
        pausedDurationSec,
        distanceKm: dist,
        avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
        maxSpeedKmh: Math.round(Math.max(maxSpeed, avgSpeedKmh) * 10) / 10,
        avgPace: formatPace(dist, durationSec),
        calories,
        elevationGainM: Math.round(elevation),
        route,
        visibility: 'followers',
        notes: 'Auto-saved session',
        steps: getLiveSteps(type, dist, usePedometerStore.getState()),
        stepSource: usePedometerStore.getState().stepSource,
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

    await requestNotificationPermission();
    await requestForegroundPermissions();
    if (Capacitor.isNativePlatform()) {
      NativeWorkoutLocation.requestBatteryOptimizationExemption().catch(() => {});
    }
    
    const initialContent = getCardioNotificationContent(store, 0);
    startWorkoutForegroundService('cardio', initialContent.title, initialContent.body, false);
    
    setupForegroundServiceListeners(
      () => {
        const st = useCardioStore.getState();
        if (st.isPaused) {
          st.resumeTracking();
        } else {
          st.pauseTracking();
        }
        const next = useCardioStore.getState();
        const elapsed = next.startedAt
          ? Math.max(0, Math.floor((Date.now() - next.startedAt - next.totalPausedMs) / 1000))
          : 0;
        const { title, body, isPaused } = getCardioNotificationContent(next, elapsed);
        updateWorkoutForegroundService('cardio', title, body, isPaused);
      },
      () => {
        handleStopRef.current?.();
      }
    );
    
    store.startTracking(type);
    setScreen('tracking');
    setElapsedSec(0);

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
    setSearchParams({ type });
  };

  const handlePause = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    store.pauseTracking();
    const st = useCardioStore.getState();
    const elapsed = st.startedAt ? Math.max(0, Math.floor((Date.now() - st.startedAt - st.totalPausedMs) / 1000)) : elapsedSec;
    const { title, body } = getCardioNotificationContent(st, elapsed);
    updateWorkoutForegroundService('cardio', title, body, true);
    processingRef.current = false;
  };

  const handleResume = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    store.resumeTracking();
    const st = useCardioStore.getState();
    const elapsed = st.startedAt ? Math.max(0, Math.floor((Date.now() - st.startedAt - st.totalPausedMs) / 1000)) : elapsedSec;
    const { title, body } = getCardioNotificationContent(st, elapsed);
    updateWorkoutForegroundService('cardio', title, body, false);
    processingRef.current = false;
  };

  const handleStop = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
    if (store.activityType === 'walk' || store.activityType === 'run') {
      await pedometerStore.stopSession();
    }

    const finalStore = await finishTracking();
    stopWorkoutForegroundService('cardio');

    if (user) {
      endActiveSession(user.uid).catch(console.error);
    }

    const movingDurationSec = finalStore.startedAt
      ? Math.max(0, Math.floor((Date.now() - finalStore.startedAt - finalStore.totalPausedMs) / 1000))
      : elapsedSec;
    const elapsedDurationSec = Math.max(0, Math.floor((Date.now() - (finalStore.startedAt || Date.now())) / 1000));
    const pausedDurationSec = Math.floor(finalStore.totalPausedMs / 1000);
    const durationMin = movingDurationSec / 60;
    const dist = finalStore.distanceKm;
    const avgSpeed = movingDurationSec > 0 ? (dist / movingDurationSec) * 3600 : 0;
    const pace = formatPace(dist, movingDurationSec);
    const calories = calculateCardioCalories(
      finalStore.activityType!,
      dist,
      durationMin,
      userWeight || 70,
      avgSpeed
    );

    const steps = getLiveSteps(finalStore.activityType!, dist, pedometerStore);

    // Compute DEM-corrected elevation gain from full route points
    let finalElevationGain = Math.round(finalStore.elevationGainM);
    if (finalStore.routePoints && finalStore.routePoints.length > 2) {
      try {
        const demResult = await calculateCorrectedElevation(finalStore.routePoints);
        if (demResult.correctedElevationGainM > 0) {
          finalElevationGain = demResult.correctedElevationGainM;
        }
      } catch (err) {
        console.warn('DEM elevation calculation fallback to GPS:', err);
      }
    }

    const data: Partial<CardioActivity> = {
      type: finalStore.activityType!,
      distanceKm: dist,
      durationSec: movingDurationSec,
      movingDurationSec,
      elapsedDurationSec,
      pausedDurationSec,
      avgPace: pace,
      avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
      maxSpeedKmh: Math.round(Math.max(finalStore.maxSpeedKmh, avgSpeed) * 10) / 10,
      calories,
      elevationGainM: finalElevationGain,
      route: finalStore.routePoints,
      steps,
    };

    setSummaryData(data);
    setScreen('summary');

    // Auto-save to Firestore
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
          durationSec: movingDurationSec,
          movingDurationSec,
          elapsedDurationSec,
          pausedDurationSec,
          distanceKm: dist,
          avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
          maxSpeedKmh: Math.round(Math.max(store.maxSpeedKmh, avgSpeed) * 10) / 10,
          avgPace: `${pace} /km`,
          calories: calories,
          elevationGainM: finalElevationGain,
          route: finalStore.routePoints,
          visibility: 'followers',
          notes: workoutNotes || `Effort: ${workoutEffort}`,
          steps: steps,
          stepSource: usePedometerStore.getState().stepSource,
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

        showToast('Workout saved to logbook!');
      } catch (err) {
        console.error('Failed to save activity:', err);
        showToast('Failed to save activity', 'error');
      } finally {
        setIsSaving(false);
      }
    }
    } finally {
      processingRef.current = false;
    }
  };

  const handleDiscard = async () => {
    if (processingRef.current) return;
    if (window.confirm('Are you sure you want to discard this cardio session?')) {
      processingRef.current = true;
      try {
      if (user) endActiveSession(user.uid).catch(console.error);
      stopWorkoutForegroundService('cardio');
      await stopGpsWatch();
      if (store.activityType === 'walk' || store.activityType === 'run') {
        await pedometerStore.stopSession();
      }
      store.reset();
      setSearchParams({});
      setScreen('select');
      } finally {
        processingRef.current = false;
      }
    }
  };

  // Assign the stop handler ref
  handleStopRef.current = handleStop;

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

  // ─── Screen 1: Select Screen ───
  if (screen === 'select') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-28 max-w-3xl mx-auto px-4 pt-6 md:pt-10" style={themeStyles}>
        {/* Header Bar */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-2xl bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)] transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="font-mono text-sienna text-[10px] tracking-widest font-bold uppercase flex items-center gap-1.5">
                <Activity size={12} /> Outdoor & Gym
              </div>
              <h1 className="font-display text-3xl md:text-4xl text-[var(--text)] leading-none tracking-tight mt-0.5">
                Activity Hub
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-mono text-xs font-bold">
            <Navigation size={12} /> GPS Ready
          </div>
        </div>

        {/* Weekly Stats Glance */}
        <div className="p-4 rounded-3xl bg-[var(--card)]/80 backdrop-blur-xl border border-[var(--border)] mb-8 shadow-sm">
          <div className="text-[10px] font-mono font-bold uppercase text-[var(--muted)] tracking-wider mb-3 flex items-center gap-1.5">
            <Award size={13} className="text-amber-500" /> Past 7 Days Performance
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)]/60">
              <div className="font-mono text-2xl font-black text-[var(--text)]">{weeklyStats.totalKm} <span className="text-xs font-normal text-[var(--muted)]">km</span></div>
              <div className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase mt-0.5">Distance</div>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)]/60">
              <div className="font-mono text-2xl font-black text-[var(--text)]">{weeklyStats.totalCalories} <span className="text-xs font-normal text-[var(--muted)]">kcal</span></div>
              <div className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase mt-0.5">Calories</div>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--bg)]/60 border border-[var(--border)]/60">
              <div className="font-mono text-2xl font-black text-[var(--text)]">{weeklyStats.totalSessions}</div>
              <div className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase mt-0.5">Workouts</div>
            </div>
          </div>
        </div>

        {/* Activity Selection Cards */}
        <div className="mb-4 text-xs font-mono font-bold uppercase text-[var(--muted)] tracking-wider">
          Choose Workout Mode
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {ACTIVITY_OPTIONS.map((opt) => (
            <motion.button
              key={opt.type}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleStartActivity(opt.type)}
              className={`relative overflow-hidden flex flex-col gap-3.5 p-5 rounded-[2rem] bg-gradient-to-br ${opt.bgGradient} bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] hover:border-sienna/50 transition-all text-left group shadow-lg shadow-black/5`}
            >
              <div className="flex items-center justify-between w-full">
                <div className={`w-13 h-13 p-3 rounded-2xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-white shrink-0 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-300 shadow-md`}>
                  {opt.icon}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] uppercase">
                    {opt.tag}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-[var(--border)]/60 flex items-center justify-center text-[var(--text)] group-hover:bg-sienna group-hover:text-white transition-colors">
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0 mt-1">
                <h3 className="font-bold text-xl text-[var(--text)] tracking-tight mb-1">{opt.label}</h3>
                <p className="text-[12px] text-[var(--muted)] leading-relaxed">{opt.description}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Recent Activities List */}
        {recentActivities.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-[var(--text)]">Recent Cardio History</h2>
              <span className="text-xs font-mono text-[var(--muted)]">{recentActivities.length} logged</span>
            </div>

            <div className="space-y-3">
              {recentActivities.map((act) => {
                const typeLabel = act.type === 'walk' ? 'Walk' : act.type === 'run' ? 'Run' : 'Ride';
                const typeIcon = act.type === 'walk' ? <Footprints size={16} className="text-emerald-500" /> : act.type === 'run' ? <Zap size={16} className="text-cyan-500" /> : <Bike size={16} className="text-purple-500" />;
                
                return (
                  <div 
                    key={act.id} 
                    className="p-4 rounded-2xl bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] flex items-center justify-between shadow-sm hover:border-sienna/40 transition-all"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center shrink-0">
                        {typeIcon}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[var(--text)] flex items-center gap-2">
                          <span>{typeLabel}</span>
                          <span className="font-mono text-xs font-normal text-[var(--muted)]">· {act.distanceKm.toFixed(2)} km</span>
                        </div>
                        <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                          {formatDuration(act.durationSec)} · {act.avgPace} · {act.calories} kcal
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShareDataOverride({
                            type: act.type as any,
                            date: act.date,
                            distanceKm: act.distanceKm,
                            durationSec: act.durationSec,
                            calories: act.calories,
                            avgPace: act.avgPace,
                            avgSpeedKmh: act.avgSpeedKmh,
                            maxSpeedKmh: act.maxSpeedKmh,
                            elevationGainM: act.elevationGainM,
                            route: act.route,
                            steps: act.steps,
                          });
                          setShowShare(true);
                        }}
                        className="p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-sienna hover:border-sienna/50 transition-colors shadow-sm"
                        title="Share Activity Card"
                      >
                        <Share2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Global Share Modal */}
        {showShare && (shareDataOverride || summaryData) && (
          <CardioShareModal
            data={shareDataOverride || {
              type: summaryData?.type as any,
              date: new Date().toISOString(),
              distanceKm: summaryData?.distanceKm || 0,
              durationSec: summaryData?.durationSec || 0,
              calories: summaryData?.calories || 0,
              avgPace: summaryData?.avgPace || '0:00 /km',
              avgSpeedKmh: summaryData?.avgSpeedKmh || 0,
              maxSpeedKmh: summaryData?.maxSpeedKmh || 0,
              elevationGainM: summaryData?.elevationGainM || 0,
              route: summaryData?.route,
              currentLocation: store.currentLocation,
              steps: summaryData?.steps,
            }}
            mapTheme={mapLayer}
            onClose={() => {
              setShowShare(false);
              setShareDataOverride(null);
            }}
          />
        )}
      </motion.div>
    );
  }

  // ─── Screen 2: Ready Screen ───
  if (screen === 'ready' && urlType) {
    const typeLabel = urlType === 'walk' ? 'Walking' : urlType === 'run' ? 'Running' : 'Cycling';
    const typeIcon = urlType === 'walk' ? <Footprints size={32} /> : urlType === 'run' ? <Zap size={32} /> : <Bike size={32} />;

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cardio-ready-screen fixed inset-0 z-[9999] bg-[#090605] flex flex-col h-screen overflow-hidden" style={themeStyles}>
        
        {/* Background Live Map */}
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} currentLocation={store.currentLocation} isLive={false} height="100%" theme={mapLayer} cardioType={store.activityType as any} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090605] via-[#090605]/40 to-transparent z-[1]" />
        </div>

        {/* Top Header Overlay */}
        <div className="relative z-10 flex items-start justify-between p-6 safe-top pointer-events-none">
          <button 
            onClick={() => { setSearchParams({}); setScreen('select'); }}
            className="w-11 h-11 flex items-center justify-center rounded-2xl bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] text-white pointer-events-auto transition-transform active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] pointer-events-auto">
              {store.gpsStatus === 'error' || store.gpsStatus === 'denied' ? (
                <><Navigation size={14} className="text-red-500" /><span className="text-xs font-bold text-white">{store.gpsStatus === 'denied' ? 'GPS Denied' : 'GPS Error'}</span></>
              ) : store.gpsStatus === 'waiting' || store.gpsStatus === 'warming_up' ? (
                <><Loader2 size={14} className="animate-spin text-amber-500" /><span className="text-xs font-bold text-white">Acquiring GPS...</span></>
              ) : store.gpsStatus === 'degraded' ? (
                <><Navigation size={14} className="text-amber-500" /><span className="text-xs font-bold text-white">Poor Signal (±{Math.round(store.gpsAccuracy)}m)</span></>
              ) : (
                <>
                  <Navigation size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white">GPS Locked</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </>
              )}
            </div>
            
            <button
              onClick={() => {
                const themes = Object.keys(MAP_THEMES) as MapThemeKey[];
                const nextIdx = (themes.indexOf(mapLayer) + 1) % themes.length;
                setMapLayer(themes[nextIdx]);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] text-white pointer-events-auto transition-transform active:scale-95"
              title={MAP_THEMES[mapLayer].label}
            >
              <Layers size={18} />
            </button>
          </div>
        </div>

        {/* Content HUD Overlay */}
        <div className="relative z-10 flex-1 flex flex-col justify-end p-8 pb-16 pointer-events-none">
          <div className="pointer-events-auto text-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-sienna to-amber-500 text-white flex items-center justify-center mx-auto mb-3 shadow-[0_10px_30px_rgba(235,89,60,0.4)]">
              {typeIcon}
            </div>
            <h1 className="font-sans text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md mb-2">
              {typeLabel} Ready
            </h1>
            <p className="text-xs font-mono font-bold text-white/70 tracking-widest uppercase bg-black/60 px-4 py-1.5 rounded-full inline-block backdrop-blur-md border border-white/10">
              High Precision GPS Active · Tap Play
            </p>
          </div>
          
          {/* Big Pulsing Start Button */}
          <div className="relative flex items-center justify-center mx-auto pointer-events-auto">
            <div className="absolute w-32 h-32 rounded-full bg-sienna/25 animate-ping" />
            <div className="absolute w-28 h-28 rounded-full bg-amber-500/20 animate-pulse" />
            
            <button
              onClick={handleStartTracking}
              className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-sienna via-amber-500 to-rose-500 text-white flex items-center justify-center shadow-[0_12px_40px_rgba(235,89,60,0.6)] hover:scale-105 transition-all active:scale-95 z-10 group"
            >
              <Play size={42} fill="currentColor" className="ml-1.5 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Screen 3: Tracking Screen ───
  if (screen === 'tracking') {
    const avgSpeed = elapsedSec > 0 ? (store.distanceKm / (elapsedSec / 3600)).toFixed(1) : '0.0';
    const currentPace = formatPaceMs(store.currentPaceMs);
    const activityType = store.activityType || 'run';
    const typeLabel = activityType === 'walk' ? 'Walk' : activityType === 'run' ? 'Run' : 'Cycle';

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[9999] bg-[#090605] flex flex-col h-screen overflow-hidden" style={themeStyles}>
        
        {/* Full Screen Map Background */}
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} currentLocation={store.currentLocation} isLive height="100%" theme={mapLayer} recenterTrigger={recenterTrigger} cardioType={store.activityType as any} heading={heading} mapRotationMode={mapRotationMode} visualHeadingRef={visualHeadingRef} />
        </div>

        {/* Recovery Overlay — shows when replaying native buffer after background */}
        <AnimatePresence>
          {store.isRecovering && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-[#090605]/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 pointer-events-none"
            >
              <Loader2 size={40} className="animate-spin text-amber-500" />
              <div className="text-white font-bold text-lg">Recovering GPS data...</div>
              <div className="text-white/60 text-sm font-mono">Syncing background tracking</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Header */}
        <div className="absolute top-6 left-4 right-4 z-20 safe-top pointer-events-none flex justify-between items-start">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button 
              onClick={() => {
                setSearchParams({});
                navigate('/');
              }}
              className="w-11 h-11 flex items-center justify-center rounded-2xl bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] text-white pointer-events-auto transition-transform active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>

            {/* Activity Type Badge */}
            <div className="flex items-center px-4 py-2 h-11 rounded-2xl bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] pointer-events-auto">
               <span className="text-sm font-bold text-white tracking-wide">{typeLabel}</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-2.5 items-end">
            <div className="flex items-center gap-2 px-4 py-2 h-11 rounded-2xl bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] pointer-events-auto">
              {store.gpsStatus === 'error' || store.gpsStatus === 'denied' ? (
                <><Navigation size={14} className="text-red-500" /><span className="text-xs font-bold text-white">{store.gpsStatus === 'denied' ? 'GPS Denied' : 'GPS Error'}</span></>
              ) : store.gpsStatus === 'active' ? (
                <>
                  <Navigation size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-white">Live GPS</span>
                  <div className={`w-2 h-2 rounded-full ${store.gpsAccuracy > 0 && store.gpsAccuracy <= 10 ? 'bg-emerald-400' : store.gpsAccuracy <= 30 ? 'bg-yellow-400' : 'bg-orange-400'}`} title={`±${Math.round(store.gpsAccuracy)}m`} />
                </>
              ) : (
                <><Loader2 size={14} className="animate-spin text-amber-500" /><span className="text-xs font-bold text-white">Warming Up</span></>
              )}
            </div>
            
            {/* Layers Button */}
            <button
              onClick={() => {
                const themes = Object.keys(MAP_THEMES) as MapThemeKey[];
                const nextIdx = (themes.indexOf(mapLayer) + 1) % themes.length;
                setMapLayer(themes[nextIdx]);
              }}
              className="w-11 h-11 flex items-center justify-center rounded-2xl bg-[#1a100d]/90 backdrop-blur-md shadow-md border border-[#42241b] text-white pointer-events-auto transition-transform active:scale-95"
              title={MAP_THEMES[mapLayer].label}
            >
              <Layers size={18} />
            </button>
          </div>
        </div>

        {/* Floating Actions */}
        <div className="absolute right-4 bottom-[230px] z-10 pointer-events-auto flex flex-col gap-3 transition-all" style={{ transform: isExpanded ? 'translateY(-290px)' : 'translateY(0)' }}>
          <button
            onClick={toggleMapRotation}
            className={`w-12 h-12 flex items-center justify-center rounded-full bg-[var(--card)]/90 backdrop-blur-md shadow-lg border border-[var(--border)] active:scale-95 transition-transform ${mapRotationMode ? 'text-emerald-500' : 'text-[var(--text)]'}`}
            title="Toggle Map Rotation"
          >
            <Compass size={22} className={mapRotationMode ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={() => setRecenterTrigger(t => t + 1)}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--card)]/90 backdrop-blur-md text-sienna shadow-lg border border-[var(--border)] active:scale-95 transition-transform"
          >
            <LocateFixed size={22} />
          </button>
        </div>

        {/* Expandable Bottom Sheet */}
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
          <motion.div 
            animate={{ height: isExpanded ? 520 : 220 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="cardio-live-panel relative bg-[var(--card)]/95 backdrop-blur-2xl text-[var(--text)] border-t border-[var(--border)] rounded-t-[32px] shadow-[0_-15px_50px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden"
          >
            {/* Drag Handle & Toggle */}
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full pt-3 pb-1.5 flex flex-col items-center justify-center shrink-0 group cursor-pointer"
            >
              <div className="w-12 h-1.5 rounded-full bg-[var(--border)] group-hover:bg-[var(--muted)] transition-colors" />
              <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--muted)] mt-1.5 tracking-wider uppercase">
                {isExpanded ? (
                  <>
                    <ChevronDown size={12} className="text-sienna" /> Collapse Metrics
                  </>
                ) : (
                  <>
                    <ChevronUp size={12} className="text-sienna" /> All Metrics & Stats
                  </>
                )}
              </div>
            </button>

            {/* Auto-Pause & Status Indicator */}
            <AnimatePresence>
              {store.autoPauseStatus === 'PAUSED' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="mx-5 px-3.5 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-7 h-7 rounded-full bg-amber-500/25 text-amber-500 flex items-center justify-center shrink-0">
                      <Pause size={13} className="animate-pulse" />
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-300 tracking-wide uppercase flex items-center gap-1.5">
                        Auto-Paused <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                      </div>
                      <div className="text-[10px] text-[var(--muted)] font-medium">Standing still • Resumes when you move</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleResume}
                    className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-[11px] shadow-sm transition-all"
                  >
                    Resume
                  </button>
                </motion.div>
              )}

              {store.isPaused && store.autoPauseStatus !== 'PAUSED' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="mx-5 px-3.5 py-2 rounded-2xl bg-sienna/15 border border-sienna/30 flex items-center justify-between shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-sienna/25 text-sienna flex items-center justify-center shrink-0">
                      <Pause size={13} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-sienna tracking-wide uppercase">Session Paused</div>
                      <div className="text-[10px] text-[var(--muted)] font-medium">Timer & tracking temporarily halted</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleResume}
                    className="px-2.5 py-1 rounded-xl bg-sienna hover:bg-sienna/90 active:scale-95 text-white font-bold text-[11px] shadow-sm transition-all"
                  >
                    Resume
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Core Stats Hero Row */}
            <div className="px-6 pt-1 pb-3 shrink-0" onClick={() => !isExpanded && setIsExpanded(true)}>
              <div className="grid grid-cols-3 gap-3 items-center">
                {/* Timer */}
                <div className="flex flex-col">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <Clock size={11} className="text-sienna" /> Time
                  </div>
                  <div className={`font-mono text-3xl sm:text-4xl font-extrabold tracking-tight mt-0.5 ${store.autoPauseStatus === 'PAUSED' || store.isPaused ? 'text-amber-500/70' : 'text-[var(--text)]'}`}>
                    {formatDuration(elapsedSec)}
                  </div>
                </div>

                {/* Distance */}
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <MapPin size={11} className="text-emerald-500" /> Distance
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text)]">
                      {store.distanceKm.toFixed(2)}
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--muted)]">km</span>
                  </div>
                </div>

                {/* Pace / Speed */}
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1">
                    <Zap size={11} className="text-amber-500" /> {activityType === 'cycle' ? 'Speed' : 'Pace'}
                  </div>
                  <div className="font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)] mt-0.5">
                    {activityType === 'cycle' ? `${store.currentSpeedKmh.toFixed(1)}` : currentPace}
                    <span className="text-[11px] font-sans font-normal text-[var(--muted)] ml-1">
                      {activityType === 'cycle' ? 'km/h' : '/km'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Collapsed Controls (Fast Access) */}
            {!isExpanded && (
              <div className="px-6 pt-1 pb-4 flex items-center justify-center gap-6 shrink-0">
                <button
                  onClick={store.isPaused ? handleResume : handlePause}
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:border-sienna shadow-sm active:scale-95 transition-all"
                  title={store.isPaused ? "Resume" : "Pause"}
                >
                  {store.isPaused ? <Play size={20} fill="currentColor" className="ml-0.5 text-sienna" /> : <Pause size={20} fill="currentColor" />}
                </button>

                <button
                  onClick={handleStop}
                  className="px-6 h-12 rounded-full bg-gradient-to-r from-rose-600 via-red-500 to-rose-500 text-white font-bold text-sm flex items-center gap-2 shadow-[0_8px_20px_rgba(239,68,68,0.4)] hover:scale-105 active:scale-95 transition-all"
                  title="Finish & Save"
                >
                  <Square size={16} fill="currentColor" /> Finish
                </button>

                <button
                  onClick={handleDiscard}
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-red-500 hover:border-red-500/50 shadow-sm active:scale-95 transition-all"
                  title="Discard"
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            )}

            {/* Expanded Metrics Dashboard & Pro Controls */}
            {isExpanded && (
              <div className="px-6 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pt-2 pb-6">
                <div className="grid grid-cols-3 gap-2.5 mb-5">
                  {/* Current Speed */}
                  <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                    <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                      <Zap size={11} className="text-cyan-500" /> Speed
                    </div>
                    <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                      {store.currentSpeedKmh.toFixed(1)} <span className="text-[10px] text-[var(--muted)]">km/h</span>
                    </div>
                  </div>

                  {/* Avg Speed */}
                  <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                    <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                      <TrendingUp size={11} className="text-emerald-500" /> Avg Spd
                    </div>
                    <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                      {avgSpeed} <span className="text-[10px] text-[var(--muted)]">km/h</span>
                    </div>
                  </div>

                  {/* Max Speed */}
                  <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                    <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                      <Flame size={11} className="text-rose-500" /> Max Spd
                    </div>
                    <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                      {store.maxSpeedKmh.toFixed(1)} <span className="text-[10px] text-[var(--muted)]">km/h</span>
                    </div>
                  </div>

                  {/* Calories */}
                  <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                    <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                      <Flame size={11} className="text-orange-500" /> Calories
                    </div>
                    <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                      {calories} <span className="text-[10px] text-[var(--muted)]">kcal</span>
                    </div>
                  </div>

                  {/* Elevation Gain */}
                  <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                    <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                      <Mountain size={11} className="text-amber-500" /> Elevation
                    </div>
                    <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                      {Math.round(store.elevationGainM)} <span className="text-[10px] text-[var(--muted)]">m</span>
                    </div>
                  </div>

                  {/* Live Steps or Route Pts */}
                  {(activityType === 'walk' || activityType === 'run') ? (
                    <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                      <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                        <Footprints size={11} className="text-teal-500" /> Steps
                      </div>
                      <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                        {getLiveSteps(store.activityType, store.distanceKm, pedometerStore)?.toLocaleString() || 0}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-[var(--bg)]/80 border border-[var(--border)] flex flex-col shadow-sm">
                      <div className="text-[9px] font-mono font-bold uppercase text-[var(--muted)] flex items-center gap-1">
                        <MapPin size={11} className="text-purple-500" /> Points
                      </div>
                      <div className="font-mono text-lg font-bold text-[var(--text)] mt-1">
                        {store.routePoints.length}
                      </div>
                    </div>
                  )}
                </div>

                {/* Pro Controls Bar */}
                <div className="flex items-center justify-center gap-7 pt-1 pb-4">
                  {/* Pause / Resume */}
                  <button
                    onClick={store.isPaused ? handleResume : handlePause}
                    className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] hover:border-sienna shadow-md active:scale-95 transition-all"
                    title={store.isPaused ? "Resume" : "Pause"}
                  >
                    {store.isPaused ? <Play size={24} fill="currentColor" className="ml-1 text-sienna" /> : <Pause size={24} fill="currentColor" />}
                  </button>

                  {/* Finish Workout (Primary Center Button) */}
                  <button
                    onClick={handleStop}
                    className="w-20 h-20 rounded-full bg-gradient-to-tr from-rose-600 via-red-500 to-rose-500 text-white flex items-center justify-center shadow-[0_10px_25px_rgba(239,68,68,0.45)] hover:scale-105 active:scale-95 transition-all relative group"
                    title="Finish & Save"
                  >
                    <div className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-25" />
                    <Square size={26} fill="currentColor" className="relative z-10" />
                  </button>

                  {/* Discard */}
                  <button
                    onClick={handleDiscard}
                    className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-red-500 hover:border-red-500/50 shadow-md active:scale-95 transition-all"
                    title="Discard Session"
                  >
                    <RotateCcw size={22} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Screen 4: Summary & Celebration Screen ───
  if (screen === 'summary' && summaryData) {
    const typeLabel = summaryData.type === 'walk' ? 'Walk' : summaryData.type === 'run' ? 'Run' : 'Cycle';

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="pb-28 max-w-2xl mx-auto px-4 pt-4 md:pt-8"
        style={themeStyles}
      >
        {/* Celebration Particles FX */}
        <div className="relative flex flex-col items-center text-center mb-6">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 via-sienna to-rose-500 flex items-center justify-center text-white shadow-[0_10px_35px_rgba(235,89,60,0.5)]">
              <Trophy size={40} className="animate-bounce" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-md">
              <Sparkles size={16} />
            </div>
          </div>

          <div className="font-mono text-xs font-bold text-sienna uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Sparkles size={12} /> Workout Finished
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--text)] tracking-tight">
            Crushed Your {typeLabel}! 🔥
          </h1>
          <p className="text-xs text-[var(--muted)] font-mono mt-1">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Master Summary Card */}
        <div className="rounded-3xl overflow-hidden mb-6 shadow-2xl bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)]">
          {/* Map Preview */}
          {summaryData.route && summaryData.route.length > 1 && (
            <div className="h-[240px] w-full border-b border-[var(--border)] relative">
              <RouteMap route={summaryData.route} height="100%" cardioType={summaryData.type as any} />
              <div className="absolute inset-0 pointer-events-none shadow-[inset_0_-20px_40px_rgba(0,0,0,0.3)] z-10" />
            </div>
          )}

          <div className="p-6">
            {/* Primary Hero Stats: Distance, Time, Pace */}
            <div className="grid grid-cols-3 gap-3 pb-6 border-b border-[var(--border)]">
              {/* Distance */}
              <div>
                <div className="text-[10px] text-sienna font-mono uppercase tracking-widest font-bold">Distance</div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-mono text-4xl md:text-5xl font-black text-[var(--text)]">{summaryData.distanceKm?.toFixed(2)}</span>
                  <span className="font-mono text-[var(--muted)] text-xs font-bold">km</span>
                </div>
              </div>

              {/* Time */}
              <div className="text-center">
                <div className="text-[10px] text-amber-500 font-mono uppercase tracking-widest font-bold">Time</div>
                <div className="font-mono text-3xl md:text-4xl font-extrabold text-[var(--text)] mt-1">
                  {formatDuration(summaryData.durationSec || 0)}
                </div>
              </div>

              {/* Calories */}
              <div className="text-right">
                <div className="text-[10px] text-rose-500 font-mono uppercase tracking-widest font-bold">Calories</div>
                <div className="font-mono text-3xl md:text-4xl font-extrabold text-[var(--text)] mt-1">
                  {summaryData.calories} <span className="text-xs font-mono text-[var(--muted)]">kcal</span>
                </div>
              </div>
            </div>

            {/* Secondary Metrics Grid */}
            <div className="grid grid-cols-4 gap-2 pt-5 text-center">
              <div className="p-2.5 rounded-2xl bg-[var(--bg)]/70 border border-[var(--border)]">
                <div className="text-[9px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">Avg Pace</div>
                <div className="font-mono text-sm md:text-base font-bold text-[var(--text)]">{summaryData.avgPace?.replace(' /km', '')}</div>
              </div>
              <div className="p-2.5 rounded-2xl bg-[var(--bg)]/70 border border-[var(--border)]">
                <div className="text-[9px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">Avg Spd</div>
                <div className="font-mono text-sm md:text-base font-bold text-[var(--text)]">{summaryData.avgSpeedKmh?.toFixed(1)} <span className="text-[10px]">kph</span></div>
              </div>
              <div className="p-2.5 rounded-2xl bg-[var(--bg)]/70 border border-[var(--border)]">
                <div className="text-[9px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">Max Spd</div>
                <div className="font-mono text-sm md:text-base font-bold text-[var(--text)]">{summaryData.maxSpeedKmh?.toFixed(1)} <span className="text-[10px]">kph</span></div>
              </div>
              <div className="p-2.5 rounded-2xl bg-[var(--bg)]/70 border border-[var(--border)]">
                <div className="text-[9px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">Elevation</div>
                <div className="font-mono text-sm md:text-base font-bold text-[var(--text)]">{summaryData.elevationGainM || 0}m</div>
              </div>
            </div>
          </div>
        </div>

        {/* Workout Effort Rating */}
        <div className="p-5 rounded-3xl bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] mb-6 shadow-sm">
          <div className="text-xs font-mono font-bold uppercase text-[var(--muted)] tracking-wider mb-3">
            How did it feel? (Effort)
          </div>
          <div className="grid grid-cols-5 gap-2">
            {EFFORT_LEVELS.map((eff) => (
              <button
                key={eff.id}
                onClick={() => setWorkoutEffort(eff.id)}
                className={`py-2 px-1 rounded-2xl flex flex-col items-center gap-1 transition-all border ${
                  workoutEffort === eff.id
                    ? 'bg-sienna/20 border-sienna text-sienna scale-105 shadow-sm font-bold'
                    : 'bg-[var(--bg)]/60 border-[var(--border)] text-[var(--muted)] hover:border-sienna/40'
                }`}
              >
                <span className="text-xl">{eff.emoji}</span>
                <span className="text-[10px] font-mono">{eff.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Saving Indicator */}
        {isSaving && (
          <div className="text-center text-xs text-amber-500 font-mono mb-4 flex items-center justify-center gap-1.5 animate-pulse">
            <Loader2 size={14} className="animate-spin" /> Saving activity to your profile...
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowShare(true)}
            className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-amber-500 via-sienna to-rose-500 text-white shadow-[0_8px_30px_rgba(235,89,60,0.4)] hover:scale-[1.01] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Share2 size={20} /> Share Workout (Story / Card)
          </button>
          
          <button
            onClick={handleDone}
            className="w-full py-3.5 rounded-2xl font-bold text-base bg-[var(--card)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Check size={18} /> Finish & Return Home
          </button>
        </div>
        
        {showShare && (
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
              steps: summaryData.steps,
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
