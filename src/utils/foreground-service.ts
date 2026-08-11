import { Capacitor } from '@capacitor/core';
import { ForegroundService, ServiceType } from '@capawesome-team/capacitor-android-foreground-service';

export type ForegroundServiceType = 'cardio' | 'gym';

export async function requestForegroundPermissions() {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await ForegroundService.checkPermissions();
    if (status.display !== 'granted') {
      const requested = await ForegroundService.requestPermissions();
      return requested.display === 'granted';
    }
    return true;
  } catch (err) {
    console.warn('[ForegroundService] Failed to check/request permissions:', err);
    return false;
  }
}

export async function startWorkoutForegroundService(type: ForegroundServiceType, title: string, body: string, isPaused: boolean) {
  // Cardio owns its own native location foreground service and notification.
  if (type !== 'gym') return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ForegroundService.startForegroundService({
      id: 102,
      title,
      body,
      smallIcon: 'ic_notification',
      serviceType: undefined,
      silent: true
    });
  } catch (err) {
    console.error('[ForegroundService] Failed to start:', err);
  }
}

export async function updateWorkoutForegroundService(type: ForegroundServiceType, title: string, body: string, isPaused: boolean) {
  if (type !== 'gym') return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ForegroundService.startForegroundService({
      id: 102,
      title,
      body,
      smallIcon: 'ic_notification',
      silent: true
    });
  } catch (err) {
    console.error('[ForegroundService] Failed to update:', err);
  }
}

export async function stopWorkoutForegroundService() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ForegroundService.stopForegroundService();
  } catch (err) {
    console.warn('[ForegroundService] Failed to stop:', err);
  }
}

export async function setupForegroundServiceListeners(
  onPauseResume: () => void,
  onStop: () => void
) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ForegroundService.removeAllListeners();
    await ForegroundService.addListener('buttonClicked', (event) => {
      if (event.buttonId === 1) {
        onPauseResume();
      } else if (event.buttonId === 2) {
        onStop();
      }
    });
  } catch (err) {
    console.warn('[ForegroundService] Failed to attach listeners:', err);
  }
}
