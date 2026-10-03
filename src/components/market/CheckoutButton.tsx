import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
  DEFAULT_MARKET_CONFIG, formatInr, getMarketConfig, openPaymentPage, refreshOrder, startCheckout, subscribePayoutAccount,
  type MarketConfig, type MarketKind, type OrderView, type PayoutAccount,
} from '@/services/market';

export function useMarketConfig() {
  const q = useQuery({ queryKey: ['marketConfig'], queryFn: getMarketConfig, staleTime: 60 * 60_000, retry: 1 });
  return useMemo<MarketConfig>(
    () => (q.data ? { ...DEFAULT_MARKET_CONFIG, ...q.data, seller: { ...DEFAULT_MARKET_CONFIG.seller, ...q.data.seller } } : DEFAULT_MARKET_CONFIG),
    [q.data],
  );
}

/** Live payout account for the signed-in seller (undefined while loading). */
export function usePayoutAccount(uid: string | undefined) {
  const [acc, setAcc] = useState<PayoutAccount | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) { setAcc(null); return; }
    return subscribePayoutAccount(uid, setAcc);
  }, [uid]);
  return acc;
}

const POLL_MS = 4000;
const GIVE_UP_MS = 15 * 60_000;

/** Waits for Razorpay to confirm a payment, polling the backend while the app is in front. */
export function PaymentWaitSheet({ order, onClose, onPaid }: { order: OrderView; onClose: () => void; onPaid: (o: OrderView) => void }) {
  const { showToast } = useUIStore();
  const [status, setStatus] = useState<OrderView['status']>(order.status);
  const [checking, setChecking] = useState(false);
  const started = useRef(Date.now());
  const done = useRef(false);

  const check = async (manual = false) => {
    if (done.current) return;
    setChecking(true);
    try {
      const fresh = await refreshOrder(order.orderId);
      setStatus(fresh.status);
      if (fresh.status === 'fulfilled') {
        done.current = true;
        onPaid(fresh);
      } else if (fresh.status === 'refund_due') {
        done.current = true;
        showToast('Payment received, but this item was removed. We\'ll refund you.', 'info');
      } else if (manual && fresh.status === 'created') {
        showToast('We haven\'t received the payment yet. It can take a few seconds.', 'info');
      }
    } catch (err: any) {
      if (manual) showToast(err?.message || 'Could not check the payment', 'error');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - started.current < GIVE_UP_MS) check();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.orderId]);

  const paid = status === 'fulfilled';
  const closed = status === 'expired' || status === 'cancelled' || status === 'refund_due';

  return createPortal(
    <motion.div className="dx fixed inset-0 z-[10040] flex items-end sm:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Payment"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="relative w-full sm:max-w-sm dx-card !rounded-b-none sm:!rounded-[28px] rounded-t-[28px] p-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="dx-icon-btn absolute right-4 top-4"><X size={16} /></button>
        <div className="flex flex-col items-center text-center pt-2">
          {paid ? <CheckCircle2 size={44} style={{ color: 'var(--dx-success)' }} /> : closed ? <X size={40} className="dx-muted" /> : <Loader2 size={40} className="animate-spin dx-accent" />}
          <h3 className="mt-3 text-[18px] font-semibold">
            {paid ? 'You\'re in!' : closed ? (status === 'refund_due' ? 'Refund on the way' : 'Payment link expired') : 'Finish paying in the browser'}
          </h3>
          <p className="mt-1 text-[13px] dx-muted leading-snug">
            {paid ? order.title : closed ? 'No money was taken for an expired link. Start again any time.' : `${order.title} · ${formatInr(order.amount / 100)}. Come back here when you're done; we'll confirm automatically.`}
          </p>
        </div>
        {!paid && !closed && (
          <div className="mt-5 grid gap-2">
            <button type="button" className="dx-btn" disabled={checking} onClick={() => check(true)}>
              {checking ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} I've paid
            </button>
            {order.shortUrl && (
              <button type="button" className="dx-btn-secondary" onClick={() => openPaymentPage(order.shortUrl).catch(() => {})}>
                <ExternalLink size={14} /> Open payment page again
              </button>
            )}
          </div>
        )}
        {(paid || closed) && <button type="button" className="dx-btn mt-5 w-full" onClick={onClose}>Done</button>}
        <p className="mt-4 text-center text-[11px] dx-muted">Pay with any UPI app, card or netbanking. Processed securely by Razorpay.</p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** "Get ticket · ₹199" style button that runs the whole checkout. */
export function CheckoutButton({ kind, itemId, className, children, onPurchased, disabled }: {
  kind: MarketKind;
  itemId: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  onPurchased?: (order: OrderView) => void;
}) {
  const { showToast } = useUIStore();
  const config = useMarketConfig();
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<OrderView | null>(null);

  const buy = async () => {
    if (!config.enabled) {
      showToast('This isn\'t available right now.', 'info');
      return;
    }
    // Open the tab synchronously so the browser doesn't block it as a popup.
    const tab = Capacitor.isNativePlatform() ? null : window.open('', '_blank');
    setBusy(true);
    try {
      const o = await startCheckout(kind, itemId);
      if (o.status === 'fulfilled') {
        tab?.close();
        onPurchased?.(o);
        return;
      }
      await openPaymentPage(o.shortUrl, tab);
      setOrder(o);
    } catch (err: any) {
      tab?.close();
      showToast(err?.message || 'Could not start checkout', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={buy} disabled={busy || disabled} className={className}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {children}
      </button>
      <AnimatePresence>
        {order && (
          <PaymentWaitSheet
            key={order.orderId}
            order={order}
            onClose={() => setOrder(null)}
            onPaid={(o) => { showToast('Payment confirmed', 'success'); onPurchased?.(o); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
