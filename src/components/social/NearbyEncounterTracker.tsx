import { useEffect, useRef } from 'react';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { cardioSessionKey, useEncounterStore, workoutSessionKey } from '@/stores/encounter-store';
import { useNearby } from '@/hooks/useNearby';
import { distanceKm } from '@/lib/geohash';

const TICK_MS = 20_000;
/** How close counts as "together": runs drift apart more than people in one gym. */
const TOGETHER_KM = { cardio: 0.25, workout: 0.15 };

/** While recording, notes which live athletes stay close, for the "with …" line on the saved session. */
export function NearbyEncounterTracker() {
  const cardioLive = useCardioStore(s => s.isTracking);
  const cardioStart = useCardioStore(s => s.startedAt);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const workoutStart = useWorkoutStore(s => s.startedAt);
  const live = cardioLive || workoutLive;
  const { athletes, viewer } = useNearby(2, { enabled: live });
  const latest = useRef({ athletes, viewer });
  latest.current = { athletes, viewer };

  const sessionKey = cardioLive && cardioStart
    ? cardioSessionKey(cardioStart)
    : workoutLive && workoutStart ? workoutSessionKey(workoutStart) : null;

  useEffect(() => {
    if (!sessionKey) return;
    useEncounterStore.getState().begin(sessionKey);
    const kind = sessionKey.startsWith('c:') ? 'cardio' : 'workout';
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      // Long gaps mean the app was frozen; don't credit time we didn't observe.
      const dt = Math.min(now - last, TICK_MS * 3);
      last = now;
      const me = kind === 'cardio' ? useCardioStore.getState().currentLocation : latest.current.viewer;
      if (!me || (kind === 'cardio' && useCardioStore.getState().isPaused)) return;
      const { addCloseTime } = useEncounterStore.getState();
      for (const a of latest.current.athletes) {
        if (distanceKm(me.lat, me.lng, a.lat, a.lng) > TOGETHER_KM[kind]) continue;
        addCloseTime({
          uid: a.uid,
          displayName: a.displayName,
          username: a.username,
          photoURL: a.photoURL,
          activity: a.activity,
          startedAt: a.startedAt?.toMillis?.(),
        }, dt);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [sessionKey]);

  return null;
}
