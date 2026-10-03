import { create } from 'zustand';
import type { BillingStatus, QuotaUsage } from '@/services/billing';
import { useUIStore } from '@/stores/ui-store';
import { PLAY_BILLING } from '@/lib/play-billing';

/** Pro is sold through Google Play only; Pro bought there unlocks the web and iPhone apps too. */
export const CAN_PURCHASE = PLAY_BILLING;
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
  /** Billing is live on the backend; until then nothing is locked. */
  enabled: boolean;
  loaded: boolean;
  /** Live from users/{uid}/private/entitlement (written by the backend). */
  entitlement: Entitlement;
  /** Server-granted Pro (team / giveaway emails) that has no entitlement doc. */
  comped: boolean;
  usage: Record<string, QuotaUsage>;
  paywall: { open: boolean; reason?: string };
  setStatus: (status: BillingStatus) => void;
  setEntitlement: (e: Entitlement) => void;
  /** Counts a successful AI use locally so the remaining allowance updates without a round trip. */
  bumpUsage: (kind: string) => void;
  /** `redeem` opens it just to enter a code (the only paywall action in store builds). */
  openPaywall: (reason?: string, opts?: { redeem?: boolean }) => void;
  closePaywall: () => void;
  reset: () => void;
}

const EMPTY: Entitlement = { pro: false };

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  enabled: false,
  loaded: false,
  entitlement: EMPTY,
  comped: false,
  usage: {},
  paywall: { open: false },
  setStatus: (status) => set({
    enabled: status.enabled,
    loaded: true,
    usage: status.usage || {},
    comped: status.entitlement?.plan === 'comp' && !!status.entitlement.pro,
  }),
  setEntitlement: (entitlement) => set({ entitlement }),
  bumpUsage: (kind) => set(state => {
    const u = state.usage[kind];
    return u ? { usage: { ...state.usage, [kind]: { ...u, used: u.used + 1 } } } : {};
  }),
  openPaywall: (reason, opts) => {
    if (!CAN_PURCHASE && !opts?.redeem) {
      useUIStore.getState().showToast(FREE_LIMIT_MESSAGE, 'info');
      return;
    }
    set({ paywall: { open: true, reason } });
  },
  closePaywall: () => set({ paywall: { open: false } }),
  reset: () => set({ enabled: false, loaded: false, entitlement: EMPTY, comped: false, usage: {}, paywall: { open: false } }),
}));

const hasProState = (s: SubscriptionState) => s.entitlement.pro || s.comped;

/** The user has an active Pro plan. */
export const useIsPro = () => useSubscriptionStore(hasProState);

/** True when Pro features are usable (Pro, or billing not live yet). */
export const useHasPro = () => useSubscriptionStore(s => !s.enabled || hasProState(s));

/** Pro teasers and "Go Pro" prompts are only shown where Pro can be bought. */
export const useShowProUpsell = () => useSubscriptionStore(s => CAN_PURCHASE && s.enabled && !hasProState(s));

/** Opens the paywall and returns false when a Pro feature is not available. */
export function requirePro(reason?: string): boolean {
  const s = useSubscriptionStore.getState();
  if (!s.enabled || hasProState(s)) return true;
  if (CAN_PURCHASE) s.openPaywall(reason);
  return false;
}
