/**
 * Muscle Map — Maps exercise names to anatomical muscle regions
 * Used to determine which muscles to highlight on the share card anatomy figure.
 */

import { COMPACT_LIBRARY } from '@/services/library';

// Canonical muscle region IDs used by the anatomy SVG
export type MuscleRegion =
  | 'chest'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'biceps'
  | 'forearms'
  | 'front_delts'
  | 'hip_flexors'
  | 'traps'
  | 'lats'
  | 'rear_delts'
  | 'triceps'
  | 'lower_back'
  | 'glutes'
  | 'hamstrings'
  | 'calves';

// Map library muscle group names → anatomy region IDs
export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Quads', 'Glutes', 
  'Hamstrings', 'Calves', 'Biceps', 'Forearms', 'Triceps', 'Core'
];

const GROUP_TO_REGIONS: Record<string, MuscleRegion[]> = {
  'Chest':        ['chest'],
  'Back':         ['lats', 'traps'],
  'Shoulders':    ['front_delts', 'rear_delts'],
  'Quads':        ['quads'],
  'Glutes':       ['glutes'],
  'Hamstrings':   ['hamstrings'],
  'Calves':       ['calves'],
  'Biceps':       ['biceps'],
  'Forearms':     ['forearms'],
  'Triceps':      ['triceps'],
  'Core':         ['abs', 'obliques'],
  // Secondary muscle labels
  'Traps':        ['traps'],
  'Upper Back':   ['traps', 'rear_delts'],
  'Lats':         ['lats'],
  'Rear Delts':   ['rear_delts'],
  'Front Delts':  ['front_delts'],
  'Obliques':     ['obliques'],
  'Lower Back':   ['lower_back'],
  'Hip Flexors':  ['hip_flexors'],
  'Lower Abs':    ['abs'],
  'Abs':          ['abs'],
  'Lower Chest':  ['chest'],
  'Upper Chest':  ['chest'],
  'Rotator Cuff': ['rear_delts'],
  'Shoulder Girdle': ['front_delts', 'rear_delts'],
};

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Determine which anatomy regions are activated by a list of exercise names. */
export function getActiveMuscles(exerciseNames: string[]): Set<MuscleRegion> {
  const active = new Set<MuscleRegion>();
  const libraryByName = new Map(COMPACT_LIBRARY.map(ex => [normalizeExerciseName(ex.name), ex]));

  for (const name of exerciseNames) {
    const ex = libraryByName.get(normalizeExerciseName(name));
    if (ex) {
      // Primary muscle group
      const primaryRegions = GROUP_TO_REGIONS[ex.muscleGroup];
      if (primaryRegions) primaryRegions.forEach(r => active.add(r));

      // Secondary muscles
      for (const sec of ex.secondaryMuscles) {
        const secRegions = GROUP_TO_REGIONS[sec];
        if (secRegions) secRegions.forEach(r => active.add(r));
      }
    } else {
      // Fuzzy fallback for custom exercises not in library
      const n = normalizeExerciseName(name);
      if (n.includes('pike push') || n.includes('handstand push')) { active.add('front_delts'); active.add('triceps'); }
      else if (n.includes('squat') || n.includes('lunge')) { active.add('quads'); active.add('glutes'); }
      else if (n.includes('push') || n.includes('bench') || n.includes('press') || n.includes('fly')) active.add('chest');
      else if (n.includes('pull') || n.includes('row') || n.includes('lat')) active.add('lats');
      else if (n.includes('curl') || n.includes('bicep')) active.add('biceps');
      if (n.includes('tricep') || n.includes('dip') || n.includes('extension')) active.add('triceps');
      if (n.includes('deadlift') || n.includes('hip')) { active.add('hamstrings'); active.add('glutes'); active.add('lower_back'); }
      if (n.includes('shoulder') || n.includes('delt') || n.includes('press')) active.add('front_delts');
      if (n.includes('plank') || n.includes('crunch') || n.includes('sit') || n.includes('core') || n.includes('ab')) active.add('abs');
      if (n.includes('calf') || n.includes('calve')) active.add('calves');
    }
  }

  return active;
}

