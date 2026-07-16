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

export function compareExerciseProgress(current: ExerciseLog, previous?: ExerciseLog | null) {
  const currentSets = completedSets(current);
  const previousSets = completedSets(previous);
  const currentVolume = exerciseTrainingVolume(current);
  const previousVolume = exerciseTrainingVolume(previous);
  const currentBest = Math.max(0, ...currentSets.map(set => Number(set.weight) || Number(set.reps) || Number(set.seconds) || 0));
  const previousBest = Math.max(0, ...previousSets.map(set => Number(set.weight) || Number(set.reps) || Number(set.seconds) || 0));
  return {
    progressed: !!previous && (currentVolume > previousVolume || currentSets.length > previousSets.length || currentBest > previousBest),
    currentVolume,
    previousVolume,
  };
}

export function summarizeProgressiveOverload(currentWorkout: Pick<Workout, 'exercises'>, previousWorkout?: Pick<Workout, 'date' | 'exercises'> | null): ProgressiveOverloadSummary {
  const currentExercises = currentWorkout.exercises || [];
  const previousExercises = previousWorkout?.exercises || [];
  const progressed: string[] = [];
  let currentVolume = 0;
  let previousVolume = 0;

  for (const current of currentExercises) {
    const previous = previousExercises.find(item => item.name.trim().toLowerCase() === current.name.trim().toLowerCase());
    const result = compareExerciseProgress(current, previous);
    currentVolume += result.currentVolume;
    previousVolume += result.previousVolume;
    if (result.progressed) progressed.push(current.name);
  }

  if (!previousWorkout) {
    return { status: 'first_session', message: 'First logged session — this is your baseline.', currentVolume, exercisesProgressed: [], exercisesTracked: currentExercises.length };
  }
  const volumeChangePercent = previousVolume > 0 ? Math.round(((currentVolume - previousVolume) / previousVolume) * 100) : undefined;
  const status = progressed.length > 0 || currentVolume > previousVolume ? 'progressed' : currentVolume < previousVolume ? 'regressed' : 'maintained';
  const message = status === 'progressed'
    ? `Progressive overload detected${volumeChangePercent !== undefined ? `: ${volumeChangePercent >= 0 ? '+' : ''}${volumeChangePercent}% training volume` : ''}.`
    : status === 'regressed' ? 'Training volume was lower than last time. Recover and build back up.' : 'Training matched your last session. Add a rep, set, or a little load next time.';
  return { status, message, previousDate: previousWorkout.date, previousVolume, currentVolume, volumeChangePercent, exercisesProgressed: progressed, exercisesTracked: currentExercises.length };
}
