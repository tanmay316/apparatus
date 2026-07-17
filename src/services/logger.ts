import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { SystemLog } from '@/types';

// ─── Rate Limiting ───────────────────────────────────────────
// Prevent log-spam on rapid errors (max 5 logs per minute per session)
const LOG_WINDOW_MS = 60_000;
const MAX_LOGS_PER_WINDOW = 5;
let logTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  logTimestamps = logTimestamps.filter((ts) => now - ts < LOG_WINDOW_MS);
  if (logTimestamps.length >= MAX_LOGS_PER_WINDOW) return true;
  logTimestamps.push(now);
  return false;
}

export async function logError(error: Error | unknown, context?: string): Promise<void> {
  if (isRateLimited()) return;

  try {
    const user = auth.currentUser;
    const logData = {
      userId: user?.uid || null,
      userName: user?.displayName || null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack || null : null,
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
  // Firestore writeBatch supports max 500 operations — paginate deletes.
  let snap = await getDocs(query(collection(db, 'systemLogs'), limit(450)));
  while (snap.size > 0) {
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 450) break;
    snap = await getDocs(query(collection(db, 'systemLogs'), limit(450)));
  }
}
