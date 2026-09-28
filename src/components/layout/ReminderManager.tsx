import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { localDateKey } from '@/lib/stats';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useNotificationPrefs } from '@/stores/notification-prefs-store';

const REMINDER_MESSAGES = [
  'Time to train. Even a short session keeps your streak alive.',
  'No session logged yet today. Get a workout or run in.',
  "Your plan is ready. Knock out today's training.",
  'A 15-minute session still counts.',
];

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Posts at most one in-app workout reminder per day, at the time chosen in notification settings. */
export function ReminderManager() {
  const { profile, stats } = useAuthStore();
  const queryClient = useQueryClient();
  const isActive = useWorkoutStore(state => state.isActive);
  const { workoutReminders, reminderTime, reminderDays, categories } = useNotificationPrefs();
  const lastWorkoutDate = stats?.lastWorkoutDate;

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid || isActive || !workoutReminders || !categories.reminders) return;

    const check = async () => {
      const now = new Date();
      const today = localDateKey(now);
      if (!reminderDays.includes(now.getDay()) || lastWorkoutDate === today) return;
      const [h, m] = reminderTime.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() < (h || 0) * 60 + (m || 0)) return;

      try {
        const ref = doc(db, 'notifications', `reminder_${uid}_${today}`);
        if ((await getDoc(ref)).exists()) return;
        await setDoc(ref, {
          receiverId: uid,
          senderId: uid,
          senderName: 'System',
          senderPhoto: '',
          type: 'reminder',
          message: REMINDER_MESSAGES[now.getDate() % REMINDER_MESSAGES.length],
          targetId: '',
          read: false,
          extra: { kind: 'workout_reminder', link: '/plans' },
          createdAt: serverTimestamp(),
        });
        queryClient.invalidateQueries({ queryKey: ['notifications', uid] });
      } catch (err) {
        console.error('Error running workout reminder check:', err);
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [profile?.uid, isActive, workoutReminders, reminderTime, reminderDays, categories.reminders, lastWorkoutDate, queryClient]);

  return null;
}
