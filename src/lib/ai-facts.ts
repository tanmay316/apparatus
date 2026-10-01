/** Compact, number-exact facts for the AI coach. The model may only reuse numbers found here. */
import type { CardioActivity, CardioActivityType, Workout } from '@/types';
import type { CardioAnalysis } from '@/lib/cardio-analysis';
import { formatClock, formatPaceSec } from '@/lib/cardio-analysis';
import type { WorkoutAnalysis } from '@/lib/workout-analysis';
import { analyzeCardioTrends, type SessionEffort } from '@/lib/cardio-trends';
import { fitnessFreshness } from '@/lib/training-load';
import { analyzeStrengthTrends } from '@/lib/strength-trends';
import type { NutritionTrends } from '@/lib/nutrition-trends';
import type { Insight } from '@/lib/analysis-common';

export type Facts = Record<string, unknown>;

const obs = (insights: Insight[], n = 5) => insights.slice(0, n).map(i => ({ title: i.title.slice(0, 80), text: i.text.slice(0, 150) }));
const r1 = (n: number) => Math.round(n * 10) / 10;
const NOUN: Record<CardioActivityType, string> = { run: 'run', walk: 'walk', cycle: 'ride' };

export function cardioFacts(a: CardioAnalysis, effort?: SessionEffort | null): Facts {
  const c = a.current;
  const ride = a.type === 'cycle';
  const rate = (s: { paceSec: number; kmh: number }) => (ride ? { speed_kmh: s.kmh } : { pace_per_km: formatPaceSec(s.paceSec) });
  return {
    activity: NOUN[a.type],
    date: c.date,
    distance_km: c.km,
    moving_time: formatClock(c.sec),
    ...rate(c),
    elevation_gain_m: c.elevGain,
    calories: c.calories,
    ...(c.cadence ? { cadence_spm: c.cadence } : {}),
    ...(a.previous ? { previous: { date: a.previous.date, distance_km: a.previous.km, ...rate(a.previous), elevation_gain_m: a.previous.elevGain } } : {}),
    ...(a.recent ? { average_last_28_days: { sessions: a.recent.count, distance_km: a.recent.km, ...rate(a.recent) } } : {}),
    records: Object.entries(a.records).filter(([, v]) => v).map(([k]) => k),
    ...(a.pacing ? {
      pacing: {
        first_half: ride ? undefined : formatPaceSec(a.pacing.firstHalfPaceSec),
        second_half: ride ? undefined : formatPaceSec(a.pacing.secondHalfPaceSec),
        second_half_change_pct: a.pacing.changePct,
        split_variability_pct: a.pacing.variabilityPct,
        fastest_split: a.pacing.fastest,
        slowest_split: a.pacing.slowest,
      },
    } : {}),
    last_7_days: { distance_km: a.weekly.km, previous_7_days_km: a.weekly.prevKm, change_pct: a.weekly.changePct ?? null, sessions: a.weekly.sessions, heart_health_minutes: a.weekly.moderateMin },
    ...(effort ? {
      effort: {
        training_load: effort.load,
        intensity_pct: Math.round(effort.intensity * 100),
        level: effort.label,
        zones: effort.zones.filter(z => z.pct > 0).map(z => ({ zone: `Z${z.zone} ${z.label}`, pct: z.pct })),
        best_efforts: effort.efforts.map(e => ({ distance: e.label, time: formatClock(e.sec), personal_record: e.isPR, ...(e.prevBest ? { previous_best: formatClock(e.prevBest) } : {}) })),
      },
    } : {}),
    observations: obs(a.insights),
  };
}

export function workoutFacts(a: WorkoutAnalysis): Facts {
  return {
    date: a.date,
    duration_min: a.totals.durationMin || null,
    working_sets: a.totals.sets,
    total_reps: a.totals.reps,
    volume_kg: a.totals.volumeKg,
    heaviest_kg: a.totals.heaviestKg,
    avg_rpe: a.totals.avgRpe,
    volume_change_pct: a.volumeChangePercent ?? null,
    ...(a.lastSameDay ? { last_time_same_day: { date: a.lastSameDay.date, sets: a.lastSameDay.sets, reps: a.lastSameDay.reps, volume_kg: a.lastSameDay.volumeKg } } : {}),
    exercises: a.exercises.slice(0, 8).map(e => ({
      name: e.name,
      sets: e.sets,
      ...(e.weighted ? { top_kg: e.topWeight, est_1rm_kg: e.e1rm } : { best_reps: e.bestReps }),
      ...(e.holdSec ? { hold_sec: e.holdSec } : {}),
      ...(e.volumeChange !== undefined ? { change_pct: e.volumeChange } : { first_time: true }),
      ...(e.isPR ? { personal_record: true } : {}),
      ...(e.stalled >= 3 ? { sessions_without_pr: e.stalled } : {}),
    })),
    rep_ranges: a.zones,
    weekly_sets_per_muscle: a.muscles.slice(0, 6).map(m => ({ muscle: m.group, today: m.sessionSets, last_7_days: m.weekSets })),
    strength_days_last_7: a.strengthDaysThisWeek,
    observations: obs(a.insights),
  };
}

