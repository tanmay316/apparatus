/**
 * Personal nutrition plan (Cal AI-style onboarding → daily targets).
 * Mifflin-St Jeor BMR × activity, adjusted by the chosen weekly weight change.
 */

export type Sex = 'male' | 'female' | 'other';
export type WorkoutFreq = '0-2' | '3-5' | '6+';
export type WeightGoal = 'lose' | 'maintain' | 'gain';
export type Diet = 'classic' | 'pescatarian' | 'vegetarian' | 'vegan';

export interface PlanAnswers {
  gender: Sex;
  workouts: WorkoutFreq;
  heightCm: number;
  weightKg: number;
  /** YYYY-MM-DD */
  birthDate: string;
  goal: WeightGoal;
  targetWeightKg: number;
  /** kg per week (ignored for maintain) */
  weeklyRateKg: number;
  obstacles: string[];
  diet: Diet;
  accomplish: string[];
  units: 'metric' | 'imperial';
}

export interface MacroGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface PlanResult extends MacroGoals {
  bmr: number;
  tdee: number;
  /** Date the goal weight should be reached (null when maintaining). */
  eta: Date | null;
  bmi: number;
  waterMl: number;
}

const ACTIVITY: Record<WorkoutFreq, number> = { '0-2': 1.375, '3-5': 1.55, '6+': 1.725 };
const KCAL_PER_KG = 7700;

export const RATE_LIMITS: Record<Exclude<WeightGoal, 'maintain'>, { min: number; max: number; step: number; recommended: number }> = {
  lose: { min: 0.1, max: 1.5, step: 0.1, recommended: 0.8 },
  gain: { min: 0.1, max: 1.0, step: 0.1, recommended: 0.3 },
};

export function ageFromBirth(birth: string, now = new Date()): number {
  const [y, m, d] = birth.split('-').map(Number);
  if (!y || !m || !d) return 30;
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return Math.max(13, Math.min(100, age));
}

export function bmiOf(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return h > 0 ? Math.round((weightKg / (h * h)) * 10) / 10 : 0;
}

export function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#4C8DF6' };
  if (bmi < 25) return { label: 'Healthy', color: '#22C55E' };
  if (bmi < 30) return { label: 'Overweight', color: '#F5A524' };
  return { label: 'Obese', color: '#EF4444' };
}

export function bmr(a: Pick<PlanAnswers, 'gender' | 'weightKg' | 'heightCm' | 'birthDate'>, now = new Date()): number {
  const base = 10 * a.weightKg + 6.25 * a.heightCm - 5 * ageFromBirth(a.birthDate, now);
  return base + (a.gender === 'male' ? 5 : a.gender === 'female' ? -161 : -78);
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Macro split for a calorie target. */
export function macrosFor(calories: number, a: Pick<PlanAnswers, 'goal' | 'weightKg' | 'heightCm'>): MacroGoals {
  // Protein by body weight, using a BMI-25 reference weight for higher BMIs.
  const h = a.heightCm / 100;
  const refWeight = bmiOf(a.weightKg, a.heightCm) > 27 ? 25 * h * h : a.weightKg;
  const perKg = a.goal === 'lose' ? 2.0 : a.goal === 'gain' ? 1.8 : 1.6;
  let protein = Math.round(refWeight * perKg);
  protein = Math.min(protein, Math.round((calories * 0.4) / 4));
  const fat = Math.max(Math.round((calories * 0.27) / 9), Math.round(a.weightKg * 0.6));
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((calories / 1000) * 14);
  return { calories, protein, carbs, fat, fiber };
}

export function buildPlan(a: PlanAnswers, now = new Date()): PlanResult {
  const base = bmr(a, now);
  const tdee = base * ACTIVITY[a.workouts];
  let calories = tdee;
  if (a.goal !== 'maintain') {
    const limits = RATE_LIMITS[a.goal];
    const rate = Math.min(limits.max, Math.max(limits.min, a.weeklyRateKg || limits.recommended));
    const delta = (rate * KCAL_PER_KG) / 7;
    calories = a.goal === 'lose' ? tdee - delta : tdee + delta;
  }
  const floor = Math.max(a.gender === 'female' ? 1200 : a.gender === 'male' ? 1500 : 1350, a.goal === 'lose' ? base * 0.95 : 0);
  calories = round10(Math.max(floor, calories));

  let eta: Date | null = null;
  const diff = Math.abs(a.targetWeightKg - a.weightKg);
  if (a.goal !== 'maintain' && diff > 0.05) {
    // Actual daily deficit after the floor, so the date stays honest.
    const dailyDelta = Math.max(50, Math.abs(calories - tdee));
    const days = Math.ceil((diff * KCAL_PER_KG) / dailyDelta);
    eta = new Date(now.getTime() + Math.min(days, 3650) * 86_400_000);
  }

  return {
    ...macrosFor(calories, a),
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    eta,
    bmi: bmiOf(a.weightKg, a.heightCm),
    waterMl: Math.round((a.weightKg * 35) / 250) * 250,
  };
}

/** Days in a row (ending today or yesterday) with at least one logged meal. */
export function streakFrom(loggedDays: Set<string>, today: string, shift: (d: string, n: number) => string): number {
  let day = loggedDays.has(today) ? today : shift(today, -1);
  let n = 0;
  while (loggedDays.has(day)) {
    n++;
    day = shift(day, -1);
  }
  return n;
}

/** 0–10 food health score from macros (protein & fibre density up, energy density & fat share down). */
export function foodHealthScore(n: { calories: number; protein: number; carbs: number; fat: number; fiber: number }): number {
  if (n.calories <= 0) return 5;
  const per100 = (v: number) => (v / n.calories) * 100;
  let s = 5;
  s += Math.min(2.5, per100(n.protein) * 0.35);
  s += Math.min(2, per100(n.fiber) * 1.2);
  const fatShare = (n.fat * 9) / n.calories;
  if (fatShare > 0.45) s -= (fatShare - 0.45) * 8;
  const carbShare = (n.carbs * 4) / n.calories;
  if (carbShare > 0.65 && per100(n.fiber) < 1) s -= (carbShare - 0.65) * 8;
  if (n.calories > 900) s -= Math.min(1.5, (n.calories - 900) / 400);
  return Math.max(1, Math.min(10, Math.round(s)));
}

export const kgToLb = (kg: number) => kg * 2.20462;
export const lbToKg = (lb: number) => lb / 2.20462;
export const cmToFtIn = (cm: number) => {
  const inches = Math.round(cm / 2.54);
  return { ft: Math.floor(inches / 12), inch: inches % 12 };
};
export const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54);
