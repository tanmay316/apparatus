/** Long-term cardio analytics (Pro): best efforts, VO2max, zones, matched routes and trends. */
import type { CardioActivity, CardioActivityType } from '@/types';
import { MAX_CARDIO_KMH, computeSplits, riegel, routeProfile } from '@/lib/cardio-analysis';
import { shiftDate, startMs, type Insight } from '@/lib/analysis-common';
import { cardioLoad, gradeAdjustedKmh, intensityFactor, thresholdKmh } from '@/lib/training-load';

export interface BestEffort {
  label: string;
  km: number;
  sec: number;
  date: string;
  activityId?: string;
  /** Estimated from the average pace because the route was too sparse. */
  approx: boolean;
  /** Best in the last 90 days (for comparison with the all-time best). */
  recentSec?: number;
}

export interface ZoneShare { zone: number; label: string; sec: number; pct: number }
export interface WeekBucket { start: string; km: number; sec: number; elev: number; count: number; load: number }
export interface MatchedRun { date: string; id?: string; km: number; sec: number; paceSec: number; kmh: number; isLatest: boolean }

export interface CardioTrends {
  type: CardioActivityType;
  count: number;
  thresholdKmh: number;
  bestEfforts: BestEffort[];
  vo2max?: { value: number; from: string; level: string };
  predictions: { label: string; km: number; sec: number }[];
  zones: ZoneShare[];
  weeks: WeekBucket[];
  matched?: { routeKm: number; runs: MatchedRun[]; bestPaceSec: number; latestRank: number };
  totals: { last4wKm: number; prev4wKm: number; yearKm: number; longestKm: number; activeWeekStreak: number };
  insights: Insight[];
}

const EFFORTS: Record<CardioActivityType, [string, number][]> = {
  run: [['1 km', 1], ['5 km', 5], ['10 km', 10], ['Half marathon', 21.0975], ['Marathon', 42.195]],
  walk: [['1 km', 1], ['5 km', 5], ['10 km', 10]],
  cycle: [['10 km', 10], ['20 km', 20], ['40 km', 40], ['100 km', 100]],
};

export const ZONE_LABELS = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max', 'Anaerobic'];
const ZONE_EDGES = [0.78, 0.88, 0.95, 1.02, 1.1];

const movingSec = (a: CardioActivity) => a.movingDurationSec || a.durationSec || 0;
const plausible = (a: CardioActivity) => {
  const sec = movingSec(a);
  return sec > 60 && (a.distanceKm || 0) > 0 && (a.distanceKm / (sec / 3600)) <= MAX_CARDIO_KMH[a.type];
};

/** Fastest time over `km` anywhere inside the activity (rolling window over the GPS route). */
export function bestEffortSec(a: CardioActivity, km: number): { sec: number; approx: boolean } | null {
  if ((a.distanceKm || 0) < km * 0.999 || !plausible(a)) return null;
  const profile = routeProfile(a.route, a.type, a.distanceKm || 0);
  if (!profile || profile.km.length < 4) return { sec: (movingSec(a) / a.distanceKm) * km, approx: true };
  const total = profile.km[profile.km.length - 1];
  if (total < km * 0.999) return { sec: (movingSec(a) / a.distanceKm) * km, approx: true };
  let best = Infinity;
  const { km: K, sec: S } = profile;
  let j = 1;
  for (let i = 0; i < K.length; i++) {
    const target = K[i] + km;
    if (target > total + 1e-9) break;
    if (j <= i) j = i + 1;
    while (j < K.length - 1 && K[j] < target) j++;
    const span = K[j] - K[j - 1];
    const f = span > 0 ? (target - K[j - 1]) / span : 0;
    const t = S[j - 1] + f * (S[j] - S[j - 1]) - S[i];
    if (t > 0 && t < best) best = t;
  }
  // GPS smoothing can make tiny windows look impossibly fast; never beat the type's speed cap.
  const floor = (km / MAX_CARDIO_KMH[a.type]) * 3600;
  return isFinite(best) ? { sec: Math.max(best, floor), approx: false } : null;
}

/** Jack Daniels' VDOT from a race-like effort: VO2 cost of the pace over the fraction sustainable for that time. */
export function vdot(km: number, sec: number): number {
  const t = sec / 60;
  const v = (km * 1000) / t;
  const cost = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const frac = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return Math.round((cost / frac) * 10) / 10;
}

