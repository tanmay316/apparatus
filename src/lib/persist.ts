import { Timestamp } from 'firebase/firestore';

/**
 * JSON helpers that round-trip Firestore Timestamps, plus a tiny IndexedDB
 * key/value store. Used to paint the last-known session and query data
 * instantly on cold start (Android often kills the WebView in the background).
 */

export function serialize(value: unknown): string {
  return JSON.stringify(value, function (this: any, key: string, v: unknown) {
    const raw = this[key];
    if (raw instanceof Timestamp) return { __ts: [raw.seconds, raw.nanoseconds] };
    return v;
  });
}

export function deserialize<T>(text: string): T {
  return JSON.parse(text, (_key, v) => {
    if (v && typeof v === 'object' && Array.isArray((v as any).__ts)) {
      const [s, ns] = (v as any).__ts;
      return new Timestamp(s, ns);
    }
    return v;
  }) as T;
}

/** True when `value` only holds JSON-safe data (and Timestamps), so it survives a round trip unchanged. */
export function isPersistable(value: unknown, depth = 0): boolean {
  if (depth > 14) return false;
  if (value === null || value === undefined) return true;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(value as number);
  if (t !== 'object') return false;
  if (value instanceof Timestamp) return true;
  if (Array.isArray(value)) return value.every(v => isPersistable(v, depth + 1));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const k in value as Record<string, unknown>) {
    if (!isPersistable((value as Record<string, unknown>)[k], depth + 1)) return false;
  }
  return true;
}

// ─── IndexedDB key/value ───────────────────────────────────

const DB_NAME = 'apparatus-cache';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export async function idbGet<T = string>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
