import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, Camera, Check, ChevronDown, Crown, Dumbbell, ImageIcon, Loader2, Minus, RotateCcw, Sparkles, Swords, Tag, Target, Ticket, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { CAN_PURCHASE, CAN_UPSELL, useIsPro, useSubscriptionStore } from '@/stores/subscription-store';
import { checkCoupon, getBillingStatus, redeemCoupon, type CouponInfo, type ProPlan } from '@/services/billing';
import { buyPro, isPurchaseCancelled, loadPlayPrices, manageProSubscription, restorePro, type PlayPrice } from '@/lib/play-billing';
import { PLAN_META, PRO_PLANS, discountPct, planDisplay, useProPricing } from '@/lib/pro-pricing';
import { BRAND } from '@/lib/brand';

const HIGHLIGHTS = [
  { icon: Bot, title: 'Unlimited AI coach', body: 'Ask anything about your training and nutrition, any time.' },
  { icon: Dumbbell, title: 'Unlimited AI workout plans', body: 'Fresh programs built from your history and goals.' },
  { icon: Camera, title: 'Unlimited food scans', body: 'Snap a meal, get calories and macros instantly.' },
  { icon: BarChart3, title: 'Advanced analytics', body: 'Fitness & freshness, VO2 max, best efforts, muscle recovery and 1RM progress.' },
  { icon: Target, title: 'Readiness, goals & heatmap', body: 'Daily readiness, weekly to yearly goals and your personal route heatmap.' },
  { icon: Swords, title: 'Compare with friends', body: 'See who is improving faster, why, and what to do next.' },
  { icon: ImageIcon, title: 'Every share template', body: 'Premium cards for workouts, runs and rides.' },
];

type Cell = boolean | string;
const PERIOD: Record<string, string> = { day: '/ day', week: '/ week', month: '/ month', lifetime: 'total' };

function freeLimit(usage: Record<string, { limit: number; period: string }>, kind: string, fallback: string): string {
  const u = usage[kind];
  return u ? `${u.limit} ${PERIOD[u.period] || ''}`.trim() : fallback;
}

