/**
 * Long-term nutrition analytics (Pro), MacroFactor-style: adaptive expenditure from intake and
 * the weight trend, adherence, macro averages, meal timing, top foods and a goal projection.
 */
import type { Insight } from '@/lib/analysis-common';
import { shiftDate } from '@/lib/analysis-common';
import { buildPlan, type MacroGoals, type PlanAnswers } from '@/lib/nutrition-plan';

const KCAL_PER_KG = 7700;

export interface NutritionMeal {
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  health_score: number | null;
  items?: { food_name: string; calories: number }[];
}

export interface DayPoint { date: string; calories: number; protein: number; carbs: number; fat: number; logged: boolean }

export interface NutritionTrends {
  days: DayPoint[];
  loggedDays: number;
  avg7: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  avg30: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  split: { protein: number; carbs: number; fat: number };
  adherence: { calories: number; protein: number; logging: number };
  proteinPerKg: number;
  meals: { type: string; avgCalories: number; share: number }[];
  topFoods: { name: string; count: number; calories: number }[];
  health: { week: string; score: number }[];
  weight: {
    trendKg?: number;
    ratePerWeek?: number;
    series: { date: string; weight: number; trend: number }[];
  };
  expenditure: { tdee: number; source: 'adaptive' | 'estimate'; confidence: 'low' | 'medium' | 'high'; days: number };
  projection?: { weeks: number; date: string; onTrack: boolean };
  suggestedCalories?: number;
  insights: Insight[];
}

const avgOf = (days: DayPoint[], k: keyof Omit<DayPoint, 'date' | 'logged'>) =>
  days.length ? Math.round(days.reduce((s, d) => s + d[k], 0) / days.length) : 0;

/** Exponential moving average of daily weigh-ins, like a "trend weight". */
export function weightTrend(weights: { date: string; weight: number }[], alpha = 0.25) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  let trend = sorted[0]?.weight ?? 0;
  return sorted.map((w, i) => {
    trend = i === 0 ? w.weight : trend + alpha * (w.weight - trend);
    return { date: w.date, weight: w.weight, trend: Math.round(trend * 100) / 100 };
  });
}

/** Least-squares slope in kg/day over the entries in the window. */
function slopePerDay(points: { date: string; v: number }[]): number | undefined {
  if (points.length < 2) return undefined;
  const t0 = new Date(`${points[0].date}T12:00:00`).getTime();
  const xs = points.map(p => (new Date(`${p.date}T12:00:00`).getTime() - t0) / 86_400_000);
  if (xs[xs.length - 1] - xs[0] < 7) return undefined;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.v, 0) / points.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (points[i].v - my); den += (x - mx) ** 2; });
  return den > 0 ? num / den : undefined;
}

