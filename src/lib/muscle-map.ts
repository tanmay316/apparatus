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

export const MUSCLE_LABELS: Record<MuscleRegion, string> = {
  chest: 'Chest',
  upper_chest: 'Upper chest',
  lower_chest: 'Lower chest',
  abs: 'Abs',
  lower_abs: 'Lower abs',
  obliques: 'Obliques',
  quads: 'Quads',
  biceps: 'Biceps',
  forearms: 'Forearms',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  hip_flexors: 'Hip flexors',
  traps: 'Traps',
  lats: 'Lats',
  rhomboids: 'Mid back',
  triceps: 'Triceps',
  lower_back: 'Lower back',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  adductors: 'Adductors',
};

const WARMUP_PATTERN = new RegExp(
  [
    'warm ?up', 'cool ?down', 'mobility', 'stretch', 'breathing', 'breath', 'meditation',
    'shodhana', 'bhastrika', 'bhramari', 'pranayama', 'salutation', 'namaskar', 'dislocat',
    'pull-apart', 'wrist circle', 'arm circle', 'circles', 'prep', 'fold', 'spinal twist',
    'supine twist', 'seated twist', 'opener', 'downward dog', 'upward dog', 'flow', 'scapular',
    'foam roll', 'german hang', "child'?s pose", 'pigeon pose', 'cobra', 'cat cow', 'cat-cow',
  ].map(k => `\\b${k}`).join('|'),
  'i',
);
// Skills whose names contain yoga words but are real training.
const NOT_WARMUP = /\b(crow|crane|handstand|russian twist)\b/i;

export const isWarmupOrCooldown = (name: string, section?: string): boolean => {
  if (section === 'warmup' || section === 'cooldown') return true;
  const nameLower = name.toLowerCase();
  if (NOT_WARMUP.test(nameLower)) return false;
  if (WARMUP_PATTERN.test(nameLower) || /\bpose\b/.test(nameLower)) return true;

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

const SINGULAR_EXCEPTIONS: Record<string, string> = { calves: 'calf', ups: 'up', abs: 'abs', press: 'press', plus: 'plus' };

function singular(word: string): string {
  if (SINGULAR_EXCEPTIONS[word]) return SINGULAR_EXCEPTIONS[word];
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return word;
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** Lower case, singular, compound words joined ("Push-Ups" → "pushup", "Dumbbell" → "db"). */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_/+&()[\]{}.,:;!?]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
    .replace(/\bdumbbell\b/g, 'db')
    .replace(/\bbarbell\b/g, 'bb')
    .replace(/\bresistance band\b/g, 'band')
    .replace(/\b(push|pull|chin|sit|step|muscle|press) up\b/g, '$1up')
    .replace(/\b(pull|push) down\b/g, '$1down')
    .trim();
}

/**
 * Resolves a single exercise name deterministically to its weighted muscle scores.
 */
export function resolveExercise(name: string): MuscleScore[] {
  const norm = normalizeExerciseName(name);

  // 1-3. Exact id, canonical name or alias of a curated lift.
  const def =
    EXERCISE_ONTOLOGY.find(ex => ex.id === norm.replace(/ /g, '_')) ||
    EXERCISE_ONTOLOGY.find(ex => normalizeExerciseName(ex.name) === norm) ||
    EXERCISE_ONTOLOGY.find(ex => ex.aliases.some(alias => normalizeExerciseName(alias) === norm));
  if (def) return buildScores(definitionMuscles(def), norm);

  // 4. Movement pattern read from the name. Runs before loose ontology matching so
  // "pike push-up" is a shoulder press, not a push-up, and "leg curl" is not a biceps curl.
  const inferred = inferMusclesFromName(norm);
  if (inferred && Object.keys(inferred).length > 0) return buildScores(inferred, norm);

  // 5. A curated lift named inside a longer name ("paused bench press").
  const sortedOntology = [...EXERCISE_ONTOLOGY].sort((a, b) => b.name.length - a.name.length);
  const loose = sortedOntology.find(ex =>
    containsPhrase(norm, normalizeExerciseName(ex.name)) ||
    ex.aliases.some(a => containsPhrase(norm, normalizeExerciseName(a)))
  );
  if (loose) return buildScores(definitionMuscles(loose), norm);

  // 6. Library fallback - coarse muscle-group labels.
  const libraryMuscles = resolveFromLibrary(norm);
  if (libraryMuscles) return buildScores(libraryMuscles, norm);

  return [];
}

