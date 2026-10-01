import { auth } from '@/lib/firebase';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

export type ProPlan = 'monthly' | 'yearly';

/** Shown on the paywall; keep in sync with the Razorpay plan amounts. */
export const PRO_PRICES: Record<ProPlan, { amount: string; per: string; note?: string }> = {
  monthly: { amount: '₹149', per: 'month' },
  yearly: { amount: '₹999', per: 'year', note: 'Save 44%' },
};

export interface QuotaUsage { used: number; limit: number; period: 'day' | 'week' | 'month' | 'lifetime' }

export interface BillingStatus {
  enabled: boolean;
  plans: ProPlan[];
  entitlement: { pro: boolean; plan?: string; status?: string; currentPeriodEnd?: number | null; subscriptionId?: string; provider?: string };
  usage: Record<string, QuotaUsage>;
}

/** Backend 402 body when a free-tier AI allowance is used up. */
export interface ProRequiredDetail { code: 'pro_required'; kind: string; limit: number; period: string; message: string }

export function isProRequired(detail: unknown): detail is ProRequiredDetail {
  return !!detail && typeof detail === 'object' && (detail as any).code === 'pro_required';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const res = await fetch(`${API_BASE}/billing${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Something went wrong. Please try again.');
  return body as T;
}

export const getBillingStatus = () => request<BillingStatus>('/status');

export const startSubscription = (plan: ProPlan, coupon?: string) =>
  request<{ subscription_id: string; short_url?: string; key_id: string }>('/subscribe', { method: 'POST', body: JSON.stringify({ plan, coupon: coupon || undefined }) });

export interface CouponInfo { code: string; type: 'free' | 'discount'; label: string; days: number; plan: 'any' | ProPlan }

export const checkCoupon = (code: string, plan?: ProPlan) =>
  request<CouponInfo>('/coupon/check', { method: 'POST', body: JSON.stringify({ code, plan }) });

export const redeemCoupon = (code: string) =>
  request<{ ok: boolean; days: number; until: number }>('/coupon/redeem', { method: 'POST', body: JSON.stringify({ code }) });

/** Only ever send users to Razorpay's own hosted pages. */
export function isRazorpayCheckoutUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'rzp.io' || u.hostname === 'razorpay.com' || u.hostname.endsWith('.razorpay.com'));
  } catch {
    return false;
  }
}

export const verifySubscription = (payload: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) =>
  request<{ ok: boolean; pro: boolean }>('/verify', { method: 'POST', body: JSON.stringify(payload) });

export const cancelSubscription = () => request<{ ok: boolean }>('/cancel', { method: 'POST' });

let checkoutScript: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  if (!checkoutScript) {
    checkoutScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { checkoutScript = null; reject(new Error('Could not load checkout')); };
      document.head.appendChild(s);
    });
  }
  return checkoutScript;
}
