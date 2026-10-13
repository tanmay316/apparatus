import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFollowing } from '@/services/social';
import { localDateKey } from '@/lib/stats';
import type { CardioActivity, Workout } from '@/types';

export type PeekKind = 'cardio' | 'workout';
export type PeekSession =
  | { kind: 'cardio'; data: CardioActivity }
  | { kind: 'workout'; data: Workout };

const COLLECTION: Record<PeekKind, string> = { cardio: 'cardioActivities', workout: 'workouts' };
/** A partner's session counts as "the same one" if it started within this window. */
const MATCH_WINDOW_MS = 4 * 3600_000;

const startMs = (d: { startedAt?: any }) => d.startedAt?.toMillis?.() ?? (d.startedAt?.seconds ? d.startedAt.seconds * 1000 : 0);

function wrap(kind: PeekKind, id: string, data: any): PeekSession {
  return kind === 'cardio'
    ? { kind, data: { id, ...data } as CardioActivity }
    : { kind, data: { id, ...data } as Workout };
}

/** A saved session by id; null when it was deleted or isn't shared with the viewer. */
export async function getSessionById(kind: PeekKind, id: string): Promise<PeekSession | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION[kind], id));
    return snap.exists() ? wrap(kind, snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

/** The session of `uid` that started closest to `aroundMs`, among those the viewer may see. */
export async function findSessionAround(uid: string, kind: PeekKind, aroundMs: number, viewerUid?: string): Promise<PeekSession | null> {
  const dates = [...new Set([-6, 0, 6].map(h => localDateKey(new Date(aroundMs + h * 3600_000))))];
  const visibilities: string[] = ['public'];
  if (viewerUid && (viewerUid === uid || await isFollowing(viewerUid, uid).catch(() => false))) visibilities.push('followers');
  if (viewerUid === uid) visibilities.push('private');
  const coll = collection(db, COLLECTION[kind]);
  const snaps = await Promise.all(visibilities.map(v =>
    getDocs(query(coll, where('userId', '==', uid), where('visibility', '==', v), where('date', 'in', dates))).catch(() => null)));
  let best: PeekSession | null = null;
  let bestGap = Infinity;
  for (const snap of snaps) {
    for (const d of snap?.docs ?? []) {
      const gap = Math.abs(startMs(d.data()) - aroundMs);
      if (gap < bestGap && gap <= MATCH_WINDOW_MS) {
        best = wrap(kind, d.id, d.data());
        bestGap = gap;
      }
    }
  }
  return best;
}
