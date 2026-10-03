import { useState } from 'react';
import { Crown, ExternalLink, Loader2, RotateCcw, Sparkles, Ticket } from 'lucide-react';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsLayout';
import { CAN_PURCHASE, useIsPro, useSubscriptionStore } from '@/stores/subscription-store';
import { useUIStore } from '@/stores/ui-store';
import { getBillingStatus } from '@/services/billing';
import { manageProSubscription, restorePro } from '@/lib/play-billing';
import { BRAND } from '@/lib/brand';

const USAGE_LABELS: Record<string, string> = {
  ai_call: 'AI requests (coach, recipes, meal plans)',
  food_scan: 'Food scans',
  workout_plan: 'AI workout plans',
  ai_summary: 'AI coach summaries',
};

const PERIOD_LABEL = { day: 'per day', week: 'this week', month: 'per month', lifetime: 'total' } as const;

export function ProSettings() {
  const { enabled, entitlement, comped, usage, openPaywall } = useSubscriptionStore();
  const isPro = useIsPro();
  const { showToast } = useUIStore();
  const [restoring, setRestoring] = useState(false);

  if (!enabled && !isPro) return null;

  const renews = entitlement.renewsAt ? new Date(entitlement.renewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const cancelled = entitlement.status === 'cancelled';
  const viaCoupon = entitlement.status === 'granted';
  const planLabel = comped ? 'Complimentary' : viaCoupon ? 'Coupon' : entitlement.plan === 'yearly' ? 'Yearly' : entitlement.plan === 'monthly' ? 'Monthly' : 'Pro';
  const viaPlay = isPro && !comped && !viaCoupon && !!entitlement.subscriptionId;

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const pro = await restorePro();
      getBillingStatus().then(useSubscriptionStore.getState().setStatus).catch(() => {});
      showToast(pro ? 'Pro restored.' : 'No Pro subscription found on this Google account.', pro ? 'success' : 'info');
    } catch (err: any) {
      showToast(err?.message || 'Could not restore right now.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SettingsSection id="pro" title={`${BRAND.name} Pro`} description={isPro || CAN_PURCHASE ? 'Unlimited AI coaching, plans, food scans and every share template.' : 'Your plan and free AI allowance.'}>
      <SettingRow
        label={isPro ? `${planLabel} plan` : 'Free plan'}
        description={isPro
          ? comped ? 'Pro is on the house for this account.'
            : renews ? (viaCoupon ? `Free Pro until ${renews}` : cancelled ? `Cancelled · Pro until ${renews}` : `Renews on ${renews}`) : 'Active'
          : CAN_PURCHASE ? 'Monthly or yearly, billed through Google Play.' : 'Have a code? Redeem it here.'}
      >
        {isPro ? (
          <span className="dx-pill dx-pill--accent !h-7 !px-3"><Crown size={12} /> Pro</span>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => openPaywall(undefined, { redeem: true })} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]">
              <Ticket size={14} /> Redeem code
            </button>
            {CAN_PURCHASE && (
              <button type="button" onClick={() => openPaywall()} className="dx-btn !h-9 !px-4 !text-[13px]">
                <Sparkles size={15} /> Upgrade
              </button>
            )}
          </div>
        )}
      </SettingRow>

      {!isPro && Object.keys(usage).length > 0 && (
        <SettingRow label="Free AI allowance" description={CAN_PURCHASE ? 'Allowances reset each day, week or month. Pro removes all limits.' : 'Allowances reset each day, week or month.'}>
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

      {viaPlay && (
        <SettingRow
          label="Manage plan"
          description={CAN_PURCHASE
            ? (cancelled ? 'Resubscribe or change plan in Google Play.' : 'Change or cancel in Google Play; you keep Pro until the period ends.')
            : 'Manage it in Google Play on your Android phone.'}
        >
          {CAN_PURCHASE && (
            <button type="button" onClick={() => manageProSubscription().catch(() => {})} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]">
              <ExternalLink size={14} /> Google Play
            </button>
          )}
        </SettingRow>
      )}

      {CAN_PURCHASE && enabled && !viaPlay && !comped && (
        <SettingRow label="Restore purchase" description="Bought Pro on another phone with this Google account?">
          <button type="button" onClick={handleRestore} disabled={restoring} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]">
            {restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restore
          </button>
        </SettingRow>
      )}
    </SettingsSection>
  );
}