/**
 * Determine activated regions from workout logs. An exercise contributes to
 * the anatomy only when at least one of its sets was explicitly completed.
 * This is the source of truth for workout sharing, so skipped/unstarted
 * exercises cannot appear as highlighted muscles.
 */
export function getActiveMusclesFromLogs(
  exerciseLogs: Array<{ name: string; muscleGroup?: string; sets: Array<{ completed?: boolean }> }>
): Set<MuscleRegion> {
  const active = new Set<MuscleRegion>();
  const completedExerciseNames: string[] = [];

  exerciseLogs.forEach(log => {
    if (log.sets.some(set => set.completed === true)) {
      if (log.muscleGroup) {
        const regions = GROUP_TO_REGIONS[log.muscleGroup];
        if (regions) {
          regions.forEach(r => active.add(r));
        } else {
          completedExerciseNames.push(log.name);
        }
      } else {
        completedExerciseNames.push(log.name);
      }
    }
  });

  const libraryActive = getActiveMuscles(completedExerciseNames);
  libraryActive.forEach(r => active.add(r));
  return active;
}

// ─── Bodyweight exercises for volume calculation ─────────────
const BODYWEIGHT_EXERCISES = new Set([
  'push-up', 'pushup', 'push up',
  'pull-up', 'pullup', 'pull up',
  'chin-up', 'chinup', 'chin up',
  'dip', 'bodyweight squat',
  'pistol squat', 'bulgarian split squat',
  'lunge', 'burpee', 'muscle-up', 'muscle up',
  'handstand push-up', 'handstand pushup',
  'pike push-up', 'pike pushup',
  'inverted row', 'body row',
  'jump squat', 'box jump',
  'step-up', 'calf raise',
  'standing calf raise',
]);

function isLoggedSet(set: { completed?: boolean; reps?: number; weight?: number; seconds?: number }): boolean {
  return set.completed === true || Number(set.reps) > 0 || Number(set.weight) > 0 || Number(set.seconds) > 0;
}

function isBodyweightExercise(name: string): boolean {
  const n = name.toLowerCase();
  if (BODYWEIGHT_EXERCISES.has(n)) return true;
  // Fuzzy: if it has "bodyweight" in the name
  if (n.includes('bodyweight') || n.includes('body weight') || n.includes('split squat') || n.includes('pistol squat')) return true;
  return false;
}

/** Reps performed without external resistance, displayed separately from
 * external kg·reps so bodyweight work is not reported as fake lifted weight. */
export function calculateBodyweightReps(
  exerciseLogs: Array<{ name: string; sets: Array<{ completed?: boolean; reps?: number }> }>
): number {
  return Math.round(exerciseLogs.reduce((total, log) => {
    if (!isBodyweightExercise(log.name)) return total;
    return total + log.sets.filter(isLoggedSet).reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  }, 0));
}

/** Calculate external-load volume for sharing. Bodyweight contributes to
 * calories, not kg·reps, so the displayed number stays meaningful. */
export function calculateShareVolume(
  exerciseLogs: Array<{ name: string; sets: Array<{ completed?: boolean; reps?: number; weight?: number; seconds?: number }> }>,
  bodyweightKg: number = 70
): number {
  let totalVolume = 0;
  for (const log of exerciseLogs) {
    const completedSets = log.sets.filter(isLoggedSet);
    for (const set of completedSets) {
      const reps = set.reps || 0;
      if (reps > 0) {
        totalVolume += (set.weight || 0) * reps;
      }
    }
  }
  return Math.round(totalVolume);
}

/** Calculate total completed sets */
export function calculateTotalSets(
  exerciseLogs: Array<{ sets: Array<{ completed?: boolean }> }>
): number {
  return exerciseLogs.reduce((total, log) => total + log.sets.filter(isLoggedSet).length, 0);
}
