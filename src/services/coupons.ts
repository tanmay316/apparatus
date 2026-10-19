import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { logAdminAction } from '@/services/admin';
import { syncCouponGrants } from '@/services/billing';

/** `free`: Pro until a fixed date. `discount`: one purchase of a cheaper Play base plan (one billing period). */
export type CouponType = 'free' | 'discount';

export interface Coupon {
  code: string;
  type: CouponType;
  /** Days of Pro granted (free coupons). */
  days?: number;
  /** Play Console base plan id of the discounted plan, e.g. "monthly-49" (discount coupons). */
  basePlanId?: string;
  /** Legacy, unused. */
  offerId?: string;
  plan: 'any' | 'monthly' | 'sixmonth' | 'yearly';
  label: string;
  /** 0 = unlimited. */
  maxRedemptions: number;
  redeemedCount: number;
  expiresAt?: Timestamp | null;
  active: boolean;
  createdAt?: Timestamp;
}

export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
/** Same rule as the backend: Play base plan id, never one of the regular plans. */
export const BASE_PLAN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const isDiscountPlanId = (id: string) => BASE_PLAN_RE.test(id) && !['monthly', 'sixmonth', 'yearly'].includes(id);

/** 10 random chars without look-alikes (0/O, 1/I) - hard to guess, easy to read out. */
export function generateCouponCode(prefix = ''): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const random = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  return `${prefix ? `${prefix.toUpperCase()}-` : ''}${random}`.slice(0, 32);
}

export async function listCoupons(): Promise<Coupon[]> {
  const snap = await getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ ...(d.data() as Coupon), code: d.id }));
}

export async function createCoupon(input: Omit<Coupon, 'redeemedCount' | 'createdAt' | 'offerId'>): Promise<void> {
  const code = input.code.trim().toUpperCase();
  if (!COUPON_CODE_RE.test(code)) throw new Error('Codes are 3-32 characters: A-Z, 0-9, - and _.');
  const discount = input.type === 'discount';
  const basePlanId = (input.basePlanId || '').trim();
  if (discount && !isDiscountPlanId(basePlanId)) throw new Error('Enter the Play Console base plan id of the discounted plan (lowercase, digits, hyphens), e.g. monthly-49.');
  if (!discount && !(input.days && input.days >= 1 && input.days <= 3660)) throw new Error('Coupons need 1-3660 days.');
  if (!discount && !input.expiresAt) throw new Error('Pick the last day of Pro for this coupon.');
  const ref = doc(db, 'coupons', code);
  if ((await getDoc(ref)).exists()) throw new Error('That code already exists.');
  await setDoc(ref, {
    code,
    type: discount ? 'discount' : 'free',
    ...(discount ? { basePlanId, plan: input.plan === 'yearly' || input.plan === 'sixmonth' ? input.plan : 'monthly' } : { days: input.days, plan: 'any' }),
    label: input.label.trim().slice(0, 120),
    maxRedemptions: Math.max(0, Math.floor(input.maxRedemptions || 0)),
    redeemedCount: 0,
    expiresAt: input.expiresAt ?? null,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || '',
  });
  await logAdminAction('coupon.create', 'coupon', code, { label: input.label, details: discount ? `discount plan ${basePlanId}` : `${input.days} days free` });
}

export async function setCouponActive(coupon: Coupon, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'coupons', coupon.code), { active, type: coupon.type, label: coupon.label || '' });
  await logAdminAction(active ? 'coupon.enable' : 'coupon.disable', 'coupon', coupon.code);
  await syncGrants(coupon.code);
}

/** Moves the coupon's last day of Pro (also for everyone who already redeemed it). */
export async function setCouponEndDate(coupon: Coupon, expiresAt: Timestamp): Promise<void> {
  const days = Math.max(1, Math.min(3660, Math.ceil((expiresAt.toMillis() - Date.now()) / 86_400_000)));
  await updateDoc(doc(db, 'coupons', coupon.code), {
    expiresAt, type: coupon.type, label: coupon.label || '', ...(coupon.type === 'free' ? { days } : {}),
  });
  await logAdminAction('coupon.update', 'coupon', coupon.code, { details: `ends ${expiresAt.toDate().toDateString()}` });
  await syncGrants(coupon.code);
}

export async function deleteCoupon(code: string): Promise<void> {
  await deleteDoc(doc(db, 'coupons', code));
  await logAdminAction('coupon.delete', 'coupon', code);
  await syncGrants(code);
}

// The backend also watches coupons; this makes the change immediate and reports a failure.
async function syncGrants(code: string) {
  try {
    await syncCouponGrants(code);
  } catch (err) {
    console.warn('Coupon grant sync failed (the server retries on its own):', err);
  }
}
