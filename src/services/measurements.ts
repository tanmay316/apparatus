import { db } from '@/lib/firebase';
import { collection, getDocs, doc, addDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import type { Measurement } from '@/types';

/** Add a body measurement log */
export const addMeasurement = async (userId: string, data: Omit<Measurement, 'id'>): Promise<string> => {
  const ref = collection(db, `users/${userId}/measurements`);
  const docRef = await addDoc(ref, {
    ...data,
    createdAt: new Date()
  });
  return docRef.id;
};

/** Get historical measurements */
export const getMeasurements = async (userId: string, limitVal = 100): Promise<Measurement[]> => {
  const ref = collection(db, `users/${userId}/measurements`);
  const q = query(ref, orderBy('date', 'desc'), limit(limitVal));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Measurement));
};

/** Delete a body measurement log */
export const deleteMeasurement = async (userId: string, id: string): Promise<void> => {
  const ref = doc(db, `users/${userId}/measurements`, id);
  await deleteDoc(ref);
};
