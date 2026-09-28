import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { create } from 'zustand';
import { auth, db } from '@/lib/firebase';
import type { AppNotificationItem } from '@/types';

export type AdminAlertKind = 'report' | 'community' | 'event';

export const ADMIN_ALERT_TAB: Record<AdminAlertKind, string> = { report: 'reports', community: 'communities', event: 'events' };

const ADMINS_DOC = () => doc(db, 'admin_settings', 'admins');

/** Admins add their uid on sign-in so other clients know where to deliver alerts. */
export async function registerAdmin(uid: string) {
  await setDoc(ADMINS_DOC(), { uids: arrayUnion(uid) }, { merge: true });
}

let adminCache: { uids: string[]; at: number } | null = null;

async function getAdminUids(): Promise<string[]> {
  if (adminCache && Date.now() - adminCache.at < 5 * 60_000) return adminCache.uids;
  const snap = await getDoc(ADMINS_DOC());
  const uids = Array.isArray(snap.data()?.uids) ? (snap.data()!.uids as unknown[]).filter((u): u is string => typeof u === 'string') : [];
  adminCache = { uids, at: Date.now() };
  return uids;
}

/**
 * Notifies every admin about something the current user just submitted. Each admin gets their own
 * app_notifications doc, so it shows in their bell, as a device banner and as a push (backend FCM listener).
 * Never throws: a missed alert must not break the user's submission.
 */
export async function raiseAdminAlert(kind: AdminAlertKind, targetId: string, title: string, body: string) {
  const me = auth.currentUser;
  if (!me || !targetId) return;
  try {
    const recipients = (await getAdminUids()).filter(uid => uid !== me.uid);
    await Promise.all(recipients.map(userId => addDoc(collection(db, 'app_notifications'), {
      userId,
      senderId: me.uid,
      type: 'admin_alert',
      kind,
      targetId,
      title: title.slice(0, 150),
      body: body.slice(0, 300),
      link: `/admin?tab=${ADMIN_ALERT_TAB[kind]}`,
      read: false,
      createdAt: serverTimestamp(),
    }).catch(err => console.warn('Admin alert not delivered:', err))));
  } catch (err) {
    console.warn('Could not raise admin alert:', err);
  }
}

const toMs = (t: any) => (t?.toMillis ? t.toMillis() : typeof t?.seconds === 'number' ? t.seconds * 1000 : Date.now());

export function subscribeAdminAlerts(uid: string, onUpdate: (items: AppNotificationItem[]) => void) {
  // Two equality filters need no composite index; sort client-side.
  const q = query(collection(db, 'app_notifications'), where('userId', '==', uid), where('type', '==', 'admin_alert'));
  return onSnapshot(
    q,
    snap => onUpdate(snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AppNotificationItem))
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .slice(0, 100)),
    err => console.warn('Admin alert feed error:', err),
  );
}

async function batchApply(items: AppNotificationItem[], op: 'read' | 'delete') {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(n => {
      const ref = doc(db, 'app_notifications', n.id!);
      if (op === 'read') batch.update(ref, { read: true });
      else batch.delete(ref);
    });
    await batch.commit();
  }
}

export const markAdminAlertsRead = (items: AppNotificationItem[]) => batchApply(items.filter(n => n.id && !n.read), 'read');
export const deleteAdminAlerts = (items: AppNotificationItem[]) => batchApply(items.filter(n => n.id), 'delete');

interface AdminAlertsState {
  alerts: AppNotificationItem[];
  setAlerts: (alerts: AppNotificationItem[]) => void;
}

/** Filled by AdminAlertsSync (mounted in Layout for admins only). */
export const useAdminAlerts = create<AdminAlertsState>(set => ({
  alerts: [],
  setAlerts: alerts => set({ alerts }),
}));

export const useUnreadAdminAlerts = () => useAdminAlerts(s => s.alerts.filter(a => !a.read).length);
