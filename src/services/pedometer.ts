import { Capacitor } from '@capacitor/core';
import { CapacitorPedometer as NativePedometer } from '@capgo/capacitor-pedometer';
import { DailySteps, hasDailyStepsPlugin, type StepCounterReading } from '@/utils/native-daily-steps';

import type { PluginListenerHandle } from '@capacitor/core';

export type StepUpdateCallback = (steps: number, isNative: boolean) => void;

export type PedometerAvailability = 'native' | 'motion' | 'unavailable';

export type StepsPermission = 'granted' | 'prompt' | 'denied' | 'unsupported';

function toStepsPermission(state?: string): StepsPermission {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

class PedometerService {
  private isNative: boolean;
  private isTracking: boolean = false;
  private webSteps: number = 0;
  private callback: StepUpdateCallback | null = null;
  private motionListener: ((e: DeviceMotionEvent) => void) | null = null;
  private nativeListener: PluginListenerHandle | null = null;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  /**
   * iOS keeps a 7-day CoreMotion step history, so any time range can be re-queried exactly,
   * even after the app was suspended or killed. Android's step counter has no history API.
   */
  get canQueryHistory(): boolean {
    return this.isNative && Capacitor.getPlatform() === 'ios';
  }

  /** Android: the hardware step counter can be read directly for exact session deltas. */
  get hasStepCounter(): boolean {
    return this.isNative && hasDailyStepsPlugin();
  }

  /** Raw Android step counter; null when unavailable or not permitted. */
  async readCounter(): Promise<StepCounterReading | null> {
    if (!this.hasStepCounter) return null;
    try {
      const r = await DailySteps.readCounter();
      return Number.isFinite(r?.counter) && r.counter >= 0 ? r : null;
    } catch {
      return null;
    }
  }

  /**
   * Everything the phone counted on a local day (yyyy-MM-dd): CoreMotion on iOS, the
   * hardware step counter (sampled by DailyStepsPlugin) on Android. Null when unknown.
   */
  async getDeviceStepsForDay(dateKey: string): Promise<number | null> {
    if (this.canQueryHistory) {
      const [y, m, d] = dateKey.split('-').map(Number);
      const start = new Date(y, m - 1, d).getTime();
      const end = Math.min(Date.now(), new Date(y, m - 1, d + 1).getTime());
      return this.getStepsBetween(start, end);
    }
    if (!this.hasStepCounter) return null;
    try {
      const res = await DailySteps.getSteps({ date: dateKey });
      return res.available && res.steps >= 0 ? Math.round(res.steps) : null;
    } catch {
      return null;
    }
  }

  /** Motion & Fitness (iOS) / Physical activity (Android) permission for all-day steps. */
  async stepsPermission(): Promise<StepsPermission> {
    if (!this.isNative) return 'unsupported';
    try {
      if (this.hasStepCounter) return toStepsPermission((await DailySteps.checkPermissions()).activityRecognition);
      if (this.canQueryHistory) return toStepsPermission((await NativePedometer.checkPermissions()).activityRecognition);
    } catch { /* fall through */ }
    return 'unsupported';
  }

  async requestStepsPermission(): Promise<boolean> {
    if (this.hasStepCounter) {
      try {
        return (await DailySteps.requestPermissions()).activityRecognition === 'granted';
      } catch {
        return false;
      }
    }
    return this.isNative ? this.requestPermission() : false;
  }

  /** Exact steps between two epoch-ms instants (iOS only). Resolves null when unavailable. */
  async getStepsBetween(start: number, end: number): Promise<number | null> {
    if (!this.canQueryHistory || !(end > start)) return null;
    try {
      const res = await NativePedometer.getMeasurement({ start, end });
      const steps = res?.numberOfSteps;
      return typeof steps === 'number' && Number.isFinite(steps) && steps >= 0 ? steps : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if pedometer is available
   */
  async isAvailable(): Promise<PedometerAvailability> {
    if (!this.isNative) return 'motion'; // Web fallback is technically a motion estimate
    try {
      const res = await NativePedometer.isAvailable();
      return res.stepCounting ? 'native' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /**
   * Request permissions (Native or Web)
   */
  async requestPermission(): Promise<boolean> {
    if (this.isNative) {
      try {
        const status = await NativePedometer.requestPermissions();
        return status.activityRecognition === 'granted';
      } catch (err) {
        console.error('Native pedometer permission error:', err);
        return false;
      }
    } else {
      // Web PWA fallback (iOS 13+ requires explicit permission for DeviceMotionEvent)
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const permissionState = await (DeviceMotionEvent as any).requestPermission();
          return permissionState === 'granted';
        } catch (error) {
          console.error('Error requesting DeviceMotionEvent permission:', error);
          return false;
        }
      }
      return true; // Android/Desktop web doesn't require explicit request, just works (or doesn't have sensor)
    }
  }

  /**
   * Start tracking steps
   */
  async start(onStepUpdate: StepUpdateCallback): Promise<boolean> {
    if (this.isTracking) {
      await this.stop();
    }
    
    const availability = await this.isAvailable();
    if (availability === 'unavailable') return false;

    const granted = await this.requestPermission();
    if (!granted) return false;

    this.callback = onStepUpdate;

    if (this.isNative) {
      try {
        this.isTracking = true;
        // Both native plugins report steps counted since startMeasurementUpdates(), not a device total.
        this.nativeListener = await NativePedometer.addListener('measurement', (data) => {
          if (!this.isTracking) return;
          const steps = data?.numberOfSteps;
          if (typeof steps === 'number' && Number.isFinite(steps) && steps >= 0) {
            if (this.callback) this.callback(steps, true);
          }
        });
        
        await NativePedometer.startMeasurementUpdates();
        return true;
      } catch (err) {
        console.error('Failed to start native pedometer:', err);
        this.isTracking = false;
        if (this.nativeListener) {
           this.nativeListener.remove().catch(console.error);
           this.nativeListener = null;
        }
        return false;
      }
    } else {
      this.startWebPedometer();
      return true;
    }
  }

  /**
   * Stop tracking steps
   */
  async stop(): Promise<void> {
    if (!this.isTracking) return;
    this.isTracking = false;

    if (this.isNative) {
      try {
        await NativePedometer.stopMeasurementUpdates();
        if (this.nativeListener) {
          await this.nativeListener.remove();
          this.nativeListener = null;
        }
      } catch (err) {
        console.error('Failed to stop native pedometer:', err);
      }
    } else {
      this.stopWebPedometer();
    }
    this.callback = null;
    this.webSteps = 0;
  }

  /**
   * Web fallback using DeviceMotionEvent (basic peak detection)
   */
  private startWebPedometer() {
    this.webSteps = 0;
    this.isTracking = true;
    
    let lastMag = 0;
    let lastPeakTime = 0;
    let stepBurstCount = 0;
    let lastBurstTime = 0;
    const threshold = 12.8; // magnitude threshold to detect a step (gravity is ~9.8 m/s^2)

    this.motionListener = (event: DeviceMotionEvent) => {
      if (!this.isTracking) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      
      const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      const now = Date.now();

      // Detect peak (crossed threshold, min 320ms and max 2000ms between walking steps)
      if (mag > threshold && lastMag <= threshold) {
        const dt = now - lastPeakTime;
        if (dt > 320 && dt < 2000) {
          if (now - lastBurstTime > 2500) {
            stepBurstCount = 1;
          } else {
            stepBurstCount++;
          }
          lastBurstTime = now;
          lastPeakTime = now;

          // Only credit steps after at least 3 continuous steps are confirmed (anti-false trigger)
          if (stepBurstCount === 3) {
            this.webSteps += 3;
            if (this.callback) this.callback(this.webSteps, false);
          } else if (stepBurstCount > 3) {
            this.webSteps += 1;
            if (this.callback) this.callback(this.webSteps, false);
          }
        } else if (dt >= 2000 || lastPeakTime === 0) {
          stepBurstCount = 1;
          lastBurstTime = now;
          lastPeakTime = now;
        }
      }
      lastMag = mag;
    };

    window.addEventListener('devicemotion', this.motionListener, true);
  }

  private stopWebPedometer() {
    if (this.motionListener) {
      window.removeEventListener('devicemotion', this.motionListener, true);
      this.motionListener = null;
    }
  }
}

export const pedometerService = new PedometerService();
