import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Timestamp } from 'firebase/firestore';
import { Copy, RefreshCw, Ticket, Trash2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
  COUPON_CODE_RE, createCoupon, deleteCoupon, generateCouponCode, isDiscountPlanId, listCoupons, setCouponActive, setCouponEndDate,
  type Coupon, type CouponType,
} from '@/services/coupons';
import { EmptyState, ErrorState, LoadingState, RefreshButton, SectionHeader, formatWhen } from './AdminShared';
import { AdminPricing } from './AdminPricing';

const DURATIONS = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '14d', label: '14 days', days: 14 },
  { id: '1m', label: '1 month', months: 1 },
  { id: '3m', label: '3 months', months: 3 },
  { id: '6m', label: '6 months', months: 6 },
  { id: '1y', label: '1 year', months: 12 },
] as const;
type DurationId = typeof DURATIONS[number]['id'] | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A coupon ends at the very end of its last day (device time zone). */
const endOfDay = (date: string) => new Date(`${date}T23:59:59`);
const daysUntil = (date: string) => Math.ceil((endOfDay(date).getTime() - Date.now()) / 86_400_000);

function durationEnd(id: DurationId): string {
  const opt = DURATIONS.find(d => d.id === id);
  const d = new Date();
  if (opt && 'months' in opt) d.setMonth(d.getMonth() + opt.months);
  else if (opt) d.setDate(d.getDate() + opt.days);
  return toDateInput(d);
}

const durationFor = (date: string): DurationId => DURATIONS.find(d => durationEnd(d.id) === date)?.id ?? 'custom';

