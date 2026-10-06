import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Bot, Camera, Check, Crown, Dumbbell, ImageIcon, Loader2, RotateCcw, Sparkles, Swords, Target, Ticket, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { CAN_PURCHASE, useIsPro, useSubscriptionStore } from '@/stores/subscription-store';
import { checkCoupon, getBillingStatus, redeemCoupon, type CouponInfo, type ProPlan } from '@/services/billing';
import { buyPro, isPurchaseCancelled, loadPlayPrices, restorePro } from '@/lib/play-billing';
import { BRAND } from '@/lib/brand';

const FEATURES = [
  { icon: Bot, title: 'Unlimited AI coach', body: 'Ask anything about your training and nutrition, any time.' },
  { icon: Dumbbell, title: 'Unlimited AI workout plans', body: 'Fresh programs built from your history and goals.' },
  { icon: Camera, title: 'Unlimited food scans', body: 'Snap a meal, get calories and macros instantly.' },
  { icon: ImageIcon, title: 'Every share template', body: 'Overview, Poster, Photo and Sticker cards.' },
  { icon: BarChart3, title: 'Advanced analytics', body: 'Fitness & freshness, VO2 max, best efforts, muscle recovery, 1RM progress and your real calorie burn.' },
  { icon: Target, title: 'Readiness, goals & heatmap', body: 'Daily readiness score, weekly to yearly goals, month-vs-month charts, a personal route heatmap and hill-adjusted pace.' },
  { icon: Swords, title: 'Compare with friends', body: 'You vs athletes you follow: who is improving faster in training and nutrition, why, and what to do next.' },
];

