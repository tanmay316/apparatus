import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Timestamp } from 'firebase/firestore';
import { Copy, RefreshCw, Ticket, Trash2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
  COUPON_CODE_RE, createCoupon, deleteCoupon, generateCouponCode, isDiscountPlanId, listCoupons, setCouponActive,
  type Coupon, type CouponType,
} from '@/services/coupons';
import { EmptyState, ErrorState, LoadingState, RefreshButton, SectionHeader, formatWhen } from './AdminShared';

export function AdminCouponsTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const coupons = useQuery({ queryKey: ['adminCoupons'], queryFn: listCoupons });

  const [code, setCode] = useState(() => generateCouponCode());
  const [type, setType] = useState<CouponType>('free');
  const [days, setDays] = useState(30);
  const [basePlanId, setBasePlanId] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [label, setLabel] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [expires, setExpires] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminCoupons'] });
    queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
  };

  const create = useMutation({
    mutationFn: () => createCoupon({
      code, type, days, basePlanId, plan: type === 'discount' ? period : 'any', label, maxRedemptions, active: true,
      expiresAt: expires ? Timestamp.fromDate(new Date(`${expires}T23:59:59`)) : null,
    }),
    onSuccess: () => {
      showToast(`Coupon ${code} created`);
      setCode(generateCouponCode());
      setLabel('');
      refresh();
    },
    onError: (e: any) => showToast(e?.message || 'Could not create coupon', 'error'),
  });

  const toggle = useMutation({
    mutationFn: ({ c, active }: { c: Coupon; active: boolean }) => setCouponActive(c, active),
    onSuccess: refresh,
    onError: (e: any) => showToast(e?.message || 'Could not update coupon', 'error'),
  });

  const remove = useMutation({
    mutationFn: (c: string) => deleteCoupon(c),
    onSuccess: () => { showToast('Coupon deleted'); refresh(); },
    onError: (e: any) => showToast(e?.message || 'Could not delete coupon', 'error'),
  });

  const validCode = COUPON_CODE_RE.test(code);
  const canCreate = validCode && (type === 'discount' ? isDiscountPlanId(basePlanId) : days >= 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5">
      <section className="card p-5">
        <SectionHeader icon={Ticket} title="New coupon" description="Free Pro days, or a discount that unlocks a cheaper Google Play plan for whoever redeems the code." />
        <div className="space-y-4">
          <div>
            <label htmlFor="cp-code" className="label">Code</label>
            <div className="flex gap-2">
              <input
                id="cp-code"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
                className="input-field font-mono tracking-wider"
              />
              <button type="button" onClick={() => setCode(generateCouponCode())} className="btn-secondary px-3" title="Generate a random code" aria-label="Generate code">
                <RefreshCw size={14} />
              </button>
            </div>
            <p className="text-[11px] text-bone-dim mt-1">Random codes can't be guessed. Use a readable one (e.g. LAUNCH50) only for public promos.</p>
          </div>

          <div>
            <span className="label">Type</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Coupon type">
              {(['free', 'discount'] as CouponType[]).map(t => (
                <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
                  className={type === t ? 'btn-primary py-2 text-sm' : 'btn-secondary py-2 text-sm'}>
                  {t === 'free' ? 'Free Pro days' : 'Discount'}
                </button>
              ))}
            </div>
          </div>

          {type === 'free' ? (
            <div>
              <label htmlFor="cp-days" className="label">Days of Pro</label>
              <input id="cp-days" type="number" min={1} max={3660} value={days} onChange={e => setDays(Math.max(1, Math.min(3660, Number(e.target.value) || 1)))} className="input-field" />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="cp-plan" className="label">Play base plan id</label>
                <input id="cp-plan" value={basePlanId} onChange={e => setBasePlanId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63))} placeholder="monthly-49" className="input-field font-mono" />
                <p className="text-[11px] text-bone-dim mt-1">
                  First add this base plan (with the lower price) to the "pro" subscription in Play Console → Monetize → Subscriptions and activate it.
                  Only accounts that redeemed this code can keep a purchase of it; anyone else is refunded automatically.
                </p>
                {basePlanId && !isDiscountPlanId(basePlanId) && <p className="text-[11px] text-danger mt-1">Use a separate plan id, not monthly or yearly.</p>}
              </div>
              <div>
                <label htmlFor="cp-period" className="label">Billing period</label>
                <select id="cp-period" value={period} onChange={e => setPeriod(e.target.value as 'monthly' | 'yearly')} className="input-field">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label htmlFor="cp-label" className="label">Shown to user</label>
            <input id="cp-label" value={label} maxLength={120} onChange={e => setLabel(e.target.value)} placeholder={type === 'discount' ? 'Pro for ₹49/month' : '1 month of Pro on us'} className="input-field" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cp-max" className="label">Max uses</label>
              <input id="cp-max" type="number" min={0} value={maxRedemptions} onChange={e => setMaxRedemptions(Math.max(0, Number(e.target.value) || 0))} className="input-field" />
              <p className="text-[11px] text-bone-dim mt-1">0 = unlimited</p>
            </div>
            <div>
              <label htmlFor="cp-exp" className="label">Expires</label>
              <input id="cp-exp" type="date" value={expires} onChange={e => setExpires(e.target.value)} className="input-field" />
            </div>
          </div>

          <button onClick={() => create.mutate()} disabled={!canCreate || create.isPending} className="btn-primary w-full">
            {create.isPending ? 'Creating…' : 'Create coupon'}
          </button>
        </div>
      </section>

      <section className="card p-5 min-w-0">
        <SectionHeader title="Coupons" description="Each account can use a code once." actions={<RefreshButton busy={coupons.isFetching} onClick={() => coupons.refetch()} />} />
        {coupons.isLoading ? <LoadingState /> : coupons.error ? <ErrorState error={coupons.error} onRetry={() => coupons.refetch()} /> : !coupons.data?.length ? (
          <EmptyState>No coupons yet.</EmptyState>
        ) : (
          <div className="space-y-2">
            {coupons.data.map(c => {
              const expired = c.expiresAt && c.expiresAt.toMillis() < Date.now();
              const full = c.maxRedemptions > 0 && c.redeemedCount >= c.maxRedemptions;
              return (
                <div key={c.code} className="rounded-xl border border-line/60 bg-ink-2 p-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm">{c.code}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(c.code).then(() => showToast('Code copied'))}
                        className="text-bone-dim hover:text-bone"
                        aria-label="Copy code"
                      >
                        <Copy size={12} />
                      </button>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${!c.active || expired || full ? 'bg-bone/10 text-bone-dim' : 'bg-emerald-500/15 text-emerald-500'}`}>
                        {!c.active ? 'OFF' : expired ? 'EXPIRED' : full ? 'FULL' : 'LIVE'}
                      </span>
                    </div>
                    <div className="text-xs text-bone-dim mt-0.5">
                      {c.type === 'free' ? `${c.days} days free` : `Discount · ${c.basePlanId || c.offerId || '?'}${c.plan !== 'any' ? ` · ${c.plan}` : ''}`}
                      {' · '}{c.redeemedCount}/{c.maxRedemptions || '∞'} used
                      {c.expiresAt ? ` · until ${formatWhen(c.expiresAt)}` : ''}
                    </div>
                    {c.label && <div className="text-xs mt-0.5 truncate">{c.label}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => toggle.mutate({ c, active: !c.active })} className="btn-secondary py-1.5 px-3 text-xs">
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => { if (await confirm({ title: `Delete ${c.code}?`, message: 'People who already redeemed it keep their Pro.', confirmText: 'Delete', type: 'danger' })) remove.mutate(c.code); }}
                      className="btn-danger py-1.5 px-2.5"
                      aria-label="Delete coupon"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
