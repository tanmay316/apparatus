import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import type { BillingStatus, QuotaUsage } from '@/services/billing';
import { useUIStore } from '@/stores/ui-store';
import { PLAY_BILLING } from '@/lib/play-billing';

/** Pro is sold through Google Play only; Pro bought there unlocks the web and iPhone apps too. */
export const CAN_PURCHASE = PLAY_BILLING;
/** Pro locks, badges and the paywall (codes on web) are shown everywhere except the iPhone app (App Store rules). */
export const CAN_UPSELL = Capacitor.getPlatform() !== 'ios';
/** Shown before Google Play has returned the localised price. */
export const PRO_PRICE_LABEL = '₹99/month';
const FREE_LIMIT_MESSAGE = "You've reached the free limit for now. It resets soon.";

export interface Entitlement {
  pro: boolean;
  plan?: string;
  status?: string;
  /** Epoch ms. */
  renewsAt?: number | null;
  subscriptionId?: string;
}

interface SubscriptionState {
  /** Pro features are locked for free users. Assumed on until the server says otherwise. */
  enabled: boolean;
  /** The server can verify Google Play purchases. */
  purchasable: boolean;
  loaded: boolean;
  /** Live from users/{uid}/private/entitlement (written by the backend). */
  entitlement: Entitlement;
  /** Server-granted Pro (team / giveaway emails) that has no entitlement doc. */
  comped: boolean;
  usage: Record<string, QuotaUsage>;
  paywall: { open: boolean; reason?: string };
  setStatus: (status: BillingStatus, uid?: string) => void;
  /** Last known billing state for this account, used until /billing/status answers. */
  restore: (uid: string) => void;
  setEntitlement: (e: Entitlement) => void;
  /** Counts a successful AI use locally so the remaining allowance updates without a round trip. */
  bumpUsage: (kind: string) => void;
  /** `redeem` opens it just to enter a code (the only paywall action in store builds). */
  openPaywall: (reason?: string, opts?: { redeem?: boolean }) => void;
  closePaywall: () => void;
  reset: () => void;
}

const EMPTY: Entitlement = { pro: false };
// v2: older builds stored enabled=false while Play billing wasn't configured; that must not unlock Pro.
const STORE_KEY = 'apparatus.billing.v2';

/** Last answer from /billing/status. Unknown = billing live, so blocking the request can't unlock Pro. */
function remembered(): { enabled: boolean; compedUid: string | null } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (v && typeof v.enabled === 'boolean') return { enabled: v.enabled, compedUid: typeof v.compedUid === 'string' ? v.compedUid : null };
  } catch { /* corrupt or unavailable storage */ }
  return { enabled: true, compedUid: null };
}

function remember(enabled: boolean, compedUid: string | null) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ enabled, compedUid })); } catch { /* storage full or blocked */ }
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  enabled: remembered().enabled,
  purchasable: true,
  loaded: false,
  entitlement: EMPTY,
  comped: false,
  usage: {},
  paywall: { open: false },
  setStatus: (status, uid) => {
    const comped = status.entitlement?.plan === 'comp' && !!status.entitlement.pro;
    remember(status.enabled, comped && uid ? uid : null);
    set({ enabled: status.enabled, purchasable: status.purchasable ?? status.enabled, loaded: true, usage: status.usage || {}, comped });
  },
  restore: (uid) => set({ enabled: remembered().enabled, comped: remembered().compedUid === uid }),
  setEntitlement: (entitlement) => set({ entitlement }),
  bumpUsage: (kind) => set(state => {
    const u = state.usage[kind];
    return u ? { usage: { ...state.usage, [kind]: { ...u, used: u.used + 1 } } } : {};
  }),
  openPaywall: (reason, opts) => {
    if (!CAN_UPSELL && !opts?.redeem) {
      useUIStore.getState().showToast(FREE_LIMIT_MESSAGE, 'info');
      return;
    }
    set({ paywall: { open: true, reason } });
  },
  closePaywall: () => set({ paywall: { open: false } }),
  reset: () => set({ enabled: remembered().enabled, purchasable: true, loaded: false, entitlement: EMPTY, comped: false, usage: {}, paywall: { open: false } }),
}));

const hasProState = (s: SubscriptionState) => s.entitlement.pro || s.comped;

/** The user has an active Pro plan. */
export const useIsPro = () => useSubscriptionStore(hasProState);

/** True when Pro features are usable (Pro, or billing not live yet). */
export const useHasPro = () => useSubscriptionStore(s => !s.enabled || hasProState(s));

/** Pro teasers and "Go Pro" prompts are only shown where Pro can be bought or redeemed. */
export const useShowProUpsell = () => useSubscriptionStore(s => CAN_UPSELL && s.enabled && !hasProState(s));

/** Opens the paywall and returns false when a Pro feature is not available. */
export function requirePro(reason?: string): boolean {
  const s = useSubscriptionStore.getState();
  if (!s.enabled || hasProState(s)) return true;
  if (CAN_UPSELL) s.openPaywall(reason);
  return false;
}
