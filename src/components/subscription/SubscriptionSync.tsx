import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useSubscriptionStore, type Entitlement } from '@/stores/subscription-store';
import { getBillingStatus } from '@/services/billing';

const GRACE_MS = 3 * 24 * 3600 * 1000;

/** Mirrors backend compute_pro: renewals get a grace window, cancelled plans run to period end. */
export function entitlementIsPro(status: string | undefined, endMs: number | null, now = Date.now()): boolean {
  if (status === 'active' || status === 'authenticated' || status === 'pending') return endMs == null || endMs + GRACE_MS > now;
  if (status === 'cancelled' || status === 'granted') return endMs != null && endMs > now;
  return false;
}

/** Keeps the Pro entitlement live and refreshes billing config/usage on login and resume. */
export function SubscriptionSync() {
  const uid = useAuthStore(s => s.user?.uid);

  useEffect(() => {
    const store = useSubscriptionStore.getState();
    if (!uid) { store.reset(); return; }

    const unsub = onSnapshot(doc(db, 'users', uid, 'private', 'entitlement'), snap => {
      const data = snap.data();
      if (!data) { store.setEntitlement({ pro: false }); return; }
      const endMs = data.currentPeriodEnd?.toMillis?.() ?? null;
      const entitlement: Entitlement = {
        pro: entitlementIsPro(data.status, endMs),
        plan: data.plan,
        status: data.status,
        renewsAt: endMs,
        subscriptionId: data.subscriptionId,
      };
      useSubscriptionStore.getState().setEntitlement(entitlement);
    }, () => {});

    let lastFetch = 0;
    const refresh = () => {
      if (Date.now() - lastFetch < 60_000) return;
      lastFetch = Date.now();
      getBillingStatus().then(useSubscriptionStore.getState().setStatus).catch(() => {});
    };
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid]);

  return null;
}
