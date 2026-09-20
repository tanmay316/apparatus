import { COMPACT_LIBRARY } from '@/services/library';
import {
  EXERCISE_ONTOLOGY,
  MODIFIERS,
  MUSCLE_GROUP_REGIONS,
  inferMusclesFromName,
  type MuscleMap,
  type MuscleWeight,
} from './exercise-ontology';

export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Quads', 'Glutes',
  'Hamstrings', 'Calves', 'Biceps', 'Forearms', 'Triceps', 'Core'
];

export type MuscleRegion =
  | 'chest'
  | 'upper_chest'
  | 'lower_chest'
  | 'abs'
  | 'lower_abs'
  | 'obliques'
  | 'quads'
  | 'biceps'
  | 'forearms'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'hip_flexors'
  | 'traps'
  | 'lats'
  | 'rhomboids'
  | 'triceps'
  | 'lower_back'
  | 'glutes'
  | 'hamstrings'
  | 'calves'
  | 'adductors';

export interface MuscleScore {
  muscle: MuscleRegion;
  score: number;
  role: 'primary' | 'secondary' | 'stabilizer';
}

export const isWarmupOrCooldown = (name: string, section?: string): boolean => {
  if (section === 'warmup' || section === 'cooldown') return true;
  const nameLower = name.toLowerCase();
  const keywords = [
    'warmup', 'warm-up', 'warm up',
    'cooldown', 'cool-down', 'cool down',
    'mobility', 'stretch', 'stretching',
    'breathing', 'breath', 'meditation', 'shodhana', 'bhastrika', 'bhramari', 'pranayama',
    'salutation', 'dislocation', 'pull-apart', 'wrist circle', 'arm circle', 'circles', 'prep',
    'pose', 'fold', 'twist', 'opener', 'dog', 'flow', 'scapular'
  ];
  if (keywords.some(k => nameLower.includes(k))) return true;

  const found = COMPACT_LIBRARY.find(ex => ex.name.toLowerCase() === nameLower);
  if (found && found.tags) {
    if (found.tags.some(t => {
      const tl = t.toLowerCase();
      return tl.includes('warmup') || tl.includes('stretch') || tl.includes('mobility') || tl.includes('yoga') || tl.includes('breathing') || tl.includes('meditation');
    })) {
      return true;
    }
  }
  return false;
};

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bdumbbells?\b/g, "db")
    .replace(/\bbarbells?\b/g, "bb")
    .replace(/\bresistance bands?\b/g, "band")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/**
 * Resolves a single exercise name deterministically to its weighted muscle scores.
 */
export function resolveExercise(name: string): MuscleScore[] {
  const norm = normalizeExerciseName(name);

  const matchedModifiers = Object.keys(MODIFIERS).filter(mod =>
    norm.includes(mod.replace('_', ' '))
  );

  // 1. Exact ID match
  let def = EXERCISE_ONTOLOGY.find(ex => ex.id === norm);

  // 2. Exact canonical name match
  if (!def) {
    def = EXERCISE_ONTOLOGY.find(ex => normalizeExerciseName(ex.name) === norm);
  }

  // 3. Alias match
  if (!def) {
    def = EXERCISE_ONTOLOGY.find(ex => ex.aliases.some(alias => normalizeExerciseName(alias) === norm));
  }

  // 4. Base exercise match — whole-word only, so "bench press" still matches
  // "paused bench press" but "dip" no longer matches "dipping bird pose".
  if (!def) {
    const sortedOntology = [...EXERCISE_ONTOLOGY].sort((a, b) => b.name.length - a.name.length);
    def = sortedOntology.find(ex =>
      containsPhrase(norm, normalizeExerciseName(ex.name)) ||
      ex.aliases.some(a => containsPhrase(norm, normalizeExerciseName(a)))
    );
  }

  if (def) {
    const scoresMap = new Map<MuscleRegion, MuscleScore>();

    const addScore = (mw: MuscleWeight, role: 'primary' | 'secondary' | 'stabilizer') => {
      scoresMap.set(mw.muscle, {
        muscle: mw.muscle,
        score: mw.weight,
        role
      });
    };

    def.muscles.primary.forEach(m => addScore(m, 'primary'));
    def.muscles.secondary.forEach(m => addScore(m, 'secondary'));
    if (def.muscles.stabilizers) {
      def.muscles.stabilizers.forEach(m => addScore(m, 'stabilizer'));
    }

    applyModifiers(scoresMap, matchedModifiers);
    return finalizeScores(scoresMap);
  }

  // 5. Movement-pattern inference from the name. Covers the long tail of
  // variations the curated ontology doesn't list (e.g. "Australian Row").
  const inferred = inferMusclesFromName(norm);
  if (inferred && Object.keys(inferred).length > 0) {
    return buildScores(inferred, matchedModifiers);
  }

  // 6. Library fallback — coarse muscle-group labels, used only when the name
  // itself reveals no movement pattern.
  const libraryMuscles = resolveFromLibrary(norm);
  if (libraryMuscles) {
    return buildScores(libraryMuscles, matchedModifiers);
  }

  return [];
}

