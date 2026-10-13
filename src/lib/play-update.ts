import { Capacitor } from '@capacitor/core';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';

const DISMISSED_KEY = 'apparatus.play-update.dismissed-at';
/** If the user backs out of the Play update screen, don't ask again for this long. */
const SNOOZE_MS = 24 * 3600_000;
/** Resume checks at most this often (each one queries Play). */
const CHECK_EVERY_MS = 3 * 3600_000;

let lastCheck = 0;
let running = false;

const busyTraining = () => useCardioStore.getState().isTracking || useWorkoutStore.getState().isActive;

/**
 * Google Play in-app update: when Play has a newer version, open Play's update screen
 * (or finish an already downloaded one). Never interrupts a live run or workout.
 */
export async function checkPlayUpdate(force = false) {
  if (Capacitor.getPlatform() !== 'android' || running) return;
  if (!force && Date.now() - lastCheck < CHECK_EVERY_MS) return;
  if (busyTraining()) return;
  running = true;
  lastCheck = Date.now();
  try {
    const { AppUpdate, AppUpdateAvailability, AppUpdateResultCode, FlexibleUpdateInstallStatus } = await import('@capawesome/capacitor-app-update');
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
      await AppUpdate.completeFlexibleUpdate();
      return;
    }
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return;
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    if (Date.now() - dismissedAt < SNOOZE_MS) return;

    if (info.immediateUpdateAllowed) {
      const result = await AppUpdate.performImmediateUpdate();
      if (result.code === AppUpdateResultCode.CANCELED) localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } else if (info.flexibleUpdateAllowed) {
      const handle = await AppUpdate.addListener('onFlexibleUpdateStateChange', state => {
        if (state.installStatus !== FlexibleUpdateInstallStatus.DOWNLOADED) return;
        void handle.remove();
        // Restarting mid-session would lose the recording; the next check after it ends installs it.
        if (!busyTraining()) void AppUpdate.completeFlexibleUpdate();
      });
      const result = await AppUpdate.startFlexibleUpdate();
      if (result.code === AppUpdateResultCode.CANCELED) {
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        void handle.remove();
      }
    }
  } catch (err) {
    // Sideloaded builds (not installed from Play) have no update info.
    console.debug('[PlayUpdate] check skipped', err);
  } finally {
    running = false;
  }
}
