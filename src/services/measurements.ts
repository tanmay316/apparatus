import { db } from '@/lib/firebase';
import { collection, getDocs, doc, addDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { validateMeasurement } from '@/lib/validation';
import type { Measurement } from '@/types';

/** Add a body measurement log */
export const addMeasurement = async (userId: string, data: Omit<Measurement, 'id'>): Promise<string> => {
  const ref = collection(db, `users/${userId}/measurements`);
  
  // Clean undefined values and validate numeric fields
  const cleanData: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    if (key === 'date') {
      cleanData[key] = val;
    } else {
      // Numeric measurement fields: validate realistic bounds
      const validated = validateMeasurement(val, 0, key === 'weight' ? 500 : key === 'bodyfat' ? 100 : 300);
      if (validated !== null) cleanData[key] = validated;
    }
  }

  const docRef = await addDoc(ref, {
    ...cleanData,
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
