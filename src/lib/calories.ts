import type { CardioActivity, CardioActivityType, Exercise, ExerciseLog, RoutePoint, SetData, Workout } from '@/types';
import { smoothAltitudes } from '@/utils/elevation';

/**
 * Energy model for "active calories": energy burned above resting metabolism,
 * the same convention as Apple Watch / Garmin "active" calories. Resting burn is
 * already in the user's daily energy budget, so it is not counted again here.
 *
 * Bump CALORIE_MODEL_VERSION whenever a formula changes so stored history is
 * recalculated on the next stats reconcile.
 */
export const CALORIE_MODEL_VERSION = 2;

// 1 MET = 3.5 mL O2/kg/min ≈ 0.0175 kcal/kg/min (5 kcal per litre of O2).
const KCAL_PER_MET_KG_MIN = 0.0175;
const G = 9.81;
const J_PER_KCAL = 4184;
const DEFAULT_WEIGHT_KG = 70;

const weightOf = (kg?: number | null) => (kg && kg > 20 && kg < 350 ? kg : DEFAULT_WEIGHT_KG);
const netMetKcalPerMin = (netMet: number, kg: number) => Math.max(0, netMet) * KCAL_PER_MET_KG_MIN * kg;

// ─── Strength ──────────────────────────────────────────────

/** Muscle efficiency for resistance exercise, including eccentric and stabilising cost. */
const LIFT_EFFICIENCY = 0.1;
/** Net MET of moving the limbs and bracing during a rep, on top of the mechanical work. */
const REP_BASE_NET_MET = 1.5;
/** Net MET between sets: standing, breathing hard, heart rate still elevated. */
const REST_NET_MET = 1.2;
/** Rest beyond this per set is idle time (phone, chat, forgot to stop) and isn't counted. */
const MAX_REST_MIN_PER_SET = 4;
const DEFAULT_REST_MIN_PER_SET = 1.5;
const DEFAULT_REPS = 8;
const DEFAULT_HOLD_SEC = 30;

type MoveKind = 'lift' | 'timed' | 'mobility';

interface MoveProfile {
  kind: MoveKind;
  /** Fraction of body mass moved each rep and how far its centre of mass travels (m). */
  body: number;
  bodyRom: number;
  /** Distance the external load travels each rep (m). */
  loadRom: number;
  /** Seconds per rep. */
  tempo: number;
  /** Net MET for timed work (holds, cardio, plyometrics). */
  met: number;
}

const lift = (body: number, bodyRom: number, loadRom = bodyRom, tempo = 3): MoveProfile =>
  ({ kind: 'lift', body, bodyRom, loadRom, tempo, met: 3 });
const timed = (met: number, tempo = 3): MoveProfile =>
  ({ kind: 'timed', body: 0, bodyRom: 0, loadRom: 0, tempo, met });
const MOBILITY: MoveProfile = { kind: 'mobility', body: 0, bodyRom: 0, loadRom: 0, tempo: 3, met: 1.3 };

