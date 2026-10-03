import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, where, type Timestamp,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { db, getSignedInUser } from '@/lib/firebase';
import { logAdminAction } from '@/services/admin';
import type { ChallengeV2, ClanV2, Plan, SimpleEvent, SponsorBadge } from '@/types';

const API_BASE = import.meta.env.VITE_NUTRITION_API_URL || 'http://localhost:8000/api/v1';

/** Only ever send buyers to Razorpay's own hosted payment pages. */
function isRazorpayCheckoutUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'rzp.io' || u.hostname === 'razorpay.com' || u.hostname.endsWith('.razorpay.com'));
  } catch {
    return false;
  }
}

export type MarketKind = 'event' | 'challenge' | 'clan' | 'plan';

export interface MarketConfig {
  enabled: boolean;
  fees: { ticket: number; coach: number };
  minPrice: number;
  maxPrice: number;
  seller: { minAccountDays: number; newSellerMonthlyLimit: number; trustedAfterSales: number; termsVersion: number };
}

/** Used until /market/config answers; mirrors the backend defaults. */
export const DEFAULT_MARKET_CONFIG: MarketConfig = {
  enabled: false, fees: { ticket: 10, coach: 20 }, minPrice: 19, maxPrice: 50000,
  seller: { minAccountDays: 7, newSellerMonthlyLimit: 10000, trustedAfterSales: 10, termsVersion: 1 },
};

