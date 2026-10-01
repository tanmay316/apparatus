/** Long-term strength analytics (Pro): lift progression, PRs, muscle balance, recovery and load. */
import type { Workout } from '@/types';
import { bestSetMetric, completedSets, exerciseTrainingVolume, exerciseVolumeUnit } from '@/lib/progressive-overload';
import { groupShares, isWorking, type MajorGroup } from '@/lib/workout-analysis';
import { shiftDate, startMs, type Insight } from '@/lib/analysis-common';

export const MAJOR_GROUPS: MajorGroup[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];

export interface LiftPoint { date: string; metric: number; topWeight: number; bestReps: number; volume: number; sets: number }

export interface LiftProgress {
  name: string;
  unit: 'kg' | 'reps' | 's';
  sessions: number;
  points: LiftPoint[];
  best: number;
  first: number;
  latest: number;
  /** % change of the best metric from the first to the last 4 weeks of the window. */
  changePct?: number;
  /** Sessions in a row without a new best. */
  stalled: number;
}

export interface PrEvent { date: string; name: string; unit: 'kg' | 'reps' | 's'; value: number; prev: number }

export interface Recovery { group: MajorGroup; readiness: number; hoursAgo: number | null; recentSets: number }

export interface StrengthTrends {
  workouts: number;
  lifts: LiftProgress[];
  prs: PrEvent[];
  weeks: { start: string; sets: Partial<Record<MajorGroup, number>>; total: number; volumeKg: number; sessions: number }[];
  balance: { label: string; left: string; right: string; leftSets: number; rightSets: number; ideal: [number, number] }[];
  recovery: Recovery[];
  acwr?: { acute: number; chronic: number; ratio: number; zone: 'low' | 'optimal' | 'caution' | 'high' };
  consistency: { perWeek: number; weekStreak: number };
  insights: Insight[];
}

