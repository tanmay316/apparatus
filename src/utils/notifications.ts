import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export async function requestNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  }
  return false;
}

export async function showPersistentNotification(id: number, title: string, body: string) {
  if (!Capacitor.isNativePlatform()) return;
  
  await LocalNotifications.schedule({
    notifications: [
      {
        title,
        body,
        id,
        ongoing: true, // Prevents the user from swiping it away easily
        autoCancel: false,
      }
    ]
  });
}

export async function clearNotification(id: number) {
  if (!Capacitor.isNativePlatform()) return;
  
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

export async function showNotification(id: number, title: string, body: string) {
  if (!Capacitor.isNativePlatform()) return;
  
  await LocalNotifications.schedule({
    notifications: [
      {
        title,
        body,
        id,
        autoCancel: true,
      }
    ]
  });
}
