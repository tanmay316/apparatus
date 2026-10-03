import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useSubscriptionStore, type Entitlement } from '@/stores/subscription-store';
import { getBillingStatus } from '@/services/billing';
import { PLAY_BILLING, restorePro } from '@/lib/play-billing';

const GRACE_MS = 3 * 24 * 3600 * 1000;

/** Mirrors backend compute_pro: active plans get a short grace window, cancelled plans run to period end. */
export function entitlementIsPro(status: string | undefined, endMs: number | null, now = Date.now()): boolean {
  if (status === 'active' || status === 'grace') return endMs == null || endMs + GRACE_MS > now;
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
    let restored = false;
    const refresh = () => {
      if (Date.now() - lastFetch < 60_000) return;
      lastFetch = Date.now();
      getBillingStatus().then(status => {
        useSubscriptionStore.getState().setStatus(status);
        // Picks up a Play purchase that was paid but never confirmed (app closed mid-purchase).
        if (PLAY_BILLING && status.enabled && !status.entitlement?.pro && !restored) {
          restored = true;
          restorePro().catch(() => {});
        }
      }).catch(() => {});
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