const weekStart = (key: string) => shiftDate(key, -((new Date(`${key}T12:00:00`).getDay() + 6) % 7));
const sum = (groups: Partial<Record<MajorGroup, number>>, keys: MajorGroup[]) => keys.reduce((s, k) => s + (groups[k] || 0), 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function analyzeStrengthTrends(all: Workout[], asOf: string, nowMs = Date.now()): StrengthTrends {
  const workouts = all.filter(w => w.date && w.date <= asOf && (w.exercises || []).some(isWorking)).sort((a, b) => startMs(a) - startMs(b));
  const since = shiftDate(asOf, -180);

  // Per-exercise sessions (best set metric is e1RM for loaded lifts, reps or hold seconds otherwise).
  const byLift = new Map<string, { name: string; unit: LiftProgress['unit']; points: LiftPoint[] }>();
  for (const w of workouts) {
    for (const e of (w.exercises || []).filter(isWorking)) {
      const key = e.name.trim().toLowerCase();
      const sets = completedSets(e);
      const weighted = sets.filter(s => Number(s.weight) > 0);
      const entry = byLift.get(key) || { name: e.name.trim(), unit: exerciseVolumeUnit(e), points: [] };
      if (exerciseVolumeUnit(e) === 'kg') entry.unit = 'kg';
      entry.points.push({
        date: w.date,
        metric: Math.round(bestSetMetric(e) * 10) / 10,
        topWeight: Math.max(0, ...weighted.map(s => Number(s.weight) || 0)),
        bestReps: Math.max(0, ...sets.map(s => Number(s.reps) || 0)),
        volume: Math.round(exerciseTrainingVolume(e)),
        sets: sets.length,
      });
      byLift.set(key, entry);
    }
  }

  const prs: PrEvent[] = [];
  const lifts: LiftProgress[] = [];
  for (const { name, unit, points: rawPoints } of byLift.values()) {
    // Keep only sessions in the lift's own unit so a weighted lift isn't compared with bodyweight reps.
    const points = unit === 'kg' ? rawPoints.filter(p => p.topWeight > 0) : rawPoints;
    if (!points.length) continue;
    let best = 0;
    let stalled = 0;
    for (const p of points) {
      if (best > 0 && p.metric > best * 1.01) {
        prs.push({ date: p.date, name, unit, value: p.metric, prev: best });
        stalled = 0;
      } else if (best > 0) stalled++;
      best = Math.max(best, p.metric);
    }
    const windowPts = points.filter(p => p.date >= since);
    if (windowPts.length < 2) continue;
    const firstBlockEnd = shiftDate(windowPts[0].date, 28);
    const lastBlockStart = shiftDate(windowPts[windowPts.length - 1].date, -28);
    const first = Math.max(...windowPts.filter(p => p.date <= firstBlockEnd).map(p => p.metric));
    const latest = Math.max(...windowPts.filter(p => p.date >= lastBlockStart).map(p => p.metric));
    lifts.push({
      name, unit, sessions: windowPts.length, points: windowPts.slice(-24), best, first, latest,
      changePct: first > 0 && windowPts.length >= 3 ? Math.round(((latest - first) / first) * 100) : undefined,
      stalled,
    });
  }
  lifts.sort((a, b) => b.sessions - a.sessions || b.best - a.best);
  prs.sort((a, b) => b.date.localeCompare(a.date));

  // 8 weeks of sets per muscle group.
  const thisWeek = weekStart(asOf);
  const weeks: StrengthTrends['weeks'] = [];
  for (let i = 7; i >= 0; i--) weeks.push({ start: shiftDate(thisWeek, -7 * i), sets: {}, total: 0, volumeKg: 0, sessions: 0 });
  const last28: Partial<Record<MajorGroup, number>> = {};
  const fatigue = new Map<MajorGroup, number>();
  const lastHit = new Map<MajorGroup, number>();
  const recentSets = new Map<MajorGroup, number>();
  const from28 = shiftDate(asOf, -27);
  const from7 = shiftDate(asOf, -6);
  let acute = 0;
  let chronic28 = 0;
  for (const w of workouts) {
    const bucket = weeks.find(b => b.start === weekStart(w.date));
    const at = startMs(w);
    const hours = Math.max(0, (nowMs - at) / 3_600_000);
    if (bucket) bucket.sessions += 1;
    for (const e of (w.exercises || []).filter(isWorking)) {
      const n = completedSets(e).length;
      if (bucket) {
        bucket.total += n;
        bucket.volumeKg += completedSets(e).reduce((s, x) => s + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0);
      }
      if (w.date >= from7) acute += n;
      if (w.date >= from28) chronic28 += n;
      for (const [g, credit] of groupShares(e.name)) {
        if (!credit) continue;
        if (bucket) bucket.sets[g] = r1((bucket.sets[g] || 0) + credit * n);
        if (w.date >= from28) last28[g] = (last28[g] || 0) + credit * n;
        if (hours <= 24 * 7) {
          fatigue.set(g, (fatigue.get(g) || 0) + credit * n * Math.exp(-hours / 36));
          recentSets.set(g, (recentSets.get(g) || 0) + credit * n);
        }
        lastHit.set(g, Math.max(lastHit.get(g) || 0, at));
      }
    }
  }
  for (const w of weeks) w.volumeKg = Math.round(w.volumeKg);

  const recovery: Recovery[] = MAJOR_GROUPS.map(group => {
    const last = lastHit.get(group);
    return {
      group,
      readiness: Math.max(0, Math.min(100, Math.round(100 - (fatigue.get(group) || 0) * 8))),
      hoursAgo: last ? Math.round((nowMs - last) / 3_600_000) : null,
      recentSets: r1(recentSets.get(group) || 0),
    };
  });

  const push: MajorGroup[] = ['Chest', 'Shoulders', 'Triceps'];
  const pull: MajorGroup[] = ['Back', 'Biceps'];
  const upper: MajorGroup[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'];
  const lower: MajorGroup[] = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
  const balance: StrengthTrends['balance'] = [
    { label: 'Push vs pull', left: 'Push', right: 'Pull', leftSets: r1(sum(last28, push)), rightSets: r1(sum(last28, pull)), ideal: [0.8, 1.25] as [number, number] },
    { label: 'Upper vs lower', left: 'Upper', right: 'Lower', leftSets: r1(sum(last28, upper)), rightSets: r1(sum(last28, lower)), ideal: [0.7, 1.6] as [number, number] },
    { label: 'Quads vs hamstrings', left: 'Quads', right: 'Hams', leftSets: r1(sum(last28, ['Quads'])), rightSets: r1(sum(last28, ['Hamstrings'])), ideal: [0.6, 1.6] as [number, number] },
  ].filter(b => b.leftSets + b.rightSets >= 6);

  let acwr: StrengthTrends['acwr'];
  const chronicWeekly = chronic28 / 4;
  if (chronicWeekly >= 8 && workouts.some(w => w.date < shiftDate(asOf, -21))) {
    const ratio = Math.round((acute / chronicWeekly) * 100) / 100;
    acwr = { acute, chronic: Math.round(chronicWeekly), ratio, zone: ratio < 0.8 ? 'low' : ratio <= 1.3 ? 'optimal' : ratio <= 1.5 ? 'caution' : 'high' };
  }

  const active = weeks.slice(0, -1);
  const perWeek = r1(active.reduce((s, w) => s + w.sessions, 0) / Math.max(1, active.length));
  let weekStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].sessions > 0) weekStreak++;
    else if (i === weeks.length - 1) continue;
    else break;
  }

  const t: StrengthTrends = {
    workouts: workouts.length, lifts: lifts.slice(0, 12), prs: prs.slice(0, 20), weeks, balance, recovery, acwr,
    consistency: { perWeek, weekStreak }, insights: [],
  };
  t.insights = strengthInsights(t, last28);
  return t;
}

