import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { queryClient } from '@/lib/query-client';
import { startMs } from '@/lib/analysis-common';
import type { CardioActivity, Workout } from '@/types';

/**
 * The signed-in user's full workout / cardio history, read from Firestore once and shared by every
 * screen (Progress, cardio hub, analysis, saving a session, stats). Saves, edits and deletes on this
 * device patch the cache instead of re-reading everything, which keeps us far inside the free quota.
 */
type Kind = 'workouts' | 'cardio';
type Item<K extends Kind> = K extends 'workouts' ? Workout : CardioActivity;

const COLLECTION: Record<Kind, string> = { workouts: 'workouts', cardio: 'cardioActivities' };
export const historyKey = (kind: Kind, uid: string | undefined) => [kind === 'workouts' ? 'allWorkouts' : 'allCardioActivities', uid];
/** Other devices' changes show up within this time (and on any save from this device). */
export const HISTORY_STALE_MS = 15 * 60_000;

const newestFirst = <T extends { startedAt?: any; date?: string }>(list: T[]) => [...list].sort((a, b) => startMs(b) - startMs(a));

async function load<K extends Kind>(kind: K, uid: string): Promise<Item<K>[]> {
  const snap = await getDocs(query(collection(db, COLLECTION[kind]), where('userId', '==', uid)));
  return newestFirst(snap.docs.map(d => ({ id: d.id, ...d.data() } as Item<K>)));
}

export const isMe = (uid: string | undefined | null) => !!uid && auth.currentUser?.uid === uid;

/** React Query options for the shared history (use with useQuery). */
export function historyQuery<K extends Kind>(kind: K, uid: string | undefined) {
  return {
    queryKey: historyKey(kind, uid),
    queryFn: () => load(kind, uid!),
    staleTime: HISTORY_STALE_MS,
    enabled: !!uid,
  };
}

/** Newest first. `fresh` forces a read from Firestore (stats rebuilds). Returns a copy callers may sort. */
export async function getMyHistory<K extends Kind>(kind: K, uid: string, opts: { fresh?: boolean } = {}): Promise<Item<K>[]> {
  const list = await queryClient.fetchQuery({
    queryKey: historyKey(kind, uid),
    queryFn: () => load(kind, uid),
    staleTime: opts.fresh ? 0 : HISTORY_STALE_MS,
  });
  return [...list];
}

function update<K extends Kind>(kind: K, uid: string | undefined | null, fn: (list: Item<K>[]) => Item<K>[]) {
  if (!uid) return;
  const key = historyKey(kind, uid);
  if (queryClient.getQueryData(key) === undefined) return;
  queryClient.setQueryData<Item<K>[]>(key, list => (list ? fn(list) : list));
}

/** A session just saved on this device. */
export function rememberSession<K extends Kind>(kind: K, uid: string, item: Item<K>) {
  update(kind, uid, list => newestFirst([item, ...list.filter(x => x.id !== item.id)]));
}

export function patchSession<K extends Kind>(kind: K, uid: string | undefined | null, id: string, patch: Partial<Item<K>>) {
  update(kind, uid, list => list.map(x => (x.id === id ? { ...x, ...patch } : x)));
}

export function forgetSession(uid: string | undefined | null, id: string) {
  update('workouts', uid, list => list.filter(x => x.id !== id));
  update('cardio', uid, list => list.filter(x => x.id !== id));
}