// Ordered: the first match wins, so specific patterns come before generic ones.
// Net METs are Compendium of Physical Activities values minus 1 (resting).
const MOVE_PROFILES: [RegExp, MoveProfile][] = [
  // Skill statics and holds
  [/planche(?!.*push)|front lever(?!.*row)|back lever|maltese|iron cross|manna|human flag|\b(tuck|straddle|vertical) flag/, timed(4.5)],
  [/handstand(?!.*(push|walk))|headstand|crow|frog stand|elbow lever/, timed(3.5)],
  [/wall sit|squat hold/, timed(3.5)],
  [/\bl[- ]?sit|\bv[- ]?sit|support hold|ring support|top hold/, timed(4)],
  [/farmer|suitcase carry|carry\b|yoke/, timed(6)],
  [/plank|hollow|arch hold|superman hold|dead ?hang|active hang|flexed hang|scap(ular)? hang|isometric|glute bridge hold/, timed(2.5)],
  // Cardio and conditioning
  [/jump(ing)? rope|skipping|double under/, timed(10.8, 0.5)],
  [/sprint/, timed(12, 3)],
  [/burpee/, timed(9, 3.5)],
  [/battle rope|assault bike|air ?bike|echo bike/, timed(9)],
  [/\brun|\bjog|treadmill/, timed(8)],
  [/rowing|rower|row (machine|erg)|ergometer|ski ?erg/, timed(6)],
  [/stair ?(climb|master|mill)|stepmill/, timed(8)],
  [/\bbike|cycling|\bspin/, timed(6)],
  [/elliptical|cross ?trainer/, timed(4)],
  [/jumping jack|star jump|seal jack/, timed(7, 1)],
  [/mountain climber|high knee|butt kick/, timed(7, 0.7)],
  [/box jump|broad jump|tuck jump|jump squat|squat jump|jump lunge|lunge jump|split jump|skater|bound|plyo|pogo/, timed(8, 2)],
  // Mobility, warm-up and cool-down
  [/stretch|mobility|circle|cat[- ]?cow|dislocat|rotation|foam|breath|warm[- ]?up|cool[- ]?down|yoga|cobra|child'?s pose|greatest|thoracic|wrist (rock|prep)|ankle|hip opener|scap(ular)? (circle|rotation)/, MOBILITY],
  // Olympic lifts and full-body power
  [/snatch/, lift(0.6, 0.5, 1.6, 2)],
  [/clean|jerk/, lift(0.6, 0.45, 1.1, 2)],
  [/thruster|wall ball/, lift(0.8, 0.45, 1.3, 2)],
  [/kettlebell swing|kb swing|\bswing/, lift(0.35, 0.3, 0.7, 1.5)],
  // Bodyweight pulling
  [/muscle[- ]?up/, lift(0.95, 1.0)],
  [/pull[- ]?up|chin[- ]?up|lever row/, lift(0.95, 0.55)],
  [/inverted row|australian|body ?weight row|ring row|tuck row/, lift(0.6, 0.4)],
  [/skin the cat/, lift(0.7, 0.8)],
  // Bodyweight pushing
  [/handstand push|hspu/, lift(0.95, 0.35)],
  [/pike push/, lift(0.75, 0.3)],
  [/pseudo planche|planche push/, lift(0.75, 0.35)],
  [/dip/, lift(0.9, 0.45)],
  [/incline push|knee push|wall push/, lift(0.5, 0.35)],
  [/decline push|clap push|plyo push/, lift(0.75, 0.4)],
  [/push[- ]?up/, lift(0.65, 0.35)],
  // Legs
  [/pistol|shrimp|single[- ]?leg squat/, lift(0.9, 0.5)],
  [/nordic/, lift(0.6, 0.5, 0.5, 4)],
  [/step[- ]?up/, lift(0.95, 0.4)],
  [/lunge|split squat/, lift(0.8, 0.45)],
  [/leg press|hack squat/, lift(0.1, 0.3, 0.4)],
  [/squat/, lift(0.8, 0.4, 0.5)],
  [/romanian|rdl|stiff[- ]?leg|good morning/, lift(0.45, 0.3, 0.5)],
  [/deadlift/, lift(0.5, 0.35, 0.55)],
  [/hip thrust|glute bridge|bridge/, lift(0.4, 0.25, 0.3)],
  [/calf raise/, lift(0.95, 0.08)],
  [/leg (curl|extension)/, lift(0.08, 0.3)],
  // Core
  [/toes[- ]?to[- ]?bar|knees[- ]?to[- ]?elbow/, lift(0.35, 0.9)],
  [/hanging (leg|knee)|leg raise|knee raise/, lift(0.35, 0.6)],
  [/dragon flag/, lift(0.6, 0.6)],
  [/windshield/, lift(0.35, 0.5)],
  [/rollout|ab wheel/, lift(0.5, 0.3)],
  [/v[- ]?up|jackknife/, lift(0.5, 0.4)],
  [/sit[- ]?up/, lift(0.45, 0.35)],
  [/crunch|russian twist|dead bug|bird dog/, lift(0.3, 0.15)],
  [/back extension|hyperextension|superman/, lift(0.45, 0.3)],
  // Upper-body free weights and machines (external load only)
  [/bench|chest press|floor press/, lift(0.05, 0.4)],
  [/overhead press|shoulder press|military|push press|arnold/, lift(0.05, 0.5)],
  [/\brow|pulldown|pull[- ]?down|face pull/, lift(0.05, 0.3, 0.45)],
  [/fly|flye|pec deck/, lift(0.05, 0.4)],
  [/lateral raise|front raise|rear delt|raise/, lift(0.04, 0.3, 0.5)],
  [/curl/, lift(0.03, 0.3, 0.35)],
  [/extension|skull ?crusher|pushdown|kickback/, lift(0.03, 0.3, 0.35)],
  [/shrug/, lift(0.05, 0.08)],
];

const UNKNOWN_BODYWEIGHT = lift(0.5, 0.35);
const UNKNOWN_LOADED = lift(0.05, 0.3, 0.45);
const UNKNOWN_HOLD = timed(3);

function profileFor(name: string, loaded: boolean): MoveProfile {
  const n = name.toLowerCase();
  for (const [pattern, profile] of MOVE_PROFILES) if (pattern.test(n)) return profile;
  return loaded ? UNKNOWN_LOADED : UNKNOWN_BODYWEIGHT;
}

/** A set counts if it was ticked off, or if it has data and wasn't explicitly left unticked. */
function isLoggedSet(set: SetData): boolean {
  if (set.completed === false) return false;
  return set.completed === true || Number(set.reps) > 0 || Number(set.weight) > 0 || Number(set.seconds) > 0;
}

interface SetEnergy {
  kcal: number;
  workSec: number;
}

function setEnergy(log: ExerciseLog, set: SetData, kg: number): SetEnergy {
  const weight = Math.max(0, Number(set.weight) || 0);
  const reps = Math.max(0, Number(set.reps) || 0);
  const seconds = Math.max(0, Number(set.seconds) || 0);
  const profile = profileFor(log.name, weight > 0);
  const isTimed = log.mode === 'hold' || (seconds > 0 && reps === 0) || profile.kind !== 'lift';

  if (isTimed) {
    const t = profile.kind === 'lift' ? UNKNOWN_HOLD : profile;
    const workSec = seconds > 0 ? seconds
      : reps > 0 ? reps * t.tempo
      : log.mode === 'hold' ? DEFAULT_HOLD_SEC
      : DEFAULT_REPS * t.tempo;
    return { kcal: netMetKcalPerMin(t.met, kg) * (workSec / 60), workSec };
  }

  const count = reps || DEFAULT_REPS;
  const workSec = seconds > 0 ? seconds : count * profile.tempo;
  const joulesPerRep = (profile.body * kg * profile.bodyRom + weight * profile.loadRom) * G;
  const mechanicalKcal = (count * joulesPerRep) / LIFT_EFFICIENCY / J_PER_KCAL;
  const movementKcal = netMetKcalPerMin(REP_BASE_NET_MET, kg) * (workSec / 60);
  return { kcal: mechanicalKcal + movementKcal, workSec };
}

export interface WorkoutEnergy {
  kcal: number;
  workMin: number;
  restMin: number;
  sets: number;
}

/**
 * Active calories for a strength session: mechanical work of every rep (body mass
 * moved + external load, at ~10% muscle efficiency), metabolic cost of holds and
 * conditioning from Compendium METs, plus the elevated cost of rest between sets.
 */
export function estimateWorkoutEnergy(logs: ExerciseLog[], bodyWeightKg?: number | null, durationMin?: number): WorkoutEnergy {
  const kg = weightOf(bodyWeightKg);
  let kcal = 0;
  let workSec = 0;
  let sets = 0;
  for (const log of logs || []) {
    for (const set of log.sets || []) {
      if (!isLoggedSet(set)) continue;
      const e = setEnergy(log, set, kg);
      kcal += e.kcal;
      workSec += e.workSec;
      sets++;
    }
  }
  if (sets === 0) return { kcal: 0, workMin: 0, restMin: 0, sets: 0 };

  const workMin = workSec / 60;
  const restMin = durationMin && durationMin > 0
    ? Math.min(Math.max(0, durationMin - workMin), sets * MAX_REST_MIN_PER_SET + 10)
    : sets * DEFAULT_REST_MIN_PER_SET;
  kcal += netMetKcalPerMin(REST_NET_MET, kg) * restMin;
  return { kcal: Math.round(kcal), workMin, restMin, sets };
}

export function calculateWorkoutCalories(logs: ExerciseLog[], bodyWeightKg?: number | null, durationMin?: number): number {
  return estimateWorkoutEnergy(logs, bodyWeightKg, durationMin).kcal;
}

/** Training volume is external resistance only. Bodyweight is used for
 * calorie estimation, but is not added to kg·reps because that inflates the
 * metric and makes pull-ups look like thousands of kilograms lifted. */
export function calculateExerciseVolume(_exercise: Exercise | ExerciseLog, log: ExerciseLog, _bodyWeightKg = 70): number {
  return log.sets
    .filter(set => isLoggedSet(set) && log.mode === 'reps')
    .reduce((total, set) => total + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
}

export function calculateWorkoutVolume(exercises: Exercise[], logs: ExerciseLog[], bodyWeightKg = 70): number {
  const byName = new Map(exercises.map(exercise => [exercise.name.toLowerCase(), exercise]));
  return Math.round(logs.reduce((total, log) => total + calculateExerciseVolume(byName.get(log.name.toLowerCase()) || log, log, bodyWeightKg), 0));
}

// ─── Cardio ────────────────────────────────────────────────

// Gross METs from the 2011 Compendium of Physical Activities (Ainsworth et al.),
// keyed by speed in km/h and linearly interpolated.
const WALK_MET: [number, number][] = [
  [2.0, 2.0], [2.7, 2.3], [3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0], [8.0, 8.3],
];
const RUN_MET: [number, number][] = [
  [6.4, 6.0], [8.0, 8.3], [8.4, 9.0], [9.7, 9.8], [10.8, 10.5], [11.3, 11.0], [12.1, 11.5],
  [12.9, 11.8], [13.8, 12.3], [14.5, 12.8], [16.1, 14.5], [17.7, 16.0], [19.3, 19.0], [20.9, 19.8], [22.5, 23.0],
];

function interpolate(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}

// Minetti et al. 2002 (J Appl Physiol): net metabolic cost (J/kg/m) vs gradient.
const minettiWalk = (i: number) => 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5;
const minettiRun = (i: number) => 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
const MAX_FOOT_GRADE = 0.3;

/** Walking/running uphill costs more and gentle downhill costs less than flat ground. */
function gradeFactor(gait: 'walk' | 'run', grade: number): number {
  const i = Math.max(-MAX_FOOT_GRADE, Math.min(MAX_FOOT_GRADE, grade));
  return gait === 'walk' ? minettiWalk(i) / minettiWalk(0) : minettiRun(i) / minettiRun(0);
}

// Cycling power model: rolling resistance + gravity + aerodynamic drag.
const BIKE_KG = 12;
const CRR = 0.007;
const CDA = 0.5;
const AIR_DENSITY = 1.2;
const DRIVETRAIN_EFFICIENCY = 0.975;
/** Net (delta) efficiency of recreational cyclists: metabolic energy above rest per unit of work. */
const CYCLING_EFFICIENCY = 0.21;
/** Balancing and braking while coasting still costs a little. */
const COASTING_NET_MET = 0.5;
const MAX_BIKE_GRADE = 0.25;

function cyclingKcalPerMin(speedKmh: number, grade: number, kg: number): number {
  const v = speedKmh / 3.6;
  const theta = Math.atan(Math.max(-MAX_BIKE_GRADE, Math.min(MAX_BIKE_GRADE, grade)));
  const mass = kg + BIKE_KG;
  const force = CRR * mass * G * Math.cos(theta) + mass * G * Math.sin(theta) + 0.5 * AIR_DENSITY * CDA * v * v;
  const watts = Math.max(0, (force * v) / DRIVETRAIN_EFFICIENCY);
  const kcal = (watts / CYCLING_EFFICIENCY) * 60 / J_PER_KCAL;
  return Math.max(kcal, netMetKcalPerMin(COASTING_NET_MET, kg));
}

function kcalPerMin(type: CardioActivityType, speedKmh: number, grade: number, kg: number): number {
  if (type === 'cycle') return cyclingKcalPerMin(speedKmh, grade, kg);
  // A "walk" faster than ~8 km/h is effectively a jog.
  const gait = type === 'run' || speedKmh > 8 ? 'run' : 'walk';
  const met = gait === 'run' ? interpolate(RUN_MET, speedKmh) : interpolate(WALK_MET, speedKmh);
  return netMetKcalPerMin(met - 1, kg) * gradeFactor(gait, grade);
}

/** Climbing cost when only the total gain is known (ACSM vertical terms / potential energy). */
function climbKcal(type: CardioActivityType, gainM: number, kg: number): number {
  if (!(gainM > 0)) return 0;
  if (type === 'cycle') return ((kg + BIKE_KG) * G * gainM) / CYCLING_EFFICIENCY / J_PER_KCAL;
  return (type === 'run' ? 0.9 : 1.8) * gainM * kg * 0.005;
}

const SEGMENT_MIN_M = 100;
const PAUSE_GAP_SEC = 30;
const MIN_MOVING_KMH = 1;
const MAX_KMH: Record<CardioActivityType, number> = { walk: 15, run: 30, cycle: 90 };

function haversineM(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface RouteEnergy {
  kcal: number;
  distM: number;
  sec: number;
}

/**
 * Sums energy over ~100 m route segments so pace changes and hills are costed where
 * they happen. Grades come from smoothed altitude, scaled so total climb matches the
 * authoritative (DEM-corrected) elevation gain.
 */
function routeEnergy(type: CardioActivityType, route: RoutePoint[], kg: number, elevationGainM?: number): RouteEnergy | null {
  const pts = route.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.ts));
  if (pts.length < 3) return null;

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineM(pts[i - 1], pts[i]));

  const withAlt = pts.map((p, i) => ({ alt: p.alt as number, distM: cum[i], i })).filter(s => Number.isFinite(s.alt));
  let alt: (number | null)[] = pts.map(() => null);
  if (withAlt.length >= pts.length * 0.5 && withAlt.length >= 3) {
    const smooth = smoothAltitudes(withAlt, 150);
    withAlt.forEach((s, k) => { alt[s.i] = smooth[k]; });
    // Fill gaps from the previous known value.
    let last: number | null = null;
    alt = alt.map(a => (a == null ? last : (last = a)));
    const firstKnown = alt.find(a => a != null) ?? null;
    alt = alt.map(a => (a == null ? firstKnown : a));
  }

  const segments: { d: number; dt: number; rise: number | null }[] = [];
  let startIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    const gap = (pts[i].ts - pts[i - 1].ts) / 1000;
    // Simplified routes have long gaps on straight roads; only a gap without movement is a pause.
    const stationary = cum[i] - cum[i - 1] < 30;
    if (gap < 0 || (gap >= PAUSE_GAP_SEC && stationary)) {
      // Close the segment before a pause; the paused stretch itself isn't exercise.
      if (i - 1 > startIdx) pushSegment(startIdx, i - 1);
      startIdx = i;
      continue;
    }
    if (cum[i] - cum[startIdx] >= SEGMENT_MIN_M) {
      pushSegment(startIdx, i);
      startIdx = i;
    }
  }
  if (pts.length - 1 > startIdx) pushSegment(startIdx, pts.length - 1);

  function pushSegment(a: number, b: number) {
    const d = cum[b] - cum[a];
    const dt = (pts[b].ts - pts[a].ts) / 1000;
    if (d <= 0 || dt <= 0) return;
    const kmh = (d / dt) * 3.6;
    if (kmh < MIN_MOVING_KMH || kmh > MAX_KMH[type]) return;
    const rise = alt[a] != null && alt[b] != null ? (alt[b] as number) - (alt[a] as number) : null;
    segments.push({ d, dt, rise });
  }

  if (segments.length === 0) return null;
  const hasAlt = segments.some(s => s.rise != null);
  const routeClimb = segments.reduce((sum, s) => sum + Math.max(0, s.rise ?? 0), 0);
  const gradeScale = !hasAlt ? 0
    : elevationGainM == null || routeClimb === 0 ? 1
    : Math.min(3, elevationGainM / routeClimb);

  let kcal = 0;
  let distM = 0;
  let sec = 0;
  for (const s of segments) {
    const grade = ((s.rise ?? 0) * gradeScale) / s.d;
    kcal += kcalPerMin(type, (s.d / s.dt) * 3.6, grade, kg) * (s.dt / 60);
    distM += s.d;
    sec += s.dt;
  }
  if (!hasAlt) kcal += climbKcal(type, elevationGainM || 0, kg);
  return { kcal, distM, sec };
}