function definitionMuscles(def: (typeof EXERCISE_ONTOLOGY)[number]): MuscleMap {
  const map: MuscleMap = {};
  [...def.muscles.primary, ...def.muscles.secondary, ...(def.muscles.stabilizers || [])]
    .forEach((mw: MuscleWeight) => { map[mw.muscle] = mw.weight; });
  return map;
}

/** Whole-word phrase containment, avoiding accidental substring matches. */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(^|\\s)${escapeRegex(needle)}(\\s|$)`).test(haystack);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildScores(muscles: MuscleMap, norm: string): MuscleScore[] {
  const weights: MuscleMap = { ...muscles };
  for (const mod of MODIFIERS) {
    if (!mod.match.test(norm) || !mod.requires.some(m => (weights[m] ?? 0) > 0)) continue;
    Object.entries(mod.adjust).forEach(([region, delta]) => {
      const m = region as MuscleRegion;
      weights[m] = Math.min(1, Math.max(0, (weights[m] ?? 0) + (delta as number)));
    });
  }
  // 0.3 keeps genuine secondaries (pull-up traps sit at 0.4) while dropping trivial stabilisers.
  return Object.entries(weights)
    .map(([region, w]) => ({
      muscle: region as MuscleRegion,
      score: w as number,
      role: ((w as number) >= 0.85 ? 'primary' : (w as number) >= 0.5 ? 'secondary' : 'stabilizer') as MuscleScore['role'],
    }))
    .filter(s => s.score >= 0.3);
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

const FOCUS_GROUP: Partial<Record<MuscleRegion, MuscleRegion>> = { upper_chest: 'chest', lower_chest: 'chest', lower_abs: 'abs' };

/** Top trained muscles for display, with chest/abs sub-regions merged and % of the top muscle. */
export function muscleFocus(scores: MuscleScore[], count: number): { muscle: MuscleRegion; label: string; pct: number }[] {
  const merged = new Map<MuscleRegion, number>();
  for (const s of scores) {
    const key = FOCUS_GROUP[s.muscle] ?? s.muscle;
    merged.set(key, Math.max(merged.get(key) || 0, s.score));
  }
  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] || 1;
  return sorted.slice(0, count).map(([muscle, score]) => ({ muscle, label: MUSCLE_LABELS[muscle], pct: Math.round((score / top) * 100) }));
}

export function getActiveMuscles(exerciseNames: string[]): Set<MuscleRegion> {
  const aggregated = getActiveMuscleScores(exerciseNames);
  return new Set(aggregated.map(a => a.muscle));
}

/**
 * Determine activated regions from workout logs, weighted by logged sets.
 */
export function getActiveMusclesFromLogs(
  exerciseLogs: Array<{ name: string; section?: string; sets: Array<{ completed?: boolean; reps?: number; weight?: number; seconds?: number }> }>
): MuscleScore[] {
  const exercises = exerciseLogs.map(log => ({
    name: log.name,
    isWarmup: isWarmupOrCooldown(log.name, log.section),
    sets: (log.sets || []).filter(isCountedSet).length,
  }));

  return aggregateWorkoutMuscles(exercises);
}

/** Ticked sets, or legacy sets that have data and were never explicitly unticked. */
function isCountedSet(set: { completed?: boolean; reps?: number; weight?: number; seconds?: number }): boolean {
  if (set.completed === false) return false;
  return set.completed === true || Number(set.reps) > 0 || Number(set.weight) > 0 || Number(set.seconds) > 0;
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
