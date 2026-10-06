import { doc, getDoc } from 'firebase/firestore';
import { db, getSignedInUser } from '@/lib/firebase';
import { isFollowing } from '@/services/social';
import { getPublicWorkoutsForUser } from '@/services/workouts';
import { getVisibleCardioActivitiesForUser } from '@/services/cardio';
import { isProRequired } from '@/services/billing';
import type { NutritionSide, NutritionStatus } from '@/lib/athlete-compare';
import type { CardioActivity, UserProfile, UserStats, Workout } from '@/types';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';
const MAX_SESSIONS = 1000;

export type CompareAccess = 'ok' | 'not_following' | 'stats_hidden' | 'not_found' | 'self';

export interface CompareTarget {
  access: CompareAccess;
  profile: UserProfile | null;
  stats: UserStats | null;
  workouts: Workout[];
  cardio: CardioActivity[];
}

/** The athlete's profile and the sessions they share with you. Only followed athletes can be compared. */
export async function loadCompareTarget(myUid: string, uid: string): Promise<CompareTarget> {
  const empty = { profile: null, stats: null, workouts: [], cardio: [] };
  if (uid === myUid) return { access: 'self', ...empty };
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { access: 'not_found', ...empty };
  const profile = { uid, ...snap.data() } as UserProfile;
  if (!(await isFollowing(myUid, uid))) return { access: 'not_following', ...empty, profile };
  // "Show stats" off means the athlete doesn't want their training compared.
  if (profile.privacySettings?.showStatsToFollowers === false) return { access: 'stats_hidden', ...empty, profile };
  const [stats, workouts, cardio] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'stats', 'current')).then(s => (s.exists() ? (s.data() as UserStats) : null)).catch(() => null),
    getPublicWorkoutsForUser(uid, myUid, MAX_SESSIONS).catch(() => [] as Workout[]),
    getVisibleCardioActivitiesForUser(uid, myUid, MAX_SESSIONS).catch(() => [] as CardioActivity[]),
  ]);
  return { access: 'ok', profile, stats, workouts, cardio };
}

export interface NutritionCompare { days: number; status: NutritionStatus; me: NutritionSide; them: NutritionSide | null }

export class CompareProRequiredError extends Error {}

export async function loadNutritionCompare(uid: string, days: number): Promise<NutritionCompare> {
  const user = await getSignedInUser();
  if (!user) throw new Error('Not signed in');
  const tz = -new Date().getTimezoneOffset();
  const res = await fetch(`${API_BASE}/nutrition/compare/${encodeURIComponent(uid)}?days=${Math.max(7, Math.min(365, Math.round(days)))}&tz=${tz}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 402 || isProRequired(body.detail)) throw new CompareProRequiredError(body.detail?.message || 'Pro required');
  if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not load nutrition');
  return body as NutritionCompare;
}
