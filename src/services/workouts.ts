import { collection, doc, setDoc, getDoc, runTransaction, Timestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Workout, UserStats } from '@/types';
import { summarizeProgressiveOverload } from '@/lib/progressive-overload';
import { isFollowing } from '@/services/social';

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

export const saveWorkout = async (userId: string, workout: Omit<Workout, 'id'>) => {
  const workoutRef = doc(collection(db, 'workouts'));
  const newWorkoutId = workoutRef.id;

  const statsRef = doc(db, 'users', userId, 'stats', 'current');
  let progressiveOverload;
  try {
    const previousSnapshot = await getDocs(query(collection(db, 'workouts'), where('userId', '==', userId), orderBy('startedAt', 'desc'), limit(250)));
    const previousWorkout = previousSnapshot.docs
      .map(item => item.data() as Workout)
      .find(item => item.dayId === workout.dayId && item.date !== workout.date && (item.exercises || []).length > 0) || null;
    progressiveOverload = summarizeProgressiveOverload(workout, previousWorkout);
  } catch {
    // Progressive overload is a nice-to-have — don't let it block saving.
    progressiveOverload = undefined;
  }

  await runTransaction(db, async (transaction) => {
    // 1. Read existing stats
    const statsDoc = await transaction.get(statsRef);
    let stats = statsDoc.data() as UserStats | undefined;
    
    if (!stats) {
      stats = {
        totalWorkouts: 0,
        totalCalories: 0,
        totalDurationMin: 0,
        totalVolume: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastWorkoutDate: null,
        xp: 0,
        prCount: 0,
        bestHold: 0,
        badges: []
      };
    }

    // 2. Calculate increments
    const calories = workout.calories || 0;
    const duration = workout.durationMin || 0;
    const volume = workout.volume || 0;
    
    // Calculate Streak
    const today = localDateKey(new Date());
    let newStreak = stats.currentStreak;
    if (stats.lastWorkoutDate !== today) {
       // If it's the very next day, increment
       const last = stats.lastWorkoutDate ? new Date(stats.lastWorkoutDate) : null;
       const yesterday = new Date();
       yesterday.setDate(yesterday.getDate() - 1);
       const yesterdayStr = localDateKey(yesterday);
       
       if (stats.lastWorkoutDate === yesterdayStr) {
         newStreak += 1;
       } else if (stats.lastWorkoutDate !== today) {
         newStreak = 1; // reset streak if gap > 1 day
       }
    }

    // Calculate XP (Example rule: 100 XP per workout + volume/1000 + duration)
    const xpEarned = 100 + Math.round(volume / 1000) + duration;
    const bestHold = Math.max(
      stats.bestHold || 0,
      ...(workout.exercises || []).flatMap(exercise => (exercise.sets || []).map(set => Number(set.seconds) || 0)),
    );

    // 3. Update stats object
    const newStats: UserStats = {
      ...stats,
      totalWorkouts: (stats.totalWorkouts || 0) + 1,
      totalCalories: (stats.totalCalories || 0) + calories,
      totalDurationMin: (stats.totalDurationMin || 0) + duration,
      totalVolume: (stats.totalVolume || 0) + volume,
      currentStreak: newStreak,
      longestStreak: Math.max(stats.longestStreak || 0, newStreak),
      lastWorkoutDate: today,
      xp: (stats.xp || 0) + xpEarned,
      prCount: (stats.prCount || 0) + (workout.exercises?.filter(e => e.isPR).length || 0),
      bestHold,
    };

    const workoutData: any = { ...workout, id: newWorkoutId, finishedAt: Timestamp.now() };
    if (progressiveOverload !== undefined) {
      workoutData.progressiveOverload = progressiveOverload;
    }
    
    // Deep clone/clean undefined to prevent Firestore errors
    const cleanedWorkoutData = removeUndefined(workoutData);

    transaction.set(workoutRef, cleanedWorkoutData);
    transaction.set(statsRef, newStats);
  });

  return newWorkoutId;
};

export const getUserWorkouts = async (userId: string, limitCount = 10): Promise<Workout[]> => {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    orderBy('startedAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workout));
};

/** Get the last N sessions for a specific exercise */
export const getExerciseHistory = async (
  userId: string,
  exerciseName: string,
  limitCount = 5
): Promise<{ date: string; sets: any[]; notes: string }[]> => {
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    orderBy('startedAt', 'desc'),
    limit(250)
  );
  const snapshot = await getDocs(q);
  const results: { date: string; sets: any[]; notes: string; seconds: number }[] = [];

  for (const d of snapshot.docs) {
    const workout = d.data() as Workout;
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
    where('visibility', '==', 'public'),
    orderBy('date', 'desc'),
    limit(limitCount),
  );
  const publicSnapshot = await getDocs(publicQuery);
  const visible = publicSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Workout));
  if (viewerId && viewerId !== userId && await isFollowing(viewerId, userId)) {
    const followerQuery = query(collection(db, 'workouts'), where('userId', '==', userId), where('visibility', '==', 'followers'), orderBy('date', 'desc'), limit(limitCount));
    const followerSnapshot = await getDocs(followerQuery);
    visible.push(...followerSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Workout)));
  }
  return visible.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limitCount);
};
