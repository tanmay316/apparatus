import type { CardioActivityType } from '@/types';

/** Pedometer steps when available, otherwise a stride-length estimate from distance. */
export function getLiveSteps(
  type: CardioActivityType | null,
  distKm: number,
  pedStore: { isSessionActive: boolean; sessionSteps: number; stepSource: string }
): number | undefined {
  if (type !== 'walk' && type !== 'run') return undefined;

  if (pedStore.isSessionActive && (pedStore.stepSource === 'native' || pedStore.stepSource === 'motion_estimate')) {
    return pedStore.sessionSteps;
  }

  if (distKm < 0.01) return 0;
  return Math.round(distKm * 1000 / (type === 'run' ? 1.0 : 0.762));
}