export interface OrderView {
  orderId: string;
  status: 'created' | 'fulfilled' | 'expired' | 'cancelled' | 'refund_due';
  kind: MarketKind | 'sponsorship';
  itemId: string;
  title: string;
  amount: number;
  shortUrl?: string | null;
  result?: { planId?: string; reason?: string };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = await getSignedInUser();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const res = await fetch(`${API_BASE}/market${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Something went wrong. Please try again.');
  return body as T;
}

export const getMarketConfig = () => request<MarketConfig>('/config');

export const startCheckout = (kind: MarketKind, itemId: string) =>
  request<OrderView>('/checkout', {
    method: 'POST',
    body: JSON.stringify({ kind, item_id: itemId, return_to: Capacitor.isNativePlatform() ? 'app' : 'web' }),
  });

export const refreshOrder = (orderId: string) =>
  request<OrderView>(`/orders/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' });

export const quoteSponsorship = (sponsorshipId: string, amountInr: number) =>
  request<{ orderId: string; payUrl: string }>(`/admin/sponsorships/${encodeURIComponent(sponsorshipId)}/quote`, {
    method: 'POST', body: JSON.stringify({ amount_inr: amountInr }),
  });

export const retryTransfer = (orderId: string) =>
  request<{ status: string; error?: string }>(`/admin/orders/${encodeURIComponent(orderId)}/transfer`, { method: 'POST' });

/** Opens Razorpay's hosted payment page. `preopened` is a tab opened synchronously on click (avoids popup blockers). */
export async function openPaymentPage(url: string | null | undefined, preopened?: Window | null): Promise<void> {
  if (!isRazorpayCheckoutUrl(url ?? undefined)) {
    preopened?.close();
    throw new Error('Payment link unavailable. Please try again.');
  }
  if (Capacitor.isNativePlatform()) {
    await AppLauncher.openUrl({ url: url! });
    return;
  }
  if (preopened && !preopened.closed) {
    preopened.opener = null;
    preopened.location.href = url!;
    return;
  }
  if (!window.open(url!, '_blank', 'noopener')) window.location.href = url!;
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function sellerShare(price: number, feePct: number): number {
  return Math.max(0, price - Math.round((price * feePct)) / 100);
}

export function isPaid(price: unknown): price is number {
  return typeof price === 'number' && price > 0;
}

// ─── Payout accounts ─────────────────────────────────────────────

export type PayoutStatus = 'pending' | 'active' | 'rejected' | 'suspended';

export interface PayoutAccount {
  uid: string;
  legalName: string;
  email: string;
  phone: string;
  businessType: 'individual' | 'business';
  about?: string;
  status: PayoutStatus;
  razorpayAccountId?: string;
  adminNote?: string;
  trusted?: boolean;
  termsVersion?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export function subscribePayoutAccount(uid: string, cb: (acc: PayoutAccount | null) => void): () => void {
  return onSnapshot(doc(db, 'payout_accounts', uid), snap => cb(snap.exists() ? (snap.data() as PayoutAccount) : null), () => cb(null));
}

export async function getPayoutAccount(uid: string): Promise<PayoutAccount | null> {
  const snap = await getDoc(doc(db, 'payout_accounts', uid));
  return snap.exists() ? (snap.data() as PayoutAccount) : null;
}

/** Seller sign-up. The backend checks verified email + phone (from the ID token), account age, terms and bans. */
export const applyAsSeller = (input: { legalName: string; email: string; businessType: PayoutAccount['businessType']; about: string; termsVersion: number }) =>
  request<{ status: PayoutStatus }>('/seller/apply', {
    method: 'POST',
    body: JSON.stringify({
      legal_name: input.legalName.trim(), email: input.email.trim(), business_type: input.businessType,
      about: input.about.trim().slice(0, 500), terms_version: input.termsVersion,
    }),
  });

export async function setPayoutTrusted(uid: string, trusted: boolean) {
  await updateDoc(doc(db, 'payout_accounts', uid), { trusted, updatedAt: serverTimestamp() });
  await logAdminAction(trusted ? 'payout.trusted' : 'payout.untrusted', 'payout_account', uid, {});
}

export async function listPayoutAccounts(): Promise<PayoutAccount[]> {
  const snap = await getDocs(query(collection(db, 'payout_accounts'), limit(200)));
  return snap.docs.map(d => ({ ...(d.data() as PayoutAccount), uid: d.id }))
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
}

export async function reviewPayoutAccount(uid: string, decision: { status: PayoutStatus; razorpayAccountId?: string; adminNote?: string }) {
  if (decision.status === 'active' && !/^acc_[A-Za-z0-9]{6,40}$/.test(decision.razorpayAccountId || '')) {
    throw new Error('Paste the Razorpay linked account id (acc_...).');
  }
  await updateDoc(doc(db, 'payout_accounts', uid), {
    status: decision.status,
    ...(decision.razorpayAccountId !== undefined ? { razorpayAccountId: decision.razorpayAccountId.trim() } : {}),
    adminNote: (decision.adminNote || '').slice(0, 300),
    updatedAt: serverTimestamp(),
  });
  await logAdminAction(`payout.${decision.status}`, 'payout_account', uid, { details: decision.razorpayAccountId || decision.adminNote || '' });
}

// ─── Coach plan listings ─────────────────────────────────────────

export interface PlanListing {
  id: string;
  sellerId: string;
  sellerName?: string;
  sellerPhoto?: string;
  planId: string;
  kind: 'plan';
  title: string;
  description?: string;
  price: number;
  active: boolean;
  salesCount: number;
  preview?: { days: number; dayTitles: string[]; exercises: number; tags?: string[] };
  createdAt?: Timestamp;
}

export async function listActiveListings(): Promise<PlanListing[]> {
  const snap = await getDocs(query(collection(db, 'market_listings'), where('active', '==', true), limit(60)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PlanListing)).sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
}

export async function listMyListings(uid: string): Promise<PlanListing[]> {
  const snap = await getDocs(query(collection(db, 'market_listings'), where('sellerId', '==', uid), limit(60)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PlanListing));
}

export async function getListing(id: string): Promise<PlanListing | null> {
  const snap = await getDoc(doc(db, 'market_listings', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PlanListing) : null;
}

export function planPreview(plan: Plan, days: { title?: string; warmup?: unknown[]; skillWork?: unknown[]; strength?: unknown[]; cooldown?: unknown[] }[]) {
  return {
    days: days.length,
    dayTitles: days.slice(0, 14).map(d => String(d.title || '').slice(0, 60)),
    exercises: days.reduce((n, d) => n + (d.warmup?.length || 0) + (d.skillWork?.length || 0) + (d.strength?.length || 0) + (d.cooldown?.length || 0), 0),
    tags: (plan.tags || []).slice(0, 6).map(t => String(t).slice(0, 30)),
  };
}

export async function createListing(input: Omit<PlanListing, 'id' | 'salesCount' | 'createdAt' | 'kind' | 'active'>): Promise<string> {
  const ref = await addDoc(collection(db, 'market_listings'), {
    ...input,
    title: input.title.trim().slice(0, 80),
    description: (input.description || '').trim().slice(0, 2000),
    kind: 'plan',
    active: true,
    salesCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateListing(listing: PlanListing, patch: Partial<Pick<PlanListing, 'title' | 'description' | 'price' | 'active'>>) {
  if (patch.active === false && Object.keys(patch).length === 1) {
    await updateDoc(doc(db, 'market_listings', listing.id), { active: false, updatedAt: serverTimestamp() });
    return;
  }
  await updateDoc(doc(db, 'market_listings', listing.id), { ...patch, updatedAt: serverTimestamp() });
}

export const deleteListing = (id: string) => deleteDoc(doc(db, 'market_listings', id));

// ─── Orders ──────────────────────────────────────────────────────

export interface MarketOrder {
  id: string;
  kind: MarketKind | 'sponsorship';
  itemId: string;
  title: string;
  buyerId: string;
  buyerName?: string;
  sellerId: string;
  amount: number;
  fee: number;
  sellerAmount: number;
  status: OrderView['status'];
  createdAt?: Timestamp;
  transfer?: { status: 'pending' | 'created' | 'failed'; id?: string; error?: string; at?: number };
  result?: { planId?: string; reason?: string };
}

const toOrders = (docs: { id: string; data: () => any }[]) =>
  docs.map(d => ({ id: d.id, ...d.data() } as MarketOrder))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

export async function listMyPurchases(uid: string): Promise<MarketOrder[]> {
  const snap = await getDocs(query(collection(db, 'market_orders'), where('buyerId', '==', uid), where('status', '==', 'fulfilled'), limit(100)));
  return toOrders(snap.docs);
}

export async function listMySales(uid: string): Promise<MarketOrder[]> {
  const snap = await getDocs(query(collection(db, 'market_orders'), where('sellerId', '==', uid), limit(200)));
  return toOrders(snap.docs).filter(o => o.status === 'fulfilled' || o.status === 'refund_due');
}

export async function listRecentOrders(): Promise<MarketOrder[]> {
  const snap = await getDocs(query(collection(db, 'market_orders'), orderBy('createdAt', 'desc'), limit(80)));
  return toOrders(snap.docs);
}

// ─── Paid items in the marketplace ───────────────────────────────

export async function listPaidClans(): Promise<ClanV2[]> {
  const snap = await getDocs(query(collection(db, 'clans_v2'), where('joinPrice', '>', 0), limit(40)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClanV2)).filter(c => (c.status || 'active') === 'active' && c.visibility !== 'closed');
}

export type TicketedItem = { kind: 'event'; item: SimpleEvent } | { kind: 'challenge'; item: ChallengeV2 };

export async function listTicketed(): Promise<TicketedItem[]> {
  const [events, challenges] = await Promise.all([
    getDocs(query(collection(db, 'simple_events'), where('ticketPrice', '>', 0), limit(40))),
    getDocs(query(collection(db, 'challenges_v2'), where('ticketPrice', '>', 0), limit(40))),
  ]);
  const now = Date.now();
  const items: TicketedItem[] = [
    ...events.docs.map(d => ({ kind: 'event' as const, item: { id: d.id, ...d.data() } as SimpleEvent })),
    ...challenges.docs.map(d => ({ kind: 'challenge' as const, item: { id: d.id, ...d.data() } as ChallengeV2 })),
  ];
  const endOf = (t: TicketedItem) => (t.kind === 'event' ? t.item.endTime : t.item.endDate)?.toMillis?.() || 0;
  const startOf = (t: TicketedItem) => (t.kind === 'event' ? t.item.startTime : t.item.startDate)?.toMillis?.() || 0;
  return items
    .filter(t => t.item.visibility !== 'clan_only' && t.item.status !== 'completed' && (!endOf(t) || endOf(t) > now))
    .sort((a, b) => startOf(a) - startOf(b));
}

// ─── Sponsorships ────────────────────────────────────────────────

export type SponsorshipStatus = 'pending' | 'quoted' | 'paid' | 'live' | 'declined' | 'cancelled';

export interface Sponsorship {
  id: string;
  requesterId: string;
  requesterName?: string;
  brandName: string;
  logoUrl?: string;
  website?: string;
  prize: string;
  message?: string;
  contactEmail: string;
  contactPhone?: string;
  targetType: 'challenge' | 'event' | 'host';
  targetId?: string;
  targetTitle?: string;
  budgetInr?: number;
  status: SponsorshipStatus;
  amountInr?: number;
  payUrl?: string | null;
  adminNote?: string;
  createdAt?: Timestamp;
}

export async function createSponsorship(input: Omit<Sponsorship, 'id' | 'status' | 'createdAt' | 'amountInr' | 'payUrl' | 'adminNote'>): Promise<string> {
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== ''));
  const ref = await addDoc(collection(db, 'sponsorships'), {
    ...clean,
    targetType: input.targetType,
    ...(input.targetType === 'host' ? {} : { targetId: input.targetId }),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listMySponsorships(uid: string): Promise<Sponsorship[]> {
  const snap = await getDocs(query(collection(db, 'sponsorships'), where('requesterId', '==', uid), limit(50)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Sponsorship))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export async function listSponsorships(): Promise<Sponsorship[]> {
  const snap = await getDocs(query(collection(db, 'sponsorships'), orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Sponsorship));
}

export const cancelSponsorship = (id: string) => updateDoc(doc(db, 'sponsorships', id), { status: 'cancelled' });

export async function setSponsorshipStatus(s: Sponsorship, status: SponsorshipStatus, adminNote = '') {
  await updateDoc(doc(db, 'sponsorships', s.id), { status, adminNote: adminNote.slice(0, 300) });
  await logAdminAction(`sponsorship.${status}`, 'sponsorship', s.id, { label: s.brandName });
}

/** Admin: show (or remove) the sponsor on a challenge or event. */
export async function applySponsor(s: Sponsorship, targetType: 'challenge' | 'event', targetId: string, on = true) {
  const coll = targetType === 'challenge' ? 'challenges_v2' : 'simple_events';
  const target = doc(db, coll, targetId);
  if (!(await getDoc(target)).exists()) throw new Error(`No ${targetType} with that id.`);
  const badge: SponsorBadge = { sponsorshipId: s.id, name: s.brandName, logoUrl: s.logoUrl || '', website: s.website || '', prize: s.prize };
  await updateDoc(target, { sponsor: on ? badge : null });
  await updateDoc(doc(db, 'sponsorships', s.id), { targetType, targetId, ...(on && s.status === 'paid' ? { status: 'live' } : {}) });
  await logAdminAction(on ? 'sponsorship.apply' : 'sponsorship.remove', 'sponsorship', s.id, { label: s.brandName, details: `${targetType}/${targetId}` });
}
