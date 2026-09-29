import { collection, doc, setDoc, getDoc, runTransaction, Timestamp, query, where, getDocs, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Workout, UserStats, ProgressiveOverloadSummary } from '@/types';
import { findPersonalRecords, summarizeProgressiveOverload } from '@/lib/progressive-overload';
import { applySession, bestHoldSeconds, completesPlanWeek, heaviestLiftKg, localDateKey } from '@/lib/stats';
import { workoutMetrics } from '@/lib/performance';
import { isFollowing, visibilityForUser } from '@/services/social';
import { notifyUnlockedBadges, scheduleStatsReconcile, syncAthleteRank } from '@/services/stats';

function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === 'object') {
    if (obj instanceof Timestamp) return obj;
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

export interface SaveWorkoutResult {
  id: string;
  xpEarned: number;
  streakBonus: number;
  prCount: number;
  unlockedBadges: string[];
  progressiveOverload?: ProgressiveOverloadSummary;
}

export const saveWorkout = async (userId: string, workout: Omit<Workout, 'id'>): Promise<SaveWorkoutResult> => {
  const workoutRef = doc(collection(db, 'workouts'));
  const newWorkoutId = workoutRef.id;

  const statsRef = doc(db, 'users', userId, 'stats', 'current');
  let progressiveOverload;
  let earlierWorkouts: Workout[] = [];
  try {
    const previousSnapshot = await getDocs(query(collection(db, 'workouts'), where('userId', '==', userId)));
    const isFirstWorkoutEver = previousSnapshot.empty;
    earlierWorkouts = previousSnapshot.docs.map(item => ({ id: item.id, ...item.data() } as Workout));
    // Pass full workout history (not just the last session on the same plan day) so each
    // exercise is compared against its own true personal best, which is what "progressive
    // overload" actually means.
    const previousWorkouts = earlierWorkouts
      .filter(item => item.date !== workout.date && (item.exercises || []).length > 0)
      .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
    progressiveOverload = summarizeProgressiveOverload(workout, previousWorkouts, isFirstWorkoutEver);
  } catch {
    // Progressive overload is a nice-to-have - don't let it block saving.
    progressiveOverload = undefined;
  }

  const personalRecords = new Set(findPersonalRecords(workout, earlierWorkouts));
  const exercises = (workout.exercises || []).map(exercise => ({ ...exercise, isPR: personalRecords.has(exercise.name) }));
  const dateKey = workout.date || localDateKey(new Date());

  let daysPerWeek = 0;
  if (workout.planId) {
    try {
      const plan = await getDoc(doc(db, 'plans', workout.planId));
      daysPerWeek = Number(plan.data()?.daysPerWeek) || 0;
    } catch { /* sample or deleted plan */ }
  }
  const fullWeek = completesPlanWeek({ ...workout, date: dateKey }, earlierWorkouts, daysPerWeek);
  const visibility = await visibilityForUser(userId, workout.visibility);

  const result = await runTransaction(db, async (transaction) => {
    const statsDoc = await transaction.get(statsRef);
    const outcome = applySession(statsDoc.data() as UserStats | undefined, {
      kind: 'workout',
      dateKey,
      calories: workout.calories || 0,
      durationMin: workout.durationMin || 0,
      volume: workout.volume || 0,
      prCount: personalRecords.size,
      bestHold: bestHoldSeconds(workout),
      maxLiftKg: heaviestLiftKg(workout),
      fullWeek,
      metrics: workoutMetrics(workout),
    });

    const workoutData: any = { ...workout, exercises, visibility, date: dateKey, id: newWorkoutId, finishedAt: Timestamp.now() };
    if (progressiveOverload !== undefined) {
      workoutData.progressiveOverload = progressiveOverload;
    }

    transaction.set(workoutRef, removeUndefined(workoutData));
    transaction.set(statsRef, outcome.stats);
    return outcome;
  });

  notifyUnlockedBadges(userId, result.unlocked).catch(() => {});
  syncAthleteRank(userId, result.stats).catch(() => {});

  // Auto-track challenge progress (fire-and-forget)
  try {
    const { getActiveAutoTrackChallenges, addChallengeProgressLog } = await import('@/services/community');
    const matches = await getActiveAutoTrackChallenges(userId, 'workout');

    for (const { challenge } of matches) {
      let value = 0;
      const metric = challenge.metric;
      if (metric === 'workouts') value = 1;
      else if (metric === 'calories') value = workout.calories || 0;
      else if (metric === 'duration') value = workout.durationMin || 0;

      if (value > 0 && challenge.id) {
        await addChallengeProgressLog({
          challengeId: challenge.id,
          userId,
          userName: workout.userName || '',
          userPhoto: workout.userPhoto || '',
          value,
          unit: challenge.unit,
          source: 'auto_workout',
          sourceActivityId: newWorkoutId,
        });
      }
    }
  } catch { /* auto-track is non-critical */ }

  return { id: newWorkoutId, xpEarned: result.xpEarned, streakBonus: result.streakBonus, prCount: personalRecords.size, unlockedBadges: result.unlocked, progressiveOverload };
};

/** A saved workout plus the user's full workout history, for session analysis. */
export const getWorkoutWithHistory = async (userId: string, workoutId: string): Promise<{ workout: Workout; history: Workout[] } | null> => {
  const snap = await getDoc(doc(db, 'workouts', workoutId));
  if (!snap.exists()) return null;
  const workout = { id: snap.id, ...snap.data() } as Workout;
  if (workout.userId !== userId) return null;
  const historySnap = await getDocs(query(collection(db, 'workouts'), where('userId', '==', userId)));
  return { workout, history: historySnap.docs.map(item => ({ id: item.id, ...item.data() } as Workout)) };
};

export const getUserWorkouts = async (userId: string, limitCount = 10): Promise<Workout[]> => {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId)
  );
  
  const snapshot = await getDocs(q);
  const allWorkouts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workout));
  return allWorkouts
    .sort((a, b) => {
      const timeA = a.startedAt?.seconds || 0;
      const timeB = b.startedAt?.seconds || 0;
      return timeB - timeA;
    })
    .slice(0, limitCount);
};

