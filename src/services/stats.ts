import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getBadge } from '@/lib/badges';
import { rebuildStats } from '@/lib/stats';
import { CALORIE_MODEL_VERSION, cardioCalories, workoutCalories } from '@/lib/calories';
import { getMeasurements } from '@/services/measurements';
import { computeAthleteRank, experienceLevelFor, rankTierIndex } from '@/lib/rank';
import type { CardioActivity, UserProfile, UserStats, Workout } from '@/types';

/** Rebuilds users/{uid}/stats/current from the user's workouts and cardio sessions. */
export async function reconcileUserStats(uid: string): Promise<UserStats> {
  const statsRef = doc(db, 'users', uid, 'stats', 'current');
  const [statsSnap, workoutSnap, cardioSnap] = await Promise.all([
    getDoc(statsRef),
    getDocs(query(collection(db, 'workouts'), where('userId', '==', uid))),
    getDocs(query(collection(db, 'cardioActivities'), where('userId', '==', uid))),
  ]);
  const workouts = workoutSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
  const cardio = cardioSnap.docs.map(d => ({ id: d.id, ...d.data() } as CardioActivity));
  await recalculateStoredCalories(uid, workouts, cardio);

  const planDaysPerWeek: Record<string, number> = {};
  await Promise.all([...new Set(workouts.map(w => w.planId).filter(Boolean))].map(async planId => {
    try {
      const plan = await getDoc(doc(db, 'plans', planId));
      planDaysPerWeek[planId] = Number(plan.data()?.daysPerWeek) || 0;
    } catch {
      planDaysPerWeek[planId] = 0;
    }
  }));

  const previous = statsSnap.exists() ? (statsSnap.data() as UserStats) : undefined;
  const rebuilt = rebuildStats(previous, workouts, cardio, planDaysPerWeek);
  await setDoc(statsRef, rebuilt);
  await syncAthleteRank(uid, rebuilt, { notify: false }).catch(() => {});
  return rebuilt;
}

/**
 * Re-estimates calories for sessions saved with an older calorie model, updating
 * the arrays in place and persisting the new values (with the weight used, so the
 * number stays stable if the user's weight changes later).
 */
async function recalculateStoredCalories(uid: string, workouts: Workout[], cardio: CardioActivity[]): Promise<void> {
  const stale = (v?: number) => (v || 0) < CALORIE_MODEL_VERSION;
  if (!workouts.some(w => stale(w.caloriesVersion)) && !cardio.some(c => stale(c.caloriesVersion))) return;

  let weight: number | undefined;
  try {
    const [profileSnap, measurements] = await Promise.all([getDoc(doc(db, 'users', uid)), getMeasurements(uid)]);
    weight = measurements.find(m => m.weight != null)?.weight || (profileSnap.data() as UserProfile | undefined)?.weight || undefined;
  } catch { /* fall back to the model's default weight */ }

  const writes: Promise<unknown>[] = [];
  for (const w of workouts) {
    if (!w.id || !stale(w.caloriesVersion)) continue;
    const bodyweight = w.bodyweight || weight;
    w.calories = workoutCalories({ ...w, bodyweight }, weight);
    w.caloriesVersion = CALORIE_MODEL_VERSION;
    writes.push(updateDoc(doc(db, 'workouts', w.id), { calories: w.calories, caloriesVersion: CALORIE_MODEL_VERSION, ...(bodyweight ? { bodyweight } : {}) }));
  }
  for (const c of cardio) {
    if (!c.id || !stale(c.caloriesVersion)) continue;
    const bodyweight = c.bodyweight || weight;
    c.calories = cardioCalories({ ...c, bodyweight }, weight);
    c.caloriesVersion = CALORIE_MODEL_VERSION;
    writes.push(updateDoc(doc(db, 'cardioActivities', c.id), { calories: c.calories, caloriesVersion: CALORIE_MODEL_VERSION, ...(bodyweight ? { bodyweight } : {}) }));
  }
  // A doc that fails to update (e.g. legacy data the rules reject) keeps its old value on the server only.
  await Promise.allSettled(writes);
}

/** Stores the computed rank on the profile so other users (and legacy screens) see it. */
export async function syncAthleteRank(uid: string, stats: UserStats, options: { notify?: boolean } = {}): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const profile = userSnap.data() as UserProfile;
  const rank = computeAthleteRank(stats, profile.weight);
  const previous = profile.athleteRank;
  const athleteRank = {
    tier: rank.tier,
    track: rank.track,
    label: rank.label,
    score: rank.score,
    strength: rank.strengthScore,
    endurance: rank.enduranceScore,
  };
  const experienceLevel = experienceLevelFor(rank.tier);
  if (previous?.label === athleteRank.label && previous?.score === athleteRank.score && profile.experienceLevel === experienceLevel) return;

  await updateDoc(userRef, { athleteRank, experienceLevel });

  const { useAuthStore } = await import('@/stores/auth-store');
  const current = useAuthStore.getState().profile;
  if (current?.uid === uid) useAuthStore.setState({ profile: { ...current, athleteRank, experienceLevel } });

  if (options.notify !== false && previous && rankTierIndex(rank.tier) > rankTierIndex(previous.tier)) {
    await addDoc(collection(db, 'notifications'), {
      receiverId: uid,
      senderId: uid,
      senderName: 'Rank',
      senderPhoto: '',
      type: 'achievement',
      message: `⬆️ Rank up! You are now ${rank.label}.`,
      targetId: '',
      extra: { link: '/profile' },
      read: false,
      createdAt: serverTimestamp(),
    });
  }
}

/** Recompute stats in the background after history changes (e.g. a deleted session). */
export function scheduleStatsReconcile(uid: string | undefined | null): void {
  if (!uid) return;
  reconcileUserStats(uid)
    .then(async stats => {
      const { useAuthStore } = await import('@/stores/auth-store');
      if (useAuthStore.getState().user?.uid === uid) useAuthStore.setState({ stats });
    })
    .catch(err => console.warn('[stats] reconcile failed', err));
}

export async function notifyUnlockedBadges(uid: string, badgeIds: string[]): Promise<void> {
  if (!badgeIds.length) return;
  await Promise.allSettled(badgeIds.map(id => {
    const badge = getBadge(id);
    if (!badge) return Promise.resolve();
    return addDoc(collection(db, 'notifications'), {
      receiverId: uid,
      senderId: uid,
      senderName: 'Achievements',
      senderPhoto: '',
      type: 'achievement',
      message: `${badge.icon} Achievement unlocked: ${badge.name}: ${badge.desc}`,
      targetId: '',
      extra: { link: '/achievements', badgeId: id },
      read: false,
      createdAt: serverTimestamp(),
    });
  }));
}
