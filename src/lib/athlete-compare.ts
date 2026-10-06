/**
 * Pro: you vs an athlete you follow. Compares consistency and improvement (not just who is
 * stronger), explains who is ahead and why, and suggests one thing to do next.
 */
import type { CardioActivity, CardioActivityType, Workout } from '@/types';
import { shiftDate, startMs } from '@/lib/analysis-common';
import { bestSetMetric, exerciseVolumeUnit } from '@/lib/progressive-overload';
import { isWorking } from '@/lib/workout-analysis';
import { workoutMinutes } from '@/lib/pro-insights';
import { bucketIndex, rangeBuckets, rangeDays, rangeStart, type TimeRange } from '@/lib/time-range';

export interface AthleteLog { workouts: Workout[]; cardio: CardioActivity[] }

export interface Momentum { label: string; tone: 'up' | 'flat' | 'down' | 'idle'; text: string }

export interface SideStats {
  sessions: number;
  activeDays: number;
  minutes: number;
  workouts: number;
  cardioSessions: number;
  distanceKm: number;
  volumeKg: number;
  prs: number;
  /** Active days as a share of the period. */
  consistencyPct: number;
  /** Training time vs the previous period of the same length (null for "All"). */
  trendPct: number | null;
  /** Average % improvement of lifts done at least twice in the period. */
  liftProgressPct: number | null;
  lastActive: string | null;
  daysSinceActive: number | null;
  momentum: Momentum;
  /** Momentum score 0-100: consistency, improvement and PRs (not absolute strength). */
  score: number;
  /** Training minutes per chart bucket. */
  series: number[];
}

export interface LiftCompare { name: string; unit: 'kg' | 'reps' | 's'; me: { best: number; changePct: number | null }; them: { best: number; changePct: number | null } }
export interface CardioCompare {
  type: CardioActivityType;
  me: { km: number; sessions: number; paceSec: number | null; kmh: number | null; changePct: number | null };
  them: { km: number; sessions: number; paceSec: number | null; kmh: number | null; changePct: number | null };
}

