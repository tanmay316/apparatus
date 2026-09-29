import { collection, doc, getDocs, deleteDoc, query, where, Timestamp, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { CardioActivity, RoutePoint, UserStats } from '@/types';
import { applySession, cardioDurationMin, localDateKey } from '@/lib/stats';
import { cardioMetrics } from '@/lib/performance';
import { estimateSteps } from '@/lib/steps';
import { pedometerService } from '@/services/pedometer';
import { scheduleInactivityReminders } from '@/utils/notifications';
import { isFollowing, visibilityForUser } from '@/services/social';
import { notifyUnlockedBadges, scheduleStatsReconcile, syncAthleteRank } from '@/services/stats';

/**
 * Perpendicular distance from a point (x0, y0) to line segment (x1, y1)-(x2, y2) in lat/lng degrees.
 * where x is lng, y is lat.
 */
function perpendicularDistance(pt: RoutePoint, lineStart: RoutePoint, lineEnd: RoutePoint): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    const dLat = pt.lat - lineStart.lat;
    const dLng = pt.lng - lineStart.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  // Exact distance formula: |dy * x0 - dx * y0 + (x2 * y1 - y2 * x1)| / sqrt(dx^2 + dy^2)
  const num = Math.abs(dy * pt.lng - dx * pt.lat + (lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng));
  const den = Math.sqrt(dy * dy + dx * dx);
  return num / den;
}

/**
 * Ramer-Douglas-Peucker (RDP) polyline simplification.
 * Preserves corner turns, sharp elevation curves, and start/end coordinates.
 */
function ramerDouglasPeucker(points: RoutePoint[], epsilon: number): RoutePoint[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const right = ramerDouglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Compresses route to at most `maxPoints` using geometry-preserving RDP simplification.
 */
export function simplifyRoute(points: RoutePoint[], maxPoints = 1000): RoutePoint[] {
  if (!points || points.length <= maxPoints) return points || [];

  let minEps = 0.000001; // ~0.1m
  let maxEps = 0.001;    // ~100m
  let best = points;

  for (let iter = 0; iter < 12; iter++) {
    const midEps = (minEps + maxEps) / 2;
    const simplified = ramerDouglasPeucker(points, midEps);
    if (simplified.length <= maxPoints) {
      best = simplified;
      maxEps = midEps; // try tighter tolerance (smaller epsilon)
    } else {
      minEps = midEps; // need looser tolerance (larger epsilon)
    }
  }

  return best.length <= maxPoints ? best : best.slice(0, maxPoints);
}

export const saveCardioActivity = async (userId: string, activity: Omit<CardioActivity, 'id'>): Promise<string> => {
  const ref = doc(collection(db, 'cardioActivities'));
  const id = ref.id;

  // Geometry-aware compression - keeps full fidelity for up to 1000 points
  const route = simplifyRoute(activity.route, 1000).map(pt => {
    const cleanPt: any = { ...pt };
    Object.keys(cleanPt).forEach(k => {
      if (cleanPt[k] === undefined) delete cleanPt[k];
    });
    return cleanPt;
  });

  const dataToSave = {
    ...activity,
    id,
    route,
    visibility: await visibilityForUser(userId, activity.visibility),
    startedAt: activity.startedAt || Timestamp.now(),
    finishedAt: activity.finishedAt || Timestamp.now(),
    createdAt: Timestamp.now(),
  };

  // Firestore rejects 'undefined' values, so we strip them
  Object.keys(dataToSave).forEach(key => {
    if ((dataToSave as any)[key] === undefined) {
      delete (dataToSave as any)[key];
    }
  });

  const statsRef = doc(db, 'users', userId, 'stats', 'current');
  const outcome = await runTransaction(db, async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    const result = applySession(statsDoc.data() as UserStats | undefined, {
      kind: 'cardio',
      dateKey: activity.date || localDateKey(),
      calories: activity.calories || 0,
      durationMin: cardioDurationMin(activity),
      distanceKm: activity.distanceKm || 0,
      cardioType: activity.type,
      elevationGainM: activity.elevationGainM || 0,
      steps: activity.steps || 0,
      metrics: cardioMetrics(activity),
    });
    transaction.set(ref, dataToSave);
    transaction.set(statsRef, result.stats);
    return result;
  });
  notifyUnlockedBadges(userId, outcome.unlocked).catch(() => {});
  syncAthleteRank(userId, outcome.stats).catch(() => {});
  scheduleInactivityReminders().catch(() => {});
  notifyStepGoal(userId, activity).catch(() => {});
  notifyCardioAnalysis(userId, id, activity.type).catch(() => {});

  // Auto-track challenge progress (fire-and-forget)
  try {
    const { getActiveAutoTrackChallenges, addChallengeProgressLog } = await import('@/services/community');
    const actType = activity.type as 'run' | 'walk' | 'cycle';
    const matches = await getActiveAutoTrackChallenges(userId, actType);

    for (const { challenge } of matches) {
      let value = 0;
      const metric = challenge.metric;
      if (metric === 'distance') value = activity.distanceKm || 0;
      else if (metric === 'calories') value = activity.calories || 0;
      else if (metric === 'duration') value = Math.round((activity.movingDurationSec || activity.durationSec || 0) / 60);
      else if (metric === 'steps') value = activity.steps || 0;
      else if (metric === 'workouts') value = 1;

      if (value > 0 && challenge.id) {
        await addChallengeProgressLog({
          challengeId: challenge.id,
          userId,
          userName: activity.userName || '',
          userPhoto: activity.userPhoto || '',
          value,
          unit: challenge.unit,
          source: 'auto_cardio',
          sourceActivityId: id,
        });
      }
    }
  } catch { /* auto-track is non-critical */ }

  return id;
};

