import { addDoc, collection, onSnapshot, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import type { QueryClient } from '@tanstack/react-query';
import { auth, db } from '@/lib/firebase';

/**
 * Deleted shared content disappears on everyone's device right away.
 * The deleter writes a tombstone (deletions/{auto}); every signed-in app listens for new ones and
 * drops that id from all cached lists, so nobody sees it until their cache would have gone stale.
 */
export type DeletionKind = 'challenge' | 'event' | 'clan' | 'post' | 'announcement' | 'activity' | 'listing' | 'showcase';

/** Must match deletedPath() in firestore.rules. */
export const DELETION_COLLECTION: Record<DeletionKind, string> = {
  challenge: 'challenges_v2',
  event: 'simple_events',
  clan: 'clans_v2',
  post: 'community_posts',
  announcement: 'community_announcements',
  activity: 'activities',
  listing: 'market_listings',
  showcase: 'market_items',
};

/** Call after the document is gone (the rules check it no longer exists). Never throws. */
export async function announceDeletion(kind: DeletionKind, ...ids: string[]): Promise<void> {
  const by = auth.currentUser?.uid;
  if (!by) return;
  await Promise.all(ids.filter(Boolean).map(id =>
    addDoc(collection(db, 'deletions'), { kind, id, by, at: serverTimestamp() }).catch(() => undefined),
  ));
}

const hasId = (v: unknown, id: string) => !!v && typeof v === 'object' && (v as { id?: unknown }).id === id;

/** Copy of `data` without anything whose id is `id`; the same object when nothing matched. */
function without(data: unknown, id: string, depth = 0): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.flatMap(item => {
      if (hasId(item, id)) { changed = true; return []; }
      const inner = depth < 2 ? without(item, id, depth + 1) : item;
      if (inner !== item) changed = true;
      return [inner];
    });
    return changed ? next : data;
  }
  if (data && typeof data === 'object' && depth < 2 && Object.getPrototypeOf(data) === Object.prototype) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      const inner = Array.isArray(v) || (v && typeof v === 'object') ? without(v, id, depth + 1) : v;
      if (inner !== v) changed = true;
      next[k] = inner;
    }
    return changed ? next : data;
  }
  return data;
}

/** Removes the item from every cached list, and empties detail queries for it. */
export function purgeDeleted(queryClient: QueryClient, id: string) {
  for (const q of queryClient.getQueryCache().getAll()) {
    const data = q.state.data;
    if (data === undefined) continue;
    if (hasId(data, id)) {
      queryClient.setQueryData(q.queryKey, null);
      continue;
    }
    const next = without(data, id);
    if (next !== data) queryClient.setQueryData(q.queryKey, next);
  }
}

/** Listens for deletions from now on (plus a short look-back for cache restored at launch). */
export function subscribeDeletions(queryClient: QueryClient, onError?: (err: unknown) => void): () => void {
  const since = Timestamp.fromMillis(Date.now() - 15 * 60_000);
  return onSnapshot(query(collection(db, 'deletions'), where('at', '>', since)), snap => {
    for (const change of snap.docChanges()) {
      if (change.type !== 'added') continue;
      const id = change.doc.data().id;
      if (typeof id === 'string' && id) purgeDeleted(queryClient, id);
    }
  }, err => onError?.(err));
}
