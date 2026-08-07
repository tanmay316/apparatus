import { collection, doc, setDoc, getDocs, deleteDoc, query, where, orderBy, limit as firestoreLimit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CardioActivity } from '@/types';

export const saveCardioActivity = async (userId: string, activity: Omit<CardioActivity, 'id'>): Promise<string> => {
  const ref = doc(collection(db, 'cardioActivities'));
  const id = ref.id;

  // Compress route for storage — keep at most 500 points
  const route = activity.route.length > 500
    ? activity.route.filter((_, i) => i % Math.ceil(activity.route.length / 500) === 0)
    : activity.route;

  await setDoc(ref, {
    ...activity,
    id,
    route,
    startedAt: activity.startedAt || Timestamp.now(),
    finishedAt: activity.finishedAt || Timestamp.now(),
    createdAt: Timestamp.now(),
  });

  return id;
};

export const getUserCardioActivities = async (userId: string, count = 20): Promise<CardioActivity[]> => {
  const q = query(
    collection(db, 'cardioActivities'),
    where('userId', '==', userId),
    orderBy('startedAt', 'desc'),
    firestoreLimit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CardioActivity));
};

export const deleteCardioActivity = async (activityId: string): Promise<void> => {
  await deleteDoc(doc(db, 'cardioActivities', activityId));
};