export const DEFAULT_STEP_GOAL = 10000;

/** Steps from a walk or run: pedometer count when recorded, otherwise a stride estimate. */
export function activitySteps(activity: Pick<CardioActivity, 'type' | 'distanceKm' | 'steps'> & { movingDurationSec?: number }): number {
  if (activity.steps && activity.steps > 0) return activity.steps;
  return estimateSteps(activity.type, activity.distanceKm || 0, activity.movingDurationSec) || 0;
}

export const getStepsForDate = async (userId: string, dateKey: string): Promise<number> => {
  const snap = await getDocs(query(
    collection(db, 'cardioActivities'),
    where('userId', '==', userId),
    where('date', '==', dateKey),
  ));
  return snap.docs.reduce((sum, d) => sum + activitySteps(d.data() as CardioActivity), 0);
};

/**
 * Daily total for display. On phones the device counts every step all day (CoreMotion on
 * iOS, the hardware step counter on Android), so that count is used with tracked sessions
 * as a floor; elsewhere only tracked sessions are known.
 */
export const getDailySteps = async (userId: string, dateKey: string): Promise<number> => {
  const [tracked, device] = await Promise.all([
    getStepsForDate(userId, dateKey),
    pedometerService.getDeviceStepsForDay(dateKey),
  ]);
  return Math.max(tracked, device ?? 0);
};

/** Posts one notification the first time today's tracked steps pass the daily goal. */
async function notifyStepGoal(userId: string, activity: Omit<CardioActivity, 'id'>) {
  const added = activitySteps(activity);
  if (!added) return;
  const { useAuthStore } = await import('@/stores/auth-store');
  const goal = useAuthStore.getState().profile?.stepGoal || DEFAULT_STEP_GOAL;
  const dateKey = activity.date || localDateKey();
  const total = await getStepsForDate(userId, dateKey);
  if (total < goal || total - added >= goal) return;
  const { createSelfNotification } = await import('@/services/social');
  await createSelfNotification(
    userId,
    `Daily step goal reached: ${total.toLocaleString()} of ${goal.toLocaleString()} steps (${Math.round((total / goal) * 100)}%).`,
    '',
    { kind: 'steps', link: '/cardio' },
  );
}

