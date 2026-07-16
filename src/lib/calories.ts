import type { Exercise, ExerciseLog } from '@/types';

const DEFAULT_MET = 4.5;
const BODYWEIGHT_PATTERNS = /(pull[- ]?up|chin[- ]?up|push[- ]?up|dip|muscle[- ]?up|handstand|pistol squat|bodyweight squat|air squat|lunge|burpee|plank|crunch|sit[- ]?up|mountain climber|jump squat|calf raise)/i;

function isLoggedSet(set: { completed?: boolean; reps?: number; weight?: number; seconds?: number }): boolean {
  return set.completed === true || Number(set.reps) > 0 || Number(set.weight) > 0 || Number(set.seconds) > 0;
}

function isBodyweightExercise(exercise: Exercise | ExerciseLog): boolean {
  const name = exercise.name.toLowerCase();
  const equipment = String((exercise as Exercise).equipment || '').toLowerCase();
  if (equipment && /(barbell|dumbbell|kettlebell|cable|machine|plate|smith|ez[- ]?bar)/i.test(equipment)) {
    return false;
  }
  return BODYWEIGHT_PATTERNS.test(name);
}

/** MET estimate for the exercise category. The result is an estimate, not a medical measurement. */
export function getExerciseMet(exercise: Exercise | ExerciseLog): number {
  const explicit = Number((exercise as Exercise).met);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const name = exercise.name.toLowerCase();
  if (/(squat|deadlift|lunge|burpee|muscle[- ]?up|pull[- ]?up|chin[- ]?up|dip|push[- ]?up|row|clean|snatch)/i.test(name)) return 6;
  if (/(run|jump|sprint|mountain climber)/i.test(name)) return 7;
  if (/(stretch|mobility|breath|warm[- ]?up|shoulder dislocation)/i.test(name)) return 2.8;
  if (/(curl|extension|raise|fly|kickback|hold|plank|crunch)/i.test(name)) return 3.5;
  return DEFAULT_MET;
}

/** Training volume is external resistance only. Bodyweight is used for
 * calorie estimation, but is not added to kg·reps because that inflates the
 * metric and makes pull-ups look like thousands of kilograms lifted. */
export function calculateExerciseVolume(exercise: Exercise | ExerciseLog, log: ExerciseLog, bodyWeightKg = 70): number {
  return log.sets
    .filter(set => isLoggedSet(set) && log.mode === 'reps')
    .reduce((total, set) => {
      const externalLoad = Number(set.weight) || 0;
      return total + externalLoad * (Number(set.reps) || 0);
    }, 0);
}

export function calculateWorkoutVolume(exercises: Exercise[], logs: ExerciseLog[], bodyWeightKg = 70): number {
  const byName = new Map(exercises.map(exercise => [exercise.name.toLowerCase(), exercise]));
  return Math.round(logs.reduce((total, log) => total + calculateExerciseVolume(byName.get(log.name.toLowerCase()) || log, log, bodyWeightKg), 0));
}

export function caloriesForExercise(exercise: Exercise | ExerciseLog, log: ExerciseLog, bodyWeightKg = 70): number {
  const completedSets = log.sets.filter(isLoggedSet);
  const activeMinutes = completedSets.reduce((sum, set) => sum + (Number(set.seconds) || 0), 0) / 60 + completedSets.length * 0.75;
  return activeMinutes * (getExerciseMet(exercise) * 3.5 * bodyWeightKg) / 200;
}

export function calculateWorkoutCalories(
  exercises: Exercise[] | null | undefined,
  logs: ExerciseLog[],
  bodyWeightKg?: number | null,
  durationMin?: number
): number {
  const byName = new Map((exercises || []).map(exercise => [exercise.name, exercise]));
  const completedLogs = logs.filter(log => log.sets.some(isLoggedSet));
  if (completedLogs.length === 0) return 0;

  const totalSets = completedLogs.reduce((sum, log) => sum + log.sets.filter(isLoggedSet).length, 0);
  const weightedMet = completedLogs.reduce((sum, log) => {
    const exercise = byName.get(log.name) || ({ name: log.name } as Exercise);
    return sum + getExerciseMet(exercise) * log.sets.filter(isLoggedSet).length;
  }, 0) / Math.max(1, totalSets);
  const estimatedDuration = completedLogs.reduce((sum, log) => {
    const exercise = byName.get(log.name) || ({ name: log.name } as Exercise);
    return sum + caloriesForExercise(exercise, log, bodyWeightKg || 70);
  }, 0);
  const minutes = durationMin && durationMin > 0 ? durationMin : Math.max(1, estimatedDuration / ((weightedMet * 3.5 * (bodyWeightKg || 70)) / 200));
  return Math.max(0, Math.round(minutes * (weightedMet * 3.5 * (bodyWeightKg || 70)) / 200));
}
