import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pedometerService } from '@/services/pedometer';
import { useCardioStore } from '@/stores/cardio-store';
import {
  activeSegments, estimateSteps, gapSteps, isPlausiblePedometerCount,
  type PauseSpan, type StepSource, type StrideProfile,
} from '@/lib/steps';
import type { CardioActivityType } from '@/types';
import type { StepCounterReading } from '@/utils/native-daily-steps';

// Android only delivers step events while the app is in the foreground; beyond this silence
// with distance still growing, the missing stretch is extrapolated from the measured stride.
const STALE_STREAM_MS = 30_000;

interface FinalizeInput {
  type: CardioActivityType | null;
  distanceKm: number;
  movingSec?: number;
  profile?: StrideProfile;
}

export interface StepResult {
  steps: number | undefined;
  source: StepSource;
}

interface PedometerState {
  isSupported: boolean | null;
  /** Session total shown to the user: counted steps minus steps taken during manual pauses. */
  sessionSteps: number;
  stepSource: StepSource;
  lastStepAt: number | null;
  isSessionActive: boolean;

  // Persisted so a WebView reload or process restart can resume the same session.
  sessionStartedAt: number | null;
  pauses: PauseSpan[];
  /** Steps carried over from before the current native stream started (restarts). */
  offsetSteps: number;
  /** Raw count reported by the current native stream. */
  liveSteps: number;
  /** Live-stream steps that fell inside finished pauses. */
  excludedSteps: number;
  /** liveSteps at the moment the running pause began. */
  pausedAtLive: number | null;
  /** Cardio distance when sessionSteps last increased (for gap extrapolation). */
  lastStepDistanceKm: number;

  // Android hardware step counter (steps since boot), read at start / pause / resume / finish.
  // It keeps counting while the app is in the background, so the delta is exact.
  counterStart: number | null;
  counterBootAt: number | null;
  counterExcluded: number;
  counterAtPause: number | null;

  startSession: () => Promise<boolean>;
  pause: () => void;
  resume: () => void;
  resumeIfNeeded: (opts: { sessionStartedAt: number; distanceKm: number; type: CardioActivityType | null; profile?: StrideProfile }) => Promise<void>;
  finalize: (input: FinalizeInput) => Promise<StepResult>;
  stopSession: () => Promise<void>;
  resetSession: () => void;
  setSupported: (supported: boolean) => void;
}

/** Not persisted: true only while this JS context has a native listener attached. */
let listening = false;

const EMPTY_SESSION = {
  sessionSteps: 0,
  stepSource: 'none' as StepSource,
  lastStepAt: null,
  isSessionActive: false,
  sessionStartedAt: null,
  pauses: [] as PauseSpan[],
  offsetSteps: 0,
  liveSteps: 0,
  excludedSteps: 0,
  pausedAtLive: null,
  lastStepDistanceKm: 0,
  counterStart: null,
  counterBootAt: null,
  counterExcluded: 0,
  counterAtPause: null,
};

/** Serialises counter reads so pause/resume/finish deltas are applied in order. */
let counterQueue: Promise<void> = Promise.resolve();

function withCounter(fn: (reading: StepCounterReading | null) => void): Promise<void> {
  counterQueue = counterQueue.then(async () => fn(await pedometerService.readCounter())).catch(() => {});
  return counterQueue;
}

const sameBoot = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) < 60_000;

/** Android: counted steps from the hardware counter, or null when the reading chain broke. */
function counterSteps(s: Pick<PedometerState, 'counterStart' | 'counterBootAt' | 'counterExcluded' | 'counterAtPause'>, reading: StepCounterReading | null): number | null {
  if (s.counterStart == null || !reading || !sameBoot(reading.bootAt, s.counterBootAt)) return null;
  const end = s.counterAtPause ?? reading.counter;
  if (end < s.counterStart) return null;
  return Math.max(0, Math.round(end - s.counterStart - s.counterExcluded));
}

function computeSessionSteps(s: Pick<PedometerState, 'offsetSteps' | 'liveSteps' | 'excludedSteps' | 'pausedAtLive'>) {
  const counted = s.pausedAtLive != null ? s.pausedAtLive : s.liveSteps;
  return Math.max(0, s.offsetSteps + counted - s.excludedSteps);
}

