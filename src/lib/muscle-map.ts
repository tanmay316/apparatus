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

/** Determine which anatomy regions are activated by a list of exercise names */
export function getActiveMuscles(exerciseNames: string[]): Set<MuscleRegion> {
  const active = new Set<MuscleRegion>();
  const libraryByName = new Map(COMPACT_LIBRARY.map(ex => [ex.name.toLowerCase(), ex]));

  for (const name of exerciseNames) {
    const ex = libraryByName.get(name.toLowerCase());
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
      const n = name.toLowerCase();
      if (n.includes('squat') || n.includes('lunge')) { active.add('quads'); active.add('glutes'); }
      if (n.includes('push') || n.includes('bench') || n.includes('press') || n.includes('fly')) active.add('chest');
      if (n.includes('pull') || n.includes('row') || n.includes('lat')) active.add('lats');
      if (n.includes('curl') || n.includes('bicep')) active.add('biceps');
      if (n.includes('tricep') || n.includes('dip') || n.includes('extension')) active.add('triceps');
      if (n.includes('deadlift') || n.includes('hip')) { active.add('hamstrings'); active.add('glutes'); active.add('lower_back'); }
      if (n.includes('shoulder') || n.includes('delt') || n.includes('press')) active.add('front_delts');
      if (n.includes('plank') || n.includes('crunch') || n.includes('sit') || n.includes('core') || n.includes('ab')) active.add('abs');
      if (n.includes('calf') || n.includes('calve')) active.add('calves');
    }
  }

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

function isBodyweightExercise(name: string): boolean {
  const n = name.toLowerCase();
  if (BODYWEIGHT_EXERCISES.has(n)) return true;
  // Fuzzy: if it has "bodyweight" in the name
  if (n.includes('bodyweight') || n.includes('body weight')) return true;
  return false;
}

/** Calculate total volume including bodyweight for BW exercises */
export function calculateShareVolume(
  exerciseLogs: Array<{ name: string; sets: Array<{ completed?: boolean; reps?: number; weight?: number; seconds?: number }> }>,
  bodyweightKg: number = 70
): number {
  let totalVolume = 0;
  for (const log of exerciseLogs) {
    const completedSets = log.sets.filter(s => s.completed);
    for (const set of completedSets) {
      const reps = set.reps || 0;
      if (reps > 0) {
        const weight = set.weight || (isBodyweightExercise(log.name) ? bodyweightKg : 0);
        totalVolume += weight * reps;
      }
    }
  }
  return Math.round(totalVolume);
}

/** Calculate total completed sets */
export function calculateTotalSets(
  exerciseLogs: Array<{ sets: Array<{ completed?: boolean }> }>
): number {
  return exerciseLogs.reduce((total, log) => total + log.sets.filter(s => s.completed).length, 0);
}
