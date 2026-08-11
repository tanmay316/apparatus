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
