import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck, BadgeIndianRupee, CalendarDays, Clock, Eye, EyeOff, Loader2, Plus, ShieldAlert, Store, Trash2, Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getPlanDays, getUserPlans, updatePlan } from '@/services/plans';
import {
  createListing, deleteListing, formatInr, listMyListings, listMySales, planPreview, savePayoutApplication, sellerShare,
  updateListing, type PayoutAccount, type PlanListing,
} from '@/services/market';
import { useMarketConfig, usePayoutAccount } from './CheckoutButton';
import { MarketSheet } from './MarketSheet';
import { parsePriceInput } from './PriceField';

function PayoutSheet({ existing, onClose }: { existing: PayoutAccount | null; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const [legalName, setLegalName] = useState(existing?.legalName || profile?.displayName || '');
  const [email, setEmail] = useState(existing?.email || user?.email || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [businessType, setBusinessType] = useState<PayoutAccount['businessType']>(existing?.businessType || 'individual');
  const [about, setAbout] = useState(existing?.about || '');

  const valid = legalName.trim().length >= 2 && /^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email.trim()) && /^\+?[0-9 ]{8,16}$/.test(phone.trim());
  const save = useMutation({
    mutationFn: () => savePayoutApplication(user!.uid, { legalName, email, phone, businessType, about }, existing),
    onSuccess: () => { showToast('Application sent. We\'ll email you the next steps.', 'success'); onClose(); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });

  return (
    <MarketSheet
      title="Set up payouts"
      subtitle="Tell us who to pay. Razorpay will then ask you for bank and KYC details directly - we never see or store them."
      onClose={onClose}
      footer={<button type="button" className="dx-btn w-full" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Sending…' : 'Send application'}</button>}
    >
      <div className="space-y-4">
        <div>
          <label className="dx-label" htmlFor="po-name">Legal name (as on your bank account)</label>
          <input id="po-name" className="dx-input w-full" value={legalName} maxLength={100} onChange={e => setLegalName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="dx-label" htmlFor="po-email">Email</label>
            <input id="po-email" type="email" className="dx-input w-full" value={email} maxLength={120} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="dx-label" htmlFor="po-phone">Phone</label>
            <input id="po-phone" type="tel" className="dx-input w-full" value={phone} maxLength={16} placeholder="+91 98765 43210" onChange={e => setPhone(e.target.value.replace(/[^0-9+ ]/g, ''))} />
          </div>
        </div>
        <div>
          <span className="dx-label">I'm selling as</span>
          <div className="dx-segment" role="tablist">
            <button type="button" role="tab" aria-selected={businessType === 'individual'} onClick={() => setBusinessType('individual')}>Individual coach</button>
            <button type="button" role="tab" aria-selected={businessType === 'business'} onClick={() => setBusinessType('business')}>Gym / business</button>
          </div>
        </div>
        <div>
          <label className="dx-label" htmlFor="po-about">What will you sell? (optional)</label>
          <textarea id="po-about" className="dx-input w-full" rows={3} maxLength={500} value={about} onChange={e => setAbout(e.target.value)} placeholder="e.g. 12-week calisthenics plans, a paid running club, monthly 5K events" />
        </div>
      </div>
    </MarketSheet>
  );
}

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
  const [price, setPrice] = useState('499');
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
              <input id="sp-price" className="dx-input w-full" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
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

function StatusCard({ account, onSetup }: { account: PayoutAccount | null; onSetup: () => void }) {
  if (!account) {
    return (
      <section className="dx-hero p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="dx-hero-icon"><Wallet size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">Earn on Apparatus</div>
            <h2 className="mt-1 text-[21px] font-semibold leading-tight">Get paid for your coaching</h2>
            <p className="mt-1.5 text-[13px] opacity-80 leading-relaxed">Sell plans, charge for clan membership and sell tickets for events and challenges. Money goes straight to your bank through Razorpay.</p>
          </div>
        </div>
        <button type="button" onClick={onSetup} className="dx-hero-btn w-full mt-4"><BadgeIndianRupee size={16} /> Set up payouts</button>
      </section>
    );
  }
  const map = {
    pending: { icon: Clock, title: 'Application under review', body: 'We\'ll set up your Razorpay payout account and email you. This usually takes 1-2 days.' },
    active: { icon: BadgeCheck, title: 'Payouts active', body: 'Add prices to your plans, clans, events and challenges. Earnings settle to your bank automatically.' },
    rejected: { icon: ShieldAlert, title: 'Application needs changes', body: account.adminNote || 'Please check your details and send it again.' },
    suspended: { icon: ShieldAlert, title: 'Payouts paused', body: account.adminNote || 'Contact support to resume payouts.' },
  }[account.status];
  const Icon = map.icon;
  return (
    <section className="dx-card p-4 flex items-start gap-3">
      <span className="dx-badge-icon" style={{ background: account.status === 'active' ? 'var(--dx-success-soft)' : 'var(--dx-accent-soft)', color: account.status === 'active' ? 'var(--dx-success)' : 'var(--dx-accent)' }}><Icon size={18} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold">{map.title}</div>
        <p className="text-[13px] dx-muted mt-0.5 leading-snug">{map.body}</p>
        {account.status === 'rejected' && <button type="button" onClick={onSetup} className="dx-link mt-2">Edit application</button>}
      </div>
    </section>
  );
}

export function SellerHub() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const config = useMarketConfig();
  const account = usePayoutAccount(user?.uid);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const active = account?.status === 'active';

  const listings = useQuery({ queryKey: ['myListings', user?.uid], queryFn: () => listMyListings(user!.uid), enabled: !!user && active });
  const sales = useQuery({ queryKey: ['mySales', user?.uid], queryFn: () => listMySales(user!.uid), enabled: !!user && !!account });
  const earned = useMemo(() => (sales.data || []).filter(o => o.status === 'fulfilled').reduce((n, o) => n + (o.sellerAmount || 0), 0) / 100, [sales.data]);

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

  if (account === undefined) return <div className="dx-card h-40 animate-pulse" />;

  return (
    <div className="space-y-4">
      <StatusCard account={account} onSetup={() => setPayoutOpen(true)} />

      <section className="grid grid-cols-3 gap-2 text-center">
        {[
          { k: 'Plans & clans', v: `${100 - config.fees.coach}%` },
          { k: 'Tickets', v: `${100 - config.fees.ticket}%` },
          { k: 'Earned', v: formatInr(earned) },
        ].map(s => (
          <div key={s.k} className="dx-card p-3">
            <div className="text-[19px] font-semibold tabular">{s.v}</div>
            <div className="text-[11px] dx-muted mt-0.5">{s.k === 'Earned' ? 'You earned' : `You keep · ${s.k}`}</div>
          </div>
        ))}
      </section>

      {active && (
        <>
          <section className="dx-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold">Your plans for sale</div>
                <div className="text-[12px] dx-muted">Buyers get a private copy.</div>
              </div>
              <button type="button" className="dx-btn !h-10 gap-1.5" onClick={() => setSellOpen(true)}><Plus size={15} /> Sell a plan</button>
            </div>
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
          </section>

          <section className="dx-card p-4 text-[13px] leading-relaxed">
            <div className="text-[15px] font-semibold mb-1">Charge for clans, events and challenges</div>
            <ul className="dx-muted space-y-1 list-disc pl-5">
              <li>Clan settings → <b>Paid membership</b> for a one-time join fee.</li>
              <li>When creating or editing an event → <b>Ticket price</b>.</li>
              <li>When creating or editing a challenge → <b>Entry fee</b>.</li>
            </ul>
            <button type="button" className="dx-link mt-2" onClick={() => navigate('/community')}>Go to Community</button>
          </section>
        </>
      )}

      {!!account && (
        <section className="dx-card p-4">
          <div className="text-[15px] font-semibold">Sales</div>
          {sales.isLoading ? <Loader2 size={16} className="animate-spin mt-3 dx-muted" /> : !(sales.data || []).length ? (
            <div className="text-[13px] dx-muted mt-1">No sales yet.</div>
          ) : (
            <div className="mt-2 dx-list">
              {sales.data!.slice(0, 30).map(o => (
                <div key={o.id} className="py-2.5 flex items-center gap-3 text-[13px]">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{o.title}</div>
                    <div className="dx-muted text-[12px]">{o.buyerName || 'Athlete'} · {o.createdAt?.toDate?.().toLocaleDateString() || ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular">{formatInr((o.sellerAmount || 0) / 100)}</div>
                    <div className="text-[11px] dx-muted">
                      {o.status === 'refund_due' ? 'Refunding' : o.transfer?.status === 'created' ? 'Paid out' : o.transfer?.status === 'failed' ? 'Payout issue' : 'Processing'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <AnimatePresence>
        {payoutOpen && <PayoutSheet key="payout" existing={account} onClose={() => setPayoutOpen(false)} />}
        {sellOpen && <SellPlanSheet key="sell" onClose={() => setSellOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
