import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Timestamp } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore, getCardioActiveSec } from '@/stores/cardio-store';
import { usePedometerStore } from '@/stores/pedometer-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { upsertActiveSession, type LiveSessionStatus } from '@/services/social';
import { calculateCardioCalories } from '@/lib/calories';
import { getLiveSteps } from '@/lib/cardio-steps';
import { NativeWorkoutLocation } from '@/utils/native-workout-location';

const HEARTBEAT_MS = 15_000;
const TITLES = { walk: 'Walking', run: 'Running', cycle: 'Cycling' } as const;
const hasNativeLiveSync = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('WorkoutLocation');

async function handOffToNative(uid: string, activeSec: number, distanceKm: number, calories: number, steps?: number) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) return;
  const { token, expirationTime } = await user.getIdTokenResult();
  const { projectId, apiKey } = auth.app.options;
  if (!projectId || !apiKey) return;
  await NativeWorkoutLocation.setLiveSync({
    projectId, apiKey, origin: window.location.origin, uid,
    refreshToken: user.refreshToken, idToken: token, idTokenExpiresAt: Date.parse(expirationTime),
    activeSec, distanceKm, calories, steps: steps ?? -1,
  });
}

/**
 * Keeps the cardio live session fresh app-wide (including while paused) so followers'
 * Live Training strip doesn't drop it; the tracker page only creates the doc once.
 */
export function CardioLivePublisher() {
  const uid = useAuthStore((s) => s.user?.uid);
  const weightKg = useUserWeight() || 70;
  const isTracking = useCardioStore((s) => s.isTracking);
  const isPaused = useCardioStore((s) => s.isPaused);
  const isAutoPaused = useCardioStore((s) => s.autoPauseStatus === 'PAUSED');

  useEffect(() => {
    if (!uid || !isTracking) return;

    const publish = () => {
      const st = useCardioStore.getState();
      const type = st.activityType;
      if (!st.isTracking || !type || !st.startedAt) return;

      const status: LiveSessionStatus = st.isPaused ? 'paused' : st.autoPauseStatus === 'PAUSED' ? 'auto_paused' : 'active';
      const activeSec = getCardioActiveSec(st);
      const movingSec = Math.min(st.movingDurationSec, activeSec);
      const distanceKm = Math.round(st.distanceKm * 100) / 100;
      const avgSpeedKmh = movingSec > 0 ? (st.distanceKm / movingSec) * 3600 : 0;
      const profile = useAuthStore.getState().profile;
      const steps = getLiveSteps(type, st.distanceKm, usePedometerStore.getState(), {
        movingSec, profile: { heightCm: profile?.height, gender: profile?.gender },
      });

      const caloriesBurned = calculateCardioCalories({ type, distanceKm: st.distanceKm, movingMin: movingSec / 60, bodyWeightKg: weightKg, elevationGainM: st.elevationGainM });

      upsertActiveSession(uid, {
        planId: 'cardio',
        dayId: type,
        dayTitle: TITLES[type],
        activityType: type,
        currentExercise: `${distanceKm.toFixed(2)} km`,
        startedAt: Timestamp.fromMillis(st.startedAt),
        status,
        activeSec,
        movingSec,
        distanceKm,
        currentSpeedKmh: status === 'active' ? st.currentSpeedKmh : 0,
        avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
        paceSecPerKm: st.distanceKm >= 0.05 && movingSec > 0 ? Math.round(movingSec / st.distanceKm) : 0,
        elevationGainM: Math.round(st.elevationGainM),
        caloriesBurned,
        ...(steps !== undefined ? { steps } : {}),
      }, 'cardio')
        .then(() => hasNativeLiveSync() ? handOffToNative(uid, activeSec, st.distanceKm, caloriesBurned, steps) : undefined)
        .catch((err) => console.warn('[CardioLivePublisher] heartbeat failed', err));
    };

    // Small delay so the tracker's initial create (which may reset chat) lands first.
    const first = window.setTimeout(publish, 1500);
    const interval = window.setInterval(publish, HEARTBEAT_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [uid, isTracking, isPaused, isAutoPaused, weightKg]);

  useEffect(() => {
    if (!uid || !isTracking || !hasNativeLiveSync()) return;
    return () => { NativeWorkoutLocation.clearLiveSync().catch(() => {}); };
  }, [uid, isTracking]);

  return null;
}
