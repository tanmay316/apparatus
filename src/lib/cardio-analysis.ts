import type { CardioActivity, CardioActivityType, RoutePoint } from '@/types';
import { shiftDate, startMs, type Insight } from '@/lib/analysis-common';

export interface CardioSplit { index: number; km: number; sec: number; paceSec: number; kmh: number; partial: boolean }

export interface CardioSnapshot {
  date: string;
  km: number;
  sec: number;
  /** Seconds per km. */
  paceSec: number;
  kmh: number;
  maxKmh: number;
  elevGain: number;
  climbPerKm: number;
  calories: number;
  steps?: number;
  /** Steps per minute, only from a real step counter. */
  cadence?: number;
  strideM?: number;
}

export interface CardioAnalysis {
  type: CardioActivityType;
  current: CardioSnapshot;
  previous?: CardioSnapshot;
  /** Average of the same activity over the 28 days before this session. */
  recent?: { count: number; km: number; paceSec: number; kmh: number };
  records: { longest: boolean; fastest: boolean; mostClimb: boolean };
  splitKm: number;
  splits: CardioSplit[];
  pacing?: { firstHalfPaceSec: number; secondHalfPaceSec: number; changePct: number; variabilityPct: number; fastest: number; slowest: number };
  weekly: { km: number; prevKm: number; changePct?: number; sessions: number; moderateMin: number };
  predictions: { label: string; km: number; sec: number }[];
  insights: Insight[];
}

const MAX_KMH: Record<CardioActivityType, number> = { run: 25, walk: 10, cycle: 70 };
/** Minimum distance for a session's average speed to count as a "fastest". */
const FAST_MIN_KM: Record<CardioActivityType, number> = { run: 1, walk: 1, cycle: 5 };
const LABEL: Record<CardioActivityType, string> = { run: 'run', walk: 'walk', cycle: 'ride' };

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance (km) and moving time (s) along the route, skipping pauses and GPS jumps. */
function routeProfile(route: RoutePoint[], type: CardioActivityType, recordedKm: number): { km: number[]; sec: number[] } | null {
  if (!Array.isArray(route) || route.length < 3 || !route.every(p => typeof p.ts === 'number')) return null;
  const km = [0];
  const sec = [0];
  for (let i = 1; i < route.length; i++) {
    const d = haversineKm(route[i - 1], route[i]);
    const dt = (route[i].ts - route[i - 1].ts) / 1000;
    const kmh = dt > 0 ? d / (dt / 3600) : Infinity;
    const paused = dt > 20 && kmh < 1;
    const jump = kmh > MAX_KMH[type];
    km.push(km[i - 1] + (jump ? 0 : d));
    sec.push(sec[i - 1] + (paused || jump || dt <= 0 ? 0 : dt));
  }
  // The saved route is simplified, so stretch it to the recorded distance (if roughly consistent).
  const total = km[km.length - 1];
  if (recordedKm > 0 && total > 0) {
    const ratio = recordedKm / total;
    if (ratio < 0.6 || ratio > 1.6) return null;
    for (let i = 0; i < km.length; i++) km[i] *= ratio;
  }
  return { km, sec };
}

function timeAt(profile: { km: number[]; sec: number[] }, target: number): number {
  const { km, sec } = profile;
  for (let i = 1; i < km.length; i++) {
    if (km[i] >= target) {
      const span = km[i] - km[i - 1];
      const f = span > 0 ? (target - km[i - 1]) / span : 0;
      return sec[i - 1] + f * (sec[i] - sec[i - 1]);
    }
  }
  return sec[sec.length - 1];
}

export function computeSplits(activity: Pick<CardioActivity, 'route' | 'type' | 'distanceKm'>, splitKm: number): CardioSplit[] {
  const profile = routeProfile(activity.route, activity.type, activity.distanceKm || 0);
  if (!profile) return [];
  const total = profile.km[profile.km.length - 1];
  if (total < splitKm * 0.5) return [];
  const splits: CardioSplit[] = [];
  let prevTime = 0;
  const count = Math.ceil(total / splitKm - 1e-9);
  for (let i = 1; i <= count; i++) {
    const end = Math.min(i * splitKm, total);
    const km = end - (i - 1) * splitKm;
    if (km < splitKm * 0.2) break;
    const t = timeAt(profile, end);
    const sec = t - prevTime;
    prevTime = t;
    if (sec <= 0) continue;
    splits.push({ index: i, km: Math.round(km * 100) / 100, sec: Math.round(sec), paceSec: Math.round(sec / km), kmh: Math.round((km / (sec / 3600)) * 10) / 10, partial: km < splitKm * 0.999 });
  }
  return splits;
}