/** Self notification comparing the session with the last one of the same type; opens the analysis. */
async function notifyCardioAnalysis(userId: string, activityId: string, type: CardioActivity['type']) {
  const loaded = await getCardioWithHistory(userId, activityId);
  if (!loaded) return;
  const { analyzeCardio, formatPaceSec } = await import('@/lib/cardio-analysis');
  const { current: c, previous: p } = analyzeCardio(loaded.activity, loaded.history);
  const noun = type === 'cycle' ? 'ride' : type;
  const label = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  const rate = type === 'cycle' ? `${c.kmh} km/h` : `${formatPaceSec(c.paceSec)} /km`;
  let trend: 'up' | 'down' | 'flat' = 'flat';
  let delta = '';
  if (p && p.km > 0) {
    if (type === 'cycle') {
      const d = Math.round((c.kmh - p.kmh) * 10) / 10;
      trend = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
      delta = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} km/h`;
    } else {
      const d = c.paceSec - p.paceSec;
      trend = d < 0 ? 'up' : d > 0 ? 'down' : 'flat';
      delta = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} s/km`;
    }
  }
  const comparison = p
    ? trend === 'flat' ? `same ${type === 'cycle' ? 'speed' : 'pace'} as your last ${noun}`
      : `${delta.replace(/^[+−]/, '')} ${trend === 'up' ? 'faster' : 'slower'} than your last ${noun}`
    : `your first ${noun} on record`;
  const { createSelfNotification } = await import('@/services/social');
  await createSelfNotification(
    userId,
    `${label} ${c.km.toFixed(2)} km at ${rate}: ${comparison}. Tap for splits and coaching.`,
    activityId,
    { kind: 'cardio_progress', trend, cardioType: type, ...(delta ? { delta } : {}), link: '/cardio' },
  );
}

/** A saved session plus the user's full cardio history, for session analysis. */
export const getCardioWithHistory = async (userId: string, activityId: string): Promise<{ activity: CardioActivity; history: CardioActivity[] } | null> => {
  const snap = await getDocs(query(collection(db, 'cardioActivities'), where('userId', '==', userId)));
  const history = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardioActivity));
  const activity = history.find(a => a.id === activityId);
  return activity ? { activity, history } : null;
};

export const getUserCardioActivities = async (userId: string, count = 20): Promise<CardioActivity[]> => {
  const q = query(
    collection(db, 'cardioActivities'),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  const activities = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardioActivity));
  
  // Sort and limit client-side to avoid requiring a composite index in Firestore
  return activities
    .sort((a, b) => {
      const timeA = a.startedAt?.seconds || 0;
      const timeB = b.startedAt?.seconds || 0;
      return timeB - timeA;
    })
    .slice(0, count);
};

/** Cardio sessions of another user that the viewer is allowed to see. */
export const getVisibleCardioActivitiesForUser = async (userId: string, viewerId?: string, count = 20): Promise<CardioActivity[]> => {
  const coll = collection(db, 'cardioActivities');
  const snaps = [await getDocs(query(coll, where('userId', '==', userId), where('visibility', '==', 'public')))];
  if (viewerId && viewerId !== userId && await isFollowing(viewerId, userId)) {
    snaps.push(await getDocs(query(coll, where('userId', '==', userId), where('visibility', '==', 'followers'))));
  }
  return snaps
    .flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as CardioActivity)))
    .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0))
    .slice(0, count);
};

export const updateCardioActivityNotes = async (activityId: string, notes: string): Promise<void> => {
  await updateDoc(doc(db, 'cardioActivities', activityId), { notes: notes.slice(0, 500) });
};

/** Changes who can see a saved session and its feed post; returns the level actually applied. */
export const updateCardioVisibility = async (
  userId: string,
  activityId: string,
  feedPostId: string | null,
  visibility: CardioActivity['visibility'],
): Promise<CardioActivity['visibility']> => {
  const applied = await visibilityForUser(userId, visibility);
  const batch = writeBatch(db);
  batch.update(doc(db, 'cardioActivities', activityId), { visibility: applied });
  if (feedPostId) batch.update(doc(db, 'activities', feedPostId), { visibility: applied });
  await batch.commit();
  return applied;
};

export const deleteCardioActivity = async (activityId: string): Promise<void> => {
  await deleteDoc(doc(db, 'cardioActivities', activityId));
  scheduleStatsReconcile(auth.currentUser?.uid);
};
