import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeWorkoutPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  speedAccuracy?: number | null;
  altitude: number | null;
  verticalAccuracy?: number | null;
  bearing?: number | null;
  bearingAccuracy?: number | null;
  timestamp: number;

  // Authoritative metrics calculated by native service
  distanceMeters?: number;
  movingDurationSec?: number;
  currentSpeedKmh?: number;
  maxSpeedKmh?: number;
  elevationGainM?: number;
  isMoving?: boolean;
  isAccepted?: boolean;
}

export interface NativeWorkoutSessionSummary {
  state: 'IDLE' | 'TRACKING' | 'PAUSED' | 'STOPPED';
  activityType: 'walk' | 'run' | 'cycle';
  startedAt: number;
  pausedAt: number;
  totalPausedMs: number;
  movingDurationSec: number;
  distanceMeters: number;
  currentSpeedKmh: number;
  maxSpeedKmh: number;
  elevationGainM: number;
  lastLat: number | null;
  lastLng: number | null;
  lastAlt?: number | null;
  lastBearing?: number | null;
  lastAccuracy: number;
  lastTimestamp: number;
  pointCount: number;
}

interface WorkoutLocationPlugin {
  start(options: { reset: boolean; activityType?: 'walk' | 'run' | 'cycle' }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  getSessionSummary(): Promise<NativeWorkoutSessionSummary>;
  getDownsampledPoints(options: { maxPoints: number }): Promise<{ points: NativeWorkoutPoint[] }>;
  getLocationsAfter(options: { timestamp: number }): Promise<{ points: NativeWorkoutPoint[] }>;
  requestBatteryOptimizationExemption(): Promise<{ isExempt: boolean }>;
  addListener(eventName: 'location', listenerFunc: (point: NativeWorkoutPoint) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'stateChange', listenerFunc: (event: { state: string }) => void): Promise<PluginListenerHandle>;
}

export const NativeWorkoutLocation = registerPlugin<WorkoutLocationPlugin>('WorkoutLocation');
