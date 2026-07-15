import type { Exercise, ExerciseLog } from '@/types';

const DEFAULT_REP_RATE = 0.35;
const DEFAULT_HOLD_RATE = 0.08;

export function caloriesForExercise(exercise: Exercise | ExerciseLog, log: ExerciseLog, bodyWeightKg = 70): number {
  const weightFactor = Math.max(0.65, Math.min(1.5, bodyWeightKg / 70));
  const name = exercise.name.toLowerCase();
  const metadata = exercise as Exercise;
  const repRate = metadata.caloriesPerRep ?? (name.includes('squat') || name.includes('burpee') || name.includes('muscle') ? 0.5 : DEFAULT_REP_RATE);
  const holdRate = metadata.caloriesPerSecond ?? (name.includes('plank') || name.includes('hold') || name.includes('handstand') ? 0.09 : DEFAULT_HOLD_RATE);
  const completedSets = log.sets.filter(set => set.completed);
  const reps = completedSets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  const seconds = completedSets.reduce((sum, set) => sum + (Number(set.seconds) || 0), 0);
  const setBase = completedSets.length * 1.5;
  return (reps * repRate + seconds * holdRate + setBase) * weightFactor;
}

export function calculateWorkoutCalories(exercises: Exercise[], logs: ExerciseLog[], bodyWeightKg?: number | null): number {
  const byName = new Map(exercises.map(exercise => [exercise.name, exercise]));
  return Math.max(0, Math.round(logs.reduce((total, log) => total + caloriesForExercise(byName.get(log.name) || { name: log.name } as Exercise, log, bodyWeightKg || 70), 0)));
}
