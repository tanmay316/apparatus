import type { CardioActivityType } from '@/types';
import { estimateSteps, type StrideProfile } from '@/lib/steps';

/** Pedometer steps while a sensor session is live, otherwise a stride-model estimate from distance. */
export function getLiveSteps(
  type: CardioActivityType | null,
  distKm: number,
  pedStore: { isSessionActive: boolean; sessionSteps: number; stepSource: string },
  opts: { movingSec?: number; profile?: StrideProfile } = {},
): number | undefined {
  if (type !== 'walk' && type !== 'run') return undefined;

  if (pedStore.isSessionActive && (pedStore.stepSource === 'native' || pedStore.stepSource === 'motion_estimate')) {
    return pedStore.sessionSteps;
  }

  return estimateSteps(type, distKm, opts.movingSec, opts.profile);
}
