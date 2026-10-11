import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Square, Navigation, Layers, RotateCcw, ChevronUp, ChevronDown, LocateFixed, Loader2,
} from 'lucide-react';
import { useCompassHeading } from '@/hooks/useCompassHeading';
import { Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { requestNotificationPermission } from '@/utils/notifications';
import { useUIStore } from '@/stores/ui-store';
import { useCardioStore, startGpsWatch, stopGpsWatch, finishTracking, checkGpsStaleness, getCardioActiveSec } from '@/stores/cardio-store';
import { usePedometerStore } from '@/stores/pedometer-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { saveCardioActivity, getUserCardioActivities, updateCardioActivityNotes, deleteCardioActivity, updateCardioVisibility } from '@/services/cardio';
import { CALORIE_MODEL_VERSION, calculateCardioCalories } from '@/lib/calories';
import { startActiveSession, endActiveSession, postActivity, visibilityForUser } from '@/services/social';
import { RouteMap, MAP_THEMES, type MapThemeKey } from '@/components/cardio/RouteMap';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { SwipeToStart } from '@/components/cardio/SwipeToStart';
import { NowPlayingCard } from '@/components/cardio/NowPlayingCard';
import { CardioHub } from '@/components/cardio/CardioHub';
import { CardioSummary, EFFORT_LEVELS, type SaveState } from '@/components/cardio/CardioSummary';
import { CardioVisibilityPicker, loadCardioVisibility, storeCardioVisibility, type CardioVisibility } from '@/components/cardio/CardioVisibilityPicker';
import { CARDIO_TYPES, formatDuration, formatPace, formatPaceMs, localDateKey } from '@/components/cardio/cardio-format';
import { getLiveSteps } from '@/lib/cardio-steps';
import { updateUserChallengeProgress } from '@/services/community';
import { calculateCorrectedElevation } from '@/services/elevation-service';
import { NativeWorkoutLocation } from '@/utils/native-workout-location';
import { Capacitor } from '@capacitor/core';
import type { CardioActivityType, CardioActivity } from '@/types';
import { lockBodyScroll } from '@/lib/scroll-lock';

function toShareData(a: Partial<CardioActivity>, extra: Partial<CardioShareData> = {}): CardioShareData {
  return {
    type: (a.type || 'run') as CardioShareData['type'],
    date: a.date || new Date().toISOString(),
    distanceKm: a.distanceKm || 0,
    durationSec: a.durationSec || 0,
    calories: a.calories || 0,
    avgPace: a.avgPace || '0:00 /km',
    avgSpeedKmh: a.avgSpeedKmh || 0,
    maxSpeedKmh: a.maxSpeedKmh || 0,
    elevationGainM: a.elevationGainM || 0,
    route: a.route,
    steps: a.steps,
    ...extra,
  };
}

export function CardioTracker() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { showToast, theme, confirm } = useUIStore();
  const userWeight = useUserWeight();
  const store = useCardioStore();
  const [elapsedSec, setElapsedSec] = useState(0);
  const processingRef = useRef(false); // Guard against double-clicks during recovery

  const themeStyles = theme === 'dark' ? {
    '--bg': 'var(--dx-canvas, #050505)',
    '--card': 'var(--dx-card, #0e0e10)',
    '--card-2': 'var(--dx-card-2, #151518)',
    '--border': 'var(--dx-border, rgba(255, 255, 255, 0.05))',
    '--border-strong': 'var(--dx-border-strong, rgba(255, 255, 255, 0.14))',
    '--text': 'var(--dx-text, #f4f4f6)',
    '--muted': 'var(--dx-muted, #9a9aa5)',
    '--teal': '#34d399',
    '--amber': '#fbbf24',
    '--sienna': '#b07458',
    '--accent': '#b07458',
  } as React.CSSProperties : {
    '--bg': 'var(--dx-canvas, #fafafb)',
    '--card': 'var(--dx-card, #ffffff)',
    '--card-2': 'var(--dx-card-2, #f4f3f1)',
    '--border': 'var(--dx-border, rgba(23, 25, 28, 0.07))',
    '--border-strong': 'var(--dx-border-strong, rgba(23, 25, 28, 0.16))',
    '--text': 'var(--dx-text, #17191c)',
    '--muted': 'var(--dx-muted, #6f7380)',
    '--teal': '#059669',
    '--amber': '#b45309',
    '--sienna': '#d9532f',
    '--accent': '#5d2a1a',
  } as React.CSSProperties;

  const pedometerStore = usePedometerStore();
  const strideProfile = { heightCm: profile?.height, gender: profile?.gender };

  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get('type') as CardioActivityType | null;

  const [screen, setScreen] = useState<'select' | 'ready' | 'tracking' | 'summary'>(() => {
    if (store.isTracking) return 'tracking';
    if (urlType) return 'ready';
    return 'select';
  });
  
  // Map layer state - default to street, persist in localStorage
  const [mapLayer, _setMapLayer] = useState<MapThemeKey>(() => {
    const saved = localStorage.getItem('apparatus_map_layer');
    return saved && saved in MAP_THEMES ? saved as MapThemeKey : 'street';
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
        if (!store.isTracking && screen !== 'ready' && screen !== 'tracking') {
          store.reset();
        }
        if (!store.isTracking) {
          setScreen('ready');
        }
      }
    } else {
      if (!store.isTracking && screen !== 'summary' && screen !== 'tracking') {
        setScreen('select');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlType, store.isTracking]);

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

  // After a WebView reload / process restart mid-session, re-attach the step
  // counter and carry over steps counted before the restart.
  useEffect(() => {
    if (screen !== 'tracking' || !store.isTracking || !store.startedAt) return;
    if (store.activityType !== 'walk' && store.activityType !== 'run') return;
    const s = useCardioStore.getState();
    usePedometerStore.getState().resumeIfNeeded({
      sessionStartedAt: s.startedAt!,
      distanceKm: s.distanceKm,
      type: s.activityType,
      profile: { heightCm: profile?.height, gender: profile?.gender },
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, store.isTracking, store.startedAt, store.activityType]);

  const [saveState, setSaveState] = useState<SaveState>('saving');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<Partial<CardioActivity> | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [shareDataOverride, setShareDataOverride] = useState<CardioShareData | null>(null);
  const [recentActivities, setRecentActivities] = useState<CardioActivity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const historyLoadedRef = useRef(false);
  const [workoutEffort, setWorkoutEffort] = useState<string>('moderate');
  const [workoutNotes, setWorkoutNotes] = useState<string>('');
  const [visibility, setVisibilityState] = useState<CardioVisibility>(loadCardioVisibility);
  // Read at save time so a restored session (or background save) uses the latest choice.
  const visibilityRef = useRef(visibility);
  const feedPostIdRef = useRef<string | null>(null);
  const setVisibility = (v: CardioVisibility) => {
    visibilityRef.current = v;
    storeCardioVisibility(v);
    setVisibilityState(v);
  };
  // Retries the last save if the network dropped at the finish line.
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // Live sheet height so the floating map buttons always sit just above it.
  const [sheetEl, setSheetEl] = useState<HTMLDivElement | null>(null);
  const [sheetH, setSheetH] = useState(260);
  useEffect(() => {
    if (!sheetEl) return;
    const update = () => setSheetH(sheetEl.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(sheetEl);
    return () => ro.disconnect();
  }, [sheetEl]);

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

  // History powers the hub (week, bests, list) and the post-session comparison.
  // The summary loads it too: starting fast or resuming after a restart skips the hub load.
  useEffect(() => {
    if (!user || !(screen === 'select' || (screen === 'summary' && !historyLoadedRef.current))) return;
    let cancelled = false;
    setHistoryLoading(true);
    getUserCardioActivities(user.uid, 1000)
      .then(list => { if (!cancelled) { historyLoadedRef.current = true; setRecentActivities(list); } })
      .catch(console.error)
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [user, screen]);

  // Live screens are full-screen overlays; stop the page underneath from scrolling.
  useEffect(() => {
    if (screen !== 'ready' && screen !== 'tracking') return;
    return lockBodyScroll();
  }, [screen]);

  // Timer - counts up continuously when active, halts cleanly when manually paused or auto-paused
  useEffect(() => {
    if (!store.isTracking || !store.startedAt) return;
    const interval = setInterval(() => {
      checkGpsStaleness();
      setElapsedSec(getCardioActiveSec(useCardioStore.getState()));
    }, 500);
    return () => clearInterval(interval);
  }, [store.isTracking, store.startedAt, store.isPaused, store.autoPauseStatus]);

  // Re-sync elapsed timer when app returns to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const st = useCardioStore.getState();
        if (st.isTracking && st.startedAt) {
          setElapsedSec(getCardioActiveSec(st));
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handleBackgroundSave = async () => {
    if (!store.isTracking || !store.activityType) return;
    const activeSecAtStop = getCardioActiveSec(useCardioStore.getState());
    const finalStore = await finishTracking();
    const startedAt = finalStore.startedAt;
    const durationSec = Math.min(
      finalStore.movingDurationSec > 0 ? finalStore.movingDurationSec : activeSecAtStop,
      activeSecAtStop
    );
    const dist = finalStore.distanceKm;
    const type = finalStore.activityType;
    if (!type) return;
    const route = finalStore.routePoints;
    const elevation = finalStore.elevationGainM;
    const maxSpeed = finalStore.maxSpeedKmh;

    if (user) {
      endActiveSession(user.uid, 'cardio').catch(console.error);
    }

    const stepResult = await usePedometerStore.getState().finalize({ type, distanceKm: dist, movingSec: durationSec, profile: strideProfile });

    if (user && dist > 0.01) {
      const durationMin = durationSec / 60;
      const movingDurationSec = durationSec;
      const elapsedDurationSec = Math.max(0, Math.floor((Date.now() - startedAt!) / 1000));
      const pausedDurationSec = Math.max(0, elapsedDurationSec - activeSecAtStop);
      const avgSpeedKmh = movingDurationSec > 0 ? (dist / movingDurationSec) * 3600 : 0;
      const calories = calculateCardioCalories({
        type, distanceKm: dist, movingMin: durationMin, bodyWeightKg: userWeight, elevationGainM: elevation, route,
      });

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
        maxSpeedKmh: Math.round(maxSpeed * 10) / 10,
        avgPace: formatPace(dist, durationSec),
        calories,
        caloriesVersion: CALORIE_MODEL_VERSION,
        bodyweight: userWeight || undefined,
        elevationGainM: Math.round(elevation),
        route,
        visibility: visibilityRef.current,
        notes: 'Auto-saved session',
        steps: stepResult.steps,
        stepSource: stepResult.source,
      }).then(() => useAuthStore.getState().refreshProfile()).catch(console.error);
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
    if (Capacitor.isNativePlatform()) {
      NativeWorkoutLocation.requestBatteryOptimizationExemption().catch(() => {});
    }
    
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
      }, 'cardio').catch(console.error);
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
    processingRef.current = false;
  };

  const handleResume = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    store.resumeTracking();
    processingRef.current = false;
  };

  const handleStop = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
    // Measure before finishTracking(): stopping clears an in-progress pause without crediting it.
    const activeSecAtStop = getCardioActiveSec(useCardioStore.getState());
    const finalStore = await finishTracking();

    if (user) {
      endActiveSession(user.uid, 'cardio').catch(console.error);
    }

    const movingDurationSec = Math.min(
      finalStore.movingDurationSec > 0 ? finalStore.movingDurationSec : activeSecAtStop,
      activeSecAtStop
    );
    const elapsedDurationSec = Math.max(0, Math.floor((Date.now() - (finalStore.startedAt || Date.now())) / 1000));
    const pausedDurationSec = Math.max(0, elapsedDurationSec - activeSecAtStop);
    const durationMin = movingDurationSec / 60;
    const dist = finalStore.distanceKm;
    const avgSpeed = movingDurationSec > 0 ? (dist / movingDurationSec) * 3600 : 0;
    const pace = formatPace(dist, movingDurationSec);

    // Read steps only after tracking stopped (final distance known); finalize also stops the sensor.
    const { steps, source: stepSource } = await usePedometerStore.getState().finalize({
      type: finalStore.activityType, distanceKm: dist, movingSec: movingDurationSec, profile: strideProfile,
    });

    // Recompute elevation gain from the full route (DEM lookup, or noise-filtered
    // GPS altitude). Its result is authoritative even when 0 - flat routes must
    // not fall back to the live GPS counter, which can drift on noisy altitude.
    let finalElevationGain = Math.round(finalStore.elevationGainM);
    if (finalStore.routePoints && finalStore.routePoints.length > 2) {
      try {
        const demResult = await calculateCorrectedElevation(finalStore.routePoints);
        finalElevationGain = demResult.correctedElevationGainM;
      } catch (err) {
        console.warn('DEM elevation calculation fallback to GPS:', err);
      }
    }

    const calories = calculateCardioCalories({
      type: finalStore.activityType!,
      distanceKm: dist,
      movingMin: durationMin,
      bodyWeightKg: userWeight,
      elevationGainM: finalElevationGain,
      route: finalStore.routePoints,
    });

    const data: Partial<CardioActivity> = {
      type: finalStore.activityType!,
      distanceKm: dist,
      durationSec: movingDurationSec,
      movingDurationSec,
      elapsedDurationSec,
      pausedDurationSec,
      avgPace: pace,
      avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
      maxSpeedKmh: Math.round(finalStore.maxSpeedKmh * 10) / 10,
      calories,
      elevationGainM: finalElevationGain,
      route: finalStore.routePoints,
      steps,
    };

    setSummaryData({
      ...data,
      date: localDateKey(new Date(finalStore.startedAt || Date.now())),
      ...(finalStore.startedAt ? { startedAt: Timestamp.fromMillis(finalStore.startedAt) } : {}),
    });
    setSavedId(null);
    feedPostIdRef.current = null;
    setWorkoutEffort('moderate');
    setWorkoutNotes('');
    setScreen('summary');

    if (!user || dist <= 0.01) {
      pendingSaveRef.current = null;
      setSaveState('skipped');
      return;
    }

    const persist = async () => {
      setSaveState('saving');
      const chosenVisibility = await visibilityForUser(user.uid, visibilityRef.current);
      if (chosenVisibility !== visibilityRef.current) {
        visibilityRef.current = chosenVisibility;
        setVisibilityState(chosenVisibility);
      }
      try {
        const id = await saveCardioActivity(user.uid, {
          userId: user.uid,
          userName: user.displayName || 'Athlete',
          userPhoto: user.photoURL || '',
          type: finalStore.activityType!,
          date: localDateKey(new Date(finalStore.startedAt || Date.now())),
          startedAt: finalStore.startedAt ? Timestamp.fromMillis(finalStore.startedAt) : Timestamp.now(),
          finishedAt: Timestamp.now(),
          durationSec: movingDurationSec,
          movingDurationSec,
          elapsedDurationSec,
          pausedDurationSec,
          distanceKm: dist,
          avgSpeedKmh: data.avgSpeedKmh!,
          maxSpeedKmh: data.maxSpeedKmh!,
          avgPace: `${pace} /km`,
          calories: calories,
          caloriesVersion: CALORIE_MODEL_VERSION,
          bodyweight: userWeight || undefined,
          elevationGainM: finalElevationGain,
          route: finalStore.routePoints,
          visibility: chosenVisibility,
          notes: 'Effort: moderate',
          steps: steps,
          stepSource,
        });
        setSavedId(id);
        setSaveState('saved');
        pendingSaveRef.current = null;
      } catch (err) {
        console.error('Failed to save activity:', err);
        setSaveState('error');
        showToast('Could not save this session. Tap “Retry save”.', 'error');
        return;
      }

      try {
        const typeLabel = CARDIO_TYPES[data.type!]?.label ?? 'Cardio';
        feedPostIdRef.current = await postActivity({
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
            steps: steps ?? null,
            movingDurationSec,
            elapsedDurationSec,
            pausedDurationSec,
          },
          visibility: chosenVisibility,
          likesCount: 0,
          commentsCount: 0,
        });
      } catch { /* feed post is best-effort */ }

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

      useAuthStore.getState().refreshProfile().catch(() => {});
    };

    pendingSaveRef.current = persist;
    await persist();
    } finally {
      processingRef.current = false;
    }
  };

  const handleDiscard = async () => {
    if (processingRef.current) return;
    const ok = await confirm({
      title: 'Discard session?',
      message: 'This session will not be saved. This cannot be undone.',
      confirmText: 'Discard',
      type: 'danger',
    });
    if (!ok) return;
    processingRef.current = true;
    try {
      if (user) endActiveSession(user.uid, 'cardio').catch(console.error);
      await stopGpsWatch();
      await pedometerStore.stopSession();
      pedometerStore.resetSession();
      store.reset();
      setSearchParams({});
      setScreen('select');
    } finally {
      processingRef.current = false;
    }
  };

  // Assign the stop handler ref
  handleStopRef.current = handleStop;

  const handleVisibilityChange = async (next: CardioVisibility) => {
    const previous = visibility;
    setVisibility(next);
    if (!user || !savedId) return;
    try {
      const applied = await updateCardioVisibility(user.uid, savedId, feedPostIdRef.current, next);
      if (applied !== next) {
        setVisibility(applied);
        showToast('Your profile is private, so this session is shared with followers only.');
      }
    } catch (err) {
      console.error('Could not update visibility:', err);
      setVisibility(previous);
      showToast('Could not change who can see this session.', 'error');
    }
  };

  const handleDone = async () => {
    // Effort and notes are picked after the auto-save, so write them onto the saved session.
    const effortLabel = EFFORT_LEVELS.find(e => e.id === workoutEffort)?.label ?? workoutEffort;
    const notes = [`Effort: ${effortLabel}`, workoutNotes.trim()].filter(Boolean).join('\n');
    if (savedId && (workoutEffort !== 'moderate' || workoutNotes.trim())) {
      updateCardioActivityNotes(savedId, notes).catch(err => console.warn('Could not save notes:', err));
    }
    if (saveState === 'error' && !await confirm({ title: 'Session not saved', message: 'Leave without saving this session?', confirmText: 'Leave', type: 'warning', icon: 'alert' })) return;
    store.reset();
    setSummaryData(null);
    setScreen('select');
  };

  const handleDeleteActivity = async (activity: CardioActivity) => {
    if (!activity.id) return;
    const ok = await confirm({ title: 'Delete session?', message: 'The session is removed from your history and stats. Feed posts stay until you delete them.', confirmText: 'Delete' });
    if (!ok) return;
    try {
      await deleteCardioActivity(activity.id);
      setRecentActivities(list => list.filter(a => a.id !== activity.id));
      showToast('Session deleted');
    } catch (err: any) {
      showToast(err?.message || 'Could not delete session', 'error');
    }
  };

  // Live estimate must use the AVERAGE moving speed - instantaneous speed drops
  // to 0 at every stop, which made the calorie counter flash back to 0.
  const liveMovingSec = store.movingDurationSec > 0 ? store.movingDurationSec : elapsedSec;
  const calories = store.activityType
    ? calculateCardioCalories({
        type: store.activityType,
        distanceKm: store.distanceKm,
        movingMin: liveMovingSec / 60,
        bodyWeightKg: userWeight,
        elevationGainM: store.elevationGainM,
      })
    : 0;

  // ─── Screen 1: Hub ───
  if (screen === 'select') {
    return (
      <>
        <CardioHub
          activities={recentActivities}
          loading={historyLoading}
          gpsStatus={store.gpsStatus}
          onStart={type => handleStartActivity(type)}
          onShare={act => { setShareDataOverride(toShareData(act)); setShowShare(true); }}
          onDelete={handleDeleteActivity}
        />
        {showShare && shareDataOverride && (
          <CardioShareModal
            data={shareDataOverride}
            mapTheme={mapLayer}
            onClose={() => { setShowShare(false); setShareDataOverride(null); }}
          />
        )}
      </>
    );
  }

  // ─── Screen 2: Ready Screen ───
  if (screen === 'ready' && urlType) {
    const meta = CARDIO_TYPES[urlType];
    const gpsOk = store.gpsStatus === 'active';
    const gpsBad = store.gpsStatus === 'error' || store.gpsStatus === 'denied';
    const gpsText = gpsBad
      ? (store.gpsStatus === 'denied' ? 'Location permission denied' : 'GPS error — check location settings')
      : store.gpsStatus === 'degraded'
        ? `Weak signal (±${Math.round(store.gpsAccuracy)} m) — move to open sky`
        : gpsOk
          ? `GPS locked${store.gpsAccuracy > 0 ? ` · ±${Math.round(store.gpsAccuracy)} m` : ''}`
          : 'Finding your location…';
    const chip = 'h-11 flex items-center justify-center rounded-2xl bg-[var(--card)]/95 backdrop-blur-md shadow-md border border-[var(--border)] text-[var(--text)] pointer-events-auto active:scale-95 transition-transform';

    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cardio-ready-screen fixed inset-0 z-[9999] bg-[var(--bg)] text-[var(--text)] flex flex-col h-[100dvh] overflow-hidden" style={themeStyles}>
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} currentLocation={store.currentLocation} isLive={false} height="100%" theme={mapLayer} cardioType={urlType} />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/70 to-transparent z-[1] pointer-events-none" />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-2 px-4 pointer-events-none" style={{ paddingTop: 'calc(var(--sat) + 16px)' }}>
          <button onClick={() => { setSearchParams({}); setScreen('select'); }} className={`${chip} w-11`} aria-label="Back to cardio hub">
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => {
              const themes = Object.keys(MAP_THEMES) as MapThemeKey[];
              setMapLayer(themes[(themes.indexOf(mapLayer) + 1) % themes.length]);
            }}
            className={`${chip} px-3 gap-2 text-xs font-semibold`}
            aria-label="Change map style"
          >
            <Layers size={16} /> {MAP_THEMES[mapLayer].label}
          </button>
        </div>

        <div className="relative z-10 mt-auto px-4 pointer-events-none" style={{ paddingBottom: 'calc(var(--sab) + 20px)' }}>
          <div className="pointer-events-auto rounded-[28px] bg-[var(--card)]/95 backdrop-blur-xl border border-[var(--border)] shadow-2xl p-4 max-w-md mx-auto">
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--card-2)]" role="radiogroup" aria-label="Activity type">
              {(Object.keys(CARDIO_TYPES) as CardioActivityType[]).map(t => {
                const m = CARDIO_TYPES[t];
                const on = t === urlType;
                return (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSearchParams({ type: t }, { replace: true })}
                    className={`h-10 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors ${on ? 'bg-[var(--card)] text-[var(--text)] shadow-sm' : 'text-[var(--muted)]'}`}
                  >
                    <m.icon size={15} /> {m.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${meta.tint}`}><meta.icon size={24} /></span>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight leading-tight">Ready to {meta.noun}</h1>
                <div className={`flex items-center gap-1.5 text-xs font-medium mt-0.5 ${gpsBad ? 'text-rose-500' : gpsOk ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {gpsOk || gpsBad ? <Navigation size={12} /> : <Loader2 size={12} className="animate-spin" />}
                  <span className="truncate">{gpsText}</span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-semibold text-[var(--muted)] mb-1.5 px-0.5">Who can see this session</div>
              <CardioVisibilityPicker value={visibility} onChange={setVisibility} />
            </div>

            <div className="mt-4">
              <SwipeToStart onComplete={handleStartTracking} />
            </div>
          </div>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Screen 3: Tracking Screen ───
  if (screen === 'tracking') {
    const avgSpeed = store.movingDurationSec > 0 ? (store.distanceKm / (store.movingDurationSec / 3600)).toFixed(1) : '0.0';
    const currentPace = formatPaceMs(store.currentPaceMs);
    const activityType = store.activityType || 'run';
    const typeLabel = activityType === 'walk' ? 'Walk' : activityType === 'run' ? 'Run' : 'Cycle';

    return createPortal(
      <motion.div initial={false} animate={{ opacity: 1 }} className="fixed inset-0 z-[9999] bg-[#090605] flex flex-col h-[100dvh] overflow-hidden" style={themeStyles}>
        
        {/* Full Screen Map Background */}
        <div className="absolute inset-0 z-0">
          <RouteMap route={store.routePoints} currentLocation={store.currentLocation} isLive height="100%" theme={mapLayer} recenterTrigger={recenterTrigger} cardioType={store.activityType as any} heading={heading} mapRotationMode={mapRotationMode} visualHeadingRef={visualHeadingRef} />
        </div>

        {/* Recovery Overlay - shows when replaying native buffer after background */}
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
            {/* Back Button - safe navigation with confirmation during active tracking */}
            <button 
              onClick={async () => {
                if (store.isTracking) {
                  const choice = await confirm({
                    title: 'Leave the live screen?',
                    message: 'Your session keeps recording in the background. Reopen Cardio to get back to it.',
                    confirmText: 'Go home',
                    cancelText: 'Stay',
                    type: 'info',
                    icon: 'info',
                  });
                  if (choice) {
                    setSearchParams({});
                    navigate('/');
                  }
                } else {
                  setSearchParams({});
                  navigate('/');
                }
              }}
              aria-label="Leave live screen"
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

        {/* Dynamic Island Style Floating Auto-Pause Notification Banner */}
        <AnimatePresence>
          {store.autoPauseStatus === 'PAUSED' && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="absolute top-20 left-4 right-4 z-20 pointer-events-auto flex justify-center"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#1c120c]/95 backdrop-blur-xl border border-amber-500/40 shadow-[0_8px_30px_rgba(245,158,11,0.25)] text-white">
                <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400">
                  <span className="absolute inset-0 rounded-full bg-amber-500/40 animate-ping" />
                  <Pause size={12} className="relative z-10 fill-amber-400" />
                </div>
                <div className="flex items-baseline gap-1.5 text-xs font-bold tracking-tight">
                  <span className="text-amber-400">AUTO-PAUSED</span>
                  <span className="text-white/60 text-[11px] font-medium hidden sm:inline">• Standing still</span>
                </div>
                <button
                  onClick={handleResume}
                  className="ml-1 px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-extrabold text-[11px] tracking-wide shadow transition-all"
                >
                  RESUME
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Actions */}
        <div className="absolute right-4 z-10 pointer-events-auto flex flex-col gap-3" style={{ bottom: sheetH + 16, transition: 'bottom 0.25s ease-out' }}>
          {/* True North-Pointing Compass Rose Widget */}
          <button
            onClick={toggleMapRotation}
            className={`relative w-14 h-14 rounded-full bg-[#1a100d]/95 backdrop-blur-xl shadow-2xl border-2 active:scale-95 transition-all flex items-center justify-center group ${
              mapRotationMode ? 'border-sienna shadow-[0_0_15px_rgba(235,89,60,0.4)]' : 'border-[#42241b]'
            }`}
            title={mapRotationMode ? "Map rotated (Track-Up). Tap for North-Up" : "North-Up. Tap to rotate map with heading"}
          >
            {/* Cardinal Direction Letters */}
            <span className="absolute top-1 text-[9px] font-black text-red-500 tracking-tighter leading-none">N</span>
            <span className="absolute right-1 text-[8px] font-bold text-white/50 tracking-tighter leading-none">E</span>
            <span className="absolute bottom-1 text-[8px] font-bold text-white/50 tracking-tighter leading-none">S</span>
            <span className="absolute left-1 text-[8px] font-bold text-white/50 tracking-tighter leading-none">W</span>

            {/* Rotating Dual-Color Compass Needle pointing to North */}
            <div 
              className="w-full h-full absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-100 ease-out"
              style={{ transform: `rotate(${heading != null ? -heading : 0}deg)` }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" className="filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {/* North Needle (Red/Orange) */}
                <polygon points="12,3 15.5,12 12,10.5 8.5,12" fill="#ef4444" />
                {/* South Needle (White/Slate) */}
                <polygon points="12,21 15.5,12 12,13.5 8.5,12" fill="#e2e8f0" />
                {/* Center Pivot Pin */}
                <circle cx="12" cy="12" r="2" fill="#0f172a" stroke="#ef4444" strokeWidth="1" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => setRecenterTrigger(t => t + 1)}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-[#1a100d]/95 backdrop-blur-xl text-sienna shadow-2xl border-2 border-[#42241b] active:scale-95 transition-transform"
            title="Recenter Map"
          >
            <LocateFixed size={22} />
          </button>
        </div>

        {/* Expandable Bottom Sheet */}
        <div ref={setSheetEl} className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
          <div 
            className="cardio-live-panel pro-scope relative text-[var(--text)] border-t border-[var(--border)] rounded-t-[32px] flex flex-col overflow-hidden max-h-[82vh]"
            style={{ background: 'var(--card)', boxShadow: '0 -15px 50px rgba(0,0,0,0.35)', paddingBottom: 'max(14px, var(--sab))' }}
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

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {/* Auto-Pause & Status Indicator Banner */}
            <AnimatePresence>
              {store.isPaused && store.autoPauseStatus !== 'PAUSED' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="mx-5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-sienna/20 via-sienna/10 to-transparent border border-sienna/35 flex items-center justify-between shadow-lg shadow-sienna/10 overflow-hidden"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-sienna/25 border border-sienna/50 text-sienna flex items-center justify-center shrink-0">
                      <Pause size={14} className="fill-sienna" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-sienna tracking-wide uppercase">Session Paused</div>
                      <div className="text-[10.5px] text-[var(--muted)] font-medium">Timer & tracking temporarily halted</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleResume}
                    className="px-3.5 py-1.5 rounded-xl bg-sienna hover:bg-sienna/90 active:scale-95 text-white font-bold text-xs shadow-md shadow-sienna/25 transition-all cursor-pointer"
                  >
                    Resume
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Now playing (Android: mirrors Spotify / any music app) */}
            <NowPlayingCard className="mx-4 sm:mx-6 mb-3" />

            {/* Core KPI row */}
            <div className="px-3 sm:px-6 pt-1 pb-3 shrink-0" onClick={() => !isExpanded && setIsExpanded(true)}>
              <div className="grid grid-cols-3 items-stretch">
                {/* Timer */}
                <div className="cardio-kpi-cell flex flex-col items-center text-center min-w-0 px-1 py-1">
                  <div className="text-[12px] font-medium text-[var(--muted)] truncate flex items-center justify-center gap-1.5">
                    Time {store.autoPauseStatus === 'PAUSED' && <span className="px-1.5 py-0.2 rounded text-[8.5px] font-mono font-extrabold bg-amber-500/20 text-amber-500 border border-amber-500/30">PAUSED</span>}
                  </div>
                  <div className={`text-[26px] sm:text-[32px] font-bold tracking-tight mt-1 leading-none tabular-nums truncate transition-colors ${store.autoPauseStatus === 'PAUSED' ? 'text-amber-500 animate-pulse' : store.isPaused ? 'text-sienna' : 'text-[var(--text)]'}`}>
                    {formatDuration(elapsedSec)}
                  </div>
                </div>

                {/* Distance */}
                <div className="cardio-kpi-cell flex flex-col items-center text-center min-w-0 px-1 py-1">
                  <div className="text-[12px] font-medium text-[var(--muted)] truncate">
                    Distance
                  </div>
                  <div className="flex items-baseline justify-center gap-1 mt-1 leading-none truncate">
                    <span className="text-[26px] sm:text-[32px] font-bold tracking-tight text-[var(--text)] tabular-nums">
                      {store.distanceKm.toFixed(2)}
                    </span>
                    <span className="text-[11px] sm:text-xs font-medium text-[var(--muted)]">km</span>
                  </div>
                </div>

                {/* Pace (speed stays in the expanded row to avoid a duplicate KPI) */}
                <div className="cardio-kpi-cell flex flex-col items-center text-center min-w-0 px-1 py-1">
                  <div className="text-[12px] font-medium text-[var(--muted)] truncate">
                    Pace
                  </div>
                  <div className="flex items-baseline justify-center gap-1 mt-1 leading-none truncate">
                    <span className="text-[26px] sm:text-[32px] font-bold tracking-tight text-[var(--text)] tabular-nums">
                      {currentPace}
                    </span>
                    <span className="text-[11px] sm:text-xs font-medium text-[var(--muted)]">
                      /km
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded KPIs - same metrics, same data */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="expanded-kpis"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                  className="overflow-hidden"
                >
                  <div className="cardio-kpi-rows mx-3 sm:mx-6 mb-2 border-t border-dashed border-[var(--border)]">
                    {[
                      [
                        { label: 'Speed', value: store.currentSpeedKmh.toFixed(1), unit: 'km/h' },
                        { label: 'Avg Spd', value: avgSpeed, unit: 'km/h' },
                        { label: 'Max Spd', value: store.maxSpeedKmh.toFixed(1), unit: 'km/h' },
                      ],
                      [
                        { label: 'Calories', value: String(calories), unit: 'kcal' },
                        { label: 'Elevation', value: String(Math.round(store.elevationGainM)), unit: 'm' },
                        (activityType === 'walk' || activityType === 'run')
                          ? { label: 'Steps', value: getLiveSteps(store.activityType, store.distanceKm, pedometerStore, { movingSec: store.movingDurationSec, profile: strideProfile })?.toLocaleString() || '0', unit: '' }
                          : { label: 'Moving Time', value: formatDuration(Math.min(store.movingDurationSec, elapsedSec)), unit: '' },
                      ],
                    ].map((row, ri) => (
                      <div key={ri} className="cardio-kpi-row grid grid-cols-3 py-3">
                        {row.map((kpi) => (
                          <div key={kpi.label} className="cardio-kpi-cell flex flex-col items-center text-center min-w-0 px-1">
                            <div className="text-[11px] font-medium text-[var(--muted)] truncate">{kpi.label}</div>
                            <div className="flex items-baseline justify-center gap-1 mt-1 leading-none truncate">
                              <span className="text-[20px] font-bold tracking-tight text-[var(--text)] tabular-nums">{kpi.value}</span>
                              {kpi.unit && <span className="text-[10px] font-medium text-[var(--muted)]">{kpi.unit}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            {/* Controls: Discard · Pause/Resume · Finish */}
            <div className="px-6 pt-2 pb-1 flex items-center justify-center gap-7 shrink-0">
              <button
                onClick={handleDiscard}
                className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] hover:text-red-500 active:scale-95 transition-all"
                title="Discard Session"
                aria-label="Discard session"
              >
                <RotateCcw size={22} />
              </button>

              <button
                onClick={store.isPaused ? handleResume : handlePause}
                className="relative w-[76px] h-[76px] rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
                style={{ background: 'var(--sienna)', boxShadow: '0 10px 26px rgba(235, 89, 60, 0.42)' }}
                title={store.isPaused ? 'Resume' : 'Pause'}
                aria-label={store.isPaused ? 'Resume' : 'Pause'}
              >
                {store.isPaused ? <Play size={32} fill="currentColor" className="ml-1" /> : <Pause size={32} fill="currentColor" />}
              </button>

              <button
                onClick={handleStop}
                className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] active:scale-95 transition-all"
                title="Finish & Save"
                aria-label="Finish and save"
              >
                <Square size={20} fill="currentColor" className="rounded-[3px]" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>,
      document.body
    );
  }

  // ─── Screen 4: Summary ───
  if (screen === 'summary' && summaryData) {
    return (
      <>
        <CardioSummary
          data={summaryData}
          saveState={saveState}
          effort={workoutEffort}
          onEffort={setWorkoutEffort}
          notes={workoutNotes}
          onNotes={setWorkoutNotes}
          onShare={() => { setShareDataOverride(toShareData(summaryData, { currentLocation: store.currentLocation })); setShowShare(true); }}
          onDone={handleDone}
          onRetry={() => { pendingSaveRef.current?.(); }}
          visibility={visibility}
          onVisibility={handleVisibilityChange}
          history={historyLoadedRef.current ? recentActivities : undefined}
        />
        {showShare && shareDataOverride && (
          <CardioShareModal
            data={shareDataOverride}
            mapTheme={mapLayer}
            onClose={() => { setShowShare(false); setShareDataOverride(null); }}
          />
        )}
      </>
    );
  }

  return null;
}
