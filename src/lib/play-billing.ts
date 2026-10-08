import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { verifyPlayPurchase } from '@/services/billing';

/** Pro is sold only through Google Play, so only the Android app can buy it. */
export const PLAY_BILLING = Capacitor.getPlatform() === 'android';
export const PRO_PRODUCT_ID = 'pro';

/** Obfuscated account id for Play (never the raw uid). Must match play_billing.account_id on the backend. */
export async function playAccountId(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pro:${uid}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Localised prices from Google Play, keyed by base plan id (monthly, yearly and any coupon plans). */
export async function loadPlayPrices(): Promise<Record<string, string>> {
  const { isBillingSupported } = await NativePurchases.isBillingSupported();
  if (!isBillingSupported) return {};
  const { products } = await NativePurchases.getProducts({ productIdentifiers: [PRO_PRODUCT_ID], productType: PURCHASE_TYPE.SUBS });
  const prices: Record<string, string> = {};
  // One entry per offer; the base offer (no offerId) carries the regular price.
  for (const p of [...products].sort((a, b) => Number(!!a.offerId) - Number(!!b.offerId))) {
    if (p.identifier && !prices[p.identifier]) prices[p.identifier] = p.priceString;
  }
  return prices;
}

export function isPurchaseCancelled(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return msg.includes('cancel');
}

/** Opens the Google Play purchase sheet for a base plan and unlocks Pro on the server. Returns whether Pro is active. */
export async function buyPro(basePlan: string, uid: string): Promise<boolean> {
  const tx = await NativePurchases.purchaseProduct({
    productIdentifier: PRO_PRODUCT_ID,
    planIdentifier: basePlan,
    productType: PURCHASE_TYPE.SUBS,
    appAccountToken: await playAccountId(uid),
  });
  if (!tx.purchaseToken) throw new Error('Purchase received. Pro will unlock in a moment.');
  return (await verifyPlayPurchase(tx.purchaseToken)).pro;
}

/** Re-links Pro bought on this Google account (new phone, reinstall, or a purchase that wasn't confirmed). */
export async function restorePro(): Promise<boolean> {
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
  let pro = false;
  for (const p of purchases) {
    if (p.productIdentifier !== PRO_PRODUCT_ID || !p.purchaseToken) continue;
    try {
      pro = (await verifyPlayPurchase(p.purchaseToken)).pro || pro;
    } catch { /* e.g. the purchase belongs to another account */ }
  }
  return pro;
}

export const manageProSubscription = () => NativePurchases.manageSubscriptions();
