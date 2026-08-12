import { Capacitor } from '@capacitor/core';
import { CapacitorPedometer as NativePedometer } from '@capgo/capacitor-pedometer';

import type { PluginListenerHandle } from '@capacitor/core';

export type StepUpdateCallback = (steps: number, isNative: boolean) => void;

export type PedometerAvailability = 'native' | 'motion' | 'unavailable';

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
        // Native pedometer usually resets daily or we must keep track of diffs
        // We'll listen for step events if supported
        this.nativeListener = await (NativePedometer as any).addListener('measurement', (data: any) => {
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
    let lastPeakTime = Date.now();
    const threshold = 12.0; // magnitude threshold to detect a step (gravity is ~9.8 m/s^2)

    this.motionListener = (event: DeviceMotionEvent) => {
      if (!this.isTracking) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      
      const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      
      const now = Date.now();
      // Detect peak (simple heuristic: crossed threshold, minimum 300ms between steps)
      if (mag > threshold && lastMag <= threshold && (now - lastPeakTime) > 300) {
        this.webSteps++;
        lastPeakTime = now;
        if (this.callback) {
          // For web fallback, pass total step count for the current session
          this.callback(this.webSteps, false);
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
