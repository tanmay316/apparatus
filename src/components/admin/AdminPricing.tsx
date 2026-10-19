import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IndianRupee } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { getAdminPricing, saveAdminPricing, type PricingConfig, type ProPlan } from '@/services/billing';
import { logAdminAction } from '@/services/admin';
import { DEFAULT_PRICING, PLAN_META, PRO_PLANS, discountPct, formatMoney } from '@/lib/pro-pricing';
import { ErrorState, LoadingState, RefreshButton, SectionHeader } from './AdminShared';

const toInt = (v: string) => Math.max(0, Math.floor(Number(v.replace(/[^0-9]/g, '')) || 0));

/** Pro subscription prices: regular price, optional sale price (shown struck-through with % off), on/off per plan. */
export function AdminPricing() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const remote = useQuery({ queryKey: ['adminPricing'], queryFn: getAdminPricing });
  const [draft, setDraft] = useState<PricingConfig>(DEFAULT_PRICING);
  // Sale price per plan as typed; empty = no discount.
  const [sale, setSale] = useState<Record<ProPlan, string>>({ monthly: '', sixmonth: '', yearly: '' });
  const [syncPlay, setSyncPlay] = useState(true);

  useEffect(() => {
    const cfg = remote.data?.config;
    if (!cfg) return;
    setDraft(cfg);
    setSale(Object.fromEntries(PRO_PLANS.map(p => [p, cfg.plans[p].price < cfg.plans[p].mrp ? String(cfg.plans[p].price) : ''])) as Record<ProPlan, string>);
    setSyncPlay(!remote.data?.playError);
  }, [remote.data]);

  // What gets saved: regular price = mrp; selling price = sale price when set.
  const next: PricingConfig = {
    label: draft.label,
    plans: Object.fromEntries(PRO_PLANS.map(p => {
      const mrp = draft.plans[p].mrp;
      const price = sale[p] ? toInt(sale[p]) : mrp;
      return [p, { mrp, price, enabled: draft.plans[p].enabled }];
    })) as PricingConfig['plans'],
  };
  const problems = PRO_PLANS.flatMap(p => {
    const c = next.plans[p];
    if (c.mrp < 10) return [`${PLAN_META[p].label}: regular price must be at least ₹10.`];
    if (c.price < 10) return [`${PLAN_META[p].label}: sale price must be at least ₹10.`];
    if (c.price > c.mrp) return [`${PLAN_META[p].label}: sale price must be below the regular price.`];
    return [];
  });
  if (!PRO_PLANS.some(p => next.plans[p].enabled)) problems.push('Keep at least one plan on sale.');

  const save = useMutation({
    mutationFn: async () => {
      const res = await saveAdminPricing(next, syncPlay);
      await logAdminAction('pricing.update', 'admin_settings', 'pricing', {
        details: PRO_PLANS.map(p => `${p} ${next.plans[p].enabled ? `₹${next.plans[p].price}${next.plans[p].price < next.plans[p].mrp ? ` (was ₹${next.plans[p].mrp})` : ''}` : 'off'}`).join(', ')
          + (syncPlay ? ' · Google Play updated' : ' · app only'),
      });
      return res;
    },
    onSuccess: res => {
      const updated = Object.entries(res.play || {}).filter(([, s]) => s === 'updated').map(([p]) => PLAN_META[p as ProPlan]?.label || p);
      showToast(updated.length ? `Prices saved. Google Play updated: ${updated.join(', ')}` : 'Prices saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['adminPricing'] });
      queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
    },
    onError: (e: any) => showToast(e?.message || 'Could not save prices', 'error'),
  });

  const setPlan = (p: ProPlan, patch: Partial<PricingConfig['plans'][ProPlan]>) =>
    setDraft(d => ({ ...d, plans: { ...d.plans, [p]: { ...d.plans[p], ...patch } } }));

  const play = remote.data?.play;

  return (
    <section className="card p-5 lg:col-span-2">
      <SectionHeader
        icon={IndianRupee}
        title="Pro pricing"
        description="Regular price per plan, plus an optional sale price. The app shows the regular price struck through with the % off."
        actions={<RefreshButton busy={remote.isFetching} onClick={() => remote.refetch()} />}
      />
      {remote.isLoading ? <LoadingState /> : remote.error ? <ErrorState error={remote.error} onRetry={() => remote.refetch()} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRO_PLANS.map(p => {
              const c = next.plans[p];
              const pct = discountPct(c);
              const live = play?.[p];
              return (
                <div key={p} className={`rounded-xl border border-line/60 bg-ink-2 p-3 space-y-3 ${c.enabled ? '' : 'opacity-60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{PLAN_META[p].label}</span>
                    <label className="flex items-center gap-1.5 text-xs text-bone-dim">
                      <input type="checkbox" checked={draft.plans[p].enabled} onChange={e => setPlan(p, { enabled: e.target.checked })} />
                      On sale
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`pr-mrp-${p}`} className="label">Regular ₹</label>
                      <input id={`pr-mrp-${p}`} inputMode="numeric" value={draft.plans[p].mrp || ''} onChange={e => setPlan(p, { mrp: toInt(e.target.value) })} className="input-field tabular" />
                    </div>
                    <div>
                      <label htmlFor={`pr-sale-${p}`} className="label">Sale ₹</label>
                      <input id={`pr-sale-${p}`} inputMode="numeric" placeholder="none" value={sale[p]} onChange={e => setSale(s => ({ ...s, [p]: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) }))} className="input-field tabular" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-ink p-2.5 text-sm">
                    <span className="text-[10px] font-mono text-bone-dim block mb-1">PREVIEW</span>
                    {pct > 0 && <span className="line-through text-bone-dim mr-2">{formatMoney(c.mrp)}</span>}
                    <span className="font-semibold">{formatMoney(c.price)}</span>
                    <span className="text-bone-dim"> / {PLAN_META[p].period}</span>
                    {pct > 0 && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500">{pct}% OFF</span>}
                  </div>
                  <div className="text-[11px] text-bone-dim">
                    Google Play now: {live ? (live.inr != null ? `${formatMoney(live.inr)}${live.state && live.state !== 'ACTIVE' ? ` · ${live.state.toLowerCase()}` : ''}` : 'no INR price') : play ? <span className="text-danger">base plan "{p}" missing</span> : '—'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pr-label" className="label">Sale banner (optional)</label>
              <input id="pr-label" value={draft.label} maxLength={60} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Diwali sale" className="input-field" />
              <p className="text-[11px] text-bone-dim mt-1">Shown on the Pro page as "Diwali sale · up to 25% off" while any plan has a sale price.</p>
            </div>
            <div>
              <label className="flex items-start gap-2 text-sm mt-6">
                <input type="checkbox" className="mt-1" checked={syncPlay} disabled={!!remote.data?.playError} onChange={e => setSyncPlay(e.target.checked)} />
                <span>
                  Update the price on Google Play too
                  <span className="block text-[11px] text-bone-dim">
                    {remote.data?.playError
                      ? remote.data.playError
                      : 'Recommended. New subscribers pay the new price; existing subscribers keep the price they signed up at.'}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {problems.length > 0 && <p className="text-xs text-danger">{problems[0]}</p>}
          {!syncPlay && <p className="text-xs text-amber-500">Without updating Google Play, change the price in Play Console yourself so buyers see the same amount.</p>}

          <button
            type="button"
            disabled={problems.length > 0 || save.isPending}
            onClick={async () => {
              if (await confirm({
                title: 'Save Pro prices?',
                message: PRO_PLANS.filter(p => next.plans[p].enabled).map(p => `${PLAN_META[p].label}: ${formatMoney(next.plans[p].price)}`).join(' · ')
                  + (syncPlay ? '. Google Play prices change for new subscribers within a few minutes.' : '.'),
                confirmText: 'Save prices',
              })) save.mutate();
            }}
            className="btn-primary w-full md:w-auto md:px-8"
          >
            {save.isPending ? 'Saving…' : 'Save prices'}
          </button>
        </div>
      )}
    </section>
  );
}