export function PaywallSheet() {
  const { open, reason } = useSubscriptionStore(s => s.paywall);
  const close = useSubscriptionStore(s => s.closePaywall);
  const plans = useSubscriptionStore(s => s.enabled);
  const isPro = useIsPro();
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const [plan, setPlan] = useState<ProPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [prices, setPrices] = useState<Partial<Record<ProPlan, string>> | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<CouponInfo | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    if (!open) { setBusy(false); setShowCoupon(false); setCode(''); setCoupon(null); return; }
    if (CAN_PURCHASE && plans && !prices) loadPlayPrices().then(setPrices).catch(() => setPrices({}));
  }, [open, plans, prices]);

  const applyCoupon = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3) return;
    setCouponBusy(true);
    try {
      setCoupon(await checkCoupon(trimmed));
    } catch (err: any) {
      setCoupon(null);
      showToast(err?.message || 'That code isn\'t valid.', 'error');
    } finally {
      setCouponBusy(false);
    }
  };

  const redeemFree = async () => {
    if (!coupon) return;
    setCouponBusy(true);
    try {
      const res = await redeemCoupon(coupon.code);
      const until = new Date(res.until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      showToast(`Pro unlocked until ${until}. Enjoy!`, 'success');
      getBillingStatus().then(useSubscriptionStore.getState().setStatus).catch(() => {});
      close();
    } catch (err: any) {
      showToast(err?.message || 'Could not redeem this code.', 'error');
    } finally {
      setCouponBusy(false);
    }
  };

  const refreshStatus = () => getBillingStatus().then(useSubscriptionStore.getState().setStatus).catch(() => {});

  const checkout = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const pro = await buyPro(plan, user.uid);
      refreshStatus();
      if (pro) {
        showToast(`Welcome to ${BRAND.name} Pro!`, 'success');
        close();
      } else {
        showToast('Payment is pending. Pro unlocks as soon as Google Play confirms it.', 'info');
      }
    } catch (err: any) {
      if (!isPurchaseCancelled(err)) showToast(err?.message || 'Could not complete the purchase.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const pro = await restorePro();
      refreshStatus();
      showToast(pro ? 'Pro restored.' : 'No Pro subscription found on this Google account.', pro ? 'success' : 'info');
      if (pro) close();
    } catch (err: any) {
      showToast(err?.message || 'Could not restore right now.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const price = prices?.[plan];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="paywall"
          className="dx fixed inset-0 z-[10040] flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${BRAND.name} Pro`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] dx-card !rounded-b-none sm:!rounded-[28px]"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
          >
            <div className="dx-hero !rounded-none sm:!rounded-t-[28px] px-5 pt-6 pb-5">
              <button type="button" onClick={close} aria-label="Close" className="dx-hero-icon !w-9 !h-9 absolute right-4 top-4">
                <X size={16} />
              </button>
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] opacity-80">
                <Crown size={14} /> {BRAND.name} Pro
              </div>
              <h2 className="mt-2 text-[24px] leading-tight font-semibold">
                {isPro ? "You're on Pro" : 'Train smarter, without limits'}
              </h2>
              {reason && !isPro && <p className="mt-2 text-[13px] opacity-85 leading-snug">{reason}</p>}
            </div>

            <div className="px-5 pt-4">
              <ul className="space-y-3">
                {FEATURES.map(f => (
                  <li key={f.title} className="flex gap-3">
                    <span className="dx-badge-icon !w-9 !h-9 !rounded-xl shrink-0" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
                      <f.icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{f.title}</span>
                      <span className="block text-[12.5px] dx-muted leading-snug">{f.body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {isPro ? (
                <div className="mt-5 flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--dx-success)' }}>
                  <Check size={18} /> All Pro features are unlocked.
                </div>
              ) : (
                <>
                  {CAN_PURCHASE && plans && (
                  <div className="mt-5 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Plan">
                    {(['yearly', 'monthly'] as ProPlan[]).map(p => {
                      const selected = plan === p;
                      const amount = prices?.[p];
                      return (
                        <button
                          key={p}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setPlan(p)}
                          disabled={prices !== null && !amount}
                          className="relative text-left rounded-2xl p-3.5 transition-colors disabled:opacity-40"
                          style={{
                            border: `1.5px solid ${selected ? 'var(--dx-accent)' : 'var(--dx-border)'}`,
                            background: selected ? 'var(--dx-accent-soft)' : 'var(--dx-card-2)',
                          }}
                        >
                          {p === 'yearly' && (
                            <span className="dx-pill dx-pill--accent absolute -top-2.5 right-3 !h-5 !text-[10px]">Best value</span>
                          )}
                          <span className="block text-[12px] dx-muted font-semibold uppercase tracking-wide">{p === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                          <span className="block mt-1 text-[20px] font-semibold tabular min-h-[28px]">
                            {amount ?? (prices === null ? <Loader2 size={16} className="animate-spin mt-1.5" /> : '—')}
                          </span>
                          <span className="block text-[12px] dx-muted">per {p === 'yearly' ? 'year' : 'month'}</span>
                        </button>
                      );
                    })}
                  </div>
                  )}

                  <div className="mt-3">
                    {!showCoupon && !coupon ? (
                      <button type="button" onClick={() => setShowCoupon(true)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: 'var(--dx-accent)' }}>
                        <Ticket size={14} /> Have a coupon code?
                      </button>
                    ) : coupon ? (
                      <div className="dx-inset p-3 flex items-center gap-2.5">
                        <Ticket size={16} className="shrink-0" style={{ color: 'var(--dx-accent)' }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold font-mono">{coupon.code}</div>
                          <div className="text-[12px] dx-muted leading-snug">
                            {coupon.label || `${coupon.days} days of Pro, free`}
                          </div>
                        </div>
                        <button type="button" onClick={() => { setCoupon(null); setCode(''); }} aria-label="Remove coupon" className="dx-icon-btn dx-icon-btn--sm !w-8 !h-8">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={e => { e.preventDefault(); applyCoupon(); }} className="flex gap-2">
                        <input
                          value={code}
                          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
                          placeholder="ENTER CODE"
                          autoFocus
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          className="dx-input flex-1 !h-10 font-mono tracking-wider"
                          aria-label="Coupon code"
                        />
                        <button type="submit" disabled={couponBusy || code.trim().length < 3} className="dx-btn-secondary !h-10 !px-4 !text-[13px]">
                          {couponBusy ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                        </button>
                      </form>
                    )}
                  </div>

                  {coupon ? (
                    <button type="button" onClick={redeemFree} disabled={couponBusy} className="dx-btn w-full mt-4 !h-12 !text-[15px]">
                      {couponBusy ? <Loader2 size={18} className="animate-spin" /> : <Crown size={17} />}
                      {couponBusy ? 'Unlocking…' : `Redeem · ${coupon.days} days of Pro free`}
                    </button>
                  ) : CAN_PURCHASE && plans ? (
                    <button type="button" onClick={checkout} disabled={busy || !price} className="dx-btn w-full mt-4 !h-12 !text-[15px]">
                      {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={17} />}
                      {busy ? 'Opening Google Play…' : price ? `Get Pro · ${price}/${plan === 'yearly' ? 'year' : 'month'}` : 'Get Pro'}
                    </button>
                  ) : null}
                  {CAN_PURCHASE && plans && (
                    <>
                      <p className="mt-3 text-center text-[11.5px] dx-muted leading-snug">
                        Billed through Google Play. Renews automatically; cancel anytime in Google Play → Subscriptions.
                      </p>
                      <button type="button" onClick={restore} disabled={restoring} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold dx-muted">
                        {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore purchase
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
