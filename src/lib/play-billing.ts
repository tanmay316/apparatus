import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { BillingApiError, verifyPlayPurchase } from '@/services/billing';

/** Pro is sold only through Google Play, so only the Android app can buy it. */
export const PLAY_BILLING = Capacitor.getPlatform() === 'android';
export const PRO_PRODUCT_ID = 'pro';

/** Obfuscated account id for Play (never the raw uid). Must match play_billing.account_id on the backend. */
export async function playAccountId(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pro:${uid}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export interface PlayPrice { priceString: string; price: number; currencyCode: string; offerToken?: string }

/** Localised prices from Google Play, keyed by base plan id (monthly, sixmonth, yearly and any coupon plans). */
export async function loadPlayPrices(): Promise<Record<string, PlayPrice>> {
  const { isBillingSupported } = await NativePurchases.isBillingSupported();
  if (!isBillingSupported) return {};
  const { products } = await NativePurchases.getProducts({ productIdentifiers: [PRO_PRODUCT_ID], productType: PURCHASE_TYPE.SUBS });
  const prices: Record<string, PlayPrice> = {};
  // One entry per offer; the base offer (no offerId) carries the regular price. Its offerToken is what
  // buyPro charges, so the price shown is exactly the price Google Play takes.
  for (const p of [...products].sort((a, b) => Number(!!a.offerId) - Number(!!b.offerId))) {
    if (p.identifier && !prices[p.identifier]) {
      prices[p.identifier] = { priceString: p.priceString, price: p.price, currencyCode: p.currencyCode, offerToken: p.offerToken || undefined };
    }
  }
  return prices;
}

export function isPurchaseCancelled(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return msg.includes('cancel');
}

function isPurchasePending(err: unknown): boolean {
  return String((err as any)?.message || err || '').toLowerCase().includes('pending');
}

// Purchases Google Play has charged for that the server hasn't confirmed yet. They stay here until Pro is
// confirmed, so an interrupted confirmation (no network, server waking up, app closed) is retried later.
const PENDING_KEY = 'apparatus.play.pending.v1';
const PENDING_TTL_MS = 7 * 24 * 3600 * 1000;

function readPending(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(p => p && typeof p.token === 'string' && Date.now() - Number(p.at) < PENDING_TTL_MS).map(p => p.token);
  } catch {
    return [];
  }
}

function writePending(tokens: string[]) {
  try {
    const at = Date.now();
    const prev: { token: string; at: number }[] = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    const since = new Map((Array.isArray(prev) ? prev : []).map(p => [p.token, p.at]));
    localStorage.setItem(PENDING_KEY, JSON.stringify(tokens.slice(-10).map(token => ({ token, at: since.get(token) ?? at }))));
  } catch { /* storage full or blocked */ }
}

const addPending = (token: string) => writePending([...readPending().filter(t => t !== token), token]);
const dropPending = (token: string) => writePending(readPending().filter(t => t !== token));

/** Unconfirmed purchases are waiting for the server (used to retry on launch and resume). */
export const hasPendingPurchase = () => PLAY_BILLING && readPending().length > 0;

/** The server or network hiccuped (server waking up, Google unreachable), so trying again can succeed. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof BillingApiError)) return true;
  return err.status === undefined || err.status === 429 || err.status >= 500;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Asks the server to check the purchase with Google and unlock Pro. Returns whether Pro is active. */
async function confirmPurchase(token: string, retryDelays: number[] = []): Promise<boolean> {
  let lastError: unknown;
  for (const delay of [0, ...retryDelays]) {
    if (delay) await sleep(delay);
    try {
      const { pro } = await verifyPlayPurchase(token);
      if (pro) {
        dropPending(token);
        // The server acknowledges too; this is only a fallback so a granted purchase is never auto-refunded.
        NativePurchases.acknowledgePurchase({ purchaseToken: token }).catch(() => {});
      } else {
        // Payment still processing: keep it so the next launch or resume checks again.
        addPending(token);
      }
      return pro;
    } catch (err) {
      lastError = err;
      if (!isTransient(err)) {
        dropPending(token);
        throw err;
      }
    }
  }
  throw lastError;
}

const STILL_CONFIRMING =
  "Payment received. We're still confirming it with Google Play and Pro will unlock automatically. " +
  "If it can't be confirmed, Google Play refunds you within 3 days.";

/** Opens the Google Play purchase sheet for a base plan and unlocks Pro on the server. Returns whether Pro is active
 *  (false = Google Play is still processing the payment). */
export async function buyPro(basePlan: string, uid: string, offerToken?: string): Promise<boolean> {
  let tx;
  try {
    tx = await NativePurchases.purchaseProduct({
      productIdentifier: PRO_PRODUCT_ID,
      planIdentifier: basePlan,
      // The exact offer whose price the app showed, so Play can't charge a different offer of the plan.
      offerToken,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: await playAccountId(uid),
      // Only acknowledge once the server has unlocked Pro: Google refunds unacknowledged purchases after
      // 3 days, so a payment can never be kept without Pro.
      autoAcknowledgePurchases: false,
    });
  } catch (err) {
    // UPI and similar payments can stay pending; restorePro links them once Google confirms the payment.
    if (isPurchasePending(err)) return false;
    throw err;
  }
  if (!tx.purchaseToken) throw new Error(STILL_CONFIRMING);
  addPending(tx.purchaseToken);
  try {
    // Retries cover the server waking up from sleep and short Google Play outages.
    return await confirmPurchase(tx.purchaseToken, [2000, 5000, 10000, 20000]);
  } catch (err) {
    throw isTransient(err) ? new Error(STILL_CONFIRMING) : err;
  }
}

/** Re-links Pro bought on this Google account (new phone, reinstall, or a purchase that wasn't confirmed).
 *  Throws when a purchase exists but the server couldn't be reached, so callers don't report "nothing found". */
export async function restorePro(): Promise<boolean> {
  const tokens = new Set(readPending());
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    for (const p of purchases) {
      if (p.productIdentifier === PRO_PRODUCT_ID && p.purchaseToken) tokens.add(p.purchaseToken);
    }
  } catch (err) {
    if (!tokens.size) throw err;
  }
  let pro = false;
  let transientError: unknown = null;
  for (const token of tokens) {
    try {
      pro = (await confirmPurchase(token)) || pro;
    } catch (err) {
      // e.g. the purchase belongs to another account
      if (isTransient(err)) transientError = err;
    }
  }
  if (!pro && transientError) throw new Error(STILL_CONFIRMING);
  return pro;
}

export const manageProSubscription = () => NativePurchases.manageSubscriptions();