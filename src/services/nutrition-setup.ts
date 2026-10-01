import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { ageFromBirth, foodHealthScore, type MacroGoals, type PlanAnswers } from '@/lib/nutrition-plan';
import { portion, type FoodEntry, type Macros } from '@/lib/food-db';
import { getWorkoutsByDateRange } from '@/services/workouts';
import { activitySteps } from '@/services/cardio';
import type { CardioActivity } from '@/types';
import { logMeal, updateNutritionProfile } from '@/services/nutrition-api';

export interface SavedFood {
  id: string;
  name: string;
  brand?: string;
  per100: Macros;
  serving: { label: string; grams: number };
}

export interface NutritionSetup {
  version: 1;
  answers: PlanAnswers;
  goals: MacroGoals;
  prefs: { addBurned: boolean; rollover: boolean };
  completedAt?: number;
  /** date key → ml */
  water?: Record<string, number>;
  /** Daily water goal in ml; derived from body weight when unset. */
  waterGoal?: number;
  /** date key → manually logged exercise kcal */
  burned?: Record<string, number>;
  saved?: SavedFood[];
}

export const MAX_SAVED_FOODS = 60;

export function waterGoalFor(setup?: NutritionSetup | null): number {
  if (setup?.waterGoal) return setup.waterGoal;
  return setup ? Math.max(1500, Math.round((setup.answers.weightKg * 35) / 250) * 250) : 2500;
}

export const dateKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const setupRef = (uid: string) => doc(db, 'users', uid, 'private', 'nutrition');

export async function getNutritionSetup(uid: string): Promise<NutritionSetup | null> {
  const snap = await getDoc(setupRef(uid));
  return snap.exists() ? (snap.data() as NutritionSetup) : null;
}

export function useNutritionSetup() {
  const uid = useAuthStore(s => s.user?.uid);
  return useQuery({
    queryKey: ['nutrition-setup', uid],
    queryFn: () => getNutritionSetup(uid!),
    enabled: !!uid,
    staleTime: 60_000,
  });
}

/** Merge-write the setup doc and update the cached copy immediately. */
export function useUpdateNutritionSetup() {
  const uid = useAuthStore(s => s.user?.uid);
  const qc = useQueryClient();
  return async (patch: Partial<NutritionSetup>, cachePatch?: (prev: NutritionSetup) => NutritionSetup) => {
    if (!uid) throw new Error('Not signed in');
    const key = ['nutrition-setup', uid];
    const prev = qc.getQueryData<NutritionSetup | null>(key);
    if (prev) qc.setQueryData(key, cachePatch ? cachePatch(prev) : { ...prev, ...patch });
    try {
      await setDoc(setupRef(uid), patch, { merge: true });
    } catch (err) {
      qc.setQueryData(key, prev);
      throw err;
    }
    if (!prev) qc.invalidateQueries({ queryKey: key });
  };
}

const ACTIVITY_LEVEL = { '0-2': 'light', '3-5': 'moderate', '6+': 'active' } as const;
const FITNESS_GOAL = { lose: 'lose_fat', maintain: 'maintain', gain: 'build_muscle' } as const;

/** Keep the AI coach's (backend) body profile and targets in step with the plan. */
export async function syncPlanToBackend(answers: PlanAnswers, goals: MacroGoals): Promise<void> {
  await updateNutritionProfile({
    weight_kg: answers.weightKg,
    height_cm: answers.heightCm,
    age: ageFromBirth(answers.birthDate),
    gender: answers.gender,
    activity_level: ACTIVITY_LEVEL[answers.workouts],
    fitness_goal: FITNESS_GOAL[answers.goal],
    calorie_goal: goals.calories,
    protein_goal: goals.protein,
    carb_goal: goals.carbs,
    fat_goal: goals.fat,
    fiber_goal: goals.fiber,
    diet: answers.diet,
  });
}

// ─── Logging foods without a photo ───────────────────────────

export function mealTypeForNow(d = new Date()): string {
  const h = d.getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h < 16 && h >= 11) return 'lunch';
  if (h < 19 && h >= 16) return 'snack';
  return 'dinner';
}

function grade(score10: number): string {
  if (score10 >= 9) return 'A+';
  if (score10 >= 8) return 'A';
  if (score10 >= 7) return 'B+';
  if (score10 >= 6) return 'B';
  if (score10 >= 5) return 'C+';
  return 'C';
}

export async function logFoodEntry(food: Pick<FoodEntry, 'name' | 'brand' | 'per100'>, grams: number, mealType = mealTypeForNow()) {
  return logFoodEntries([{ food, grams }], mealType);
}

/** Log several foods as one meal (e.g. everything you had for lunch). */
export async function logFoodEntries(entries: { food: Pick<FoodEntry, 'name' | 'brand' | 'per100'>; grams: number }[], mealType = mealTypeForNow()) {
  const items = entries.map(({ food, grams }) => {
    const m = portion(food.per100, grams);
    return {
      name: food.brand ? `${food.name} (${food.brand})` : food.name,
      weight_grams: Math.round(grams),
      calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber,
      confidence: 1,
    };
  });
  const sum = (k: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber') => Math.round(items.reduce((s, i) => s + (i[k] || 0), 0) * 10) / 10;
  const totals = { calories: Math.round(sum('calories')), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), fiber: sum('fiber') };
  const score = foodHealthScore(totals);
  return logMeal({
    nutrition: {
      nutrition: {
        items,
        total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat, total_fiber: totals.fiber,
      },
      health_score: { score: score * 10, grade: grade(score), suggestions: [] },
    },
  }, mealType);
}

/** Log a quick calorie/macro entry typed in by hand. */
export async function logQuickEntry(name: string, m: Macros, mealType = mealTypeForNow()) {
  return logFoodEntry({ name, per100: m }, 100, mealType);
}

// ─── Calories burned from training ───────────────────────────

export async function getTrainingBurned(uid: string, day: string): Promise<{ workouts: number; cardio: number; cardioSteps: number }> {
  const [workouts, cardioSnap] = await Promise.all([
    getWorkoutsByDateRange(uid, day, day).catch(() => []),
    getDocs(query(collection(db, 'cardioActivities'), where('userId', '==', uid), where('date', '==', day))).catch(() => null),
  ]);
  const w = workouts.reduce((s, x) => s + (Number(x.calories) || 0), 0);
  const cardio = cardioSnap ? cardioSnap.docs.map(d => d.data() as CardioActivity) : [];
  const c = cardio.reduce((s, a) => s + (Number(a.calories) || 0), 0);
  const cardioSteps = cardio.reduce((s, a) => s + activitySteps(a), 0);
  return { workouts: Math.round(w), cardio: Math.round(c), cardioSteps };
}

/** Active kcal for everyday steps (net of resting): ~0.035 kcal per step at 70 kg. */
export function stepsCalories(steps: number, weightKg: number): number {
  return Math.max(0, Math.round(steps * weightKg * 0.0005));
}

export function useTrainingBurned(day: string) {
  const uid = useAuthStore(s => s.user?.uid);
  return useQuery({
    queryKey: ['training-burned', uid, day],
    queryFn: () => getTrainingBurned(uid!, day),
    enabled: !!uid,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
