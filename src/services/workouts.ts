import { collection, doc, setDoc, getDoc, runTransaction, Timestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Workout, UserStats } from '@/types';

export const saveWorkout = async (userId: string, workout: Omit<Workout, 'id'>) => {
  const workoutRef = doc(collection(db, 'workouts'));
  const newWorkoutId = workoutRef.id;

  const statsRef = doc(db, 'users', userId, 'stats', 'current');

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
    const today = new Date().toISOString().split('T')[0];
    let newStreak = stats.currentStreak;
    if (stats.lastWorkoutDate !== today) {
       // If it's the very next day, increment
       const last = stats.lastWorkoutDate ? new Date(stats.lastWorkoutDate) : null;
       const yesterday = new Date();
       yesterday.setDate(yesterday.getDate() - 1);
       const yesterdayStr = yesterday.toISOString().split('T')[0];
       
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
      totalWorkouts: stats.totalWorkouts + 1,
      totalCalories: stats.totalCalories + calories,
      totalDurationMin: stats.totalDurationMin + duration,
      totalVolume: stats.totalVolume + volume,
      currentStreak: newStreak,
      longestStreak: Math.max(stats.longestStreak, newStreak),
      lastWorkoutDate: today,
      xp: stats.xp + xpEarned,
      prCount: stats.prCount + (workout.exercises?.filter(e => e.isPR).length || 0),
      bestHold,
    };

    // 4. Write data
    transaction.set(workoutRef, { ...workout, id: newWorkoutId, finishedAt: Timestamp.now() });
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
  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workout));
};
