import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function setupNotificationChannels() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: 'clan_chat_messages',
        name: 'Clan Chat Messages',
        description: 'Instant notifications for new clan chat messages',
        importance: 5, // MAX importance - heads up banner + sound + vibration
        visibility: 1, // Public on lockscreen
        sound: 'default',
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
          await setDoc(doc(db, 'users', userId), {
            fcmToken: token.value,
            fcmTokens: arrayUnion(token.value),
            lastFcmRegisteredAt: Date.now()
          }, { merge: true });
        } catch (e) {
          console.warn('Failed to save FCM token:', e);
        }
      }
    });

    // User clicked notification banner
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data;
      if (data?.link) {
        window.location.href = data.link;
      } else if (data?.clanId) {
        window.location.href = `/clan/${data.clanId}/chat`;
      }
    });
  } catch (err) {
    console.warn('Push notification setup error:', err);
  }
}

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

export async function showNotification(id: number, title: string, body: string, extraData?: any) {
  const safeId = id || (Date.now() % 2147483647);
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: safeId,
            extra: extraData,
            autoCancel: true,
            channelId: 'clan_chat_messages',
            smallIcon: 'ic_stat_icon_config_sample',
            sound: 'default',
          }
        ]
      });
    } catch (err) {
      console.warn('Failed to schedule local notification:', err);
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

export async function scheduleDailyReminders() {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;

  // We will schedule notifications for the next 7 days.
  // IDs will be based on the day (1-7) to allow easy cancellation.
  // ID format: Day (1-7) * 100 + Hour.
  // Example: Day 1 at 5am = 105. Day 1 at 8am = 108. Day 1 at 5pm = 117.

  const notifications: any[] = [];
  const now = new Date();
  
  for (let i = 1; i <= 7; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    
    // 5:00 AM
    targetDate.setHours(5, 0, 0, 0);
    notifications.push({
      id: i * 100 + 5,
      title: 'Rise and grind! 🌅',
      body: 'Time to crush your goals today. Check your workout plan!',
      schedule: { at: new Date(targetDate) },
    });

    // 8:00 AM
    targetDate.setHours(8, 0, 0, 0);
    notifications.push({
      id: i * 100 + 8,
      title: "Don't forget your workout! 💪",
      body: 'Your training awaits. Open the app to see today\'s session.',
      schedule: { at: new Date(targetDate) },
    });

    // 5:00 PM
    targetDate.setHours(17, 0, 0, 0);
    notifications.push({
      id: i * 100 + 17,
      title: 'Evening session? 🌙',
      body: 'Still haven\'t trained today? Now is the perfect time!',
      schedule: { at: new Date(targetDate) },
    });
  }

  await LocalNotifications.schedule({ notifications });
}

export async function cancelRemainingTodayReminders() {
  if (!Capacitor.isNativePlatform()) return;
  // If a user works out TODAY, we want to cancel the 8am and 5pm reminders for TODAY.
  // We can just clear ALL pending daily reminders and re-schedule them for the next 7 days starting tomorrow!
  
  const pending = await LocalNotifications.getPending();
  const dailyIds = pending.notifications
    .map(n => n.id)
    .filter(id => id >= 100 && id <= 717); // IDs for the daily reminders

  if (dailyIds.length > 0) {
    await LocalNotifications.cancel({ notifications: dailyIds.map(id => ({ id })) });
  }

  // Re-schedule for the NEXT 7 days (starting tomorrow)
  await scheduleDailyReminders();
}

export async function scheduleInactivityReminders() {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;

  // Clear existing inactivity reminders (IDs 2000-2010)
  const pending = await LocalNotifications.getPending();
  const inactivityIds = pending.notifications
    .map(n => n.id)
    .filter(id => id >= 2000 && id <= 2010);

  if (inactivityIds.length > 0) {
    await LocalNotifications.cancel({ notifications: inactivityIds.map(id => ({ id })) });
  }

  const notifications: any[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Schedule for 3, 6, 7, 10, 14 days
  const intervals = [
    { days: 3, title: 'We miss you! 🏃', body: 'It\'s been 3 days since your last workout. Let\'s get back to it!' },
    { days: 6, title: 'Don\'t lose your progress! 📉', body: '6 days without training. Your body needs movement!' },
    { days: 7, title: 'It\'s been a week! 🗓️', body: 'A full week! Open the app and log a quick 10-minute session.' },
    { days: 10, title: 'Come back! 🥺', body: '10 days away. We saved your progress, just pick up where you left off.' },
    { days: 14, title: 'Two weeks away! 🕰️', body: 'It\'s never too late to restart your fitness journey. Start today.' },
  ];

  intervals.forEach((interval, index) => {
    notifications.push({
      id: 2000 + index,
      title: interval.title,
      body: interval.body,
      schedule: { at: new Date(now + (interval.days * dayMs)) },
    });
  });

  await LocalNotifications.schedule({ notifications });
}
