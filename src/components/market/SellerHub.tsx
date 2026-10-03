import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck, BadgeIndianRupee, CalendarDays, Clock, Eye, EyeOff, Loader2, Plus, ShieldAlert, Store, Trash2, Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getPlanDays, getUserPlans, updatePlan } from '@/services/plans';
import {
  createListing, deleteListing, formatInr, listMyListings, listMySales, planPreview, sellerShare,
  updateListing, type MarketOrder, type PayoutAccount, type PlanListing,
} from '@/services/market';
import { useMarketConfig } from './CheckoutButton';
import { MarketSheet } from './MarketSheet';
import { parsePriceInput } from './PriceField';

function SellPlanSheet({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const config = useMarketConfig();
  const plans = useQuery({ queryKey: ['userPlans', user?.uid], queryFn: () => getUserPlans(user!.uid), enabled: !!user });
  const sellable = (plans.data || []).filter(p => !p.purchasedFrom);
  const [planId, setPlanId] = useState('');
  const plan = sellable.find(p => p.id === planId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const parsed = parsePriceInput(price, config);

  const pick = (id: string) => {
    const p = sellable.find(x => x.id === id);
    setPlanId(id);
    if (p) { setTitle(p.title.slice(0, 80)); setDescription((p.description || '').slice(0, 2000)); }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!plan?.id || !user) throw new Error('Pick a plan');
      if (parsed.error || !parsed.value) throw new Error(parsed.error || 'Set a price');
      if (plan.isPublic) {
        const ok = await confirm({ title: 'Make this plan private?', message: 'Public plans can be imported for free. To sell it, it has to be private.', confirmText: 'Make private' });
        if (!ok) throw new Error('cancelled');
        await updatePlan(plan.id, { isPublic: false });
      }
      const days = await getPlanDays(plan.id);
      if (!days.length) throw new Error('Add at least one day to this plan first.');
      await createListing({
        sellerId: user.uid,
        sellerName: (profile?.displayName || user.displayName || 'Coach').slice(0, 60),
        sellerPhoto: /^https:\/\//.test(profile?.photoURL || '') && (profile?.photoURL || '').length <= 600 ? profile!.photoURL! : '',
        planId: plan.id,
        title,
        description,
        price: parsed.value,
        preview: planPreview(plan, days),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myListings'] });
      queryClient.invalidateQueries({ queryKey: ['marketListings'] });
      showToast('Your plan is on sale!', 'success');
      onClose();
    },
    onError: (e: any) => { if (e?.message !== 'cancelled') showToast(e?.message || 'Could not list this plan', 'error'); },
  });

  return (
    <MarketSheet
      title="Sell a plan"
      subtitle="Buyers get their own copy right after paying. Your original stays private."
      onClose={onClose}
      footer={<button type="button" className="dx-btn w-full" disabled={!plan || !title.trim() || !!parsed.error || !parsed.value || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Listing…' : `List for ${parsed.value ? formatInr(parsed.value) : '…'}`}</button>}
    >
      <div className="space-y-4">
        <div>
          <span className="dx-label">Plan</span>
          {plans.isLoading ? <div className="dx-inset h-12 animate-pulse" /> : sellable.length === 0 ? (
            <div className="dx-inset p-3 text-[13px] dx-muted">Create a plan in Plans first, then come back to sell it.</div>
          ) : (
            <div className="grid gap-2 max-h-56 overflow-y-auto">
              {sellable.map(p => (
                <button key={p.id} type="button" onClick={() => pick(p.id!)} className="dx-inset p-3 text-left flex items-center gap-3" style={planId === p.id ? { outline: '2px solid var(--dx-accent)' } : undefined}>
                  <CalendarDays size={16} className="dx-muted shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate">{p.title}</span>
                    <span className="block text-[12px] dx-muted">{p.daysPerWeek} days/week{p.isPublic ? ' · public' : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {plan && (
          <>
            <div>
              <label className="dx-label" htmlFor="sp-title">Title</label>
              <input id="sp-title" className="dx-input w-full" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="dx-label" htmlFor="sp-desc">Description</label>
              <textarea id="sp-desc" className="dx-input w-full" rows={4} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Who is it for, what results to expect, equipment needed…" />
            </div>
            <div>
              <label className="dx-label" htmlFor="sp-price">Price (₹)</label>
              <input id="sp-price" className="dx-input w-full" inputMode="numeric" value={price} placeholder="e.g. 499" onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
              <p className={`text-[12px] mt-1 ${parsed.error ? 'text-red-500' : 'dx-muted'}`}>
                {parsed.error || (parsed.value ? `You get ${formatInr(sellerShare(parsed.value, config.fees.coach))} per sale (${config.fees.coach}% platform fee).` : 'Set a price.')}
              </p>
            </div>
          </>
        )}
      </div>
    </MarketSheet>
  );
}

/** Payout account state with the next action. */
export function PayoutStatusCard({ account, onSetup }: { account: PayoutAccount | null; onSetup: () => void }) {
  const state = !account
    ? { icon: Wallet, title: 'Set up payouts', body: 'One time, so money from your sales can reach your bank. Razorpay checks your bank account (KYC) directly; we never see your bank details.', cta: 'Set up payouts' }
    : {
      pending: { icon: Clock, title: 'Bank verification in progress', body: 'Razorpay is verifying your payout account. This usually takes 1-2 days; we\'ll email you.', cta: '' },
      active: { icon: BadgeCheck, title: 'Payouts active', body: 'Add prices to your plans, clans, events and challenges. Earnings settle to your bank automatically.', cta: '' },
      rejected: { icon: ShieldAlert, title: 'Payout details need changes', body: account.adminNote || 'Please check your details and send them again.', cta: 'Edit details' },
      suspended: { icon: ShieldAlert, title: 'Payouts paused', body: account.adminNote || 'Contact support to resume payouts.', cta: '' },
    }[account.status];
  const ok = account?.status === 'active';
  return (
    <section className="dx-card p-4 flex items-start gap-3">
      <span className="dx-badge-icon" style={ok ? { background: 'var(--dx-success-soft)', color: 'var(--dx-success)' } : undefined}><state.icon size={18} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold">{state.title}</div>
        <p className="text-[13px] dx-muted mt-0.5 leading-snug">{state.body}</p>
        {state.cta && <button type="button" onClick={onSetup} className="dx-btn !h-10 mt-3"><BadgeIndianRupee size={15} /> {state.cta}</button>}
      </div>
    </section>
  );
}

export function payoutLabel(o: MarketOrder) {
  if (o.status === 'refund_due') return 'Refunding';
  if (o.transfer?.status === 'created') return 'Paid out';
  if (o.transfer?.status === 'failed') return 'Payout issue';
  return o.kind === 'event' || o.kind === 'challenge' ? 'Held until event ends' : 'Processing';
}

/** The seller's own sales (Firestore rules only return orders where they are the seller). */
export function SalesList({ max, onMore }: { max?: number; onMore?: () => void }) {
  const { user } = useAuthStore();
  const sales = useQuery({ queryKey: ['mySales', user?.uid], queryFn: () => listMySales(user!.uid), enabled: !!user });
  const list = (sales.data || []).slice(0, max || 200);
  return (
    <section className="dx-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold">{max ? 'Recent sales' : 'All sales'}</div>
        {onMore && (sales.data || []).length > list.length && <button type="button" className="dx-link text-[13px]" onClick={onMore}>See all</button>}
      </div>
      {sales.isLoading ? <Loader2 size={16} className="animate-spin mt-3 dx-muted" /> : !list.length ? (
        <div className="text-[13px] dx-muted mt-1">No sales yet. They'll show up here as soon as someone buys.</div>
      ) : (
        <div className="mt-2 dx-list">
          {list.map(o => (
            <div key={o.id} className="py-2.5 flex items-center gap-3 text-[13px]">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{o.title}</div>
                <div className="dx-muted text-[12px] truncate">{o.buyerName || 'Athlete'} · {o.createdAt?.toDate?.().toLocaleDateString() || ''}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold tabular">{formatInr((o.sellerAmount || 0) / 100)}</div>
                <div className="text-[11px] dx-muted">{payoutLabel(o)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Training plans the seller has on sale, with hide/remove controls. */
export function PlanListings({ active }: { active: boolean }) {
  const { user } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [sellOpen, setSellOpen] = useState(false);
  const listings = useQuery({ queryKey: ['myListings', user?.uid], queryFn: () => listMyListings(user!.uid), enabled: !!user });

  const toggle = useMutation({
    mutationFn: (l: PlanListing) => updateListing(l, { active: !l.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myListings'] }),
    onError: (e: any) => showToast(e?.message || 'Could not update', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteListing(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['myListings'] }); showToast('Listing removed'); },
    onError: (e: any) => showToast(e?.message || 'Could not remove', 'error'),
  });

  return (
    <section className="dx-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Training plans for sale</div>
          <div className="text-[12px] dx-muted">Buyers get their own copy; your original stays private.</div>
        </div>
        <button type="button" className="dx-btn !h-10 gap-1.5 shrink-0" disabled={!active} onClick={() => setSellOpen(true)}><Plus size={15} /> Sell a plan</button>
      </div>
      {!active && <p className="text-[12px] dx-muted mt-2">Available once payouts are active.</p>}
      <div className="mt-3 space-y-2">
        {listings.isLoading ? <div className="dx-inset h-14 animate-pulse" /> : !(listings.data || []).length ? (
          <div className="text-[13px] dx-muted">No plans listed yet.</div>
        ) : listings.data!.map(l => (
          <div key={l.id} className="dx-inset p-3 flex items-center gap-3">
            <Store size={16} className="dx-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold truncate">{l.title}</div>
              <div className="text-[12px] dx-muted">{formatInr(l.price)} · {l.salesCount || 0} sold · {l.active ? 'On sale' : 'Hidden'}</div>
            </div>
            <button type="button" className="dx-icon-btn dx-icon-btn--sm" aria-label={l.active ? 'Hide listing' : 'Show listing'} onClick={() => toggle.mutate(l)}>
              {l.active ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              className="dx-icon-btn dx-icon-btn--sm"
              aria-label="Remove listing"
              onClick={async () => { if (await confirm({ title: 'Remove listing?', message: 'People who bought it keep their copy.', confirmText: 'Remove', type: 'danger' })) remove.mutate(l.id); }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <AnimatePresence>{sellOpen && <SellPlanSheet key="sell" onClose={() => setSellOpen(false)} />}</AnimatePresence>
    </section>
  );
}

export function useSellerEarnings() {
  const { user } = useAuthStore();
  const sales = useQuery({ queryKey: ['mySales', user?.uid], queryFn: () => listMySales(user!.uid), enabled: !!user });
  return useMemo(() => {
    const paid = (sales.data || []).filter(o => o.status === 'fulfilled');
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const sum = (list: MarketOrder[]) => list.reduce((n, o) => n + (o.sellerAmount || 0), 0) / 100;
    const thisMonth = paid.filter(o => (o.createdAt?.toMillis?.() || 0) >= monthStart);
    return {
      loading: sales.isLoading,
      sales: paid.length,
      monthGross: thisMonth.reduce((n, o) => n + (o.amount || 0), 0) / 100,
      total: sum(paid),
      month: sum(thisMonth),
      tickets: paid.filter(o => o.kind === 'event' || o.kind === 'challenge').length,
      plans: paid.filter(o => o.kind === 'plan').length,
      clans: paid.filter(o => o.kind === 'clan').length,
    };
  }, [sales.data, sales.isLoading]);
}