const join = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function strengthInsights(t: StrengthTrends, last28: Partial<Record<MajorGroup, number>>): Insight[] {
  const out: Insight[] = [];
  const growing = t.lifts.filter(l => (l.changePct || 0) >= 5).sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
  if (growing.length) out.push({ tone: 'good', title: 'Getting stronger', text: `${join(growing.slice(0, 3).map(l => `${l.name} +${l.changePct}%`))} over the last months.` });
  const stuck = t.lifts.filter(l => l.stalled >= 4);
  if (stuck.length) out.push({ tone: 'warn', title: 'Plateaus', text: `${join(stuck.slice(0, 3).map(l => l.name))} ${stuck.length > 1 ? 'have' : 'has'} gone 4+ sessions without a new best. Change the rep range, add a set, or deload ~10% for a week.` });

  if (t.acwr) {
    const { ratio, zone } = t.acwr;
    out.push(zone === 'high'
      ? { tone: 'warn', title: `Load spike (${ratio}× usual)`, text: `${t.acwr.acute} sets this week vs about ${t.acwr.chronic} a week normally. Spikes above 1.5× are linked to more injuries - ease off a little.` }
      : zone === 'caution'
        ? { tone: 'info', title: `Load ${ratio}× usual`, text: 'A bigger week than normal. Fine occasionally; recover well before the next one.' }
        : zone === 'low'
          ? { tone: 'info', title: `Lighter week (${ratio}×)`, text: 'Below your usual training. Good for a deload; otherwise get back to your normal volume.' }
          : { tone: 'good', title: `Load in the sweet spot (${ratio}×)`, text: 'This week matches what your body is used to (0.8–1.3×), the lowest-risk zone for progress.' });
  }

  for (const b of t.balance) {
    const ratio = b.rightSets > 0 ? b.leftSets / b.rightSets : Infinity;
    if (ratio > b.ideal[1]) out.push({ tone: 'warn', title: `${b.left}-heavy`, text: `${b.leftSets} ${b.left.toLowerCase()} vs ${b.rightSets} ${b.right.toLowerCase()} sets in 4 weeks. Balance them to protect joints and posture.` });
    else if (ratio < b.ideal[0]) out.push({ tone: 'warn', title: `${b.right}-heavy`, text: `${b.rightSets} ${b.right.toLowerCase()} vs ${b.leftSets} ${b.left.toLowerCase()} sets in 4 weeks. Add more ${b.left.toLowerCase()} work.` });
  }

  const neglected = MAJOR_GROUPS.filter(g => g !== 'Forearms' && (last28[g] || 0) < 4);
  if (t.workouts >= 6 && neglected.length && neglected.length <= 5) out.push({ tone: 'info', title: 'Under-trained muscles', text: `${join(neglected)} got fewer than 4 sets in the last 4 weeks.` });

  const ready = t.recovery.filter(r => r.readiness >= 85 && r.hoursAgo !== null && r.hoursAgo >= 48).map(r => r.group);
  const sore = t.recovery.filter(r => r.readiness < 50).map(r => r.group);
  if (sore.length) out.push({ tone: 'info', title: 'Still recovering', text: `${join(sore)} worked hard recently. Train other muscles today or keep these light.` });
  if (ready.length) out.push({ tone: 'good', title: 'Ready to train', text: `${join(ready.slice(0, 4))} ${ready.length > 1 ? 'are' : 'is'} fully recovered.` });

  if (t.consistency.perWeek > 0) out.push(t.consistency.perWeek >= 2
    ? { tone: 'good', title: `${t.consistency.perWeek} sessions a week`, text: `Averaged over 7 weeks${t.consistency.weekStreak >= 3 ? `, with a ${t.consistency.weekStreak}-week streak` : ''}. Consistency beats intensity.` }
    : { tone: 'info', title: `${t.consistency.perWeek} sessions a week`, text: 'Two or more strength sessions a week roughly doubles muscle and strength gains vs one.' });
  return out;
}
