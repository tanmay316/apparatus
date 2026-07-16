import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, setDoc, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkoutStore } from '@/stores/workout-store';

const REMINDER_MESSAGES: Record<'5am' | '8am' | '5pm' | '8pm', string[]> = {
  '5am': [
    "It's 5 AM. The high performers are already up and grinding. What's your excuse? Log your workout today!",
    "5 AM reminder: Successful people start before their excuses do. Get up and log your session!",
    "Rise and grind! 5 AM is here. Time to show up and log today's session.",
    "While you sleep on your goals, someone else is working on theirs. Log your workout today!"
  ],
  '8am': [
    "8 AM. The day has officially started, but have you? Don't let your streak die—log today's workout!",
    "Are you actually training today or just pretending to care about your fitness? Show some discipline and log it!",
    "8 AM and zero sweat? No excuses. Get to work and make sure to log it today!",
    "Your streak is waiting. Log today's session and show up for yourself!"
  ],
  '5pm': [
    "5 PM. Work is done, but your personal goals aren't. No skipping today. Go log a workout!",
    "Evening is here. Are you going to end today with zero logged activity? Move your body and log it!",
    "Stop scrolling and start lifting. Your future self is judging you. Log a session!",
    "Don't let today be a zero day. Go push yourself and log your session!"
  ],
  '8pm': [
    "8 PM. The clock is ticking. Are you going to sleep a quitter or a winner? Log your workout!",
    "Only a few hours left of today. Don't disappoint yourself. Log that session now!",
    "Last chance to log today! Don't let your streak reset. Go push yourself!",
    "No workout logged yet? The day is almost over. Finish strong and log it!"
  ]
};

function getRandomReminderMessage(slot: '5am' | '8am' | '5pm' | '8pm'): string {
  const list = REMINDER_MESSAGES[slot];
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ReminderManager() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const isActive = useWorkoutStore(state => state.isActive);
  const lastCheckedSlotRef = useRef<string>('');

  useEffect(() => {
    if (!profile?.uid) return;
    if (isActive) {
      // If the user starts exercising or is actively in a workout, do not trigger/send reminders
      return;
    }

    const checkReminders = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      let activeSlot: '5am' | '8am' | '5pm' | '8pm' | null = null;

      if (currentHour >= 20) {
        activeSlot = '8pm';
      } else if (currentHour >= 17) {
        activeSlot = '5pm';
      } else if (currentHour >= 8) {
        activeSlot = '8am';
      } else if (currentHour >= 5) {
        activeSlot = '5am';
      }

      if (!activeSlot) return;

      const todayStr = localDateKey(now);
      const checkKey = `${todayStr}_${activeSlot}`;

      if (lastCheckedSlotRef.current === checkKey) return;
      lastCheckedSlotRef.current = checkKey;

      try {
        // 1. Check if user has logged a workout today
        const workoutQuery = query(
          collection(db, 'workouts'),
          where('userId', '==', profile.uid),
          where('date', '==', todayStr),
          limit(1)
        );
        const workoutSnap = await getDocs(workoutQuery);
        if (!workoutSnap.empty) {
          // User already logged a workout today
          return;
        }

        // 2. Check if reminder notification doc already exists
        const notifId = `reminder_${profile.uid}_${todayStr}_${activeSlot}`;
        const notifRef = doc(db, 'notifications', notifId);
        const notifSnap = await getDoc(notifRef);

        if (!notifSnap.exists()) {
          const message = getRandomReminderMessage(activeSlot);
          await setDoc(notifRef, {
            receiverId: profile.uid,
            senderId: profile.uid,
            senderName: 'System',
            senderPhoto: '',
            type: 'reminder',
            message,
            targetId: '',
            read: false,
            createdAt: serverTimestamp(),
          });

          // Invalidate notifications query to show the new notification immediately
          queryClient.invalidateQueries({ queryKey: ['notifications', profile.uid] });
        }
      } catch (err) {
        console.error('Error running workout reminder check:', err);
      }
    };

    // Run check immediately on mount/auth-change
    checkReminders();

    // Run check every 10 minutes
    const interval = setInterval(checkReminders, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [profile?.uid, isActive, queryClient]);

  return null;
}
