import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { SystemLog } from '@/types';

export async function logError(error: Error | any, context?: string): Promise<void> {
  try {
    const user = auth.currentUser;
    const logData = {
      userId: user?.uid || null,
      userName: user?.displayName || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
      context: context || 'app_error',
      url: window.location.href,
      userAgent: navigator.userAgent,
      createdAt: serverTimestamp(),
    };
    
    await addDoc(collection(db, 'systemLogs'), logData);
  } catch (err) {
    // Fail silently to avoid infinite logs loop
    console.error('Failed to write error log to Firestore:', err);
  }
}

export async function getSystemLogs(limitCount = 100): Promise<SystemLog[]> {
  const q = query(
    collection(db, 'systemLogs'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      // Fallback if createdAt doesn't exist yet (hasn't synced with server timestamp)
      createdAt: data.createdAt || null
    } as SystemLog;
  });
}

export async function clearAllSystemLogs(): Promise<void> {
  const snap = await getDocs(collection(db, 'systemLogs'));
  const batch = writeBatch(db);
  snap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
