/**
 * Training load and Fitness & Freshness (CTL / ATL / TSB), the model behind Strava's
 * "Fitness & Freshness" and TrainingPeaks' PMC - estimated from pace instead of heart rate.
 */
import type { CardioActivity, CardioActivityType, Workout } from '@/types';
import { MAX_CARDIO_KMH, riegel } from '@/lib/cardio-analysis';
import { shiftDate } from '@/lib/analysis-common';

const movingSec = (a: CardioActivity) => a.movingDurationSec || a.durationSec || 0;

function plausible(a: CardioActivity): boolean {
  const sec = movingSec(a);
  const km = a.distanceKm || 0;
  return sec > 60 && km > 0 && km / (sec / 3600) <= MAX_CARDIO_KMH[a.type];
}

/** Speed (km/h) the athlete could hold for about an hour - the anchor for intensity. */
export function thresholdKmh(activities: CardioActivity[], type: CardioActivityType, asOf: string): number {
  if (type === 'walk') return 9.2;
  const since = shiftDate(asOf, -90);
  const pool = activities.filter(a => a.type === type && a.date >= since && a.date <= asOf && plausible(a));
  const targetKm = type === 'run' ? 15 : 40;
  const minKm = type === 'run' ? 3 : 10;
  let best = 0;
  for (const a of pool) {
    if (a.distanceKm < minKm) continue;
    const t = riegel(movingSec(a), a.distanceKm, targetKm, type === 'cycle' ? 1.05 : 1.06);
    best = Math.max(best, targetKm / (t / 3600));
  }
  return best > 0 ? Math.round(best * 10) / 10 : type === 'run' ? 9 : 22;
}

/** Hills make a session harder than its speed shows: count climbing as extra flat distance. */
export function gradeAdjustedKmh(a: CardioActivity): number {
  const sec = movingSec(a);
  if (sec <= 0) return 0;
  const perMeter = a.type === 'cycle' ? 0.01 : 0.008;
  return (((a.distanceKm || 0) + (a.elevationGainM || 0) * perMeter) / sec) * 3600;
}

/** Intensity factor vs. threshold (1.0 = hour-long race effort). */
export function intensityFactor(a: CardioActivity, thrKmh: number): number {
  const raw = gradeAdjustedKmh(a) / thrKmh;
  const cap = a.type === 'walk' ? 0.8 : 1.25;
  return Math.max(0.3, Math.min(cap, raw));
}

/** Load points for one cardio session: an hour at threshold = 100. */
export function cardioLoad(a: CardioActivity, thrKmh: number): number {
  if (!plausible(a)) return 0;
  const hours = movingSec(a) / 3600;
  const f = intensityFactor(a, thrKmh);
  return Math.round(hours * f * f * 100);
}

/** Load for a strength session from duration and effort (RPE), with a set-count fallback. */
export function strengthLoad(w: Workout): number {
  const sets = (w.exercises || []).reduce((n, e) => n + (e.sets || []).filter(s => s.completed !== false).length, 0);
  const minutes = w.durationMin && w.durationMin > 0 ? Math.min(w.durationMin, 180) : sets * 2.5;
  const rpes = (w.exercises || []).map(e => e.rpe).filter((r): r is number => typeof r === 'number' && r > 0);
  const rpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 7.5;
  const f = Math.max(0.5, Math.min(0.95, rpe / 10));
  return Math.round((minutes / 60) * f * f * 100);
}

export interface FitnessPoint { date: string; load: number; fitness: number; fatigue: number; form: number }

export interface FitnessSummary {
  series: FitnessPoint[];
  fitness: number;
  fatigue: number;
  form: number;
  /** Fitness gained over the last 7 days. */
  ramp: number;
  state: { label: string; tone: 'good' | 'warn' | 'info'; text: string };
  weekLoad: number;
  prevWeekLoad: number;
}

function formState(form: number, ramp: number): FitnessSummary['state'] {
  if (ramp > 8) return { label: 'Ramping fast', tone: 'warn', text: `Fitness rose ${ramp} points this week. Gains above ~8 a week raise injury risk; hold load steady for a few days.` };
  if (form > 15) return { label: 'Fresh', tone: 'info', text: 'Well rested. A good time for a race or a hard session, but fitness slowly fades if you stay this fresh.' };
  if (form > 5) return { label: 'Ready', tone: 'good', text: 'Rested and fit: ideal for a key workout or race.' };
  if (form >= -10) return { label: 'Neutral', tone: 'good', text: 'Training and recovery are in balance.' };
  if (form >= -30) return { label: 'Productive', tone: 'good', text: 'Carrying training fatigue that builds fitness. Keep easy days easy and sleep well.' };
  return { label: 'Overreaching', tone: 'warn', text: 'Fatigue is much higher than fitness. Take 2-3 easy days or a rest day before pushing again.' };
}

/** Daily Fitness (42-day load average), Fatigue (7-day) and Form (yesterday's fitness − fatigue). */
export function fitnessFreshness(cardio: CardioActivity[], workouts: Workout[], asOf: string, days = 90): FitnessSummary {
  const loads = new Map<string, number>();
  const thr: Record<CardioActivityType, number> = {
    run: thresholdKmh(cardio, 'run', asOf),
    walk: thresholdKmh(cardio, 'walk', asOf),
    cycle: thresholdKmh(cardio, 'cycle', asOf),
  };
  for (const a of cardio) if (a.date) loads.set(a.date, (loads.get(a.date) || 0) + cardioLoad(a, thr[a.type] || 9));
  for (const w of workouts) if (w.date) loads.set(w.date, (loads.get(w.date) || 0) + strengthLoad(w));

  const warmup = 120;
  const series: FitnessPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let d = shiftDate(asOf, -(days + warmup)); d <= asOf; d = shiftDate(d, 1)) {
    const load = loads.get(d) || 0;
    const form = Math.round(ctl - atl);
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    series.push({ date: d, load, fitness: Math.round(ctl), fatigue: Math.round(atl), form });
  }
  const visible = series.slice(-days - 1);
  const last = visible[visible.length - 1];
  const weekAgo = visible[visible.length - 8] || visible[0];
  const ramp = last.fitness - weekAgo.fitness;
  const sum = (from: number, to?: number) => visible.slice(from, to).reduce((s, p) => s + p.load, 0);
  return {
    series: visible,
    fitness: last.fitness,
    fatigue: last.fatigue,
    form: last.form,
    ramp,
    state: formState(last.form, ramp),
    weekLoad: sum(-7),
    prevWeekLoad: sum(-14, -7),
  };
}
