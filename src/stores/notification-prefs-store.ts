import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationCategory = 'social' | 'chat' | 'clans' | 'events' | 'achievements' | 'reminders' | 'admin';

export interface NotificationPrefs {
  /** Device banners (native local notifications / browser notifications). The bell always lists everything. */
  bannersEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  workoutReminders: boolean;
  /** HH:MM, local time. */
  reminderTime: string;
  /** 0 = Sunday … 6 = Saturday. */
  reminderDays: number[];
  inactivityReminders: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  bannersEnabled: true,
  categories: { social: true, chat: true, clans: true, events: true, achievements: true, reminders: true, admin: true },
  quietHours: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  workoutReminders: true,
  reminderTime: '18:00',
  reminderDays: [0, 1, 2, 3, 4, 5, 6],
  inactivityReminders: true,
};

interface NotificationPrefsState extends NotificationPrefs {
  setPrefs: (patch: Partial<NotificationPrefs>) => void;
  setCategory: (category: NotificationCategory, enabled: boolean) => void;
  reset: () => void;
}

export const useNotificationPrefs = create<NotificationPrefsState>()(persist(set => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  setPrefs: patch => set(patch),
  setCategory: (category, enabled) => set(state => ({ categories: { ...state.categories, [category]: enabled } })),
  reset: () => set(DEFAULT_NOTIFICATION_PREFS),
}), {
  name: 'apparatus-notification-prefs',
  version: 1,
  merge: (persisted, current) => {
    const saved = (persisted || {}) as Partial<NotificationPrefs>;
    return { ...current, ...saved, categories: { ...current.categories, ...(saved.categories || {}) } };
  },
}));

export function getNotificationPrefs(): NotificationPrefs {
  return useNotificationPrefs.getState();
}
