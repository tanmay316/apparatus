import { collection, doc, addDoc, getDocs, updateDoc, query, where, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppNotificationItem, AppNotificationType } from '@/types';

export async function createNotification(notif: {
  userId: string;
  title: string;
  body: string;
  type: AppNotificationType;
  link?: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, 'app_notifications'), {
    ...notif,
    read: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getUserNotifications(userId: string): Promise<AppNotificationItem[]> {
  try {
    const q = query(
      collection(db, 'app_notifications'),
      where('userId', '==', userId),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AppNotificationItem))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return [];
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'app_notifications', notificationId), {
    read: true,
  });
}