export interface CardioCalorieInput {
  type: CardioActivityType;
  distanceKm: number;
  /** Moving time only - pauses and stops are excluded. */
  movingMin: number;
  bodyWeightKg?: number | null;
  elevationGainM?: number;
  route?: RoutePoint[];
}

/**
 * Active calories for a walk, run or ride. With a GPS route the estimate is summed
 * segment by segment (pace + gradient); otherwise it uses average moving speed
 * plus the cost of the total climb.
 */
export function calculateCardioCalories({ type, distanceKm, movingMin, bodyWeightKg, elevationGainM = 0, route }: CardioCalorieInput): number {
  if (!(distanceKm > 0) || !(movingMin > 0)) return 0;
  const kg = weightOf(bodyWeightKg);
  const avgSpeed = (distanceKm / movingMin) * 60;
  // Below 0.5 km/h the "distance" is GPS drift, not exercise.
  if (!Number.isFinite(avgSpeed) || avgSpeed < 0.5) return 0;
  const gain = Number.isFinite(elevationGainM) && elevationGainM > 0 ? elevationGainM : 0;

  if (route && route.length >= 3) {
    const r = routeEnergy(type, route, kg, gain);
    const targetM = distanceKm * 1000;
    // Trust the route only when it covers most of the recorded distance and time.
    if (r && r.distM >= targetM * 0.6 && r.sec >= movingMin * 60 * 0.6) {
      const scale = Math.max(0.7, Math.min(1.4, targetM / r.distM));
      return Math.max(0, Math.round(r.kcal * scale));
    }
  }

  return Math.max(0, Math.round(kcalPerMin(type, avgSpeed, 0, kg) * movingMin + climbKcal(type, gain, kg)));
}

// ─── Stored history ────────────────────────────────────────

export function workoutCalories(workout: Pick<Workout, 'exercises' | 'durationMin' | 'bodyweight' | 'calories'>, fallbackWeightKg?: number | null): number {
  const logs = workout.exercises || [];
  if (!logs.some(log => (log.sets || []).some(isLoggedSet))) return workout.calories || 0;
  return calculateWorkoutCalories(logs, workout.bodyweight || fallbackWeightKg, workout.durationMin);
}

export function cardioCalories(activity: Pick<CardioActivity, 'type' | 'distanceKm' | 'movingDurationSec' | 'durationSec' | 'elevationGainM' | 'route' | 'bodyweight'>, fallbackWeightKg?: number | null): number {
  return calculateCardioCalories({
    type: activity.type,
    distanceKm: activity.distanceKm || 0,
    movingMin: (activity.movingDurationSec || activity.durationSec || 0) / 60,
    bodyWeightKg: activity.bodyweight || fallbackWeightKg,
    elevationGainM: activity.elevationGainM || 0,
    route: activity.route,
  });
}