function vo2Level(v: number): string {
  if (v >= 60) return 'Elite';
  if (v >= 52) return 'Excellent';
  if (v >= 45) return 'Very good';
  if (v >= 38) return 'Good';
  if (v >= 32) return 'Average';
  return 'Building';
}

const weekStart = (key: string) => {
  const d = new Date(`${key}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  return shiftDate(key, -dow);
};

const distKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371;
};

export interface SessionEffort {
  load: number;
  intensity: number;
  label: string;
  thresholdKmh: number;
  zones: ZoneShare[];
  efforts: { label: string; km: number; sec: number; prevBest?: number; isPR: boolean; approx: boolean }[];
}

/** Effort score, intensity and best efforts inside one session, vs. everything before it. */
export function sessionEffort(a: CardioActivity, history: CardioActivity[]): SessionEffort {
  const thr = thresholdKmh([...history, a], a.type, a.date);
  const intensity = Math.round(intensityFactor(a, thr) * 100) / 100;
  const label = intensity >= 1.02 ? 'Very hard' : intensity >= 0.95 ? 'Hard' : intensity >= 0.88 ? 'Moderate' : intensity >= 0.78 ? 'Steady' : 'Easy';
  const zoneSec = [0, 0, 0, 0, 0, 0];
  if (a.type !== 'walk') {
    const splits = computeSplits(a, 1);
    for (const s of splits.length ? splits : [{ kmh: gradeAdjustedKmh(a), sec: movingSec(a) }]) {
      const z = ZONE_EDGES.findIndex(edge => s.kmh / thr < edge);
      zoneSec[z === -1 ? 5 : z] += s.sec;
    }
  }
  const zt = zoneSec.reduce((x, y) => x + y, 0);
  const prior = history.filter(h => h.type === a.type && h !== a && (!a.id || h.id !== a.id) && startMs(h) < startMs(a));
  const efforts: SessionEffort['efforts'] = [];
  for (const [effortLabel, km] of EFFORTS[a.type]) {
    const e = bestEffortSec(a, km);
    if (!e) continue;
    let prevBest = Infinity;
    for (const h of prior) {
      const p = bestEffortSec(h, km);
      if (p) prevBest = Math.min(prevBest, p.sec);
    }
    efforts.push({ label: effortLabel, km, sec: Math.round(e.sec), approx: e.approx, ...(isFinite(prevBest) ? { prevBest: Math.round(prevBest) } : {}), isPR: isFinite(prevBest) && e.sec < prevBest - 1 });
  }
  return {
    load: cardioLoad(a, thr),
    intensity,
    label,
    thresholdKmh: thr,
    zones: zt ? zoneSec.map((sec, i) => ({ zone: i + 1, label: ZONE_LABELS[i], sec: Math.round(sec), pct: Math.round((sec / zt) * 100) })) : [],
    efforts,
  };
}

export function analyzeCardioTrends(all: CardioActivity[], type: CardioActivityType, asOf: string): CardioTrends {
  const list = all.filter(a => a.type === type && a.date && a.date <= asOf && plausible(a)).sort((a, b) => a.date.localeCompare(b.date));
  const thr = thresholdKmh(all, type, asOf);
  const since90 = shiftDate(asOf, -90);

  const bestEfforts: BestEffort[] = [];
  for (const [label, km] of EFFORTS[type]) {
    let best: BestEffort | null = null;
    let recent = Infinity;
    for (const a of list) {
      const e = bestEffortSec(a, km);
      if (!e) continue;
      if (!best || e.sec < best.sec) best = { label, km, sec: Math.round(e.sec), date: a.date, activityId: a.id, approx: e.approx };
      if (a.date >= since90) recent = Math.min(recent, e.sec);
    }
    if (best) bestEfforts.push({ ...best, ...(isFinite(recent) ? { recentSec: Math.round(recent) } : {}) });
  }

  let vo2max: CardioTrends['vo2max'];
  let predictions: CardioTrends['predictions'] = [];
  if (type === 'run') {
    let bestV = 0;
    let anchor: { km: number; sec: number; label: string } | null = null;
    for (const a of list.filter(x => x.date >= since90)) {
      for (const [label, km] of EFFORTS.run.filter(([, k]) => k >= 5)) {
        const e = bestEffortSec(a, km);
        if (!e) continue;
        const v = vdot(km, e.sec);
        if (v > bestV && v < 85) { bestV = v; anchor = { km, sec: e.sec, label }; }
      }
    }
    if (anchor && bestV > 15) {
      vo2max = { value: bestV, from: anchor.label, level: vo2Level(bestV) };
      predictions = EFFORTS.run.filter(([, km]) => km >= 5).map(([label, km]) => ({ label, km, sec: Math.round(riegel(anchor!.sec, anchor!.km, km)) }));
    }
  } else if (type === 'cycle') {
    const anchor = bestEfforts.filter(e => e.recentSec).sort((x, y) => y.km - x.km)[0];
    if (anchor?.recentSec) predictions = EFFORTS.cycle.map(([label, km]) => ({ label, km, sec: Math.round(riegel(anchor.recentSec!, anchor.km, km, 1.05)) }));
  }

  // Time in zone over the last 28 days, from 1 km splits where the route allows.
  const zoneSec = [0, 0, 0, 0, 0, 0];
  if (type !== 'walk') {
    for (const a of list.filter(x => x.date >= shiftDate(asOf, -28))) {
      const splits = computeSplits(a, 1);
      const parts = splits.length ? splits.map(s => ({ kmh: s.kmh, sec: s.sec })) : [{ kmh: gradeAdjustedKmh(a), sec: movingSec(a) }];
      for (const p of parts) {
        const r = p.kmh / thr;
        const z = ZONE_EDGES.findIndex(edge => r < edge);
        zoneSec[z === -1 ? 5 : z] += p.sec;
      }
    }
  }
  const zoneTotal = zoneSec.reduce((a, b) => a + b, 0);
  const zones: ZoneShare[] = zoneTotal ? zoneSec.map((sec, i) => ({ zone: i + 1, label: ZONE_LABELS[i], sec: Math.round(sec), pct: Math.round((sec / zoneTotal) * 100) })) : [];

  const weeks: WeekBucket[] = [];
  const thisWeek = weekStart(asOf);
  for (let i = 11; i >= 0; i--) weeks.push({ start: shiftDate(thisWeek, -7 * i), km: 0, sec: 0, elev: 0, count: 0, load: 0 });
  for (const a of list) {
    const w = weeks.find(b => b.start === weekStart(a.date));
    if (!w) continue;
    w.km += a.distanceKm || 0;
    w.sec += movingSec(a);
    w.elev += a.elevationGainM || 0;
    w.count += 1;
    w.load += cardioLoad(a, thr);
  }
  for (const w of weeks) { w.km = Math.round(w.km * 10) / 10; w.elev = Math.round(w.elev); w.sec = Math.round(w.sec); }

  // Same route: similar distance and the same start and finish.
  let matched: CardioTrends['matched'];
  const latest = [...list].reverse().find(a => (a.route || []).length >= 3);
  if (latest) {
    const s0 = latest.route[0];
    const e0 = latest.route[latest.route.length - 1];
    const runs = list.filter(a => (a.route || []).length >= 3
      && Math.abs(a.distanceKm - latest.distanceKm) / latest.distanceKm <= 0.12
      && distKm(a.route[0], s0) <= 0.3 && distKm(a.route[a.route.length - 1], e0) <= 0.3)
      .map(a => ({ date: a.date, id: a.id, km: Math.round(a.distanceKm * 100) / 100, sec: movingSec(a), paceSec: Math.round(movingSec(a) / a.distanceKm), kmh: Math.round((a.distanceKm / (movingSec(a) / 3600)) * 10) / 10, isLatest: a === latest }));
    if (runs.length >= 2) {
      const sorted = [...runs].sort((x, y) => x.paceSec - y.paceSec);
      matched = { routeKm: Math.round(latest.distanceKm * 10) / 10, runs: runs.slice(-12), bestPaceSec: sorted[0].paceSec, latestRank: sorted.findIndex(r => r.isLatest) + 1 };
    }
  }

  const sumKm = (from: string, to: string) => Math.round(list.filter(a => a.date > from && a.date <= to).reduce((s, a) => s + a.distanceKm, 0) * 10) / 10;
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].count > 0) streak++;
    else if (i === weeks.length - 1) continue;
    else break;
  }
  const totals = {
    last4wKm: sumKm(shiftDate(asOf, -28), asOf),
    prev4wKm: sumKm(shiftDate(asOf, -56), shiftDate(asOf, -28)),
    yearKm: sumKm(`${asOf.slice(0, 4)}-01-00`, asOf),
    longestKm: Math.round(Math.max(0, ...list.map(a => a.distanceKm)) * 10) / 10,
    activeWeekStreak: streak,
  };

  const trends: CardioTrends = { type, count: list.length, thresholdKmh: thr, bestEfforts, vo2max, predictions, zones, weeks, matched, totals, insights: [] };
  trends.insights = trendInsights(trends);
  return trends;
}

function trendInsights(t: CardioTrends): Insight[] {
  const out: Insight[] = [];
  const noun = t.type === 'cycle' ? 'riding' : t.type === 'walk' ? 'walking' : 'running';
  if (t.totals.prev4wKm > 0) {
    const ch = Math.round(((t.totals.last4wKm - t.totals.prev4wKm) / t.totals.prev4wKm) * 100);
    out.push(ch > 40
      ? { tone: 'warn', title: `Volume up ${ch}% in 4 weeks`, text: `${t.totals.last4wKm} km vs ${t.totals.prev4wKm} km the 4 weeks before. Build by about 10% a week to stay injury-free.` }
      : ch >= 0
        ? { tone: 'good', title: `Volume up ${ch}%`, text: `${t.totals.last4wKm} km of ${noun} in the last 4 weeks vs ${t.totals.prev4wKm} km before - steady progress.` }
        : { tone: 'info', title: `Volume down ${Math.abs(ch)}%`, text: `${t.totals.last4wKm} km in the last 4 weeks vs ${t.totals.prev4wKm} km. Fine for a recovery block; otherwise add one short session a week.` });
  }
  if (t.zones.length) {
    const easy = t.zones[0].pct + t.zones[1].pct;
    const hard = t.zones[3].pct + t.zones[4].pct + t.zones[5].pct;
    if (easy < 65 && t.type === 'run') out.push({ tone: 'warn', title: `Only ${easy}% of time easy`, text: 'Elite endurance athletes spend about 80% of training time in easy zones 1–2. More easy running builds aerobic fitness with less fatigue.' });
    else if (easy >= 75) out.push({ tone: 'good', title: `${easy}% easy, ${hard}% hard`, text: 'Close to the 80/20 polarised split used by top endurance athletes.' });
    if (hard === 0 && t.count >= 6) out.push({ tone: 'info', title: 'No hard efforts lately', text: 'One weekly session at threshold or faster (intervals, tempo) is the quickest way to raise your top-end speed.' });
  }
  if (t.vo2max) out.push({ tone: 'info', title: `VO2 max ≈ ${t.vo2max.value} (${t.vo2max.level})`, text: `Estimated from your best ${t.vo2max.from} effort in the last 90 days. Faster race-pace efforts raise it.` });
  const pr = t.bestEfforts.find(e => e.recentSec !== undefined && e.recentSec === e.sec);
  if (pr) out.push({ tone: 'good', title: `New ${pr.label} best`, text: `Your fastest ${pr.label} came in the last 90 days (${pr.date}).` });
  if (t.matched && t.matched.runs.length >= 3) {
    out.push(t.matched.latestRank === 1
      ? { tone: 'good', title: 'Fastest time on this route', text: `Your latest ${t.matched.routeKm} km is your best of ${t.matched.runs.length} on this route.` }
      : { tone: 'info', title: `#${t.matched.latestRank} of ${t.matched.runs.length} on this route`, text: `Your latest ${t.matched.routeKm} km ranks ${t.matched.latestRank} of ${t.matched.runs.length} efforts on the same route.` });
  }
  if (t.totals.activeWeekStreak >= 4) out.push({ tone: 'good', title: `${t.totals.activeWeekStreak}-week streak`, text: 'Consistency is the biggest driver of endurance fitness. Keep it going.' });
  return out;
}
