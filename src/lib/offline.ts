import { db } from '@/lib/firebase';
import { waitForPendingWrites, writeBatch, type DocumentReference } from 'firebase/firestore';

/** Browser/WebView believes there is no network. */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

class TimeoutError extends Error {
  code = 'deadline-exceeded';
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms} ms`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/** Errors that mean "can't reach the server", not "the write is invalid". */
export function isConnectivityError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'unavailable' || code === 'deadline-exceeded' || isOffline();
}

/**
 * Waits for a best-effort write/read for at most `ms`. Offline Firestore writes only resolve once the
 * server acknowledges them, so awaiting them directly leaves the UI stuck on "Saving…".
 */
export async function settle<T>(promise: Promise<T>, ms = 4000): Promise<T | undefined> {
  try {
    return await withTimeout(promise, ms);
  } catch (err) {
    if (!(err instanceof TimeoutError)) console.warn('[offline] best-effort step failed', err);
    return undefined;
  }
}

const DIRTY_KEY = 'apparatus.stats-dirty.v1';
const ONLINE_COMMIT_MS = 10_000;

function dirtyUids(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function setDirty(uid: string, dirty: boolean) {
  const next = dirtyUids().filter(u => u !== uid);
  if (dirty) next.push(uid);
  localStorage.setItem(DIRTY_KEY, JSON.stringify(next));
}

/**
 * Saves a finished session. Online: `online()` (the stats transaction), bounded so a flaky connection
 * can't hang it. Offline/unreachable: queues a plain write in Firestore's persistent cache (survives
 * app restarts, syncs by itself when the network is back) and rebuilds stats once it has synced.
 * Returns the transaction result, or null when the session was queued.
 */
export async function commitSession<T>(
  uid: string,
  ref: DocumentReference,
  data: Record<string, unknown>,
  online: () => Promise<T>,
): Promise<T | null> {
  if (!isOffline()) {
    try {
      return await withTimeout(online(), ONLINE_COMMIT_MS);
    } catch (err) {
      if (!isConnectivityError(err)) throw err;
    }
  }
  const batch = writeBatch(db);
  batch.set(ref, data);
  setDirty(uid, true);
  batch.commit().then(() => flushOfflineSaves(uid)).catch(err => console.warn('[offline] queued session rejected', err));
  return null;
}

let flushing: Promise<void> | null = null;

/** After queued sessions reach the server, rebuild stats from history (they skipped the stats transaction). */
export function flushOfflineSaves(uid: string | undefined | null): Promise<void> {
  if (!uid || isOffline() || !dirtyUids().includes(uid)) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      await waitForPendingWrites(db);
      const { reconcileUserStats } = await import('@/services/stats');
      const stats = await reconcileUserStats(uid);
      setDirty(uid, false);
      const { useAuthStore } = await import('@/stores/auth-store');
      if (useAuthStore.getState().user?.uid === uid) useAuthStore.setState({ stats });
      const { queryClient } = await import('@/lib/query-client');
      queryClient.invalidateQueries({ queryKey: ['training-burned'] });
      queryClient.invalidateQueries({ queryKey: ['daily-steps'] });
    } catch (err) {
      console.warn('[offline] stats rebuild after sync failed', err);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
