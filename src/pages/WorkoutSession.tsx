import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Plus, X, Share2, ChevronRight, Check, Flame, Dumbbell, Weight, Activity, Play, Target, Wind, Trophy, Flag } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { useUserWeight } from '@/hooks/use-user-weight';
import { getPlan, getPlanDays, savePlanDay } from '@/services/plans';
import { saveWorkout } from '@/services/workouts';
import { startActiveSession, updateActiveSession, endActiveSession, createSelfNotification, postActivity } from '@/services/social';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { ExerciseLogModal } from '@/components/ui/ExerciseLogModal';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ExerciseAutocomplete } from '@/components/ui/ExerciseAutocomplete';
import type { Exercise } from '@/types';
import { CALORIE_MODEL_VERSION, calculateWorkoutCalories, calculateWorkoutVolume } from '@/lib/calories';
import { usePedometerStore } from '@/stores/pedometer-store';
import { requestNotificationPermission, showPersistentNotification, clearNotification, showNotification, cancelRemainingTodayReminders, scheduleInactivityReminders } from '@/utils/notifications';
import { requestForegroundPermissions, startWorkoutForegroundService, updateWorkoutForegroundService, stopWorkoutForegroundService, setupForegroundServiceListeners } from '@/utils/foreground-service';
import { playSuccessChime } from '@/utils/audio';
import { calculateBodyweightReps } from '@/lib/muscle-map';
import { compareExerciseProgress } from '@/lib/progressive-overload';
import { sameExercise } from '@/lib/exercise-name';
import { historyQuery } from '@/services/history';
import { updateUserChallengeProgress } from '@/services/community';
import { ExerciseIllustration } from '@/components/ui/ExerciseIllustration';
import { getBadge } from '@/lib/badges';
import { effectiveStreak } from '@/lib/stats';
import { BRAND } from '@/lib/brand';

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildWorkoutLiveStats() {
  const st = useWorkoutStore.getState();
  const now = Date.now();
  const pausedMs = st.totalPausedMs + (st.isPaused && st.pausedAt ? now - st.pausedAt : 0);
  let setsCompleted = 0;
  let exercisesDone = 0;
  let volumeKg = 0;
  for (const log of Object.values(st.logs || {})) {
    const done = (log.sets || []).filter((s) => s.completed);
    if (done.length > 0) exercisesDone += 1;
    setsCompleted += done.length;
    for (const s of done) volumeKg += (s.weight || 0) * (s.reps || 0);
  }
  return {
    status: st.isPaused ? 'paused' as const : 'active' as const,
    activeSec: st.startedAt ? Math.max(0, Math.floor((now - st.startedAt - pausedMs) / 1000)) : 0,
    setsCompleted,
    exercisesDone,
    volumeKg: Math.round(volumeKg),
  };
}

function historicalLogToExercise(log: any): Exercise {
  const setCount = Math.max(1, log.sets?.length || 1);
  const isHold = log.mode === 'hold' || log.sets?.some((set: any) => Number(set.seconds) > 0);
  const target = isHold ? `${log.sets?.[0]?.seconds || 0} sec` : `${log.sets?.[0]?.reps || 0}`;
  return {
    name: log.name,
    sets: `${setCount} x ${target}`,
    tempo: '',
    rest: '',
    cues: [],
    yt: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${log.name} correct form`)}`,
  };
}

