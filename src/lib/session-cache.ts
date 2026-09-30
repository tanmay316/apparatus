import { deserialize, isPersistable, serialize } from '@/lib/persist';
import type { UserProfile, UserStats } from '@/types';

/** Last signed-in profile + stats, so a cold start can render before Firestore answers. */
const KEY = 'apparatus.session.v1';

interface CachedSession {
  uid: string;
  profile: UserProfile;
  stats: UserStats;
}

export function readSessionCache(uid?: string): CachedSession | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const cached = deserialize<CachedSession>(text);
    if (!cached?.uid || !cached.profile || !cached.stats) return null;
    if (uid && cached.uid !== uid) return null;
    return cached;
  } catch {
    return null;
  }
}

export function writeSessionCache(uid: string, profile: UserProfile, stats: UserStats) {
  try {
    if (!isPersistable(profile) || !isPersistable(stats)) return;
    localStorage.setItem(KEY, serialize({ uid, profile, stats }));
  } catch {
    // Storage full or unavailable - the next boot just waits for the network.
  }
}

export function clearSessionCache() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