function freeCouponText(coupon: CouponInfo): string {
  if (!coupon.until) return `${coupon.days} days of Pro free`;
  return `Pro free until ${new Date(coupon.until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function CellValue({ value, pro }: { value: Cell; pro?: boolean }) {
  if (value === true) return <Check size={17} strokeWidth={2.6} style={{ color: pro ? 'var(--dx-accent)' : 'var(--dx-success)' }} aria-label="Included" />;
  if (value === false) return <Minus size={16} className="dx-muted opacity-60" aria-label="Not included" />;
  return <span className={`text-[12px] leading-tight ${pro ? 'font-semibold' : 'dx-muted'}`}>{value}</span>;
}

export function ProPage() {
  const navigate = useNavigate();
  const { reason, redeem } = useSubscriptionStore(s => s.paywall);
  const purchasable = useSubscriptionStore(s => s.enabled && s.purchasable);
  const usage = useSubscriptionStore(s => s.usage);
  const entitlement = useSubscriptionStore(s => s.entitlement);
  const comped = useSubscriptionStore(s => s.comped);
  const isPro = useIsPro();
  const pricing = useProPricing();
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const canBuy = CAN_PURCHASE && purchasable;

  const [prices, setPrices] = useState<Record<string, PlayPrice> | null>(null);
  const [plan, setPlan] = useState<ProPlan>('yearly');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCoupon, setShowCoupon] = useState(!!redeem);
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<CouponInfo | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => { if (redeem) setShowCoupon(true); }, [redeem]);
  useEffect(() => {
    if (canBuy && !prices) loadPlayPrices().then(setPrices).catch(() => setPrices({}));
  }, [canBuy, prices]);

  // Plans the admin has on sale; in the app, only those Google Play actually sells.
  const plans = PRO_PLANS.filter(p => pricing.plans[p].enabled && (!canBuy || prices === null || !!prices[p]));
  const planKey = plans.join(',');
  useEffect(() => {
    if (plans.length && !plans.includes(plan)) setPlan(plans.includes('yearly') ? 'yearly' : plans[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, plan]);

  const displays = plans.map(p => planDisplay(p, pricing, prices?.[p]));
  const selected = displays.find(d => d.plan === plan);
  const bestPct = Math.max(0, ...plans.map(p => discountPct(pricing.plans[p])));
  const couponPrice = coupon?.basePlanId ? prices?.[coupon.basePlanId]?.priceString : undefined;
  const couponPeriod = coupon?.plan && coupon.plan !== 'any' ? PLAN_META[coupon.plan].period : 'month';

  const refreshStatus = () => getBillingStatus().then(useSubscriptionStore.getState().setStatus).catch(() => {});
  const leave = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/', { replace: true }));

  const checkout = async (basePlan: string = plan) => {
    if (!user) return;
    setBusy(true);
    try {
      const pro = await buyPro(basePlan, user.uid);
      refreshStatus();
      if (pro) {
        showToast(`Welcome to ${BRAND.name} Pro!`, 'success');
      } else {
        showToast('Payment is pending. Pro unlocks as soon as Google Play confirms it.', 'info');
      }
    } catch (err: any) {
      if (!isPurchaseCancelled(err)) showToast(err?.message || 'Could not complete the purchase.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyCoupon = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3) return;
    setCouponBusy(true);
    try {
      const info = await checkCoupon(trimmed);
      if (info.type === 'discount' && !canBuy) {
        showToast('This discount works in the Android app from Google Play.', 'info');
        return;
      }
      setCoupon(info);
    } catch (err: any) {
      setCoupon(null);
      showToast(err?.message || 'That code isn\'t valid.', 'error');
    } finally {
      setCouponBusy(false);
    }
  };

  const redeemCode = async () => {
    if (!coupon) return;
    // Play would silently fall back to the full-price plan if the discounted one isn't live.
    if (coupon.type === 'discount' && !couponPrice) {
      showToast('This discount isn\'t available on Google Play yet. Please try again later.', 'error');
      return;
    }
    setCouponBusy(true);
    try {
      const res = await redeemCoupon(coupon.code);
      if (res.type === 'discount') {
        setCouponBusy(false);
        await checkout(res.basePlanId);
        return;
      }
      const until = new Date(res.until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      showToast(`Pro unlocked until ${until}. Enjoy!`, 'success');
      refreshStatus();
    } catch (err: any) {
      showToast(err?.message || 'Could not redeem this code.', 'error');
    } finally {
      setCouponBusy(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const pro = await restorePro();
      refreshStatus();
      showToast(pro ? 'Pro restored.' : 'No Pro subscription found on this Google account.', pro ? 'success' : 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not restore right now.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const rows: { label: string; free: Cell; pro: Cell }[] = [
    { label: 'Workout, cardio & GPS tracking', free: true, pro: true },
    { label: 'Steps, nutrition log & progress', free: true, pro: true },
    { label: 'Community, clans & challenges', free: true, pro: true },
    { label: 'AI coach, recipes & meal plans', free: freeLimit(usage, 'ai_call', '3 / day'), pro: 'Unlimited' },
    { label: 'Food photo scans', free: freeLimit(usage, 'food_scan', '2 / day'), pro: 'Unlimited' },
    { label: 'AI workout plans', free: freeLimit(usage, 'workout_plan', '1 total'), pro: 'Unlimited' },
    { label: 'AI session summaries', free: freeLimit(usage, 'ai_summary', '1 / week'), pro: 'Unlimited' },
    { label: 'Weekly AI coach report', free: false, pro: true },
    { label: 'Advanced analytics & race predictions', free: false, pro: true },
    { label: 'Readiness, goals & route heatmap', free: false, pro: true },
    { label: 'Compare with friends', free: false, pro: true },
    { label: 'A→B route planner', free: false, pro: true },
    { label: 'Share templates', free: 'Standard', pro: 'All' },
    { label: 'Pro badge on your profile', free: false, pro: true },
  ];

  const couponBox = (
    <div className="dx-card p-4">
      {!showCoupon && !coupon ? (
        <button type="button" onClick={() => setShowCoupon(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--dx-accent)' }}>
          <Ticket size={15} /> Have a coupon code?
        </button>
      ) : coupon ? (
        <>
          <div className="dx-inset p-3 flex items-center gap-2.5">
            <Ticket size={16} className="shrink-0" style={{ color: 'var(--dx-accent)' }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold font-mono">{coupon.code}</div>
              <div className="text-[12px] dx-muted leading-snug">
                {coupon.label || (coupon.type === 'discount' ? `One-time discount${couponPrice ? ` · ${couponPrice} for ${couponPeriod === 'month' ? 'one month' : couponPeriod}` : ''}` : freeCouponText(coupon))}
              </div>
            </div>
            <button type="button" onClick={() => { setCoupon(null); setCode(''); }} aria-label="Remove coupon" className="dx-icon-btn dx-icon-btn--sm !w-8 !h-8">
              <X size={14} />
            </button>
          </div>
          <button type="button" onClick={redeemCode} disabled={couponBusy || busy} className="dx-btn w-full mt-3 !h-12 !text-[15px]">
            {couponBusy || busy ? <Loader2 size={18} className="animate-spin" /> : <Crown size={17} />}
            {coupon.type === 'discount'
              ? (busy ? 'Opening Google Play…' : `Get Pro${couponPrice ? ` · ${couponPrice}` : ' with this discount'}`)
              : (couponBusy ? 'Unlocking…' : `Redeem · ${freeCouponText(coupon)}`)}
          </button>
        </>
      ) : (
        <form onSubmit={e => { e.preventDefault(); applyCoupon(); }}>
          <label htmlFor="pro-coupon" className="block text-[13px] font-semibold mb-2">Coupon code</label>
          <div className="flex gap-2">
            <input
              id="pro-coupon"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
              placeholder="ENTER CODE"
              autoFocus={!!redeem}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="dx-input flex-1 !h-11 font-mono tracking-wider"
            />
            <button type="submit" disabled={couponBusy || code.trim().length < 3} className="dx-btn-secondary !h-11 !px-4 !text-[13px]">
              {couponBusy ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  // iPhone app: App Store rules allow redeeming codes but no prices or purchase links.
  if (!CAN_UPSELL) {
    return (
      <div className="dx pro-scope w-full min-w-0 max-w-xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
        <h1 className="text-[24px] font-semibold tracking-tight">Redeem a code</h1>
        {isPro ? <p className="text-[14px] dx-muted">All Pro features are unlocked on this account.</p> : couponBox}
      </div>
    );
  }

  const renews = entitlement.renewsAt ? new Date(entitlement.renewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <div className="dx pro-scope w-full min-w-0 max-w-3xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <section className="dx-hero rounded-[28px] px-5 pt-6 pb-6 relative overflow-hidden">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] opacity-80">
          <Crown size={14} /> {BRAND.name} Pro
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[30px] leading-tight font-semibold">
          {isPro ? "You're on Pro" : 'Train smarter, without limits'}
        </h1>
        <p className="mt-2 text-[13.5px] opacity-85 leading-snug max-w-md">
          {isPro
            ? comped ? 'Pro is on the house for this account.' : renews ? `${entitlement.status === 'cancelled' ? 'Ends' : entitlement.status === 'granted' ? 'Free until' : 'Renews on'} ${renews}.` : 'All Pro features are unlocked.'
            : reason || 'Unlimited AI coaching, advanced analytics and every premium feature.'}
        </p>
        {!isPro && bestPct > 0 && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-bold" style={{ background: 'linear-gradient(135deg,#f5b544,#d97706)', color: '#1a1206' }}>
            <Tag size={13} /> {pricing.label || 'Limited-time offer'} · up to {bestPct}% off
          </div>
        )}
      </section>

      {!isPro && (
        <section aria-label="Choose a plan" className="space-y-2.5">
          <div role="radiogroup" aria-label="Plan" className="space-y-2.5">
            {displays.map(d => {
              const on = plan === d.plan;
              const meta = PLAN_META[d.plan];
              return (
                <button
                  key={d.plan}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPlan(d.plan)}
                  className="relative w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-colors"
                  style={{
                    border: `1.5px solid ${on ? 'var(--dx-accent)' : 'var(--dx-border)'}`,
                    background: on ? 'var(--dx-accent-soft)' : 'var(--dx-card)',
                  }}
                >
                  {d.plan === 'yearly' && plans.length > 1 && (
                    <span className="dx-pill dx-pill--accent absolute -top-2.5 left-4 !h-5 !text-[10px]">Best value</span>
                  )}
                  <span
                    className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                    style={{ border: `2px solid ${on ? 'var(--dx-accent)' : 'var(--dx-border-strong, var(--dx-border))'}` }}
                    aria-hidden
                  >
                    {on && <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--dx-accent)' }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{meta.label}</span>
                    <span className="block text-[12px] dx-muted leading-snug">
                      {d.perMonth ? `${d.perMonth}/month` : 'Billed monthly'}
                      {d.savesVsMonthly > 0 && ` · save ${d.savesVsMonthly}% vs monthly`}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    {d.pct > 0 && (
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="text-[12px] dx-muted line-through tabular">{d.mrp}</span>
                        <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: 'var(--dx-success)', color: '#fff' }}>{d.pct}% OFF</span>
                      </span>
                    )}
                    <span className="block text-[19px] font-semibold tabular leading-tight">{d.price}</span>
                    <span className="block text-[11px] dx-muted">per {meta.period}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {canBuy ? (
            <>
              <button type="button" onClick={() => checkout()} disabled={busy || !selected || prices === null || !prices[plan]} className="dx-btn w-full !h-[52px] !text-[15.5px]">
                {busy || prices === null ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={17} />}
                {busy ? 'Opening Google Play…' : selected ? `Continue · ${selected.price} / ${PLAN_META[plan].period}` : 'Continue'}
              </button>
              <p className="text-center text-[11.5px] dx-muted leading-snug px-2">
                Billed through Google Play. Renews automatically at the same price; cancel anytime in Google Play → Subscriptions.
              </p>
              <button type="button" onClick={restore} disabled={restoring} className="w-full inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold dx-muted">
                {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore purchase
              </button>
            </>
          ) : (
            <p className="dx-inset p-3 text-[12.5px] dx-muted leading-snug">
              {CAN_PURCHASE
                ? 'Subscriptions open very soon. Have a code? Redeem it below.'
                : `Get ${BRAND.name} Pro in our Android app on Google Play. It unlocks Pro here too. Have a code? Redeem it below.`}
            </p>
          )}
        </section>
      )}

      {!isPro && couponBox}

      {isPro && CAN_PURCHASE && entitlement.subscriptionId && !comped && entitlement.status !== 'granted' && (
        <button type="button" onClick={() => manageProSubscription().catch(() => {})} className="dx-btn-secondary w-full !h-11">
          Manage subscription in Google Play
        </button>
      )}

      <section className="dx-card p-4 sm:p-5">
        <h2 className="text-[17px] font-semibold">Free vs Pro</h2>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_76px_76px] text-[13px]">
          <div />
          <div className="text-center text-[11px] font-semibold uppercase tracking-wide dx-muted pb-2">Free</div>
          <div className="text-center text-[11px] font-semibold uppercase tracking-wide pb-2 rounded-t-xl pt-1.5 flex items-center justify-center gap-1" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
            <Crown size={11} /> Pro
          </div>
          {rows.map((r, i) => (
            <div key={r.label} className="contents">
              <div className="py-2.5 pr-2 leading-snug" style={{ borderTop: '1px solid var(--dx-border)' }}>{r.label}</div>
              <div className="py-2.5 flex items-center justify-center text-center" style={{ borderTop: '1px solid var(--dx-border)' }}><CellValue value={r.free} /></div>
              <div
                className={`py-2.5 flex items-center justify-center text-center ${i === rows.length - 1 ? 'rounded-b-xl' : ''}`}
                style={{ borderTop: '1px solid var(--dx-border)', background: 'var(--dx-accent-soft)' }}
              >
                <CellValue value={r.pro} pro />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] dx-muted">Unlimited AI is subject to fair use to keep the service fast for everyone.</p>
      </section>

      <section className="dx-card p-4 sm:p-5">
        <h2 className="text-[17px] font-semibold mb-3">What you get with Pro</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HIGHLIGHTS.map(f => (
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
      </section>

      <section className="dx-card p-4 sm:p-5">
        <h2 className="text-[17px] font-semibold mb-1">Questions</h2>
        {[
          { q: 'Can I cancel anytime?', a: 'Yes. Cancel in Google Play → Subscriptions. You keep Pro until the end of the period you paid for.' },
          { q: 'Does Pro work on the website too?', a: 'Yes. Pro is tied to your account, so it unlocks everywhere you sign in.' },
          { q: 'What happens to my data if I stop Pro?', a: 'Nothing is deleted. Your workouts, runs and history stay; only Pro features lock again.' },
          { q: 'Will my price change?', a: 'Your subscription renews at the price you signed up at. New prices only apply to new subscriptions.' },
        ].map(f => (
          <details key={f.q} className="group py-2.5" style={{ borderTop: '1px solid var(--dx-border)' }}>
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-[14px] font-semibold">
              {f.q} <ChevronDown size={16} className="dx-muted shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1.5 text-[13px] dx-muted leading-snug">{f.a}</p>
          </details>
        ))}
      </section>

      <button type="button" onClick={leave} className="w-full text-center text-[13px] font-semibold dx-muted py-2">
        {isPro ? 'Back' : 'Maybe later'}
      </button>
    </div>
  );
}
