import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PermissionState } from '@capacitor/core';

export interface DailyStepsResult {
  available: boolean;
  permission: PermissionState;
  /** Steps credited to the requested day; -1 when unknown. */
  steps: number;
  trackingSince?: number;
}

export interface StepCounterReading {
  /** Hardware steps since boot. */
  counter: number;
  /** Epoch ms of the last boot; a change means the counter restarted. */
  bootAt: number;
}

interface DailyStepsPlugin {
  getSteps(options?: { date?: string }): Promise<DailyStepsResult>;
  readCounter(): Promise<StepCounterReading>;
  checkPermissions(): Promise<{ activityRecognition: PermissionState }>;
  requestPermissions(): Promise<{ activityRecognition: PermissionState }>;
}

/** Android app-module plugin (DailyStepsPlugin.java): all-day steps from the hardware step counter. */
export const DailySteps = registerPlugin<DailyStepsPlugin>('DailySteps');

export function hasDailyStepsPlugin(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('DailySteps');
}
