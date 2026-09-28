import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { safeInternalPath } from '@/lib/validation';
import { allowsBanner } from '@/lib/notification-center';
import { getNotificationPrefs, type NotificationCategory, type NotificationPrefs } from '@/stores/notification-prefs-store';

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function setupNotificationChannels() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: 'clan_chat_messages',
        name: 'Clan Chat & Messages',
        description: 'Instant notifications for new clan chat messages',
        importance: 5, // MAX importance - heads up banner + sound + vibration
        visibility: 1, // Public on lockscreen
        vibration: true,
        lights: true,
        lightColor: '#e07a5f'
      });
      await LocalNotifications.createChannel({
        id: 'general_notifications',
        name: 'General Notifications',
        description: 'App notifications, announcements, and reminders',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#e07a5f'
      });
    } catch (err) {
      console.warn('Failed to create notification channel:', err);
    }
  }
}

export async function initPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // iOS gates local and push notifications behind separate permission grants;
    // asking only for push leaves in-app local notifications silently disabled.
    if (Capacitor.getPlatform() === 'ios') {
      try {
        const localCheck = await LocalNotifications.checkPermissions();
        if (localCheck.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (e) {
        console.warn('iOS local notification permission request failed:', e);
      }
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    // Register token in user profile
    await PushNotifications.addListener('registration', async (token) => {
      if (userId && token.value) {
        try {
          await setDoc(doc(db, 'users', userId, 'private', 'push'), {
            fcmTokens: arrayUnion(token.value),
            updatedAt: Date.now()
          }, { merge: true });
        } catch (e) {
          console.warn('Failed to save FCM token:', e);
        }
      }
    });

    // User clicked notification banner
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data;
      const link = safeInternalPath(data?.link);
      if (link) {
        window.location.href = link;
      } else if (typeof data?.clanId === 'string' && data.clanId) {
        window.location.href = `/clan/${encodeURIComponent(data.clanId)}/chat`;
      }
    });
  } catch (err) {
    console.warn('Push notification setup error:', err);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const check = await LocalNotifications.checkPermissions();
      if (check.display === 'granted') return true;
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch (err) {
      console.warn('Local notification permission check/request failed:', err);
      return false;
    }
  } else if ('Notification' in window) {
    try {
      if (Notification.permission === 'granted') return true;
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.warn('Web notification permission request failed:', err);
      return false;
    }
  }
  return false;
}

export async function showPersistentNotification(id: number, title: string, body: string) {
  if (Capacitor.getPlatform() === 'android') {
    // On Android, we already use the Foreground Service for an ongoing notification.
    // Creating a second local notification that is 'ongoing: true' will cause it to get 
    // permanently stuck if the user swipe-kills the app because JS can't run to clear it.
    return;
  }

  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id,
          ongoing: true, // Only for iOS, though iOS doesn't strictly support ongoing like Android does
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

export async function showNotification(id: number, title: string, body: string, extraData?: any, channelId = 'clan_chat_messages') {
  const safeId = id || Math.floor(Math.random() * 2147483647);
  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Ensure permission is checked before trying to schedule
      const check = await LocalNotifications.checkPermissions();
      if (check.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') {
          console.warn('Local notification permission not granted on device');
          return;
        }
      }

      // 2. Schedule with primary channel & existing icon
      await LocalNotifications.schedule({
        notifications: [
          {
            title: title || 'Apparatus',
            body: body || 'New message in clan',
            id: safeId,
            extra: extraData,
            autoCancel: true,
            channelId,
            smallIcon: 'ic_notification',
            iconColor: '#e07a5f',
          }
        ]
      });
    } catch (err) {
      console.warn('Failed to schedule local notification with channel, trying fallback:', err);
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: title || 'Apparatus',
              body: body || 'New notification',
              id: safeId,
              extra: extraData,
              autoCancel: true,
            }
          ]
        });
      } catch (fallbackErr) {
        console.error('All local notification attempts failed:', fallbackErr);
      }
    }
  } else if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          tag: safeId.toString(),
          icon: '/favicon.ico',
        });
      } catch (err) {
        console.warn('Web notification failed:', err);
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification(title, {
            body,
            tag: safeId.toString(),
            icon: '/favicon.ico',
          });
        }
      });
    }
  }
}

