import { useEffect, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAdminUser } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';

export type PaymentsMode = 'off' | 'admin' | 'on';

let mode: PaymentsMode = 'off';
let subscribedUid: string | null = null;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

// One shared listener on admin_settings/market, restarted when the signed-in user changes.
function follow(uid: string | null) {
  if (uid === subscribedUid) return;
  unsubscribe?.();
  unsubscribe = null;
  subscribedUid = uid;
  if (!uid) { mode = 'off'; emit(); return; }
  unsubscribe = onSnapshot(doc(db, 'admin_settings', 'market'), snap => {
    const m = snap.data()?.paymentsMode;
    mode = m === 'on' || m === 'admin' ? m : 'off';
    emit();
  }, () => { mode = 'off'; emit(); });
}

export function usePaymentsMode(): PaymentsMode {
  const uid = useAuthStore(s => s.user?.uid ?? null);
  useEffect(() => { follow(uid); }, [uid]);
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => mode);
}

/** In-app marketplace payments (tickets, paid clans, plan sales, payouts) for the current user. */
export function usePaymentsEnabled(): boolean {
  const m = usePaymentsMode();
  const user = useAuthStore(s => s.user);
  // Store builds would need Play / App Store billing for digital sales, so these stay web-only.
  if (Capacitor.isNativePlatform()) return false;
  return m === 'on' || (m === 'admin' && isAdminUser(user));
}