/** Get the last N sessions for a specific exercise */
export const getExerciseHistory = async (
  userId: string,
  exerciseName: string,
  limitCount = 5
): Promise<{ date: string; sets: any[]; notes: string }[]> => {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(q);
  
  const allDocs = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() } as Workout))
    .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0))
    .slice(0, 250);

  const results: { date: string; sets: any[]; notes: string; seconds: number }[] = [];

  for (const workout of allDocs) {
    const match = workout.exercises?.find(e => e.name === exerciseName);
    if (match) {
      results.push({
        date: workout.date,
        sets: match.sets || [],
        notes: match.notes || '',
        seconds: workout.startedAt?.seconds || 0,
      });
    }
  }

  return results
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limitCount)
    .map(({ date, sets, notes }) => ({ date, sets, notes }));
};

/** Get all workouts within a date range (inclusive) */
export const getWorkoutsByDateRange = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<Workout[]> => {
  try {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() } as Workout))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.warn('Date-range workout query failed; using owner-scoped fallback.', error);
    const snapshot = await getDocs(query(collection(db, 'workouts'), where('userId', '==', userId)));
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() } as Workout))
      .filter(workout => workout.date >= startDate && workout.date <= endDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
};

export const getPublicWorkoutsForUser = async (userId: string, viewerId?: string, limitCount = 20): Promise<Workout[]> => {
  const publicQuery = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    where('visibility', '==', 'public')
  );
  const publicSnapshot = await getDocs(publicQuery);
  const visible = publicSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
  
  if (viewerId && viewerId !== userId && await isFollowing(viewerId, userId)) {
    const followerQuery = query(collection(db, 'workouts'), where('userId', '==', userId), where('visibility', '==', 'followers'));
    const followerSnapshot = await getDocs(followerQuery);
    visible.push(...followerSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Workout)));
  }
  
  return visible.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limitCount);
};

export const deleteWorkout = async (workoutId: string): Promise<void> => {
  await deleteDoc(doc(db, 'workouts', workoutId));
  scheduleStatsReconcile(auth.currentUser?.uid);
};
