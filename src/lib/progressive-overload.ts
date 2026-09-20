import type { ExerciseLog, ProgressiveOverloadSummary, SetData, Workout } from '@/types';

function completedSets(exercise?: ExerciseLog | null): SetData[] {
  return (exercise?.sets || []).filter(set => set.completed !== false && (Number(set.reps) > 0 || Number(set.seconds) > 0 || Number(set.weight) > 0));
}

export function exerciseTrainingVolume(exercise?: ExerciseLog | null): number {
  return completedSets(exercise).reduce((total, set) => {
    const repsOrSeconds = Number(set.reps) || Number(set.seconds) || 0;
    const weight = Number(set.weight) || 0;
    return total + (weight > 0 ? weight * repsOrSeconds : repsOrSeconds);
  }, 0);
}

// Epley formula: estimates the 1-rep-max a lifter could achieve at a given weight/reps,
// so a heavier-but-lower-rep set and a lighter-but-higher-rep set can be compared fairly.
function estimatedOneRepMax(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

// The single best set of a session, measured on a consistent scale for the exercise type
// (strength load for weighted lifts, reps for bodyweight work, hold time for isometrics).
// Mixing these units together (e.g. treating "20 reps" as bigger than "10kg") was the root
// cause of false "progress" being reported before.
function bestSetMetric(exercise?: ExerciseLog | null): number {
  const sets = completedSets(exercise);
  if (sets.length === 0) return 0;

  if (exercise?.mode === 'hold') {
    return Math.max(0, ...sets.map(set => Number(set.seconds) || 0));
  }

  const weightedSets = sets.filter(set => Number(set.weight) > 0);
  if (weightedSets.length > 0) {
    return Math.max(0, ...weightedSets.map(set => estimatedOneRepMax(Number(set.weight) || 0, Number(set.reps) || 0)));
  }

  const bestReps = Math.max(0, ...sets.map(set => Number(set.reps) || 0));
  if (bestReps > 0) return bestReps;

  return Math.max(0, ...sets.map(set => Number(set.seconds) || 0));
}

// Small tolerance so floating point noise from the 1RM estimate doesn't register as "progress".
const IMPROVEMENT_TOLERANCE = 1.01;

export function compareExerciseProgress(current: ExerciseLog, previous?: ExerciseLog | null) {
  const currentVolume = exerciseTrainingVolume(current);
  const previousVolume = exerciseTrainingVolume(previous);
  const currentBest = bestSetMetric(current);
  const previousBest = bestSetMetric(previous);

  // Real progressive overload means lifting more/harder (best set improved) or doing more
  // total work (volume improved) — merely adding an extra set/rep at a lower load doesn't count.
  const bestImproved = !!previous && previousBest > 0 && currentBest > previousBest * IMPROVEMENT_TOLERANCE;
  const volumeImproved = !!previous && previousVolume > 0 && currentVolume > previousVolume * IMPROVEMENT_TOLERANCE;

  return {
    progressed: !!previous && (bestImproved || volumeImproved),
    currentVolume,
    previousVolume,
    currentBest,
    previousBest,
  };
}

type WorkoutHistoryEntry = Pick<Workout, 'date' | 'exercises'>;

export function summarizeProgressiveOverload(
  currentWorkout: Pick<Workout, 'exercises'>,
  previousWorkouts?: WorkoutHistoryEntry[] | WorkoutHistoryEntry | null,
  isFirstWorkoutEver?: boolean
): ProgressiveOverloadSummary {
  const currentExercises = currentWorkout.exercises || [];
  // Accept either a full history array (preferred) or a single previous workout for
  // backwards compatibility with older call sites.
  const history: WorkoutHistoryEntry[] = Array.isArray(previousWorkouts)
    ? previousWorkouts
    : previousWorkouts
      ? [previousWorkouts]
      : [];
  const hasHistory = history.some(w => (w.exercises || []).length > 0);

  if (!hasHistory) {
    const message = isFirstWorkoutEver ? 'First logged session. This is your baseline.' : '';
    const currentVolume = currentExercises.reduce((total, exercise) => total + exerciseTrainingVolume(exercise), 0);
    return { status: 'first_session', message, currentVolume, exercisesProgressed: [], exercisesTracked: currentExercises.length };
  }

  const progressed: string[] = [];
  let currentVolume = 0;
  let previousVolume = 0;
  let mostRecentMatchDate: string | undefined;

  for (const current of currentExercises) {
    const name = current.name.trim().toLowerCase();

    // Compare against this exercise's own personal best from prior sessions (the best set
    // seen so far), not just whatever was logged in the single most recent workout.
    let bestPrevious: ExerciseLog | null = null;
    let bestPreviousMetric = -1;
    let bestPreviousDate: string | undefined;
    for (const workout of history) {
      const match = (workout.exercises || []).find(exercise => exercise.name.trim().toLowerCase() === name);
      if (!match) continue;
      const metric = bestSetMetric(match);
      if (!bestPrevious || metric > bestPreviousMetric) {
        bestPrevious = match;
        bestPreviousMetric = metric;
        bestPreviousDate = workout.date;
      }
    }

    const result = compareExerciseProgress(current, bestPrevious);
    currentVolume += result.currentVolume;
    if (bestPrevious) {
      previousVolume += result.previousVolume;
      if (!mostRecentMatchDate || (bestPreviousDate && bestPreviousDate > mostRecentMatchDate)) {
        mostRecentMatchDate = bestPreviousDate;
      }
    }
    if (result.progressed) progressed.push(current.name);
  }

  const volumeChangePercent = previousVolume > 0 ? Math.round(((currentVolume - previousVolume) / previousVolume) * 100) : undefined;
  const status = progressed.length > 0 || currentVolume > previousVolume * IMPROVEMENT_TOLERANCE
    ? 'progressed'
    : currentVolume < previousVolume ? 'regressed' : 'maintained';
  const message = status === 'progressed'
    ? `Progressive overload detected${volumeChangePercent !== undefined ? `: ${volumeChangePercent >= 0 ? '+' : ''}${volumeChangePercent}% training volume` : ''}.`
    : status === 'regressed' ? 'Training volume was lower than last time. Recover and build back up.' : 'Training matched your last session. Add a rep, set, or a little load next time.';
  return { status, message, previousDate: mostRecentMatchDate, previousVolume, currentVolume, volumeChangePercent, exercisesProgressed: progressed, exercisesTracked: currentExercises.length };
}

