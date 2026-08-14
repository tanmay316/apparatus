import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeWorkoutPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}

interface WorkoutLocationPlugin {
  start(options: { reset: boolean; activityType?: 'walk' | 'run' | 'cycle' }): Promise<void>;
  stop(): Promise<void>;
  getLocationsAfter(options: { timestamp: number }): Promise<{ points: NativeWorkoutPoint[] }>;
  addListener(eventName: 'location', listenerFunc: (point: NativeWorkoutPoint) => void): Promise<PluginListenerHandle>;
}

export const NativeWorkoutLocation = registerPlugin<WorkoutLocationPlugin>('WorkoutLocation');