function snapshot(a: CardioActivity): CardioSnapshot {
  const km = a.distanceKm || 0;
  const sec = a.movingDurationSec || a.durationSec || 0;
  const realSteps = !!a.steps && a.stepSource !== 'gps_estimate' && a.stepSource !== 'none';
  const cadence = realSteps && sec > 0 ? Math.round(a.steps! / (sec / 60)) : 0;
  return {
    date: a.date,
    km: Math.round(km * 100) / 100,
    sec,
    paceSec: km > 0 ? Math.round(sec / km) : 0,
    kmh: sec > 0 ? Math.round((km / (sec / 3600)) * 10) / 10 : 0,
    maxKmh: a.maxSpeedKmh || 0,
    elevGain: Math.round(a.elevationGainM || 0),
    climbPerKm: km > 0 ? Math.round(((a.elevationGainM || 0) / km) * 10) / 10 : 0,
    calories: a.calories || 0,
    ...(a.steps ? { steps: a.steps } : {}),
    ...(cadence >= 40 && cadence <= 230 ? { cadence, strideM: Math.round(((km * 1000) / a.steps!) * 100) / 100 } : {}),
  };
}

/** Riegel's endurance model: T2 = T1 × (D2 / D1)^1.06. */
export function riegel(sec: number, km: number, targetKm: number, exponent = 1.06): number {
  return sec * Math.pow(targetKm / km, exponent);
}

const plausible = (a: CardioActivity) => {
  const s = snapshot(a);
  return s.km > 0 && s.sec > 0 && s.kmh <= MAX_KMH[a.type];
};

/** Heart-health minutes: vigorous activity counts double (WHO: 150 moderate or 75 vigorous a week). */
function moderateMinutes(a: CardioActivity): number {
  const s = snapshot(a);
  const min = s.sec / 60;
  const vigorous = a.type === 'run' || (a.type === 'cycle' && s.kmh >= 16) || (a.type === 'walk' && s.kmh >= 6.5);
  return min * (vigorous ? 2 : 1);
}