export function analyzeNutritionTrends(
  byDay: Map<string, NutritionMeal[]>,
  goals: MacroGoals,
  answers: PlanAnswers,
  weights: { date: string; weight: number }[],
  asOf: string,
): NutritionTrends {
  const days: DayPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = shiftDate(asOf, -i);
    const meals = byDay.get(date) || [];
    const t = meals.reduce((s, m) => ({ calories: s.calories + (m.calories || 0), protein: s.protein + (m.protein || 0), carbs: s.carbs + (m.carbs || 0), fat: s.fat + (m.fat || 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    days.push({ date, calories: Math.round(t.calories), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat), logged: meals.length > 0 });
  }
  // Today is usually still in progress, so averages use completed days only.
  const complete = days.filter(d => d.logged && d.date < asOf);
  const last7 = complete.filter(d => d.date >= shiftDate(asOf, -7));
  const fiberAvg = (from: string) => {
    let n = 0;
    let s = 0;
    for (const [date, meals] of byDay) if (date >= from && date < asOf && meals.length) { n++; s += meals.reduce((a, m) => a + (m.fiber || 0), 0); }
    return n ? Math.round(s / n) : 0;
  };
  const avg = (list: DayPoint[], from: string) => ({ calories: avgOf(list, 'calories'), protein: avgOf(list, 'protein'), carbs: avgOf(list, 'carbs'), fat: avgOf(list, 'fat'), fiber: fiberAvg(from) });
  const avg7 = avg(last7, shiftDate(asOf, -7));
  const avg30 = avg(complete, shiftDate(asOf, -30));

  const kcalFromMacros = avg30.protein * 4 + avg30.carbs * 4 + avg30.fat * 9;
  const split = kcalFromMacros > 0
    ? { protein: Math.round((avg30.protein * 4 * 100) / kcalFromMacros), carbs: Math.round((avg30.carbs * 4 * 100) / kcalFromMacros), fat: Math.round((avg30.fat * 9 * 100) / kcalFromMacros) }
    : { protein: 0, carbs: 0, fat: 0 };

  const within = complete.filter(d => Math.abs(d.calories - goals.calories) <= goals.calories * 0.1).length;
  const proteinHit = complete.filter(d => d.protein >= goals.protein * 0.9).length;
  const adherence = {
    calories: complete.length ? Math.round((within / complete.length) * 100) : 0,
    protein: complete.length ? Math.round((proteinHit / complete.length) * 100) : 0,
    logging: Math.round((days.filter(d => d.logged).length / days.length) * 100),
  };

  const mealAgg = new Map<string, { kcal: number; days: Set<string> }>();
  const foods = new Map<string, { name: string; count: number; calories: number }>();
  const healthByWeek = new Map<string, { s: number; n: number }>();
  for (const [date, meals] of byDay) {
    if (date < shiftDate(asOf, -42) || date > asOf) continue;
    for (const m of meals) {
      if (date >= shiftDate(asOf, -30)) {
        const type = (m.meal_type || 'snack').toLowerCase();
        const e = mealAgg.get(type) || { kcal: 0, days: new Set<string>() };
        e.kcal += m.calories || 0;
        e.days.add(date);
        mealAgg.set(type, e);
        for (const it of m.items || []) {
          const key = (it.food_name || '').trim().toLowerCase();
          if (!key) continue;
          const f = foods.get(key) || { name: it.food_name.trim(), count: 0, calories: 0 };
          f.count++;
          f.calories += it.calories || 0;
          foods.set(key, f);
        }
      }
      if (m.health_score != null) {
        const wk = shiftDate(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
        const h = healthByWeek.get(wk) || { s: 0, n: 0 };
        h.s += m.health_score;
        h.n++;
        healthByWeek.set(wk, h);
      }
    }
  }
  const mealTotal = [...mealAgg.values()].reduce((s, e) => s + e.kcal, 0);
  const order = ['breakfast', 'lunch', 'dinner', 'snack'];
  const rank = (type: string) => (order.includes(type) ? order.indexOf(type) : order.length);
  const meals = [...mealAgg.entries()]
    .map(([type, e]) => ({ type, avgCalories: Math.round(e.kcal / Math.max(1, e.days.size)), share: mealTotal ? Math.round((e.kcal / mealTotal) * 100) : 0 }))
    .sort((a, b) => rank(a.type) - rank(b.type));
  const topFoods = [...foods.values()].sort((a, b) => b.count - a.count || b.calories - a.calories).slice(0, 6).map(f => ({ ...f, calories: Math.round(f.calories) }));
  const health = [...healthByWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, h]) => ({ week, score: Math.round((h.s / h.n) * 10) / 100 }));

  const series = weightTrend(weights.filter(w => w.date <= asOf && w.date >= shiftDate(asOf, -120)));
  const recentWeights = series.filter(w => w.date >= shiftDate(asOf, -28));
  // Regression on raw weigh-ins already smooths noise; the EMA would lag and understate the rate.
  const slope = slopePerDay(recentWeights.map(w => ({ date: w.date, v: w.weight })));
  const trendKg = series.length ? series[series.length - 1].trend : undefined;
  const ratePerWeek = slope !== undefined ? Math.round(slope * 7 * 100) / 100 : undefined;

  const plan = buildPlan({ ...answers, weightKg: trendKg || answers.weightKg });
  const intakeDays = complete.filter(d => d.date >= shiftDate(asOf, -28));
  let expenditure: NutritionTrends['expenditure'] = { tdee: Math.round(plan.tdee), source: 'estimate', confidence: 'low', days: intakeDays.length };
  if (slope !== undefined && intakeDays.length >= 10 && recentWeights.length >= 3) {
    const intake = avgOf(intakeDays, 'calories');
    const adaptive = Math.round(intake - slope * KCAL_PER_KG);
    // Partial logging biases intake low; blend toward the formula until the data is solid.
    const w = Math.min(1, intakeDays.length / 21) * Math.min(1, recentWeights.length / 6);
    const tdee = Math.round(w * adaptive + (1 - w) * plan.tdee);
    if (adaptive > 1000 && adaptive < 6000) {
      expenditure = { tdee, source: 'adaptive', confidence: w >= 0.9 ? 'high' : w >= 0.5 ? 'medium' : 'low', days: intakeDays.length };
    }
  }

  let projection: NutritionTrends['projection'];
  let suggestedCalories: number | undefined;
  if (answers.goal !== 'maintain' && trendKg) {
    const remaining = answers.targetWeightKg - trendKg;
    const wantDown = answers.goal === 'lose';
    if ((wantDown && remaining < -0.2) || (!wantDown && remaining > 0.2)) {
      const rate = ratePerWeek ?? 0;
      const onTrack = wantDown ? rate < -0.05 : rate > 0.05;
      if (onTrack) {
        const weeks = Math.ceil(Math.abs(remaining / rate));
        if (weeks <= 260) projection = { weeks, date: shiftDate(asOf, weeks * 7), onTrack };
      } else projection = { weeks: 0, date: '', onTrack: false };
      const planned = Math.max(0.1, answers.weeklyRateKg || 0.5);
      suggestedCalories = Math.round((expenditure.tdee + (wantDown ? -1 : 1) * (planned * KCAL_PER_KG) / 7) / 10) * 10;
    }
  }

  const t: NutritionTrends = {
    days, loggedDays: complete.length, avg7, avg30, split, adherence,
    proteinPerKg: trendKg || answers.weightKg ? Math.round((avg30.protein / (trendKg || answers.weightKg)) * 10) / 10 : 0,
    meals, topFoods, health, weight: { trendKg, ratePerWeek, series }, expenditure, projection, suggestedCalories, insights: [],
  };
  t.insights = nutritionInsights(t, goals, answers);
  return t;
}

function nutritionInsights(t: NutritionTrends, goals: MacroGoals, a: PlanAnswers): Insight[] {
  const out: Insight[] = [];
  if (t.loggedDays < 3) {
    out.push({ tone: 'info', title: 'Log a few more days', text: 'Insights get sharper after a week of logging. Even rough entries help.' });
    return out;
  }
  if (t.expenditure.source === 'adaptive') {
    out.push({ tone: 'info', title: `You burn about ${t.expenditure.tdee.toLocaleString()} cal a day`, text: `Measured from what you ate and how your weight actually changed over ${t.expenditure.days} days (${t.expenditure.confidence} confidence). This adapts as your metabolism changes.` });
  }
  if (t.suggestedCalories && Math.abs(t.suggestedCalories - goals.calories) >= 100) {
    out.push({ tone: 'warn', title: `Adjust your target to ~${t.suggestedCalories.toLocaleString()} cal`, text: `To ${a.goal === 'lose' ? 'lose' : 'gain'} ${a.weeklyRateKg || 0.5} kg a week at your real expenditure. Your current target is ${goals.calories.toLocaleString()}.` });
  }
  if (t.projection?.onTrack) out.push({ tone: 'good', title: 'On track for your goal', text: `At ${Math.abs(t.weight.ratePerWeek || 0)} kg a week you'll reach ${a.targetWeightKg} kg around ${new Date(`${t.projection.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.` });
  else if (t.projection && !t.projection.onTrack) out.push({ tone: 'warn', title: 'Weight trend is flat or moving the wrong way', text: `Your trend weight isn't ${a.goal === 'lose' ? 'falling' : 'rising'} yet. Check portion sizes and log every meal for a week.` });

  out.push(t.adherence.calories >= 70
    ? { tone: 'good', title: `${t.adherence.calories}% of days on target`, text: 'Within ±10% of your calorie goal on most logged days. This consistency is what drives results.' }
    : { tone: 'info', title: `${t.adherence.calories}% of days on target`, text: `Within ±10% of ${goals.calories.toLocaleString()} cal on fewer than 7 in 10 logged days. Planning tomorrow's meals tonight helps.` });

  if (t.proteinPerKg > 0) out.push(t.proteinPerKg >= 1.6
    ? { tone: 'good', title: `${t.proteinPerKg} g protein per kg`, text: 'In the 1.6–2.2 g/kg range shown to maximise muscle retention and growth.' }
    : { tone: 'warn', title: `${t.proteinPerKg} g protein per kg`, text: `Below the 1.6 g/kg most research supports for building or keeping muscle. Aim for ${goals.protein} g a day - add eggs, dairy, legumes or lean meat.` });

  if (t.avg30.fiber > 0 && t.avg30.fiber < 25) out.push({ tone: 'info', title: `${t.avg30.fiber} g fibre a day`, text: 'Most adults need 25–35 g. More vegetables, fruit, oats and beans also keep you fuller.' });
  const dinner = t.meals.find(m => m.type === 'dinner');
  if (dinner && dinner.share >= 45) out.push({ tone: 'info', title: `${dinner.share}% of calories at dinner`, text: 'A back-loaded day often leads to evening overeating. A bigger breakfast or lunch can make hunger easier to manage.' });
  if (t.adherence.logging < 60) out.push({ tone: 'info', title: `Logged ${t.adherence.logging}% of days`, text: 'Adaptive insights need regular logging. Snap a photo of each meal - it takes seconds.' });
  return out;
}
