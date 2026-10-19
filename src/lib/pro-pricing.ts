import { useEffect, useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import type { PlayPrice } from '@/lib/play-billing';
import type { PlanPrice, PricingConfig, ProPlan } from '@/services/billing';

export const PRO_PLANS: ProPlan[] = ['monthly', 'sixmonth', 'yearly'];

export const PLAN_META: Record<ProPlan, { label: string; months: number; period: string }> = {
  monthly: { label: 'Monthly', months: 1, period: 'month' },
  sixmonth: { label: '6 months', months: 6, period: '6 months' },
  yearly: { label: 'Yearly', months: 12, period: 'year' },
};

/** Launch prices (₹), used until an admin changes them (admin_settings/pricing). */
export const DEFAULT_PRICING: PricingConfig = {
  plans: {
    monthly: { price: 200, mrp: 200, enabled: true },
    sixmonth: { price: 1200, mrp: 1200, enabled: true },
    yearly: { price: 2000, mrp: 2000, enabled: true },
  },
  label: '',
};

function parse(data: any): PricingConfig {
  const plans = { ...DEFAULT_PRICING.plans };
  for (const p of PRO_PLANS) {
    const c = data?.plans?.[p];
    if (c && Number(c.price) > 0) {
      const price = Number(c.price);
      plans[p] = { price, mrp: Math.max(price, Number(c.mrp) || price), enabled: c.enabled !== false };
    }
  }
  return { plans, label: typeof data?.label === 'string' ? data.label : '' };
}

let pricing: PricingConfig = DEFAULT_PRICING;
let subscribedUid: string | null = null;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

// One shared listener on admin_settings/pricing so price changes reach open screens instantly.
function follow(uid: string | null) {
  if (uid === subscribedUid) return;
  unsubscribe?.();
  unsubscribe = null;
  subscribedUid = uid;
  if (!uid) return;
  unsubscribe = onSnapshot(doc(db, 'admin_settings', 'pricing'), snap => {
    pricing = parse(snap.data());
    emit();
  }, () => {});
}

export function useProPricing(): PricingConfig {
  const uid = useAuthStore(s => s.user?.uid ?? null);
  useEffect(() => { follow(uid); }, [uid]);
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => pricing);
}

/** Whole-percent discount of the selling price against the regular (struck-through) price. */
export const discountPct = (p: PlanPrice) => (p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0);

export function formatMoney(amount: number, currency = 'INR'): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(digits)}`;
  }
}

export interface PlanDisplay {
  plan: ProPlan;
  price: string;
  /** Struck-through regular price, when discounted. */
  mrp: string | null;
  pct: number;
  /** Price per month for plans longer than a month. */
  perMonth: string | null;
  /** Saving against paying monthly for the same time. */
  savesVsMonthly: number;
}

/** What to show for a plan. Google Play's localised price wins; the admin ratio gives the struck price. */
export function planDisplay(plan: ProPlan, config: PricingConfig, play?: PlayPrice): PlanDisplay {
  const cfg = config.plans[plan];
  const { months } = PLAN_META[plan];
  const amount = play?.price ?? cfg.price;
  const currency = play?.currencyCode ?? 'INR';
  const round = (x: number) => (currency === 'INR' ? Math.round(x) : Math.round(x * 100) / 100);
  // If Play still charges something else in India (price not synced), don't advertise a discount.
  const matches = !play || currency !== 'INR' || Math.abs(play.price - cfg.price) < 1;
  const pct = matches ? discountPct(cfg) : 0;
  const monthly = config.plans.monthly;
  const savesVsMonthly = plan !== 'monthly' && monthly.price > 0
    ? Math.max(0, Math.round((1 - cfg.price / (monthly.price * months)) * 100))
    : 0;
  return {
    plan,
    price: play?.priceString || formatMoney(cfg.price),
    mrp: pct > 0 ? formatMoney(round(amount * cfg.mrp / cfg.price), currency) : null,
    pct,
    perMonth: months > 1 ? formatMoney(round(amount / months), currency) : null,
    savesVsMonthly,
  };
}

/** Short label for upsell rows, e.g. "₹200/month" or "from ₹167/month". */
export function proPriceLabel(config: PricingConfig): string {
  const live = PRO_PLANS.filter(p => config.plans[p].enabled);
  if (!live.length) return '';
  const cheapest = Math.min(...live.map(p => config.plans[p].price / PLAN_META[p].months));
  const label = `${formatMoney(Math.round(cheapest))}/month`;
  return live.length > 1 && cheapest < config.plans.monthly.price ? `from ${label}` : label;
}