export function AdminCouponsTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const coupons = useQuery({ queryKey: ['adminCoupons'], queryFn: listCoupons });

  const [codeMode, setCodeMode] = useState<'random' | 'custom'>('random');
  const [prefix, setPrefix] = useState('');
  const [code, setCode] = useState(() => generateCouponCode());
  const [type, setType] = useState<CouponType>('free');
  const [duration, setDuration] = useState<DurationId>('1m');
  const [endDate, setEndDate] = useState(() => durationEnd('1m'));
  const days = endDate ? daysUntil(endDate) : 0;
  const [basePlanId, setBasePlanId] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'sixmonth' | 'yearly'>('monthly');
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
      expiresAt: type === 'free'
        ? Timestamp.fromDate(endOfDay(endDate))
        : expires ? Timestamp.fromDate(endOfDay(expires)) : null,
    }),
    onSuccess: () => {
      showToast(`Coupon ${code} created`);
      setCode(codeMode === 'random' ? generateCouponCode(prefix) : '');
      setLabel('');
      refresh();
    },
    onError: (e: any) => showToast(e?.message || 'Could not create coupon', 'error'),
  });

  const toggle = useMutation({
    mutationFn: ({ c, active }: { c: Coupon; active: boolean }) => setCouponActive(c, active),
    onSuccess: (_, { c, active }) => {
      if (c.type === 'free' && c.redeemedCount > 0) showToast(active ? 'Pro restored for everyone who used this code' : 'Pro from this code is switched off');
      refresh();
    },
    onError: (e: any) => showToast(e?.message || 'Could not update coupon', 'error'),
  });

  const changeEnd = useMutation({
    mutationFn: ({ c, date }: { c: Coupon; date: string }) => setCouponEndDate(c, Timestamp.fromDate(endOfDay(date))),
    onSuccess: () => { showToast('End date updated'); refresh(); },
    onError: (e: any) => showToast(e?.message || 'Could not change the date', 'error'),
  });

  const remove = useMutation({
    mutationFn: (c: string) => deleteCoupon(c),
    onSuccess: () => { showToast('Coupon deleted'); refresh(); },
    onError: (e: any) => showToast(e?.message || 'Could not delete coupon', 'error'),
  });

  const validCode = COUPON_CODE_RE.test(code);
  const canCreate = validCode && (type === 'discount' ? isDiscountPlanId(basePlanId) : days >= 1 && days <= 3660);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5">
      <AdminPricing />
      <section className="card p-5">
        <SectionHeader icon={Ticket} title="New coupon" description="Free Pro until a set date, or a one-time discount on a cheaper Google Play plan for whoever redeems the code." />
        <div className="space-y-4">
          <div>
            <span className="label">Code</span>
            <div className="grid grid-cols-2 gap-2 mb-2" role="radiogroup" aria-label="Code style">
              {(['random', 'custom'] as const).map(m => (
                <button key={m} type="button" role="radio" aria-checked={codeMode === m}
                  onClick={() => { setCodeMode(m); setCode(m === 'random' ? generateCouponCode(prefix) : ''); }}
                  className={codeMode === m ? 'btn-primary py-1.5 text-xs' : 'btn-secondary py-1.5 text-xs'}>
                  {m === 'random' ? 'Random' : 'My own name'}
                </button>
              ))}
            </div>
            {codeMode === 'random' ? (
              <>
                <div className="flex gap-2">
                  <input
                    aria-label="Prefix (optional)"
                    value={prefix}
                    onChange={e => {
                      const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
                      setPrefix(next);
                      setCode(generateCouponCode(next));
                    }}
                    placeholder="Prefix"
                    className="input-field font-mono !w-28 shrink-0"
                  />
                  <input id="cp-code" value={code} readOnly className="input-field font-mono tracking-wider min-w-0" aria-label="Generated code" />
                  <button type="button" onClick={() => setCode(generateCouponCode(prefix))} className="btn-secondary px-3" title="Generate another code" aria-label="Generate code">
                    <RefreshCw size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-bone-dim mt-1">Random codes can't be guessed: best for giveaways and 1-person codes. Add a prefix like DIWALI to keep them readable.</p>
              </>
            ) : (
              <>
                <input
                  id="cp-code"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
                  placeholder="e.g. LAUNCH50"
                  autoCapitalize="characters"
                  className="input-field font-mono tracking-wider"
                />
                <p className={`text-[11px] mt-1 ${code && !validCode ? 'text-danger' : 'text-bone-dim'}`}>
                  3-32 characters: A-Z, 0-9, - and _. Easy names can be guessed, so set Max uses or a date for public promos.
                </p>
              </>
            )}
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
            <div className="space-y-3">
              <div>
                <span className="label">Pro for</span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Pro duration">
                  {DURATIONS.map(d => (
                    <button key={d.id} type="button" role="radio" aria-checked={duration === d.id}
                      onClick={() => { setDuration(d.id); setEndDate(durationEnd(d.id)); }}
                      className={duration === d.id ? 'btn-primary py-1.5 text-xs' : 'btn-secondary py-1.5 text-xs'}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="cp-end" className="label">Pro ends on</label>
                <input
                  id="cp-end"
                  type="date"
                  min={durationEnd('custom')}
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setDuration(durationFor(e.target.value)); }}
                  className="input-field"
                />
                <p className="text-[11px] text-bone-dim mt-1">
                  {days >= 1 ? `${days} day${days === 1 ? '' : 's'} from today. ` : 'Pick a future date. '}
                  Pro unlocked by this code ends at the end of this day for everyone, whenever they redeem it, and the code stops working after it.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="cp-plan" className="label">Play base plan id</label>
                <input id="cp-plan" value={basePlanId} onChange={e => setBasePlanId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63))} placeholder="monthly-49" className="input-field font-mono" />
                <p className="text-[11px] text-bone-dim mt-1">
                  First add this base plan (with the lower price) to the "pro" subscription in Play Console → Monetize → Subscriptions and activate it.
                  The discount is one-time: each account can buy this plan once, for one billing period (it doesn't renew; after that the normal price applies).
                  Anyone without the code is refunded automatically.
                </p>
                {basePlanId && !isDiscountPlanId(basePlanId) && <p className="text-[11px] text-danger mt-1">Use a separate plan id, not monthly, sixmonth or yearly.</p>}
              </div>
              <div>
                <label htmlFor="cp-period" className="label">Billing period</label>
                <select id="cp-period" value={period} onChange={e => setPeriod(e.target.value as 'monthly' | 'sixmonth' | 'yearly')} className="input-field">
                  <option value="monthly">Monthly</option>
                  <option value="sixmonth">6 months</option>
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
            {type === 'discount' && (
              <div>
                <label htmlFor="cp-exp" className="label">Redeem by</label>
                <input id="cp-exp" type="date" value={expires} onChange={e => setExpires(e.target.value)} className="input-field" />
              </div>
            )}
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
                      {c.type === 'free' ? (c.expiresAt ? 'Free Pro' : `${c.days} days free`) : `One-time discount · ${c.basePlanId || c.offerId || '?'}${c.plan !== 'any' ? ` · ${c.plan}` : ''}`}
                      {' · '}{c.redeemedCount}/{c.maxRedemptions || '∞'} used
                      {c.expiresAt ? ` · ${c.type === 'free' ? 'Pro until' : 'redeem by'} ${formatWhen(c.expiresAt)}` : ''}
                    </div>
                    {c.label && <div className="text-xs mt-0.5 truncate">{c.label}</div>}
                    {c.type === 'free' && (
                      <label className="mt-1.5 flex items-center gap-2 text-[11px] text-bone-dim">
                        <span>Change end date</span>
                        <input
                          type="date"
                          min={durationEnd('custom')}
                          value={c.expiresAt ? toDateInput(c.expiresAt.toDate()) : ''}
                          disabled={changeEnd.isPending}
                          onChange={async e => {
                            const date = e.target.value;
                            if (!date) return;
                            const ok = await confirm({
                              title: `End ${c.code} on ${endOfDay(date).toLocaleDateString()}?`,
                              message: 'Pro unlocked by this code ends on this day for everyone who used it.',
                              confirmText: 'Change date',
                            });
                            if (ok) changeEnd.mutate({ c, date });
                          }}
                          className="input-field !h-8 !min-h-0 !py-0 !w-auto text-xs"
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (c.active && c.type === 'free' && c.redeemedCount > 0 && !await confirm({
                          title: `Disable ${c.code}?`,
                          message: 'Pro unlocked by this code is switched off for everyone who used it. Enabling it again restores it.',
                          confirmText: 'Disable',
                          type: 'warning',
                        })) return;
                        toggle.mutate({ c, active: !c.active });
                      }}
                      className="btn-secondary py-1.5 px-3 text-xs"
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => { if (await confirm({ title: `Delete ${c.code}?`, message: c.type === 'free' ? 'Pro unlocked by this code ends now for everyone who used it.' : 'Unused discounts from this code stop working. Already paid periods are kept.', confirmText: 'Delete', type: 'danger' })) remove.mutate(c.code); }}
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