export function formatPaceSec(sec: number): string {
  if (!sec || !isFinite(sec)) return '--:--';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Detailed look at one run, walk or ride against the user's earlier sessions. */
export function analyzeCardio(activity: CardioActivity, history: CardioActivity[]): CardioAnalysis {
  const type = activity.type;
  const current = snapshot(activity);
  const currentMs = startMs(activity) || Infinity;
  const earlierAll = history
    .filter(h => h !== activity && (!activity.id || h.id !== activity.id) && startMs(h) < currentMs)
    .sort((a, b) => startMs(b) - startMs(a));
  const earlier = earlierAll.filter(h => h.type === type);
  const previous = earlier[0] ? snapshot(earlier[0]) : undefined;

  const monthStart = shiftDate(current.date, -28);
  const recentList = earlier.filter(h => h.date >= monthStart && plausible(h)).map(snapshot);
  const recentKm = recentList.reduce((t, s) => t + s.km, 0);
  const recentSec = recentList.reduce((t, s) => t + s.sec, 0);
  const recent = recentList.length && recentKm > 0 ? {
    count: recentList.length,
    km: Math.round((recentKm / recentList.length) * 100) / 100,
    paceSec: Math.round(recentSec / recentKm),
    kmh: Math.round((recentKm / (recentSec / 3600)) * 10) / 10,
  } : undefined;

  const priorPlausible = earlier.filter(plausible).map(snapshot);
  const valid = current.km > 0 && current.sec > 0 && current.kmh <= MAX_KMH[type];
  const records = {
    longest: valid && priorPlausible.length > 0 && current.km > Math.max(...priorPlausible.map(s => s.km)),
    fastest: valid && current.km >= FAST_MIN_KM[type] && priorPlausible.some(s => s.km >= FAST_MIN_KM[type])
      && current.kmh > Math.max(...priorPlausible.filter(s => s.km >= FAST_MIN_KM[type]).map(s => s.kmh)),
    mostClimb: valid && current.elevGain >= 50 && priorPlausible.length > 0 && current.elevGain > Math.max(...priorPlausible.map(s => s.elevGain)),
  };

  const splitKm = type === 'cycle' && current.km >= 15 ? 5 : 1;
  const splits = computeSplits(activity, splitKm);
  let pacing: CardioAnalysis['pacing'];
  const profile = routeProfile(activity.route, type, activity.distanceKm || 0);
  const full = splits.filter(s => !s.partial);
  if (profile && full.length >= 2) {
    const total = profile.km[profile.km.length - 1];
    const totalSec = profile.sec[profile.sec.length - 1];
    const halfSec = timeAt(profile, total / 2);
    const firstHalfPaceSec = halfSec / (total / 2);
    const secondHalfPaceSec = (totalSec - halfSec) / (total / 2);
    const paces = full.map(s => s.paceSec);
    const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
    const sd = Math.sqrt(paces.reduce((t, p) => t + (p - mean) ** 2, 0) / paces.length);
    pacing = {
      firstHalfPaceSec: Math.round(firstHalfPaceSec),
      secondHalfPaceSec: Math.round(secondHalfPaceSec),
      changePct: Math.round(((secondHalfPaceSec - firstHalfPaceSec) / firstHalfPaceSec) * 1000) / 10,
      variabilityPct: Math.round((sd / mean) * 1000) / 10,
      fastest: full.reduce((b, s) => (s.paceSec < b.paceSec ? s : b)).index,
      slowest: full.reduce((b, s) => (s.paceSec > b.paceSec ? s : b)).index,
    };
  }

  const weekStart = shiftDate(current.date, -6);
  const prevWeekStart = shiftDate(current.date, -13);
  const thisWeekSame = earlier.filter(h => h.date >= weekStart && h.date <= current.date);
  const prevWeekSame = earlier.filter(h => h.date >= prevWeekStart && h.date < weekStart);
  const weekKm = current.km + thisWeekSame.reduce((t, h) => t + (h.distanceKm || 0), 0);
  const prevKm = prevWeekSame.reduce((t, h) => t + (h.distanceKm || 0), 0);
  const weekAll = [activity, ...earlierAll.filter(h => h.date >= weekStart && h.date <= current.date)];
  const weekly = {
    km: Math.round(weekKm * 10) / 10,
    prevKm: Math.round(prevKm * 10) / 10,
    changePct: prevKm > 0 ? Math.round(((weekKm - prevKm) / prevKm) * 100) : undefined,
    sessions: thisWeekSame.length + 1,
    moderateMin: Math.round(weekAll.reduce((t, h) => t + moderateMinutes(h), 0)),
  };

  const targets: [string, number][] = type === 'run'
    ? [['5K', 5], ['10K', 10], ['Half marathon', 21.0975], ['Marathon', 42.195]]
    : type === 'walk' ? [['5K', 5], ['10K', 10], ['Half marathon', 21.0975]]
    : [['20 km', 20], ['40 km', 40], ['100 km', 100]];
  const minKm = type === 'cycle' ? 5 : type === 'run' ? 3 : 2;
  const predictions = valid && current.km >= minKm
    ? targets.map(([label, km]) => ({ label, km, sec: Math.round(riegel(current.sec, current.km, km, type === 'cycle' ? 1.05 : 1.06)) }))
    : [];

  const analysis: CardioAnalysis = { type, current, previous, recent, records, splitKm, splits, pacing, weekly, predictions, insights: [] };
  analysis.insights = cardioInsights(analysis, earlier);
  return analysis;
}

function cardioInsights(a: CardioAnalysis, earlier: CardioActivity[]): Insight[] {
  const out: Insight[] = [];
  const { type, current: c, previous: p } = a;
  const noun = LABEL[type];
  const isRide = type === 'cycle';

  if (p && p.km > 0 && c.km > 0) {
    if (isRide) {
      const diff = Math.round((c.kmh - p.kmh) * 10) / 10;
      const rel = p.kmh > 0 ? diff / p.kmh : 0;
      out.push({
        tone: rel > 0.01 ? 'good' : rel < -0.05 ? 'warn' : 'info',
        title: rel > 0.01 ? `${diff} km/h faster than last ride` : rel < -0.01 ? `${Math.abs(diff)} km/h slower than last ride` : 'Same speed as last ride',
        text: `${c.kmh} km/h over ${c.km} km vs ${p.kmh} km/h over ${p.km} km.${c.climbPerKm - p.climbPerKm >= 5 ? ' This ride was hillier, which lowers average speed.' : ''}${c.km > p.km * 1.3 ? ' It was also much longer, so a lower speed is expected.' : ''}`,
      });
    } else {
      const diff = c.paceSec - p.paceSec;
      const rel = p.paceSec > 0 ? diff / p.paceSec : 0;
      out.push({
        tone: rel < -0.01 ? 'good' : rel > 0.05 ? 'warn' : 'info',
        title: rel < -0.01 ? `${Math.abs(diff)} s/km faster than last ${noun}` : rel > 0.01 ? `${diff} s/km slower than last ${noun}` : `Same pace as last ${noun}`,
        text: `${formatPaceSec(c.paceSec)} /km over ${c.km} km vs ${formatPaceSec(p.paceSec)} /km over ${p.km} km.${c.km > p.km * 1.3 ? ' This one was much longer, so a slower pace is normal.' : ''}${c.climbPerKm - p.climbPerKm >= 8 ? ' It was also hillier.' : ''}`,
      });
    }
  }

  const recs = [
    a.records.longest && `longest ${noun} (${c.km} km)`,
    a.records.fastest && `fastest ${noun} (${isRide ? `${c.kmh} km/h` : `${formatPaceSec(c.paceSec)} /km`})`,
    a.records.mostClimb && `most climbing (${c.elevGain} m)`,
  ].filter(Boolean) as string[];
  if (recs.length) out.push({ tone: 'good', title: 'Personal record', text: `Your ${recs.join(' and ')} so far.` });

  if (a.pacing) {
    const { changePct, variabilityPct, firstHalfPaceSec, secondHalfPaceSec } = a.pacing;
    const secDiff = Math.abs(secondHalfPaceSec - firstHalfPaceSec);
    if (changePct <= -2) {
      out.push({ tone: 'good', title: 'Negative split', text: isRide ? 'You rode the second half faster than the first — well-judged effort.' : `Second half ${secDiff} s/km faster than the first. Finishing stronger is how most race records are set.` });
    } else if (changePct >= 5) {
      out.push({ tone: 'warn', title: isRide ? 'Speed faded' : 'Pace faded', text: isRide
        ? `Second half ${Math.round(changePct)}% slower (terrain can play a part). On rides over 90 min, eat and drink every 30–45 min and start a little easier.`
        : `Second half ${secDiff} s/km slower. On race day, start 5–10 s/km slower than goal pace and only push after halfway.` });
    }
    if (variabilityPct > (isRide ? 12 : 8)) {
      out.push({ tone: 'info', title: 'Uneven splits', text: `${isRide ? 'Speed' : 'Pace'} varied by about ±${variabilityPct}% between splits. Steady-effort (tempo) sessions train the even pacing that races reward.` });
    } else if (a.splits.length >= 3 && Math.abs(changePct) < 5) {
      out.push({ tone: 'good', title: 'Even pacing', text: `Splits stayed within about ±${variabilityPct}% — consistent effort all the way.` });
    }
  }

  if (type === 'run') {
    if (c.cadence) {
      out.push(c.cadence < 155
        ? { tone: 'info', title: `Cadence ${c.cadence} steps/min`, text: 'Efficient runners usually sit around 165–185 steps/min. Slightly shorter, quicker steps reduce overstriding and impact on knees and shins.' }
        : { tone: 'good', title: `Cadence ${c.cadence} steps/min`, text: `Good turnover${c.strideM ? ` with a ${c.strideM} m stride` : ''}.` });
    }
    const weekRuns = earlier.filter(h => h.date >= shiftDate(c.date, -6));
    const monthPaces = earlier.filter(h => h.date >= shiftDate(c.date, -28) && plausible(h) && h.distanceKm >= 1).map(h => snapshot(h).paceSec);
    if (weekRuns.length >= 2 && monthPaces.length >= 3) {
      const bestPace = Math.min(...monthPaces, c.paceSec);
      const hard = [...weekRuns.map(h => snapshot(h).paceSec), c.paceSec].filter(pace => pace <= bestPace * 1.05).length;
      if (hard > (weekRuns.length + 1) / 2) out.push({ tone: 'warn', title: 'Most runs are hard', text: `${hard} of your last ${weekRuns.length + 1} runs were near your fastest pace. Keep about 80% of runs easy and conversational; save hard efforts for 1–2 sessions a week.` });
    }
    if (a.weekly.sessions >= 2 && c.km / a.weekly.km > 0.5) {
      out.push({ tone: 'info', title: 'Big share of the week', text: `This run was ${Math.round((c.km / a.weekly.km) * 100)}% of your weekly distance. Long runs are best kept to about 30–40% of weekly volume.` });
    }
    if (a.predictions.length) {
      const longest = Math.max(c.km, ...earlier.filter(h => h.date >= shiftDate(c.date, -28)).map(h => h.distanceKm || 0));
      out.push({ tone: 'info', title: 'Race preparation', text: longest < 16
        ? 'For a half marathon, build your long run gradually towards 16–18 km, adding about 1–2 km per week.'
        : longest < 30
          ? 'Good long-run base. For a marathon, extend the long run towards 30–32 km, peaking about 3 weeks before race day.'
          : 'Marathon-ready long runs. Keep one long run, one tempo and the rest easy, and taper the last 2–3 weeks.' });
    }
  }

  if (type === 'walk') {
    const brisk = c.kmh >= 5 || (c.cadence || 0) >= 100;
    out.push(brisk
      ? { tone: 'good', title: 'Brisk pace', text: `${c.kmh} km/h${c.cadence ? ` at ${c.cadence} steps/min` : ''} counts as moderate-intensity exercise for heart health.` }
      : { tone: 'info', title: 'Easy pace', text: 'Walking at 5+ km/h (about 100+ steps/min) turns a stroll into moderate-intensity exercise.' });
    if (c.steps) out.push({ tone: 'info', title: `${c.steps.toLocaleString()} steps`, text: c.strideM ? `Average stride ${c.strideM} m.` : 'Steps estimated from distance.' });
    if (c.climbPerKm >= 15) out.push({ tone: 'info', title: 'Hilly walk', text: `${c.elevGain} m of climbing raises the effort, so pace isn't comparable with flat walks.` });
  }

  if (isRide && c.climbPerKm >= 10) {
    out.push({ tone: 'info', title: 'Hilly ride', text: `${c.elevGain} m climbed (${c.climbPerKm} m/km). Speed on hilly routes isn't directly comparable with flat rides.` });
  }

  const limit = type === 'cycle' ? 50 : 30;
  if (a.weekly.changePct !== undefined && a.weekly.prevKm >= 5 && a.weekly.changePct > limit) {
    out.push({ tone: 'warn', title: 'Big jump in weekly distance', text: `${a.weekly.km} km this week vs ${a.weekly.prevKm} km the week before (+${a.weekly.changePct}%). Raising weekly distance by roughly 10% at a time lowers injury risk.` });
  }

  out.push(a.weekly.moderateMin >= 150
    ? { tone: 'good', title: 'Weekly heart-health goal met', text: `${a.weekly.moderateMin} moderate-equivalent minutes in the last 7 days (WHO: 150 moderate or 75 vigorous minutes a week).` }
    : { tone: 'info', title: `${a.weekly.moderateMin} of 150 heart-health minutes`, text: 'The WHO recommends 150 minutes of moderate (or 75 of vigorous) activity a week. Runs and fast rides count double.' });
  return out;
}
