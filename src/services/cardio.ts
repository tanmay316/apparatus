import { collection, doc, setDoc, getDocs, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CardioActivity, RoutePoint } from '@/types';

/**
 * Perpendicular distance from a point to a line segment in lat/lng degrees.
 */
function perpendicularDistance(pt: RoutePoint, lineStart: RoutePoint, lineEnd: RoutePoint): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    const dLat = pt.lat - lineStart.lat;
    const dLng = pt.lng - lineStart.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  const num = Math.abs(dy * pt.lng - dx * pt.lat + lineEnd.lat * lineStart.lng - lineEnd.lng * lineStart.lat);
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
export function simplifyRoute(points: RoutePoint[], maxPoints = 500): RoutePoint[] {
  if (!points || points.length <= maxPoints) return points || [];

  let minEps = 0.000005; // ~0.5m
  let maxEps = 0.001;    // ~100m
  let best = points;

  for (let iter = 0; iter < 10; iter++) {
    const midEps = (minEps + maxEps) / 2;
    const simplified = ramerDouglasPeucker(points, midEps);
    if (simplified.length <= maxPoints) {
      best = simplified;
      maxEps = midEps; // try tighter tolerance
    } else {
      minEps = midEps; // need looser tolerance to reduce points
    }
  }

  return best.length <= maxPoints ? best : best.slice(0, maxPoints);
}

export const saveCardioActivity = async (userId: string, activity: Omit<CardioActivity, 'id'>): Promise<string> => {
  const ref = doc(collection(db, 'cardioActivities'));
  const id = ref.id;

  // Geometry-aware compression — keeps sharp turns and road intersections crisp
  const route = simplifyRoute(activity.route, 500);

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
