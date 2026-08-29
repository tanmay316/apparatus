import { collection, doc, setDoc, getDocs, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CardioActivity, RoutePoint } from '@/types';

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

  // Geometry-aware compression — keeps full fidelity for up to 1000 points
  const route = simplifyRoute(activity.route, 1000);

  const dataToSave = {
    ...activity,
    id,
    route,
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

  await setDoc(ref, dataToSave);

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

export const deleteCardioActivity = async (activityId: string): Promise<void> => {
  await deleteDoc(doc(db, 'cardioActivities', activityId));
};