/** iOS: exact active-time steps straight from CoreMotion history. */
async function queryActiveSteps(startedAt: number, pauses: PauseSpan[], until = Date.now()): Promise<number | null> {
  const segments = activeSegments(startedAt, pauses, until);
  let total = 0;
  for (const [a, b] of segments) {
    const n = await pedometerService.getStepsBetween(a, b);
    if (n == null) return null;
    total += n;
  }
  return total;
}

export const usePedometerStore = create<PedometerState>()(
  persist(
    (set, get) => {
      const attach = async (): Promise<boolean> => {
        const started = await pedometerService.start((steps, isNative) => {
          const st = get();
          if (!st.isSessionActive || !Number.isFinite(steps)) return;
          // Streams only grow; ignore out-of-order or reset readings.
          const liveSteps = Math.max(st.liveSteps, steps);
          const next = { ...st, liveSteps };
          const sessionSteps = computeSessionSteps(next);
          const grew = sessionSteps > st.sessionSteps;
          set({
            liveSteps,
            sessionSteps,
            stepSource: isNative ? 'native' : 'motion_estimate',
            lastStepAt: grew ? Date.now() : st.lastStepAt,
            lastStepDistanceKm: grew ? useCardioStore.getState().distanceKm : st.lastStepDistanceKm,
          });
        });
        listening = started;
        return started;
      };

      return {
        isSupported: null,
        ...EMPTY_SESSION,

        setSupported: (supported) => set({ isSupported: supported }),

        startSession: async () => {
          set({ ...EMPTY_SESSION, isSessionActive: true, sessionStartedAt: Date.now(), lastStepAt: Date.now() });
          if (pedometerService.hasStepCounter) {
            withCounter(r => { if (r) set({ counterStart: r.counter, counterBootAt: r.bootAt }); });
          }
          const started = await attach();
          if (!started) {
            set({ isSessionActive: false, isSupported: false, stepSource: 'none' });
            return false;
          }
          set({ isSupported: true });
          return true;
        },

        pause: () => {
          const st = get();
          if (!st.isSessionActive || st.pausedAtLive != null) return;
          set({ pausedAtLive: st.liveSteps, pauses: [...st.pauses, { start: Date.now(), end: null }] });
          if (pedometerService.hasStepCounter) {
            withCounter(r => {
              if (get().counterStart == null) return;
              if (r && sameBoot(r.bootAt, get().counterBootAt)) set({ counterAtPause: r.counter });
              else set({ counterStart: null });
            });
          }
        },

        resume: () => {
          const st = get();
          if (!st.isSessionActive || st.pausedAtLive == null) return;
          const excludedSteps = st.excludedSteps + Math.max(0, st.liveSteps - st.pausedAtLive);
          const pauses = st.pauses.map((p, i) => (i === st.pauses.length - 1 && p.end == null ? { ...p, end: Date.now() } : p));
          set({ excludedSteps, pausedAtLive: null, pauses, sessionSteps: computeSessionSteps({ ...st, excludedSteps, pausedAtLive: null }) });
          if (pedometerService.hasStepCounter) {
            withCounter(r => {
              const s = get();
              if (s.counterStart == null) return;
              if (!r || s.counterAtPause == null || !sameBoot(r.bootAt, s.counterBootAt)) {
                set({ counterStart: null, counterAtPause: null });
                return;
              }
              set({ counterExcluded: s.counterExcluded + Math.max(0, r.counter - s.counterAtPause), counterAtPause: null });
            });
          }
        },

        resumeIfNeeded: async ({ sessionStartedAt, distanceKm, type, profile }) => {
          if (type !== 'walk' && type !== 'run') return;
          const st = get();
          if (listening && st.isSessionActive) return;
          const sameSession = st.sessionStartedAt != null && Math.abs(st.sessionStartedAt - sessionStartedAt) < 5 * 60_000;
          const startedAt = sameSession ? st.sessionStartedAt! : sessionStartedAt;
          const pauses = sameSession ? st.pauses : [];
          const paused = useCardioStore.getState().isPaused;

          let carried = sameSession ? st.sessionSteps : 0;
          if (pedometerService.canQueryHistory) {
            const exact = await queryActiveSteps(startedAt, pauses);
            if (exact != null) carried = exact;
          } else if (sameSession && st.counterStart != null) {
            await counterQueue;
            const exact = counterSteps(get(), await pedometerService.readCounter());
            if (exact != null) carried = exact;
            else set({ counterStart: null });
          } else {
            const measuredDistanceKm = sameSession ? st.lastStepDistanceKm : 0;
            carried += gapSteps({ type, measuredSteps: carried, measuredDistanceKm, gapDistanceKm: distanceKm - measuredDistanceKm, profile });
          }

          set({
            isSessionActive: true,
            sessionStartedAt: startedAt,
            pauses,
            offsetSteps: carried,
            liveSteps: 0,
            excludedSteps: 0,
            pausedAtLive: paused ? 0 : null,
            sessionSteps: carried,
            lastStepDistanceKm: distanceKm,
            lastStepAt: Date.now(),
            ...(sameSession ? {} : { counterStart: null, counterBootAt: null, counterExcluded: 0, counterAtPause: null }),
          });
          const started = await attach();
          if (!started && carried === 0) set({ isSessionActive: false, stepSource: 'none' });
          else if (st.stepSource !== 'none') set({ stepSource: st.stepSource });
        },

        finalize: async ({ type, distanceKm, movingSec, profile }) => {
          if (type !== 'walk' && type !== 'run') {
            await get().stopSession();
            return { steps: undefined, source: 'none' };
          }
          if (get().pausedAtLive != null) get().resume();
          const st = get();
          let steps: number | null = null;
          let source: StepSource = st.stepSource;

          if (st.isSessionActive && st.sessionStartedAt && pedometerService.canQueryHistory) {
            steps = await queryActiveSteps(st.sessionStartedAt, st.pauses);
            if (steps != null) source = 'native';
          }
          if (steps == null && st.isSessionActive && pedometerService.hasStepCounter) {
            await counterQueue;
            if (get().counterStart != null) {
              steps = counterSteps(get(), await pedometerService.readCounter());
              if (steps != null) source = 'native';
            }
          }
          if (steps == null && st.isSessionActive && (st.stepSource === 'native' || st.stepSource === 'motion_estimate')) {
            steps = st.sessionSteps;
            const stale = st.lastStepAt == null || Date.now() - st.lastStepAt > STALE_STREAM_MS;
            if (st.stepSource === 'native' && stale) {
              steps += gapSteps({
                type, measuredSteps: st.sessionSteps, measuredDistanceKm: st.lastStepDistanceKm,
                gapDistanceKm: distanceKm - st.lastStepDistanceKm, movingSec, profile,
              });
            }
          }

          await get().stopSession();

          if (steps == null || (source !== 'gps_estimate' && !isPlausiblePedometerCount(type, steps, distanceKm, movingSec, profile))) {
            return { steps: estimateSteps(type, distanceKm, movingSec, profile) ?? 0, source: 'gps_estimate' };
          }
          return { steps, source };
        },

        stopSession: async () => {
          set({ isSessionActive: false });
          listening = false;
          await pedometerService.stop();
        },

        resetSession: () => set({ ...EMPTY_SESSION }),
      };
    },
    {
      name: 'pedometer-storage',
      version: 2,
      partialize: (s) => ({
        sessionStartedAt: s.sessionStartedAt,
        pauses: s.pauses,
        sessionSteps: s.sessionSteps,
        stepSource: s.stepSource,
        lastStepDistanceKm: s.lastStepDistanceKm,
        lastStepAt: s.lastStepAt,
        counterStart: s.counterStart,
        counterBootAt: s.counterBootAt,
        counterExcluded: s.counterExcluded,
        counterAtPause: s.counterAtPause,
      }),
      migrate: () => ({ ...EMPTY_SESSION }) as unknown as PedometerState,
    },
  ),
);

// Pauses can come from the tracker UI or the native notification, so follow the cardio store.
useCardioStore.subscribe((state, prev) => {
  if (state.isPaused === prev.isPaused) return;
  const ped = usePedometerStore.getState();
  if (state.isPaused) ped.pause();
  else ped.resume();
});
