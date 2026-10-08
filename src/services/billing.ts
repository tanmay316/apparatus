import { getSignedInUser } from '@/lib/firebase';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

export type ProPlan = 'monthly' | 'yearly';

export interface QuotaUsage { used: number; limit: number; period: 'day' | 'week' | 'month' | 'lifetime' }

export interface BillingStatus {
  enabled: boolean;
  /** Google Play purchases can be verified by the server. */
  purchasable?: boolean;
  plans: ProPlan[];
  play?: { productId: string; package: string };
  entitlement: { pro: boolean; plan?: string; status?: string; currentPeriodEnd?: number | null; subscriptionId?: string; provider?: string };
  usage: Record<string, QuotaUsage>;
}

/** Backend 402 body when a free-tier AI allowance is used up. */
export interface ProRequiredDetail { code: 'pro_required'; kind: string; limit: number; period: string; message: string }

export function isProRequired(detail: unknown): detail is ProRequiredDetail {
  return !!detail && typeof detail === 'object' && (detail as any).code === 'pro_required';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = await getSignedInUser();
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

/** Sends a Google Play purchase token to the server, which checks it with Google and unlocks Pro. */
export const verifyPlayPurchase = (purchaseToken: string) =>
  request<{ ok: boolean; pro: boolean }>('/play/verify', { method: 'POST', body: JSON.stringify({ purchase_token: purchaseToken }) });

/** `free` grants Pro days; `discount` unlocks a cheaper Google Play base plan for this account. */
export interface CouponInfo { code: string; type: 'free' | 'discount'; label: string; days: number; plan: ProPlan | 'any'; basePlanId: string | null }

export const checkCoupon = (code: string) =>
  request<CouponInfo>('/coupon/check', { method: 'POST', body: JSON.stringify({ code }) });

export type RedeemResult = { ok: boolean } & ({ type: 'free'; days: number; until: number } | { type: 'discount'; basePlanId: string });

export const redeemCoupon = (code: string) =>
  request<RedeemResult>('/coupon/redeem', { method: 'POST', body: JSON.stringify({ code }) });
