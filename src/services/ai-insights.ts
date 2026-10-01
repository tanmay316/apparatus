import { doc, getDoc } from 'firebase/firestore';
import { db, getSignedInUser } from '@/lib/firebase';
import { useSubscriptionStore } from '@/stores/subscription-store';
import { isProRequired } from '@/services/billing';
import { shiftDate } from '@/lib/analysis-common';
import type { Facts } from '@/lib/ai-facts';
import type { CardioActivity, Workout } from '@/types';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

export type SummaryKind = 'cardio' | 'workout' | 'weekly';

export interface AISummary {
  headline: string;
  points: string[];
  action: string;
  source: 'ai' | 'fallback';
  createdAt?: number | null;
  cached?: boolean;
}

export class ProRequiredError extends Error {}

/** Stable per session (start time), so the summary made right after saving is reused later. */
export function sessionKey(prefix: 'c' | 'w', item: { id?: string; startedAt?: any; date?: string }): string {
  const s = item.startedAt?.seconds ?? (typeof item.startedAt?.toMillis === 'function' ? Math.floor(item.startedAt.toMillis() / 1000) : undefined);
  const raw = s ? `${prefix}${Math.floor(s)}` : `${prefix}${item.id || item.date || 'x'}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

/** Monday of the last completed week (the weekly report covers Mon–Sun). */
export function lastWeekRange(today: string): { start: string; end: string; key: string } {
  const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const start = shiftDate(today, -dow - 7);
  return { start, end: shiftDate(start, 6), key: `wk${start.replace(/-/g, '')}` };
}

export async function getCachedSummary(uid: string, kind: SummaryKind, key: string): Promise<AISummary | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'ai_insights', `${kind}_${key}`));
    return snap.exists() ? ({ ...(snap.data() as AISummary), cached: true }) : null;
  } catch {
    return null;
  }
}

export async function requestSummary(kind: SummaryKind, key: string, facts: Facts): Promise<AISummary> {
  const user = await getSignedInUser();
  if (!user) throw new Error('Not signed in');
  const res = await fetch(`${API_BASE}/insights/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ kind, key, facts: JSON.parse(JSON.stringify(facts)) }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 402 || isProRequired(body.detail)) throw new ProRequiredError(body.detail?.message || 'Part of Apparatus Pro');
  // 404/405 = the server hasn't been updated with the AI coach endpoint yet.
  if (res.status === 404 || res.status === 405) throw new Error('The AI coach isn’t available on the server yet.');
  if (res.status === 429) throw new Error(typeof body.detail === 'string' ? body.detail : 'Too many requests. Try again in a few minutes.');
  if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The AI coach is busy. Try again in a moment.');
  return body as AISummary;
}

/** Pro (or billing not live yet): AI work may run automatically in the background. */
export function proActive(): boolean {
  const s = useSubscriptionStore.getState();
  return !s.enabled || s.entitlement.pro || s.comped;
}

/** Opens the AI coach chat with a question about something on screen. */
export function askCoach(prompt: string) {
  window.dispatchEvent(new CustomEvent('open-ai-bot', { detail: { prompt: prompt.slice(0, 3500) } }));
}