/** Shows a device banner only if the user's notification preferences allow this category right now. */
export async function notifyDevice(category: NotificationCategory, title: string, body: string, extraData?: any) {
  if (!allowsBanner(getNotificationPrefs(), category)) return;
  const channel = category === 'chat' ? 'clan_chat_messages' : 'general_notifications';
  await showNotification(Math.floor(Math.random() * 2147483647), title, body, extraData, channel);
}

// Local notification id ranges: 100–799 workout reminders (incl. legacy 3-a-day ids), 2000–2010 inactivity nudges.
const isWorkoutReminderId = (id: number) => id >= 100 && id <= 799;
const isInactivityId = (id: number) => id >= 2000 && id <= 2010;

async function cancelPending(match: (id: number) => boolean) {
  const pending = await LocalNotifications.getPending();
  const ids = pending.notifications.map(n => n.id).filter(match);
  if (ids.length) await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
}

const REMINDER_COPY = [
  { title: 'Time to train 💪', body: "Your session is waiting. Even a short workout keeps the streak alive." },
  { title: 'Ready when you are 🏋️', body: 'Open Apparatus to start today\'s workout or log a run.' },
  { title: 'Keep the momentum 🔥', body: 'Consistency builds your rank. Get a quality session in today.' },
  { title: "Today's training 📋", body: 'Check your plan and knock out your session.' },
];

function atTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** Schedules one reminder per selected weekday at the chosen time for the next 7 days. */
export async function scheduleWorkoutReminders(options: { trainedToday?: boolean; prefs?: NotificationPrefs } = {}) {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await cancelPending(isWorkoutReminderId);

  const prefs = options.prefs || getNotificationPrefs();
  if (!prefs.workoutReminders || !prefs.bannersEnabled || !prefs.categories.reminders || !prefs.reminderDays.length) return;

  const now = new Date();
  const notifications = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!prefs.reminderDays.includes(day.getDay())) continue;
    const at = atTime(day, prefs.reminderTime);
    if (offset === 0 && (options.trainedToday || at.getTime() <= now.getTime() + 60_000)) continue;
    const copy = REMINDER_COPY[(day.getDate() + offset) % REMINDER_COPY.length];
    notifications.push({
      id: 100 + offset,
      title: copy.title,
      body: copy.body,
      schedule: { at, allowWhileIdle: true },
      channelId: 'general_notifications',
      smallIcon: 'ic_notification',
      iconColor: '#e07a5f',
      extra: { link: '/plans', kind: 'workout_reminder' },
    });
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/** After a session, drop today's reminder and keep the rest of the week. */
export async function cancelRemainingTodayReminders() {
  await scheduleWorkoutReminders({ trainedToday: true });
}

export async function cancelInactivityReminders() {
  if (!Capacitor.isNativePlatform()) return;
  await cancelPending(isInactivityId);
}

export async function scheduleInactivityReminders() {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await cancelPending(isInactivityId);

  const prefs = getNotificationPrefs();
  if (!prefs.inactivityReminders || !prefs.bannersEnabled || !prefs.categories.reminders) return;

  const intervals = [
    { days: 3, title: 'We miss you 🏃', body: "3 days since your last session. A short one counts." },
    { days: 7, title: "It's been a week 🗓️", body: 'Log a 15-minute session to get back on track.' },
    { days: 14, title: 'Two weeks away 🕰️', body: 'Your progress is saved. Pick up where you left off.' },
  ];
  const today = new Date();
  const notifications = intervals.map((interval, index) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + interval.days);
    return {
      id: 2000 + index,
      title: interval.title,
      body: interval.body,
      // Same time of day as workout reminders instead of whenever the last session ended.
      schedule: { at: atTime(day, prefs.reminderTime), allowWhileIdle: true },
      channelId: 'general_notifications',
      smallIcon: 'ic_notification',
      iconColor: '#e07a5f',
      extra: { link: '/plans', kind: 'inactivity_reminder' },
    };
  });

  await LocalNotifications.schedule({ notifications });
}
