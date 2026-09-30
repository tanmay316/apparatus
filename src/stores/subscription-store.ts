import { create } from 'zustand';
import type { BillingStatus, QuotaUsage } from '@/services/billing';

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
  openPaywall: (reason?: string) => void;
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
  openPaywall: (reason) => set({ paywall: { open: true, reason } }),
  closePaywall: () => set({ paywall: { open: false } }),
  reset: () => set({ enabled: false, loaded: false, entitlement: EMPTY, comped: false, usage: {}, paywall: { open: false } }),
}));

const hasProState = (s: SubscriptionState) => s.entitlement.pro || s.comped;

/** The user has an active Pro plan. */
export const useIsPro = () => useSubscriptionStore(hasProState);

/** True when Pro features are usable (Pro, or billing not live yet). */
export const useHasPro = () => useSubscriptionStore(s => !s.enabled || hasProState(s));

/** Opens the paywall and returns false when a Pro feature is not available. */
export function requirePro(reason?: string): boolean {
  const s = useSubscriptionStore.getState();
  if (!s.enabled || hasProState(s)) return true;
  s.openPaywall(reason);
  return false;
}