/** Whole-word phrase containment, avoiding accidental substring matches. */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(^|\\s)${escapeRegex(needle)}(\\s|$)`).test(haystack);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildScores(muscles: MuscleMap, modifiers: string[]): MuscleScore[] {
  const scoresMap = new Map<MuscleRegion, MuscleScore>();
  Object.entries(muscles).forEach(([region, weight]) => {
    const w = weight as number;
    scoresMap.set(region as MuscleRegion, {
      muscle: region as MuscleRegion,
      score: w,
      role: w >= 0.85 ? 'primary' : w >= 0.5 ? 'secondary' : 'stabilizer',
    });
  });
  applyModifiers(scoresMap, modifiers);
  return finalizeScores(scoresMap);
}

function applyModifiers(scoresMap: Map<MuscleRegion, MuscleScore>, modifiers: string[]) {
  modifiers.forEach(mod => {
    const adjustments = MODIFIERS[mod];
    if (!adjustments) return;
    Object.entries(adjustments).forEach(([region, delta]) => {
      const m = region as MuscleRegion;
      if (scoresMap.has(m)) {
        scoresMap.get(m)!.score += (delta as number);
      } else if ((delta as number) > 0) {
        scoresMap.set(m, { muscle: m, score: (delta as number), role: 'stabilizer' });
      }
    });
  });
}

function finalizeScores(scoresMap: Map<MuscleRegion, MuscleScore>): MuscleScore[] {
  // 0.3 keeps genuine secondaries (pull-up traps/forearms sit at 0.4) while dropping
  // trivial stabilisers. The old 0.7 cutoff silently discarded most secondary work.
  return Array.from(scoresMap.values()).filter(s => s.score >= 0.3);
}

/** Maps a library entry's muscle-group labels onto anatomical regions. */
function resolveFromLibrary(norm: string): MuscleMap | null {
  const entry =
    COMPACT_LIBRARY.find(ex => normalizeExerciseName(ex.name) === norm) ||
    COMPACT_LIBRARY.find(ex => containsPhrase(norm, normalizeExerciseName(ex.name)));
  if (!entry) return null;

  const result: MuscleMap = {};
  const merge = (map: MuscleMap | undefined, scale: number) => {
    if (!map) return;
    Object.entries(map).forEach(([region, weight]) => {
      const m = region as MuscleRegion;
      const value = (weight as number) * scale;
      result[m] = Math.max(result[m] ?? 0, value);
    });
  };

  merge(MUSCLE_GROUP_REGIONS[entry.muscleGroup.toLowerCase()], 1);
  (entry.secondaryMuscles || []).forEach(sm => {
    merge(MUSCLE_GROUP_REGIONS[sm.toLowerCase()], 0.5);
  });

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Aggregates a list of exercises and their completed sets into a normalized
 * list of muscle scores, scaled such that the highest activated muscle is 1.0 (100%).
 */
export function aggregateWorkoutMuscles(
  exercises: { name: string; sets: number; isWarmup?: boolean }[]
): MuscleScore[] {
  const aggregated = new Map<MuscleRegion, MuscleScore>();

  for (const ex of exercises) {
    if (ex.isWarmup || isWarmupOrCooldown(ex.name)) continue;
    if (ex.sets === 0) continue;

    const scores = resolveExercise(ex.name);
    for (const score of scores) {
      const existing = aggregated.get(score.muscle);
      const addedScore = score.score * ex.sets;

      if (existing) {
        existing.score += addedScore;
        if (score.role === 'primary' && existing.role !== 'primary') {
          existing.role = 'primary';
        }
      } else {
        aggregated.set(score.muscle, {
          muscle: score.muscle,
          score: addedScore,
          role: score.role
        });
      }
    }
  }

  const values = Array.from(aggregated.values());
  if (values.length === 0) return [];

  const maxScore = Math.max(...values.map(v => v.score));

  return values
    .map(v => ({
      ...v,
      score: v.score / maxScore
    }))
    .sort((a, b) => b.score - a.score);
}

export function getActiveMuscleScores(exerciseNames: string[]): MuscleScore[] {
  return aggregateWorkoutMuscles(exerciseNames.map(n => ({ name: n, sets: 1 })));
}

export function getActiveMuscles(exerciseNames: string[]): Set<MuscleRegion> {
  const aggregated = getActiveMuscleScores(exerciseNames);
  return new Set(aggregated.map(a => a.muscle));
}

/**
 * Determine activated regions from workout logs.
 */
export function getActiveMusclesFromLogs(
  exerciseLogs: Array<{ name: string; sets: Array<{ completed?: boolean }> }>
): MuscleScore[] {
  const exercises = exerciseLogs.map(log => ({
    name: log.name,
    sets: log.sets.filter(s => s.completed).length
  }));

  return aggregateWorkoutMuscles(exercises);
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
  if (n.includes('bodyweight') || n.includes('body weight') || n.includes('split squat') || n.includes('pistol squat')) return true;
  return false;
}

export function calculateBodyweightReps(
  exerciseLogs: Array<{ name: string; sets: Array<{ completed?: boolean; reps?: number }> }>
): number {
  return Math.round(exerciseLogs.reduce((total, log) => {
    if (!isBodyweightExercise(log.name)) return total;
    return total + log.sets.filter(isLoggedSet).reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  }, 0));
}

export function calculateShareVolume(exerciseLogs: any[], bodyweightKg: number = 70): number {
  let totalVolume = 0;
  for (const log of exerciseLogs) {
    if (isWarmupOrCooldown(log.name, log.section)) continue;
    let completedSets = log.sets.filter(isLoggedSet);
    for (const set of completedSets) {
      const reps = set.reps || 0;
      if (reps > 0) {
        totalVolume += (set.weight || 0) * reps;
      }
    }
  }
  return Math.round(totalVolume);
}

export function calculateTotalSets(
  exerciseLogs: Array<{ sets: Array<{ completed?: boolean }> }>
): number {
  return exerciseLogs.reduce(
    (total, log) => total + log.sets.filter(set => set.completed).length,
    0
  );
}