export function WorkoutSession() {
  const { planId, dayId } = useParams<{ planId: string, dayId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { showToast, units } = useUIStore();
  const queryClient = useQueryClient();
  const userWeight = useUserWeight();

  const store = useWorkoutStore();

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId!),
    enabled: !!planId,
    refetchOnWindowFocus: false,
  });

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['planDays', planId],
    queryFn: () => getPlanDays(planId!),
    enabled: !!planId,
    refetchOnWindowFocus: false,
  });

  const todayKey = localDateKey(new Date());
  const { data: todayWorkouts = [], isLoading: todayWorkoutsLoading } = useQuery({
    queryKey: ['todayWorkouts', user?.uid, todayKey],
    queryFn: async () => {
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', user!.uid),
        where('date', '==', todayKey)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => doc.data());
    },
    enabled: !!user,
  });

  const { data: workoutHistory = [] } = useQuery(historyQuery('workouts', user?.uid));

  const currentDay = days.find(d => d.id === dayId);
  const todayCompletedWorkouts = todayWorkouts.filter((w: any) => w.dayId === dayId);
  const hasCompletedToday = todayCompletedWorkouts.length > 0;

  const [selectedWorkoutIndex, setSelectedWorkoutIndex] = useState(0);
  const completedWorkoutForDay = todayCompletedWorkouts[selectedWorkoutIndex];

  // sessionFinished tracks if the user JUST finished the workout in this current view session
  const [sessionFinished, setSessionFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const findPreviousExerciseLog = (exerciseName: string) => {
    if (!exerciseName) return undefined;
    for (const workout of workoutHistory) {
      if (completedWorkoutForDay) {
        if (workout.id && workout.id === completedWorkoutForDay.id) continue;
        if (workout.startedAt && completedWorkoutForDay.startedAt && 
            workout.startedAt.seconds === completedWorkoutForDay.startedAt.seconds) continue;
        if (workout.date === completedWorkoutForDay.date && workout.dayId === completedWorkoutForDay.dayId) continue;
      }
      
      const foundEx = workout.exercises?.find((ex: any) => sameExercise(ex.name, exerciseName));
      if (foundEx && foundEx.sets && Array.isArray(foundEx.sets)) {
        const completedSets = foundEx.sets.filter((s: any) => 
          s.completed !== false && ((s.reps ?? 0) > 0 || (s.seconds ?? 0) > 0 || (s.weight ?? 0) > 0)
        );
        if (completedSets.length > 0) {
          return foundEx;
        }
      }
    }
    return undefined;
  };

  const handleCancel = () => {
    store.cancelWorkout();
    stopWorkoutForegroundService();
    navigate('/plans', { replace: true });
  };

  // Initialize workout if not active or if plan/day mismatch
  useEffect(() => {
    if (todayWorkoutsLoading || !plan || !currentDay) return;

    if (store.isActive && (store.planId !== plan.id || store.dayId !== currentDay.id)) {
      handleCancel();
      return;
    }

    if (!store.isActive && !hasCompletedToday) {
      setSessionFinished(false);
      store.startWorkout(plan, currentDay);
    }
  }, [plan, currentDay, hasCompletedToday, todayWorkoutsLoading, store.isActive, store.planId, store.dayId]);

  const lastExerciseRef = useRef('Warming up...');
  const displayCaloriesRef = useRef(0);

  // Stopwatch state
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (store.isActive && store.startedAt && !sessionFinished) {
      const interval = setInterval(() => {
        if (!store.isPaused) {
          const raw = Date.now() - store.startedAt! - store.totalPausedMs;
          const currentSec = Math.floor(raw / 1000);
          setElapsedSec(Math.max(0, currentSec));

          if (currentSec % 5 === 0) {
            updateWorkoutForegroundService(
              'gym', 
              store.isPaused ? 'Workout Paused' : `${store.dayTitle || 'Workout'} Live`, 
              `${formatStopwatch(currentSec)} • ${lastExerciseRef.current} • ${Math.round(displayCaloriesRef.current)} kcal`, 
              store.isPaused
            );
          }
        }
      }, 1000);
      return () => clearInterval(interval);
    } else if (store.isActive && !store.startedAt) {
      setElapsedSec(0);
    }
  }, [store.isActive, store.startedAt, store.isPaused, store.totalPausedMs, sessionFinished, store.dayTitle]);

  // Instantly update foreground notification when paused state changes
  useEffect(() => {
    if (store.isActive && store.startedAt && !sessionFinished) {
      updateWorkoutForegroundService(
        'gym', 
        store.isPaused ? 'Workout Paused' : `${store.dayTitle || 'Workout'} Live`, 
        `${formatStopwatch(elapsedSec)} • ${lastExerciseRef.current} • ${Math.round(displayCaloriesRef.current)} kcal`, 
        store.isPaused
      );
    }
  }, [store.isPaused]);


  const hasLoggedSets = Object.values(store.logs || {}).some(ex => (ex.sets || []).some(s => s.completed));
  const hasLoggedSetsRef = useRef(hasLoggedSets);
  useEffect(() => {
    hasLoggedSetsRef.current = hasLoggedSets;
  }, [hasLoggedSets]);

  // Keep references to current store methods/state for unmount cleanup
  const cancelWorkoutRef = useRef(handleCancel);
  const isActiveRef = useRef(store.isActive);
  const userRef = useRef(user);

  useEffect(() => {
    cancelWorkoutRef.current = handleCancel;
    isActiveRef.current = store.isActive;
    userRef.current = user;
  }, [handleCancel, store.isActive, user]);

  // Handle cancellation on unmount ONLY if no sets were logged
  useEffect(() => {
    return () => {
      if (isActiveRef.current && !hasLoggedSetsRef.current) {
        if (userRef.current) {
          endActiveSession(userRef.current.uid, 'workout').catch(console.error);
        }
        // Avoid calling navigate() during unmount to prevent redirect bugs on page refresh
        useWorkoutStore.getState().cancelWorkout();
        stopWorkoutForegroundService();
      }
    };
  }, []);

  useEffect(() => {
    if (!store.isActive && completedWorkoutForDay) {
      setElapsedSec(Math.max(0, Number(completedWorkoutForDay.durationMin || 0) * 60));
    }
  }, [store.isActive, completedWorkoutForDay]);

  const [activeExercise, setActiveExercise] = useState<{ name: string, mode: 'reps' | 'hold' | 'freeform', index: number, section: 'warmup' | 'skillWork' | 'strength' | 'cooldown' } | null>(null);
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'private'>('followers');

  // Add exercise state
  const [addSection, setAddSection] = useState<'warmup' | 'skillWork' | 'strength' | 'cooldown' | null>(null);
  const [addName, setAddName] = useState('');
  const [addSets, setAddSets] = useState('');
  const [addTempo, setAddTempo] = useState('');
  const [addRest, setAddRest] = useState('');
  const [addCues, setAddCues] = useState('');
  const [addYt, setAddYt] = useState('');
  const [selectedExerciseMeta, setSelectedExerciseMeta] = useState<{ caloriesPerRep?: number; caloriesPerSecond?: number; muscleGroup?: string; equipment?: string; met?: number }>({});

  const formatStopwatch = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const historicalLogs = (completedWorkoutForDay?.exercises || []) as any[];
  const historicalExercises = historicalLogs.map(historicalLogToExercise);
  const planExercises = [...(currentDay?.warmup || []), ...(currentDay?.skillWork || []), ...(currentDay?.strength || []), ...(currentDay?.cooldown || [])];
  const missingHistoricalExercises = historicalExercises.filter(exercise => !planExercises.some(item => item.name === exercise.name));
  const hasPlanExercises = planExercises.length > 0;
  const displayWarmup = currentDay?.warmup || [];
  const displaySkillWork = currentDay?.skillWork || [];
  const displayCooldown = currentDay?.cooldown || [];
  const displayStrength = hasPlanExercises ? [...(currentDay?.strength || []), ...missingHistoricalExercises] : historicalExercises;
  const displayExercises = [...displayWarmup, ...displaySkillWork, ...displayStrength, ...displayCooldown];
  const activeLogs = store.isActive ? Object.values(store.logs || {}) : historicalLogs;
  const activeExercises = store.isActive
    ? [...(store.warmup || []), ...(store.skillWork || []), ...(store.strength || []), ...(store.cooldown || [])]
    : displayExercises;
  const estimatedCalories = calculateWorkoutCalories(
    activeLogs,
    userWeight,
    Math.max(1, Math.round(elapsedSec / 60)),
  );
  const displayCalories = activeLogs.length > 0
    ? estimatedCalories
    : Number(completedWorkoutForDay?.calories || 0);
  const externalVolume = calculateWorkoutVolume(activeExercises, activeLogs.filter(ex => ex.sets.some((s: any) => s.completed)), userWeight || 70);

  const [lastExercise, setLastExercise] = useState('Warming up...');

  useEffect(() => {
    if (activeExercise?.name) setLastExercise(activeExercise.name);
  }, [activeExercise?.name]);
  
  useEffect(() => {
    lastExerciseRef.current = lastExercise;
    displayCaloriesRef.current = displayCalories;
  }, [lastExercise, displayCalories]);

  // Setup background service and listeners once when active session starts
  useEffect(() => {
    if (!store.isActive || sessionFinished || !store.startedAt || !user) return;

    if (!store.planId || !store.dayId) return;

    // Start active session in backend
    startActiveSession(user.uid, {
      planId: store.planId,
      dayId: store.dayId,
      dayTitle: store.dayTitle,
      currentExercise: lastExercise,
      caloriesBurned: Math.round(displayCalories) || 0,
      startedAt: Timestamp.fromMillis(store.startedAt)
    }, 'workout').catch(console.error);

    // Request permission and show ongoing notification
    requestNotificationPermission().then(() => {
      requestForegroundPermissions().then(() => {
        startWorkoutForegroundService('gym', `${store.dayTitle || 'Workout'} Active`, '0:00', store.isPaused);
        setupForegroundServiceListeners(
          () => {
            const st = useWorkoutStore.getState();
            if (st.isPaused) st.resumeTimer();
            else st.pauseTimer();
          },
          () => {
            window.dispatchEvent(new Event('foregroundStopClicked'));
          }
        );
      });
      showPersistentNotification(
        1001,
        `${store.dayTitle || 'Workout'} Active`,
        `${BRAND.name} is tracking your session.`
      );
    });
  }, [store.isActive, sessionFinished, store.startedAt, store.planId, store.dayId, user]);

  useEffect(() => {
    const handleForegroundStop = () => {
      handleFinish();
    };
    window.addEventListener('foregroundStopClicked', handleForegroundStop);
    return () => window.removeEventListener('foregroundStopClicked', handleForegroundStop);
  });

  // Unthrottled foreground service update removed to prevent Android IPC lag

  // Immediately push exercise changes to live session
  useEffect(() => {
    if (!user || !store.isActive || sessionFinished || !store.startedAt) return;
    updateActiveSession(user.uid, {
      currentExercise: lastExercise,
      ...buildWorkoutLiveStats(),
    }, 'workout').catch(console.error);
  }, [lastExercise, user, store.isActive, store.isPaused, sessionFinished, store.startedAt]);

  // Periodically update the active session's stats (calories, etc.)
  useEffect(() => {
    if (!user || !store.isActive || sessionFinished || !store.startedAt) return;
    const interval = setInterval(() => {
      updateActiveSession(user.uid, {
        currentExercise: lastExerciseRef.current,
        caloriesBurned: Math.round(displayCaloriesRef.current) || 0,
        ...buildWorkoutLiveStats(),
      }, 'workout').catch(console.error);
    }, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, [store.isActive, sessionFinished, user, store.startedAt]);

  let maxWeight = 0;
  activeLogs.forEach(log => {
    log.sets.forEach((s: any) => {
      if (s.completed && s.weight && s.weight > maxWeight) {
        maxWeight = s.weight;
      }
    });
  });

  const displayWeightUnit = units === 'imperial' ? 'lb' : 'kg';
  const maxWeightDisplay = maxWeight > 0 ? `${maxWeight.toLocaleString()} ${displayWeightUnit}` : `0 ${displayWeightUnit}`;

  const handleFinish = async () => {
    if (!user || !store.isActive || isSaving) return;
    setIsSaving(true);
    
    try {
      const logsObj = store.logs || {};
      const exLogs = Object.values(logsObj).filter(ex => (ex.sets || []).some(s => s.completed));
      
      if (exLogs.length === 0) {
        // If they click finish/stop with no sets logged, just silently cancel the workout and remove the notification
        store.cancelWorkout();
        stopWorkoutForegroundService();
        navigate('/plans', { replace: true });
        setIsSaving(false);
        return;
      }
      
      // Play celebration sound
      playSuccessChime();

      const allExercises = [...(store.warmup || []), ...(store.skillWork || []), ...(store.strength || []), ...(store.cooldown || [])];
      const totalVol = calculateWorkoutVolume(allExercises, exLogs, userWeight || 70);
      const finalDurationMin = Math.max(1, Math.round(elapsedSec / 60));
      const calories = displayCalories;

      if (currentDay && store.planId) {
        try {
          await savePlanDay(store.planId, {
            ...currentDay,
            warmup: store.warmup,
            skillWork: store.skillWork,
            strength: store.strength,
            cooldown: store.cooldown,
          });
          queryClient.invalidateQueries({ queryKey: ['planDays', store.planId] });
        } catch (planError) {
          console.error('Failed to persist session exercise definitions to plan:', planError);
        }
      }

      const saved = await saveWorkout(user.uid, {
        userId: user.uid,
        userName: user.displayName || 'Unknown',
        userPhoto: user.photoURL || '',
        planId: store.planId!,
        planTitle: store.planTitle,
        dayId: store.dayId!,
        dayTitle: store.dayTitle,
        date: localDateKey(new Date()),
        startedAt: store.startedAt ? Timestamp.fromMillis(store.startedAt) : Timestamp.now(),
        finishedAt: null, // Set in backend
        durationMin: finalDurationMin,
        calories,
        caloriesVersion: CALORIE_MODEL_VERSION,
        volume: totalVol,
        bodyweight: userWeight || undefined,
        visibility: privacy,
        notes: '',
        mood: '',
        exercises: exLogs as any,
        likesCount: 0,
        commentsCount: 0
      });

      const overload = saved.progressiveOverload;
      if (overload?.message) {
        const change = overload.volumeChangePercent;
        try {
          await createSelfNotification(user.uid, overload.message, saved.id, {
            kind: 'progress',
            trend: change === undefined || change === 0 ? 'flat' : change > 0 ? 'up' : 'down',
            ...(change !== undefined ? { volumeChangePercent: change } : {}),
            link: '/progress',
          });
        } catch (notificationError) {
          console.error('Failed to create progression notification:', notificationError);
        }
      }

      // Post to activity feed
      try {
        await postActivity({
          userId: user!.uid,
          userName: user!.displayName || 'Athlete',
          username: profile!.username,
          userPhoto: user!.photoURL || '',
          type: 'workout',
          workoutId: saved.id,
          summary: `Completed ${store.dayTitle} from ${plan!.title}`,
          details: {
            planTitle: plan!.title,
            dayTitle: store.dayTitle,
            durationMin: finalDurationMin,
            volume: totalVol,
            calories,
            bodyweight: userWeight || null,
            gender: profile?.gender || null,
            prCount: saved.prCount || 0,
            exercises: exLogs.map(e => e.name),
            // Preserve completion state so shared anatomy reflects this
            exerciseLogs: exLogs.map(e => ({ name: e.name, sets: e.sets, muscleGroup: e.muscleGroup, section: e.section }))
          },
          visibility: privacy,
          likesCount: 0,
          commentsCount: 0,
        });
      } catch (e) {
        console.error('Failed to post activity:', e);
      }

      // Auto-update community challenges
      try {
        await updateUserChallengeProgress(user.uid, [
          { metric: 'calories', amount: calories },
          { metric: 'duration', amount: finalDurationMin },
          { metric: 'workouts', amount: 1 }
        ]);
      } catch (err) {
        console.error('Failed to update challenges:', err);
      }

      // Invalidate queries to refresh dashboard metrics immediately
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['todayWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['recentWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['progressWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['calendarWorkouts'] });

      // Refresh Zustand store stats with new database data so all components re-render immediately
      try {
        await useAuthStore.getState().refreshProfile();
      } catch (refreshError) {
        console.error('Failed to refresh profile stats locally:', refreshError);
      }

      // Celebration and Notifications
      clearNotification(1001);
      const volumeNote = overload?.volumeChangePercent !== undefined
        ? ` Volume ${overload.volumeChangePercent > 0 ? '+' : ''}${overload.volumeChangePercent}% vs your previous best.`
        : '';
      showNotification(1002, 'Workout complete', `${formatStopwatch(elapsedSec)} session.${volumeNote}`, { link: '/progress' }, 'general_notifications');
      stopWorkoutForegroundService();
      if (user) {
        endActiveSession(user.uid, 'workout').catch(console.error);
      }
      
      // Smart Background Reminders
      cancelRemainingTodayReminders().catch(() => {});
      scheduleInactivityReminders().catch(() => {});

      setCelebrationData({
        heading: 'Day complete',
        sub: `${store.dayTitle} · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        xpBreakdown: [
          { label: 'Workout complete', val: 50 },
          { label: `Training time (${finalDurationMin} min)`, val: Math.round(Math.min(finalDurationMin, 180)) },
          { label: 'Load moved', val: Math.min(150, Math.round(totalVol / 500)) },
          { label: `Personal records (${saved.prCount})`, val: Math.min(100, saved.prCount * 25) },
          { label: 'Streak bonus', val: saved.streakBonus },
        ].filter(row => row.val > 0),
        totalXp: saved.xpEarned,
        unlocked: saved.unlockedBadges,
      });

      // Prepare share data for the share card - filter out warmup and cooldown exercises
      const warmupNames = new Set((store.warmup || []).map(e => e.name.toLowerCase()));
      const cooldownNames = new Set((store.cooldown || []).map(e => e.name.toLowerCase()));
      const filteredShareExLogs = exLogs.filter(e => !warmupNames.has(e.name.toLowerCase()) && !cooldownNames.has(e.name.toLowerCase()));

      setShareData({
        dayTitle: store.dayTitle,
        planTitle: plan!.title,
        date: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        durationMin: finalDurationMin,
        volume: totalVol,
        calories,
        exerciseNames: filteredShareExLogs.map(e => e.name),
        exerciseLogs: filteredShareExLogs.map(e => ({ name: e.name, sets: e.sets, muscleGroup: e.muscleGroup, section: e.section })),
        bodyweight: userWeight || undefined,
      });
      // End and clear the persisted session immediately. The celebration and
      // share dialogs use the snapshots above and must not keep the stopwatch alive.
      setSessionFinished(true);
      store.finishWorkout();
      stopWorkoutForegroundService();
    } catch (error) {
      console.error('Failed to save workout error details:', error);
      showToast('Failed to save workout', 'error');
    } finally {
      setIsSaving(false);
    }
  };



  const [celebrationData, setCelebrationData] = useState<{ heading: string, sub: string, xpBreakdown: { label: string, val: number }[], totalXp: number, unlocked: string[] } | null>(null);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  if (planLoading || daysLoading || !plan || !currentDay || (!store.isActive && !hasCompletedToday && !sessionFinished)) {
    return (
      <div className="dx max-w-3xl mx-auto space-y-3 pt-2 animate-pulse" aria-busy="true" aria-label="Preparing workout">
        <div className="flex justify-between">
          <div className="h-9 w-9 rounded-xl" style={{ background: 'var(--dx-card-2)' }} />
          <div className="h-9 w-24 rounded-full" style={{ background: 'var(--dx-card-2)' }} />
        </div>
        <div className="h-44 rounded-3xl" style={{ background: 'var(--dx-card-2)' }} />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl" style={{ background: 'var(--dx-card-2)' }} />)}
        </div>
        <div className="h-56 rounded-3xl" style={{ background: 'var(--dx-card-2)' }} />
      </div>
    );
  }



  const exMode = (setsStr: string) => {
    if (!setsStr) return 'freeform';
    const m = setsStr.match(/^(\d+)\s*x\s*(.+)$/i);
    if (!m) return 'freeform';
    const rest = m[2];
    if (/sec|min/i.test(rest)) return 'hold';
    return 'reps';
  };

  const handleSelectAutocomplete = (libEx: any) => {
    setAddName(libEx.name);
    setAddCues(libEx.instructions?.join('\n') || '');
    setAddYt(libEx.youtubeSearch || '');
    setSelectedExerciseMeta({ caloriesPerRep: libEx.caloriesPerRep, caloriesPerSecond: libEx.caloriesPerSecond, muscleGroup: libEx.muscleGroup, equipment: libEx.equipment, met: libEx.met });
  };

  const handleAddExercise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addSection) return;
    store.addExercise(addSection, {
      name: addName.trim(),
      sets: addSets.trim() || '3 x 10',
      tempo: addTempo.trim(),
      rest: addRest.trim(),
      cues: addCues.split('\n').map(c => c.trim()).filter(Boolean),
      yt: addYt.trim()
      , ...selectedExerciseMeta
    });
    setAddSection(null);
    setAddName('');
    setAddSets('');
    setAddTempo('');
    setAddRest('');
    setAddCues('');
    setAddYt('');
    setSelectedExerciseMeta({});
    showToast('Exercise added to workout');
  };

  const renderSection = (label: string, meta: string, exercises: Exercise[], sectionKey: 'warmup' | 'skillWork' | 'strength' | 'cooldown', IconComponent: any = Dumbbell) => {
    const isViewingHistory = !store.isActive && hasCompletedToday;
    const exerciseDone = (name: string) => isViewingHistory
      ? !!completedWorkoutForDay?.exercises?.find((ex: any) => ex.name === name)?.sets?.some((s: any) => s.completed)
      : !!activeLogs.find(item => item.name === name)?.sets.some((s: any) => s.completed);
    const doneCount = exercises.filter(e => exerciseDone(e.name)).length;

    return (
      <section className="dx-card overflow-hidden">
        <header className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="dx-badge-icon"><IconComponent size={17} /></span>
          <div className="flex-1 min-w-0">
            <h3 className="dx-section-title truncate">{label}</h3>
            <p className="text-[12px] dx-muted truncate">
              {meta}{exercises.length > 0 ? ` · ${doneCount}/${exercises.length} done` : ''}
            </p>
          </div>
          <button onClick={() => setAddSection(sectionKey)} className="dx-chip font-semibold shrink-0" aria-label={`Add exercise to ${label}`}>
            <Plus size={13} /> Add
          </button>
        </header>

        <div className="dx-list border-t" style={{ borderColor: 'var(--dx-border)' }}>
          {exercises.length === 0 ? (
            <div className="px-5 py-6 text-center text-[13px] dx-muted">No exercises in this section.</div>
          ) : (
            exercises.map((e, idx) => {
              const log = activeLogs.find(item => item.name === e.name);
              const histLog = completedWorkoutForDay?.exercises?.find((ex: any) => ex.name === e.name);
              const previousLog = findPreviousExerciseLog(e.name);

              const isDone = exerciseDone(e.name);

              const numCompletedSets = isViewingHistory
                ? histLog?.sets?.filter((s: any) => s.completed !== false).length || 0
                : log?.sets?.filter((s: any) => s.completed).length || 0;

              const previousCompletedSets = previousLog?.sets?.filter((s: any) =>
                s.completed !== false && ((s.reps ?? 0) > 0 || (s.seconds ?? 0) > 0 || (s.weight ?? 0) > 0)
              ) || [];
              const previousSummary = previousCompletedSets
                .map((s: any) => `${s.reps || s.seconds || 0}${s.seconds ? 's' : ''}${s.weight ? `@${s.weight}kg` : ''}`)
                .join(', ');

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setActiveExercise({ name: e.name, mode: exMode(e.sets), index: idx, section: sectionKey })}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--dx-card-2)] active:bg-[var(--dx-card-2)]"
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isViewingHistory) return;
                      const isCurrentlyDone = log && log.sets.some((s: any) => s.completed);
                      log?.sets.forEach((_: any, setIdx: number) => {
                        store.markSetComplete(e.name, setIdx, !isCurrentlyDone);
                      });
                      setLastExercise(e.name);
                      showToast(`All sets marked ${!isCurrentlyDone ? 'complete' : 'incomplete'}`);
                    }}
                    className="dx-check"
                    aria-pressed={isDone}
                    aria-label={isDone ? `Mark ${e.name} incomplete` : `Mark ${e.name} complete`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </button>

                  <ExerciseIllustration
                    name={e.name}
                    muscleGroup={(e as any).muscleGroup}
                    size={48}
                    className="!rounded-xl"
                  />

                  <div className="flex-1 min-w-0">
                    <h5 className="text-[15px] font-semibold leading-snug truncate">{e.name}</h5>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {e.sets && <span className="dx-tag"><strong>{e.sets}</strong></span>}
                      {e.tempo && <span className="dx-tag">Tempo <strong>{e.tempo}</strong></span>}
                      {e.rest && <span className="dx-tag">Rest <strong>{e.rest}</strong></span>}
                    </div>
                    <div className="text-[12px] mt-1.5 truncate font-medium" style={{ color: isDone ? 'var(--dx-success)' : 'var(--dx-muted)' }}>
                      {isDone
                        ? `${numCompletedSets} ${numCompletedSets === 1 ? 'set' : 'sets'} logged`
                        : previousCompletedSets.length > 0
                          ? `Last: ${previousSummary}`
                          : 'No history yet'}
                    </div>
                  </div>

                  <ChevronRight size={17} className="dx-muted shrink-0" />
                </motion.div>
              );
            })
          )}
        </div>
      </section>
    );
  };

  const completedExerciseCount = activeLogs.filter(ex => ex.sets.some((s: any) => s.completed)).length;
  const progressPct = activeExercises.length ? Math.round((completedExerciseCount / activeExercises.length) * 100) : 0;
  const isViewingHistory = !store.isActive && hasCompletedToday;
  const timerRunning = store.isActive && !!store.startedAt && !sessionFinished;
  const kpis = [
    { icon: Clock, label: 'Duration', value: Math.round(elapsedSec / 60), unit: 'min' },
    { icon: Weight, label: 'Max lift', value: maxWeight > 0 ? maxWeight : 0, unit: displayWeightUnit },
    { icon: Flame, label: 'Calories', value: `~${displayCalories}`, unit: 'kcal' },
  ];
  const primaryLabel = isSaving
    ? 'Saving…'
    : sessionFinished
      ? 'Session saved'
      : isViewingHistory
        ? 'Log again'
        : (store.isActive && !store.startedAt)
          ? 'Start workout'
          : 'Finish workout';
  const PrimaryIcon = isViewingHistory ? Activity : (store.isActive && !store.startedAt) ? Play : Check;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="dx pro-scope max-w-3xl mx-auto pb-36 pt-1 sm:pt-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={handleCancel} className="dx-icon-btn dx-icon-btn--sm" aria-label="Quit workout" title="Quit">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          {store.isActive && !store.startedAt && (
            <button onClick={() => store.startTimer()} className="dx-pill dx-pill--accent h-8 px-3 text-[12px]">
              <Play size={12} fill="currentColor" /> Start timer
            </button>
          )}
          <div className="dx-card inline-flex items-center gap-2 h-9 px-3.5 !rounded-full" aria-label="Elapsed time">
            {timerRunning ? (
              <span className="relative flex h-2 w-2">
                {!store.isPaused && <span className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping" style={{ background: 'var(--dx-success)' }} />}
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: store.isPaused ? 'var(--dx-warning)' : 'var(--dx-success)' }} />
              </span>
            ) : (
              <Clock size={14} className="dx-muted" />
            )}
            <span className="tabular font-semibold text-[15px]">{formatStopwatch(elapsedSec)}</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="dx-hero p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-75">
            Day {currentDay.dayNumber.toString().padStart(2, '0')} of {String(days.length || 7).padStart(2, '0')}
          </span>
          {isViewingHistory && todayCompletedWorkouts.length > 0 && (
            <div className="relative z-10 w-[118px]">
              <CustomSelect
                className="w-full text-[12px]"
                ariaLabel="Choose session"
                value={selectedWorkoutIndex.toString()}
                onChange={(val) => setSelectedWorkoutIndex(Number(val))}
                options={todayCompletedWorkouts.map((w: any, idx: number) => {
                  let ms = Date.now();
                  if (w.startedAt) {
                    if (typeof w.startedAt.toMillis === 'function') ms = w.startedAt.toMillis();
                    else if (w.startedAt.seconds) ms = w.startedAt.seconds * 1000;
                    else if (typeof w.startedAt === 'number') ms = w.startedAt;
                  }
                  return { value: idx.toString(), label: new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
                })}
              />
            </div>
          )}
        </div>
        <h1 className="mt-2 text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">{currentDay.title}</h1>
        <p className="mt-1 text-[14px] opacity-80">Skill focus · {currentDay.skill || 'None'}</p>

        <div className="mt-5 flex items-center justify-between text-[12px] font-medium">
          <span className="opacity-80">{isViewingHistory ? 'Completed' : 'Progress'}</span>
          <span className="tabular">{completedExerciseCount} of {activeExercises.length} exercises</span>
        </div>
        <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.16)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--dx-hero-btn)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        {kpis.map(({ icon: KpiIcon, label, value, unit }) => (
          <div key={label} className="dx-card p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium dx-muted">
              <KpiIcon size={13} /> {label}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[22px] font-semibold tabular leading-none">{value}</span>
              <span className="text-[11px] dx-muted">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 mt-5">
        {renderSection('Warm-up', currentDay.time || 'Get moving', store.isActive ? store.warmup : displayWarmup, 'warmup', Activity)}
        {renderSection(`Skill · ${currentDay.skill || 'None'}`, '~15 min', store.isActive ? store.skillWork : displaySkillWork, 'skillWork', Target)}
        {renderSection('Strength', 'Main sets', store.isActive ? store.strength : displayStrength, 'strength', Dumbbell)}
        {renderSection('Cool-down', '5–10 min', store.isActive ? store.cooldown : displayCooldown, 'cooldown', Wind)}
      </div>

      {/* Action bar */}
      <div className="dx-actionbar">
        <div className="flex items-center gap-2">
          <div className="w-[128px] shrink-0">
            <CustomSelect
              className="w-full text-[13px]"
              ariaLabel="Who can see this workout"
              value={privacy}
              onChange={(val) => setPrivacy(val as any)}
              placement="top"
              options={[
                { value: 'followers', label: 'Followers' },
                { value: 'public', label: 'Public' },
                { value: 'private', label: 'Only me' }
              ]}
            />
          </div>
          <button
            onClick={() => {
              if (store.isActive && !store.startedAt) {
                store.startTimer();
              } else if (isViewingHistory) {
                setSessionFinished(false);
                store.startWorkout(plan, currentDay);
              } else {
                handleFinish();
              }
            }}
            disabled={sessionFinished || isSaving}
            className="dx-btn flex-1 h-12 text-[15px]"
          >
            {!isSaving && !sessionFinished && <PrimaryIcon size={17} />}
            {primaryLabel}
          </button>
        </div>
      </div>

      {activeExercise && (store[activeExercise.section][activeExercise.index] || (!store.isActive && hasCompletedToday)) && (
        <ExerciseLogModal
          isOpen={true}
          onClose={() => setActiveExercise(null)}
          exercise={
            (store[activeExercise.section] && store[activeExercise.section][activeExercise.index]) ||
            activeExercises.find(e => e.name === activeExercise.name)!
          }
          section={activeExercise.section}
          index={activeExercise.index}
          historicalLog={(!store.isActive && hasCompletedToday) ? completedWorkoutForDay?.exercises?.find((ex: any) => ex.name === activeExercise.name) : undefined}
          previousLog={findPreviousExerciseLog(activeExercise.name)}
        />
      )}

      {/* Add New Exercise Sheet */}
      {addSection && (
        <div className="dx-overlay z-50">
          <div className="dx-backdrop" onClick={() => setAddSection(null)} />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="Add exercise"
            className="dx-sheet sm:max-w-md"
          >
            <div className="dx-sheet-handle sm:hidden" aria-hidden />
            <div className="dx-sheet-header">
              <div className="flex-1 min-w-0">
                <div className="dx-eyebrow">{{ warmup: 'Warm-up', skillWork: 'Skill work', strength: 'Strength', cooldown: 'Cool-down' }[addSection]}</div>
                <h3 className="mt-0.5 text-[18px] font-semibold tracking-tight">Add exercise</h3>
              </div>
              <button onClick={() => setAddSection(null)} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleAddExercise} className="flex flex-col min-h-0 flex-1">
              <div className="dx-sheet-body space-y-4">
                <div>
                  <label className="dx-label">Exercise</label>
                  <ExerciseAutocomplete
                    value={addName}
                    onChange={setAddName}
                    onSelect={handleSelectAutocomplete}
                    placeholder="Search e.g. Lat pulldown"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="dx-label">Sets × reps</label>
                    <input type="text" placeholder="3 x 10" className="dx-input" value={addSets} onChange={e => setAddSets(e.target.value)} />
                  </div>
                  <div>
                    <label className="dx-label">Tempo</label>
                    <input type="text" placeholder="2-1-2" className="dx-input" value={addTempo} onChange={e => setAddTempo(e.target.value)} />
                  </div>
                  <div>
                    <label className="dx-label">Rest</label>
                    <input type="text" placeholder="90s" className="dx-input" value={addRest} onChange={e => setAddRest(e.target.value)} />
                  </div>
                </div>
                <p className="-mt-2 text-[11px] dx-muted">Use “3 x 20 sec” for timed holds.</p>

                <div>
                  <label className="dx-label">Form cues (one per line)</label>
                  <textarea placeholder="Keep arms locked..." className="dx-input text-[13px]" value={addCues} onChange={e => setAddCues(e.target.value)} />
                </div>

                <div>
                  <label className="dx-label">YouTube link or search</label>
                  <input type="text" placeholder="Leave blank to search by name" className="dx-input" value={addYt} onChange={e => setAddYt(e.target.value)} />
                </div>
              </div>

              <div className="dx-sheet-footer">
                <button type="submit" disabled={!addName.trim()} className="dx-btn w-full h-12 text-[15px]">
                  <Plus size={17} /> Add exercise
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Celebration */}
      {celebrationData && (
        <div className="dx-overlay z-50">
          <div className="dx-backdrop" />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label={celebrationData.heading}
            className="dx-sheet sm:max-w-md"
          >
            <div className="dx-sheet-handle sm:hidden" aria-hidden />
            <div className="dx-sheet-body text-center pt-6">
              <div className="mx-auto w-16 h-16 rounded-[22px] flex items-center justify-center" style={{ background: 'var(--dx-success-soft)', color: 'var(--dx-success)' }}>
                <Trophy size={30} />
              </div>
              <h2 className="mt-4 text-[22px] font-semibold tracking-tight">{celebrationData.heading}</h2>
              <p className="mt-1 text-[13px] dx-muted">{celebrationData.sub}</p>

              <div className="dx-inset mt-5 p-4 text-left">
                {celebrationData.xpBreakdown.map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 text-[13px]">
                    <span className="dx-muted">{row.label}</span>
                    <span className="font-semibold tabular dx-accent">+{row.val} XP</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2.5 mt-1.5 border-t text-[14px] font-semibold" style={{ borderColor: 'var(--dx-border)' }}>
                  <span>Total</span>
                  <span className="tabular">+{celebrationData.totalXp} XP</span>
                </div>
              </div>

              {celebrationData.unlocked.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {celebrationData.unlocked.map(id => getBadge(id)).filter(Boolean).map(badge => (
                    <div key={badge!.id} className="flex items-center gap-3 rounded-2xl p-3.5 text-left" style={{ background: 'var(--dx-accent-soft)' }}>
                      <span className="dx-badge-icon text-[18px]" style={{ background: 'var(--dx-card)' }}>{badge!.icon}</span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] dx-muted">Achievement unlocked</div>
                        <h4 className="text-[14px] font-semibold dx-accent">{badge!.name}</h4>
                        <p className="text-[12px] dx-muted">{badge!.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-2xl p-3.5 text-left" style={{ background: 'var(--dx-accent-soft)' }}>
                  <span className="dx-badge-icon" style={{ background: 'var(--dx-card)' }}><Flame size={17} /></span>
                  <div className="min-w-0">
                    <h4 className="text-[14px] font-semibold dx-accent">{effectiveStreak(useAuthStore.getState().stats)}-day streak</h4>
                    <p className="text-[12px] dx-muted">Train again tomorrow to keep it going.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="dx-sheet-footer grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setCelebrationData(null)}
                className="dx-btn-secondary h-12"
              >
                <Share2 size={17} /> Share
              </button>
              <button
                onClick={() => {
                  setCelebrationData(null);
                  store.finishWorkout();
                  navigate('/');
                }}
                className="dx-btn h-12"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Share Card Modal */}
      {shareData && !celebrationData && (
        <ShareCardModal
          data={shareData}
          onClose={() => {
            setShareData(null);
            store.finishWorkout();
            navigate('/');
          }}
        />
      )}
    </motion.div>
  );
}
