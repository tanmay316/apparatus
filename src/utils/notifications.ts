import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export async function requestNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  } else if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

export async function showPersistentNotification(id: number, title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
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
  } else if ('Notification' in window && Notification.permission === 'granted') {
    // Web notifications cannot be strictly "ongoing" like Android, but we can show them
    new Notification(title, { body, tag: id.toString() });
  }
}

export async function clearNotification(id: number) {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } else if ('Notification' in window) {
    // HTML5 Notifications don't have a reliable close-by-id mechanism after they are spawned
    // unless we keep a reference, but we use the tag for grouping.
    // This is essentially a no-op on web unless Service Workers are heavily used.
  }
}

export async function showNotification(id: number, title: string, body: string) {
  if (Capacitor.isNativePlatform()) {
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
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag: id.toString() });
  }
}

