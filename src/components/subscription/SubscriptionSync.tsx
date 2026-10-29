import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useSubscriptionStore, type Entitlement } from '@/stores/subscription-store';
import { getBillingStatus } from '@/services/billing';
import { PLAY_BILLING, hasPendingPurchase, restorePro } from '@/lib/play-billing';

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
    store.restore(uid);

    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(doc(db, 'users', uid, 'private', 'entitlement'), snap => {
      clearTimeout(expiryTimer);
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
      // Re-check when the end date passes (coupon grants have no renewal notice to wake us).
      if (entitlement.pro && endMs != null && (data.status === 'granted' || data.status === 'cancelled')) {
        const recheck = () => {
          const pro = entitlementIsPro(data.status, endMs);
          if (!pro) useSubscriptionStore.getState().setEntitlement({ ...entitlement, pro });
          else expiryTimer = setTimeout(recheck, Math.min(Math.max(1000, endMs - Date.now() + 1000), 2 ** 31 - 1));
        };
        expiryTimer = setTimeout(recheck, Math.min(Math.max(0, endMs - Date.now()) + 1000, 2 ** 31 - 1));
      }
    }, () => {});

    let lastFetch = 0;
    let lastRestore = 0;
    const refresh = () => {
      if (Date.now() - lastFetch < 60_000) return;
      lastFetch = Date.now();
      getBillingStatus().then(status => {
        useSubscriptionStore.getState().setStatus(status, uid);
        // Links a Play purchase that was paid but not confirmed yet (app closed mid-purchase, no network,
        // payment still processing). Retried on every resume until Pro shows up.
        const due = Date.now() - lastRestore > (hasPendingPurchase() ? 60_000 : 10 * 60_000);
        if (PLAY_BILLING && status.enabled && !status.entitlement?.pro && due) {
          lastRestore = Date.now();
          restorePro().then(pro => { if (pro) getBillingStatus().then(s => useSubscriptionStore.getState().setStatus(s, uid)).catch(() => {}); }).catch(() => {});
        }
      }).catch(() => {});
    };
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid]);

  return null;
}
