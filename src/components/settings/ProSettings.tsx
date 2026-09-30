import { useState } from 'react';
import { Crown, Loader2, Sparkles, Ticket } from 'lucide-react';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsLayout';
import { useIsPro, useSubscriptionStore } from '@/stores/subscription-store';
import { useUIStore } from '@/stores/ui-store';
import { PRO_PRICES, cancelSubscription, getBillingStatus } from '@/services/billing';

const USAGE_LABELS: Record<string, string> = {
  ai_call: 'AI requests (coach, recipes, meal plans)',
  food_scan: 'Food scans',
  workout_plan: 'AI workout plans',
};

const PERIOD_LABEL = { day: 'per day', month: 'per month', lifetime: 'total' } as const;

export function ProSettings() {
  const { enabled, entitlement, comped, usage, openPaywall } = useSubscriptionStore();
  const isPro = useIsPro();
  const { confirm, showToast } = useUIStore();
  const [cancelling, setCancelling] = useState(false);

  if (!enabled && !isPro) return null;

  const renews = entitlement.renewsAt ? new Date(entitlement.renewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const cancelled = entitlement.status === 'cancelled';
  const viaCoupon = entitlement.status === 'granted';
  const planLabel = comped ? 'Complimentary' : viaCoupon ? 'Coupon' : entitlement.plan === 'yearly' ? 'Yearly' : entitlement.plan === 'monthly' ? 'Monthly' : 'Pro';

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancel Apparatus Pro?',
      message: renews ? `You keep Pro until ${renews}. You won't be charged again.` : "You won't be charged again.",
      confirmText: 'Cancel plan',
      cancelText: 'Keep Pro',
      type: 'danger',
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelSubscription();
      showToast('Your plan is cancelled. Pro stays active until the end of this period.', 'success');
      getBillingStatus().then(useSubscriptionStore.getState().setStatus).catch(() => {});
    } catch (err: any) {
      showToast(err?.message || 'Could not cancel right now.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <SettingsSection id="pro" title="Apparatus Pro" description="Unlimited AI coaching, plans, food scans and every share template.">
      <SettingRow
        label={isPro ? `${planLabel} plan` : 'Free plan'}
        description={isPro
          ? comped ? 'Pro is on the house for this account.'
            : renews ? (viaCoupon ? `Free Pro until ${renews}` : cancelled ? `Cancelled · Pro until ${renews}` : `Renews on ${renews}`) : 'Active'
          : `From ${PRO_PRICES.monthly.amount}/month or ${PRO_PRICES.yearly.amount}/year.`}
      >
        {isPro ? (
          <span className="dx-pill dx-pill--accent !h-7 !px-3"><Crown size={12} /> Pro</span>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => openPaywall()} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]">
              <Ticket size={14} /> Redeem code
            </button>
            <button type="button" onClick={() => openPaywall()} className="dx-btn !h-9 !px-4 !text-[13px]">
              <Sparkles size={15} /> Upgrade
            </button>
          </div>
        )}
      </SettingRow>

      {!isPro && Object.keys(usage).length > 0 && (
        <SettingRow label="Free AI allowance" description="Daily limits reset every day. Pro removes all limits.">
          <div className="w-full sm:w-72 space-y-2">
            {Object.entries(usage).map(([kind, u]) => {
              const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
              return (
                <div key={kind}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="dx-muted">{USAGE_LABELS[kind] || kind}</span>
                    <span className="tabular font-semibold">{u.used}/{u.limit} {PERIOD_LABEL[u.period] || ''}</span>
                  </div>
                  <div className="dx-progress"><span style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </SettingRow>
      )}

      {isPro && !comped && entitlement.subscriptionId && !cancelled && (
        <SettingRow label="Manage plan" description="Cancel anytime; you keep Pro until the period ends.">
          <button type="button" onClick={handleCancel} disabled={cancelling} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]" style={{ color: '#dc2626' }}>
            {cancelling && <Loader2 size={14} className="animate-spin" />} Cancel plan
          </button>
        </SettingRow>
      )}
    </SettingsSection>
  );
}
