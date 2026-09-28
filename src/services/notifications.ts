import { collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp, orderBy, limit, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
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
    senderId: auth.currentUser?.uid || '',
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
      orderBy('createdAt', 'desc'),
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

export function subscribeToAppNotifications(userId: string, onUpdate: (items: AppNotificationItem[]) => void): () => void {
  const q = query(
    collection(db, 'app_notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  return onSnapshot(
    q,
    snap => onUpdate(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotificationItem))),
    err => console.warn('App notification feed error:', err),
  );
}

export async function markAllAppNotificationsRead(userId: string): Promise<void> {
  const snap = await getDocs(query(
    collection(db, 'app_notifications'),
    where('userId', '==', userId),
    where('read', '==', false),
  ));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}

export async function deleteAppNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, 'app_notifications', notificationId));
}