/** Gathers training + nutrition for the report week; returns null when the week was empty. */
export async function buildWeeklyFacts(uid: string, range: { start: string; end: string }, loaded?: { workouts?: Workout[]; cardio?: CardioActivity[] }): Promise<Facts | null> {
  const [{ getUserWorkouts }, { getUserCardioActivities }, { weeklyFacts }] = await Promise.all([
    import('@/services/workouts'), import('@/services/cardio'), import('@/lib/ai-facts'),
  ]);
  const [workouts, cardio] = await Promise.all([
    loaded?.workouts ?? getUserWorkouts(uid, 400),
    loaded?.cardio ?? getUserCardioActivities(uid, 400),
  ]);
  let nutrition = null;
  let goals: { calories: number; protein: number } | undefined;
  try {
    const [{ getNutritionSetup }, { getNutritionHistory }, { getMeasurements }, { analyzeNutritionTrends }, { mealDate }] = await Promise.all([
      import('@/services/nutrition-setup'), import('@/services/nutrition-api'), import('@/services/measurements'),
      import('@/lib/nutrition-trends'), import('@/components/nutrition/use-nutrition-data'),
    ]);
    const setup = await getNutritionSetup(uid);
    if (setup) {
      const [hist, measurements] = await Promise.all([getNutritionHistory(60).catch(() => null), getMeasurements(uid).catch(() => [])]);
      const byDay = new Map<string, any[]>();
      for (const m of (hist?.history || []) as any[]) {
        const d = mealDate(m);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDay.set(k, [...(byDay.get(k) || []), m]);
      }
      const weights = measurements.filter(m => typeof m.weight === 'number' && m.weight > 0).map(m => ({ date: m.date, weight: m.weight! }));
      nutrition = analyzeNutritionTrends(byDay, setup.goals, setup.answers, weights, shiftDate(range.end, 1));
      goals = setup.goals;
    }
  } catch { /* nutrition is optional in the report */ }
  return weeklyFacts({ weekStart: range.start, weekEnd: range.end, cardio, workouts, nutrition, calorieGoal: goals?.calories, proteinGoal: goals?.protein });
}

/** Once a week (Pro): build last week's report in the background and notify. */
export async function autoWeeklyReport(uid: string, today: string): Promise<void> {
  if (!proActive()) return;
  const range = lastWeekRange(today);
  const marker = `apparatus.weekly-report:${uid}`;
  if (localStorage.getItem(marker) === range.key) return;
  if (await getCachedSummary(uid, 'weekly', range.key)) { localStorage.setItem(marker, range.key); return; }
  const facts = await buildWeeklyFacts(uid, range);
  localStorage.setItem(marker, range.key);
  if (!facts) return;
  const summary = await requestSummary('weekly', range.key, facts);
  if (summary.source !== 'ai') { localStorage.removeItem(marker); return; }
  const { createSelfNotification } = await import('@/services/social');
  await createSelfNotification(uid, `Your weekly AI coach report: ${summary.headline}`, '', { kind: 'ai_summary', session: 'weekly', link: '/progress' });
}

/** After a session is saved: make its AI summary (Pro only) and post a notification. */
export async function autoSessionSummary(kind: 'cardio' | 'workout', userId: string, sessionId: string): Promise<void> {
  if (!proActive()) return;
  let facts: Facts;
  let key: string;
  let label: string;
  if (kind === 'cardio') {
    const { getCardioWithHistory } = await import('@/services/cardio');
    const loaded = await getCardioWithHistory(userId, sessionId);
    if (!loaded || !loaded.activity.distanceKm) return;
    const { analyzeCardio } = await import('@/lib/cardio-analysis');
    const { sessionEffort } = await import('@/lib/cardio-trends');
    const { cardioFacts } = await import('@/lib/ai-facts');
    facts = cardioFacts(analyzeCardio(loaded.activity, loaded.history), sessionEffort(loaded.activity, loaded.history));
    key = sessionKey('c', loaded.activity);
    label = loaded.activity.type === 'cycle' ? 'ride' : loaded.activity.type;
  } else {
    const { getWorkoutWithHistory } = await import('@/services/workouts');
    const loaded = await getWorkoutWithHistory(userId, sessionId);
    if (!loaded) return;
    const { analyzeWorkout } = await import('@/lib/workout-analysis');
    const { workoutFacts } = await import('@/lib/ai-facts');
    const analysis = analyzeWorkout(loaded.workout, loaded.history);
    if (!analysis.totals.sets) return;
    facts = workoutFacts(analysis);
    key = sessionKey('w', loaded.workout);
    label = 'workout';
  }
  const summary = await requestSummary(kind, key, facts);
  if (summary.source !== 'ai') return;
  const { createSelfNotification } = await import('@/services/social');
  await createSelfNotification(userId, `AI coach on your ${label}: ${summary.headline}`, sessionId, { kind: 'ai_summary', session: kind, link: kind === 'cardio' ? '/cardio' : '/progress' });
}