export interface Comparison {
  days: number;
  labels: string[];
  me: SideStats;
  them: SideStats;
  lifts: LiftCompare[];
  cardio: CardioCompare[];
  leader: 'me' | 'them' | 'tie' | 'none';
  /** Why each side is ahead, most important first. */
  theirEdge: string[];
  myEdge: string[];
  action: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const movingSec = (a: CardioActivity) => a.movingDurationSec || a.durationSec || 0;
const NOUN: Record<CardioActivityType, string> = { run: 'run', walk: 'walk', cycle: 'ride' };

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const liftKey = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Every best-set metric per lift in date order (e1RM for loaded lifts, reps or hold seconds otherwise). */
function liftHistory(workouts: Workout[]) {
  const out = new Map<string, { name: string; unit: LiftCompare['unit']; points: { date: string; v: number }[] }>();
  for (const w of [...workouts].sort((a, b) => startMs(a) - startMs(b))) {
    for (const e of (w.exercises || []).filter(isWorking)) {
      const v = bestSetMetric(e);
      if (!(v > 0)) continue;
      const key = liftKey(e.name);
      const entry = out.get(key) || { name: e.name.trim(), unit: exerciseVolumeUnit(e), points: [] };
      entry.points.push({ date: w.date, v });
      out.set(key, entry);
    }
  }
  return out;
}

function liftStats(history: ReturnType<typeof liftHistory>, from: string, to: string) {
  let prs = 0;
  const changes: number[] = [];
  const perLift = new Map<string, { best: number; changePct: number | null; sessions: number }>();
  for (const [key, l] of history) {
    let best = 0;
    const inRange: number[] = [];
    for (const p of l.points) {
      if (p.date > to) break;
      if (p.date >= from) {
        if (best > 0 && p.v > best) prs++;
        inRange.push(p.v);
      }
      best = Math.max(best, p.v);
    }
    if (!inRange.length) continue;
    const change = inRange.length >= 2 ? pct(Math.max(...inRange.slice(1)), inRange[0]) : null;
    if (change !== null) changes.push(Math.max(-50, Math.min(100, change)));
    perLift.set(key, { best: r1(Math.max(...inRange)), changePct: change, sessions: inRange.length });
  }
  return { prs, perLift, avgChange: changes.length ? Math.round(changes.reduce((s, c) => s + c, 0) / changes.length) : null };
}

function minutesIn(log: AthleteLog, from: string, to: string): number {
  const c = log.cardio.filter(a => a.date >= from && a.date <= to).reduce((s, a) => s + movingSec(a) / 60, 0);
  const w = log.workouts.filter(x => x.date >= from && x.date <= to).reduce((s, x) => s + workoutMinutes(x), 0);
  return c + w;
}

function cardioType(log: AthleteLog, type: CardioActivityType, from: string, to: string) {
  const list = log.cardio.filter(a => a.type === type && a.date >= from && a.date <= to && a.distanceKm > 0 && movingSec(a) > 0);
  const km = list.reduce((s, a) => s + a.distanceKm, 0);
  const sec = list.reduce((s, a) => s + movingSec(a), 0);
  return { km: r1(km), sessions: list.length, sec };
}

function momentum(trend: number | null, daysSince: number | null, sessions: number, prevMinutes: number): Momentum {
  if (daysSince === null) return { label: 'No sessions yet', tone: 'idle', text: 'Nothing shared yet.' };
  if (daysSince > 21) return { label: 'Inactive', tone: 'idle', text: `No training for ${daysSince} days.` };
  if (daysSince > 7) return { label: 'Taking a break', tone: 'idle', text: `Last session ${daysSince} days ago.` };
  if (sessions > 0 && prevMinutes === 0 && trend === null) return { label: 'Getting started', tone: 'up', text: 'Just started training again.' };
  if (trend === null) return { label: 'Active', tone: 'flat', text: 'Training regularly.' };
  if (trend >= 15) return { label: 'On fire', tone: 'up', text: `Training ${trend}% more than the period before.` };
  if (trend >= -10) return { label: 'Steady', tone: 'flat', text: 'Keeping a steady routine.' };
  return { label: 'Slowing down', tone: 'down', text: `Training ${Math.abs(trend)}% less than the period before.` };
}

function side(log: AthleteLog, range: TimeRange, asOf: string, earliest: string | null, lifts: ReturnType<typeof liftHistory>): SideStats {
  const from = rangeStart(range, asOf, earliest);
  const days = rangeDays(range, asOf, earliest);
  const w = log.workouts.filter(x => x.date >= from && x.date <= asOf);
  const c = log.cardio.filter(a => a.date >= from && a.date <= asOf);
  const activeDays = new Set([...w.map(x => x.date), ...c.map(a => a.date)]).size;
  const minutes = minutesIn(log, from, asOf);
  const prevFrom = shiftDate(from, -days);
  const prevMinutes = minutesIn(log, prevFrom, shiftDate(from, -1));
  const trendPct = range === 'all' ? null : pct(minutes, prevMinutes);
  const ls = liftStats(lifts, from, asOf);
  const allDates = [...log.workouts.map(x => x.date), ...log.cardio.map(a => a.date)].filter(d => d && d <= asOf).sort();
  const lastActive = allDates.length ? allDates[allDates.length - 1] : null;
  const daysSinceActive = lastActive ? daysBetween(lastActive, asOf) : null;
  const consistencyPct = Math.round((activeDays / days) * 100);

  // Consistency (45) + improvement vs last period (35) + PRs and lift progress (20).
  const trendPart = trendPct === null ? (minutes > 0 ? 0.5 : 0) : Math.max(0, Math.min(1, (trendPct + 50) / 100));
  const prPart = Math.min(1, ls.prs / 4) * 0.6 + (ls.avgChange === null ? 0 : Math.max(0, Math.min(1, ls.avgChange / 10))) * 0.4;
  const score = minutes > 0 ? Math.round(Math.min(1, consistencyPct / 60) * 45 + trendPart * 35 + prPart * 20) : 0;

  const buckets = rangeBuckets(range, asOf, earliest);
  const series = buckets.map(() => 0);
  for (const x of w) { const i = bucketIndex(buckets, x.date); if (i >= 0) series[i] += workoutMinutes(x); }
  for (const a of c) { const i = bucketIndex(buckets, a.date); if (i >= 0) series[i] += movingSec(a) / 60; }

  return {
    sessions: w.length + c.length,
    activeDays,
    minutes: Math.round(minutes),
    workouts: w.length,
    cardioSessions: c.length,
    distanceKm: r1(c.reduce((s, a) => s + (a.distanceKm || 0), 0)),
    volumeKg: Math.round(w.reduce((s, x) => s + (x.volume || 0), 0)),
    prs: ls.prs,
    consistencyPct,
    trendPct,
    liftProgressPct: ls.avgChange,
    lastActive,
    daysSinceActive,
    momentum: momentum(trendPct, daysSinceActive, w.length + c.length, prevMinutes),
    score,
    series: series.map(Math.round),
  };
}

export function compareAthletes(me: AthleteLog, them: AthleteLog, range: TimeRange, asOf: string, theirName: string): Comparison {
  const dates = [...me.workouts, ...me.cardio, ...them.workouts, ...them.cardio].map(x => x.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort();
  const earliest = dates[0] || null;
  const myLifts = liftHistory(me.workouts);
  const theirLifts = liftHistory(them.workouts);
  const a = side(me, range, asOf, earliest, myLifts);
  const b = side(them, range, asOf, earliest, theirLifts);
  const from = rangeStart(range, asOf, earliest);
  const days = rangeDays(range, asOf, earliest);

  // Lifts both of you did in the period, most trained first.
  const myL = liftStats(myLifts, from, asOf).perLift;
  const theirL = liftStats(theirLifts, from, asOf).perLift;
  const lifts: LiftCompare[] = [...myL.keys()].filter(k => theirL.has(k))
    .sort((x, y) => (theirL.get(y)!.sessions + myL.get(y)!.sessions) - (theirL.get(x)!.sessions + myL.get(x)!.sessions))
    .slice(0, 4)
    .map(k => ({
      name: myLifts.get(k)!.name,
      unit: myLifts.get(k)!.unit,
      me: { best: myL.get(k)!.best, changePct: myL.get(k)!.changePct },
      them: { best: theirL.get(k)!.best, changePct: theirL.get(k)!.changePct },
    }));

  const prevFrom = shiftDate(from, -days);
  const prevTo = shiftDate(from, -1);
  const cardio: CardioCompare[] = (['run', 'cycle', 'walk'] as CardioActivityType[]).flatMap(type => {
    const sideOf = (log: AthleteLog) => {
      const cur = cardioType(log, type, from, asOf);
      const prev = cardioType(log, type, prevFrom, prevTo);
      const speed = (x: { km: number; sec: number }) => (x.km > 0 && x.sec > 0 ? x.km / (x.sec / 3600) : 0);
      return {
        km: cur.km,
        sessions: cur.sessions,
        paceSec: cur.km > 0 ? Math.round(cur.sec / cur.km) : null,
        kmh: cur.km > 0 ? r1(speed(cur)) : null,
        // Faster is better for every type: compare average speed with the previous period.
        changePct: range !== 'all' && prev.km > 0 && cur.km > 0 ? pct(speed(cur), speed(prev)) : null,
      };
    };
    const m = sideOf(me);
    const t = sideOf(them);
    return m.sessions + t.sessions > 0 ? [{ type, me: m, them: t }] : [];
  });

  const name = theirName.split(' ')[0] || theirName;
  const theirEdge: string[] = [];
  const myEdge: string[] = [];
  const edge = (diff: boolean, mine: boolean, text: string, myText: string) => { if (diff) (mine ? myEdge : theirEdge).push(mine ? myText : text); };

  edge(Math.abs(a.activeDays - b.activeDays) >= 2, a.activeDays > b.activeDays,
    `${name} trained on ${b.activeDays} days, you on ${a.activeDays}.`,
    `You trained on ${a.activeDays} days, ${name} on ${b.activeDays}.`);
  if (a.trendPct !== null && b.trendPct !== null && Math.abs(a.trendPct - b.trendPct) >= 15) {
    edge(true, a.trendPct > b.trendPct,
      `${name} is training ${b.trendPct > 0 ? `${b.trendPct}% more` : `${Math.abs(b.trendPct)}% less`} than before; you ${a.trendPct >= 0 ? `+${a.trendPct}%` : `${a.trendPct}%`}.`,
      `You stepped up ${a.trendPct}% vs the period before; ${name} ${b.trendPct >= 0 ? `+${b.trendPct}%` : `${b.trendPct}%`}.`);
  }
  edge(a.prs !== b.prs && Math.max(a.prs, b.prs) >= 2, a.prs > b.prs, `${name} set ${b.prs} personal records, you ${a.prs}.`, `You set ${a.prs} personal records, ${name} ${b.prs}.`);
  for (const l of lifts) {
    if (l.me.changePct === null || l.them.changePct === null || Math.abs(l.me.changePct - l.them.changePct) < 3) continue;
    edge(true, l.me.changePct > l.them.changePct,
      `${name}'s ${l.name} improved ${l.them.changePct}%, yours ${l.me.changePct}%.`,
      `Your ${l.name} improved ${l.me.changePct}%, ${name}'s ${l.them.changePct}%.`);
    break;
  }
  for (const c of cardio) {
    if (Math.max(c.me.km, c.them.km) >= 3 && Math.abs(c.me.km - c.them.km) >= Math.max(c.me.km, c.them.km) * 0.25) {
      edge(true, c.me.km > c.them.km, `${name} covered ${c.them.km} km of ${NOUN[c.type]}s, you ${c.me.km} km.`, `You covered ${c.me.km} km of ${NOUN[c.type]}s, ${name} ${c.them.km} km.`);
    }
    if (c.me.changePct !== null && c.them.changePct !== null && Math.abs(c.me.changePct - c.them.changePct) >= 3) {
      edge(true, c.me.changePct > c.them.changePct, `${name}'s ${NOUN[c.type]} speed is up ${c.them.changePct}%, yours ${c.me.changePct}%.`, `Your ${NOUN[c.type]} speed is up ${c.me.changePct}%, ${name}'s ${c.them.changePct}%.`);
    }
  }

  const leader = a.minutes === 0 && b.minutes === 0 ? 'none' : Math.abs(a.score - b.score) < 5 ? 'tie' : a.score > b.score ? 'me' : 'them';

  let action: string;
  const weeks = Math.max(1, days / 7);
  const dayGap = Math.ceil((b.activeDays - a.activeDays) / weeks);
  if (a.minutes === 0) action = 'Log a session today to get on the board.';
  else if (b.minutes === 0) action = `You're ahead while ${name} is resting. Keep your streak going.`;
  else if (dayGap >= 1) action = `Add ${dayGap} more training day${dayGap === 1 ? '' : 's'} a week to match ${name}'s consistency.`;
  else if (b.prs > a.prs || (b.liftProgressPct ?? 0) > (a.liftProgressPct ?? 0) + 3) action = 'Push progressive overload: add a rep or 2.5 kg to your main lifts next session.';
  else if (cardio.some(c => c.them.km > c.me.km * 1.25 && c.them.km >= 3)) {
    const c = cardio.find(x => x.them.km > x.me.km * 1.25 && x.them.km >= 3)!;
    action = `Add one longer ${NOUN[c.type]} this week to close the distance gap.`;
  } else if (leader === 'me') action = `You're ahead. Keep it up, or challenge ${name} to keep you both pushing.`;
  else action = 'Neck and neck. One extra session this week puts you in front.';

  return {
    days,
    labels: rangeBuckets(range, asOf, earliest).map(x => x.label),
    me: a,
    them: b,
    lifts,
    cardio,
    leader,
    theirEdge: theirEdge.slice(0, 4),
    myEdge: myEdge.slice(0, 4),
    action,
  };
}

// ─── Nutrition (aggregates from the backend) ─────────────────

export interface NutritionSide {
  days: number;
  loggedDays: number;
  loggingPct: number;
  avgCalories: number | null;
  avgProtein: number | null;
  calorieOnTargetPct: number | null;
  proteinHitPct: number | null;
  avgHealthScore: number | null;
  lastLogged: string | null;
  weeks: { start: string; loggedDays: number; proteinHitDays: number }[];
}

export type NutritionStatus = 'ok' | 'not_following' | 'private' | 'unavailable';

/** Plain-language lines about who eats more consistently, for the nutrition card. */
export function nutritionEdges(me: NutritionSide, them: NutritionSide, theirName: string): { theirEdge: string[]; myEdge: string[] } {
  const name = theirName.split(' ')[0] || theirName;
  const theirEdge: string[] = [];
  const myEdge: string[] = [];
  if (Math.abs(me.loggedDays - them.loggedDays) >= 2) {
    (me.loggedDays > them.loggedDays ? myEdge : theirEdge).push(me.loggedDays > them.loggedDays
      ? `You logged meals on ${me.loggedDays} days, ${name} on ${them.loggedDays}.`
      : `${name} logged meals on ${them.loggedDays} days, you on ${me.loggedDays}.`);
  }
  if (me.proteinHitPct !== null && them.proteinHitPct !== null && Math.abs(me.proteinHitPct - them.proteinHitPct) >= 10) {
    (me.proteinHitPct > them.proteinHitPct ? myEdge : theirEdge).push(me.proteinHitPct > them.proteinHitPct
      ? `You hit your protein goal on ${me.proteinHitPct}% of days, ${name} ${them.proteinHitPct}%.`
      : `${name} hits their protein goal on ${them.proteinHitPct}% of days, you ${me.proteinHitPct}%.`);
  }
  if (me.calorieOnTargetPct !== null && them.calorieOnTargetPct !== null && Math.abs(me.calorieOnTargetPct - them.calorieOnTargetPct) >= 10) {
    (me.calorieOnTargetPct > them.calorieOnTargetPct ? myEdge : theirEdge).push(me.calorieOnTargetPct > them.calorieOnTargetPct
      ? `You stay within 10% of your calorie goal more often (${me.calorieOnTargetPct}% vs ${them.calorieOnTargetPct}%).`
      : `${name} stays within 10% of their calorie goal more often (${them.calorieOnTargetPct}% vs ${me.calorieOnTargetPct}%).`);
  }
  return { theirEdge, myEdge };
}
