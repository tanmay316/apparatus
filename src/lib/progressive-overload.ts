import type { ExerciseLog, ExerciseVolumeChange, ProgressiveOverloadSummary, SetData, Workout } from '@/types';

export function completedSets(exercise?: ExerciseLog | null): SetData[] {
  return (exercise?.sets || []).filter(set => set.completed !== false && (Number(set.reps) > 0 || Number(set.seconds) > 0 || Number(set.weight) > 0));
}

export function exerciseVolumeUnit(exercise?: ExerciseLog | null): ExerciseVolumeChange['unit'] {
  const sets = completedSets(exercise);
  if (sets.some(set => Number(set.weight) > 0)) return 'kg';
  if (exercise?.mode === 'hold' || (sets.length > 0 && sets.every(set => !(Number(set.reps) > 0) && Number(set.seconds) > 0))) return 's';
  return 'reps';
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
export function estimatedOneRepMax(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

// The single best set of a session, measured on a consistent scale for the exercise type
// (strength load for weighted lifts, reps for bodyweight work, hold time for isometrics).
// Mixing these units together (e.g. treating "20 reps" as bigger than "10kg") was the root
// cause of false "progress" being reported before.
export function bestSetMetric(exercise?: ExerciseLog | null): number {
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
  // total work (volume improved) - merely adding an extra set/rep at a lower load doesn't count.
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

/** Exercises whose best set beats every earlier logged session of the same exercise. */
export function findPersonalRecords(
  currentWorkout: Pick<Workout, 'exercises'>,
  history: Pick<Workout, 'exercises'>[],
): string[] {
  const records: string[] = [];
  for (const current of currentWorkout.exercises || []) {
    const name = current.name?.trim().toLowerCase();
    if (!name) continue;
    const currentBest = bestSetMetric(current);
    if (currentBest <= 0) continue;
    let previousBest = 0;
    for (const workout of history) {
      const match = (workout.exercises || []).find(exercise => exercise.name?.trim().toLowerCase() === name);
      if (match) previousBest = Math.max(previousBest, bestSetMetric(match));
    }
    if (previousBest > 0 && currentBest > previousBest * IMPROVEMENT_TOLERANCE) records.push(current.name);
  }
  return records;
}

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
  const exerciseChanges: { name: string; changePercent: number }[] = [];
  const exerciseVolumes: ExerciseVolumeChange[] = [];
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
    const change = percentChange(result.currentBest, result.previousBest) ?? percentChange(result.currentVolume, result.previousVolume);
    if (bestPrevious && change !== undefined) exerciseChanges.push({ name: current.name, changePercent: change });
    exerciseVolumes.push({
      name: current.name,
      unit: exerciseVolumeUnit(current),
      currentVolume: Math.round(result.currentVolume),
      ...(bestPrevious ? { previousVolume: Math.round(result.previousVolume) } : {}),
      ...(bestPrevious && result.previousVolume > 0
        ? { changePercent: Math.round(((result.currentVolume - result.previousVolume) / result.previousVolume) * 100) }
        : {}),
    });
  }

  const volumeChangePercent = previousVolume > 0 ? Math.round(((currentVolume - previousVolume) / previousVolume) * 100) : undefined;
  const status = progressed.length > 0 || currentVolume > previousVolume * IMPROVEMENT_TOLERANCE
    ? 'progressed'
    : currentVolume < previousVolume ? 'regressed' : 'maintained';
  exerciseChanges.sort((a, b) => b.changePercent - a.changePercent);
  const message = describeOverload(status, volumeChangePercent, exerciseChanges);
  return { status, message, previousDate: mostRecentMatchDate, previousVolume, currentVolume, volumeChangePercent, exercisesProgressed: progressed, exercisesTracked: currentExercises.length, exerciseChanges, exerciseVolumes };
}

function percentChange(current: number, previous: number): number | undefined {
  if (previous <= 0 || current <= 0) return undefined;
  const change = Math.round(((current - previous) / previous) * 100);
  return change === 0 ? undefined : change;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

/** Plain-language summary with the volume change and the biggest per-exercise moves. */
export function describeOverload(
  status: ProgressiveOverloadSummary['status'],
  volumeChangePercent: number | undefined,
  changes: { name: string; changePercent: number }[],
): string {
  const gains = changes.filter(c => c.changePercent > 0).slice(0, 2);
  const drops = changes.filter(c => c.changePercent < 0).slice(-2).reverse();
  const list = (items: typeof changes) => items.map(c => `${c.name} ${signed(c.changePercent)}`).join(', ');

  let headline: string;
  if (volumeChangePercent === undefined) headline = 'New exercises logged. This session sets your baseline.';
  else if (volumeChangePercent > 0) headline = `Training volume up ${volumeChangePercent}% vs your previous best.`;
  else if (volumeChangePercent < 0) headline = `Training volume down ${Math.abs(volumeChangePercent)}% vs your previous best.`;
  else headline = 'Training volume matched your previous best.';

  const parts = [headline];
  if (gains.length) parts.push(`Top gains: ${list(gains)}.`);
  if (status === 'regressed' && drops.length) parts.push(`Biggest drops: ${list(drops)}.`);
  if (status === 'regressed') parts.push('Recover well and build back up next time.');
  if (status === 'maintained') parts.push('Add a rep, a set or a little load next time.');
  return parts.join(' ');
}