/** Facts for the Mon–Sun weekly report. */
export function weeklyFacts(opts: {
  weekStart: string;
  weekEnd: string;
  cardio: CardioActivity[];
  workouts: Workout[];
  nutrition?: NutritionTrends | null;
  calorieGoal?: number;
  proteinGoal?: number;
}): Facts | null {
  const { weekStart, weekEnd, cardio, workouts, nutrition } = opts;
  const inWeek = <T extends { date: string }>(x: T) => x.date >= weekStart && x.date <= weekEnd;
  const weekCardio = cardio.filter(inWeek);
  const weekWorkouts = workouts.filter(inWeek);
  const nutDays = nutrition ? nutrition.days.filter(d => d.logged && d.date >= weekStart && d.date <= weekEnd) : [];
  if (!weekCardio.length && !weekWorkouts.length && !nutDays.length) return null;

  const byType: Facts = {};
  for (const t of ['run', 'walk', 'cycle'] as CardioActivityType[]) {
    const list = weekCardio.filter(a => a.type === t);
    if (!list.length) continue;
    const sec = list.reduce((s, a) => s + (a.movingDurationSec || a.durationSec || 0), 0);
    byType[NOUN[t]] = { sessions: list.length, distance_km: r1(list.reduce((s, a) => s + (a.distanceKm || 0), 0)), time: formatClock(sec) };
  }

  const ff = fitnessFreshness(cardio, workouts, weekEnd, 28);
  const strength = workouts.length ? analyzeStrengthTrends(workouts, weekEnd, new Date(`${weekEnd}T23:00:00`).getTime()) : null;
  const weekPrs = strength ? strength.prs.filter(p => p.date >= weekStart && p.date <= weekEnd).slice(0, 5) : [];
  const cardioPrs = (['run', 'cycle', 'walk'] as CardioActivityType[])
    .filter(t => weekCardio.some(a => a.type === t))
    .flatMap(t => analyzeCardioTrends(cardio, t, weekEnd).bestEfforts.filter(e => e.date >= weekStart && e.date <= weekEnd).map(e => ({ activity: NOUN[t], distance: e.label, time: formatClock(e.sec) })))
    .slice(0, 4);
  const sets = weekWorkouts.reduce((s, w) => s + (w.exercises || []).reduce((n, e) => n + (e.sets || []).filter(x => x.completed !== false).length, 0), 0);

  const facts: Facts = {
    week: `${weekStart} to ${weekEnd}`,
    cardio: byType,
    strength: {
      workouts: weekWorkouts.length,
      working_sets: sets,
      personal_records: weekPrs.map(p => ({ exercise: p.name, value: p.unit === 'kg' ? `${p.value} kg est. 1RM` : p.unit === 's' ? `${p.value} s` : `${p.value} reps` })),
      ...(strength?.acwr ? { load_vs_usual: strength.acwr.ratio, load_zone: strength.acwr.zone } : {}),
    },
    cardio_personal_records: cardioPrs,
    training_load: { fitness: ff.fitness, fatigue: ff.fatigue, form: ff.form, fitness_change_7d: ff.ramp, state: ff.state.label, load_this_week: ff.weekLoad, load_last_week: ff.prevWeekLoad },
    observations: [
      { title: `${ff.state.label} form`, text: ff.state.text },
      ...obs(strength?.insights || [], 2),
      ...obs(nutrition?.insights || [], 2),
    ],
  };
  if (nutrition && nutDays.length) {
    const avg = (k: 'calories' | 'protein') => Math.round(nutDays.reduce((s, d) => s + d[k], 0) / nutDays.length);
    facts.nutrition = {
      days_logged: nutDays.length,
      avg_calories: avg('calories'),
      calorie_goal: opts.calorieGoal ?? null,
      avg_protein_g: avg('protein'),
      protein_goal_g: opts.proteinGoal ?? null,
      ...(nutrition.weight.trendKg ? { trend_weight_kg: r1(nutrition.weight.trendKg) } : {}),
      ...(nutrition.weight.ratePerWeek !== undefined ? { weight_change_per_week_kg: nutrition.weight.ratePerWeek } : {}),
      ...(nutrition.expenditure.source === 'adaptive' ? { measured_expenditure: nutrition.expenditure.tdee } : {}),
      ...(nutrition.projection?.onTrack ? { goal_date: nutrition.projection.date } : {}),
    };
  }
  return facts;
}
