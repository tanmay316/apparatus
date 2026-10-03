import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, ExternalLink, Gift, Link2, Pencil, Receipt, RotateCw, Trash2, Wallet } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
  applySponsor, formatInr, listPayoutAccounts, listRecentOrders, listSponsorships, quoteSponsorship, retryTransfer,
  reviewPayoutAccount, setPayoutTrusted, setSponsorshipStatus, type PayoutAccount, type Sponsorship,
} from '@/services/market';
import {
  deleteAffiliateLink, getAffiliateSettings, listAffiliateLinks, saveAffiliateLink, saveAffiliateSettings,
} from '@/services/affiliates';
import { isSafeAffiliateUrl, type AffiliateLink, type AffiliatePlacement } from '@/lib/affiliates';
import { CopyId, EmptyState, ErrorState, FilterPills, LoadingState, RefreshButton, SectionHeader, formatWhen, useReasonDialog } from './AdminShared';
import { ListingRequests, ListingsModeration, PaymentsSwitch } from './AdminShowcase';
import { BRAND } from '@/lib/brand';

type Section = 'payments' | 'requests' | 'listings' | 'payouts' | 'sponsors' | 'affiliates' | 'orders';

const pill = (tone: 'ok' | 'warn' | 'off' | 'bad') => ({
  ok: 'bg-emerald-500/15 text-emerald-500', warn: 'bg-amber-500/15 text-amber-500', off: 'bg-bone/10 text-bone-dim', bad: 'bg-danger/15 text-danger',
}[tone]);

function Payouts() {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const q = useQuery({ queryKey: ['adminPayouts'], queryFn: listPayoutAccounts });
  const review = useMutation({
    mutationFn: ({ acc, status, accountId, note }: { acc: PayoutAccount; status: PayoutAccount['status']; accountId?: string; note?: string }) =>
      reviewPayoutAccount(acc.uid, { status, razorpayAccountId: accountId, adminNote: note }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminPayouts'] }); showToast('Saved'); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });
  const trust = useMutation({
    mutationFn: (acc: PayoutAccount) => setPayoutTrusted(acc.uid, !acc.trusted),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminPayouts'] }); showToast('Saved'); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });

  const approve = async (acc: PayoutAccount) => {
    const res = await ask({
      title: `Activate payouts for ${acc.legalName}`,
      message: 'In Razorpay Dashboard → Route → Linked Accounts, create a linked account for this person (Razorpay emails them for bank/KYC). Paste its id here.',
      placeholder: 'acc_XXXXXXXXXXXXXX', required: true, confirmText: 'Activate', maxLength: 44,
    });
    if (res) review.mutate({ acc, status: 'active', accountId: res.text.trim() });
  };
  const reject = async (acc: PayoutAccount, status: 'rejected' | 'suspended') => {
    const res = await ask({ title: status === 'rejected' ? 'Ask for changes' : 'Pause payouts', message: 'The seller sees this note.', required: true, danger: true, confirmText: status === 'rejected' ? 'Send back' : 'Pause' });
    if (res) review.mutate({ acc, status, note: res.text });
  };

  const order: Record<string, number> = { pending: 0, rejected: 1, active: 2, suspended: 3 };
  const rows = [...(q.data || [])].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return (
    <section className="card p-5">
      <SectionHeader icon={Wallet} title="Seller payouts" description="Coaches, gyms and hosts who want to get paid. Bank details live only in Razorpay." actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState>No applications yet.</EmptyState> : (
        <div className="space-y-2">
          {rows.map(acc => (
            <div key={acc.uid} className="rounded-xl border border-line/60 bg-ink-2 p-3 flex flex-wrap gap-3 items-start">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{acc.legalName}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill(acc.status === 'active' ? 'ok' : acc.status === 'pending' ? 'warn' : 'bad')}`}>{acc.status}</span>
                  <span className="text-[11px] text-bone-dim">{acc.businessType}</span>
                  {acc.trusted && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill('ok')}`}>trusted</span>}
                  {!acc.termsVersion && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill('warn')}`}>old application</span>}
                </div>
                <div className="text-xs text-bone-dim mt-0.5">{acc.email} · {acc.phone}</div>
                {acc.about && <div className="text-xs mt-1">{acc.about}</div>}
                <div className="mt-1 flex gap-3 flex-wrap"><CopyId value={acc.uid} label={`uid ${acc.uid.slice(0, 8)}…`} />{acc.razorpayAccountId && <CopyId value={acc.razorpayAccountId} />}</div>
                {acc.adminNote && <div className="text-[11px] text-amber-500 mt-1">Note: {acc.adminNote}</div>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {acc.status !== 'active' && <button type="button" className="btn-primary py-1.5 px-3 text-xs" onClick={() => approve(acc)}>Activate</button>}
                {acc.status === 'active' && <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={() => approve(acc)}>Change account</button>}
                {acc.status === 'pending' && <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={() => reject(acc, 'rejected')}>Ask for changes</button>}
                {acc.status === 'active' && <button type="button" className="btn-secondary py-1.5 px-3 text-xs" disabled={trust.isPending} onClick={() => trust.mutate(acc)}>{acc.trusted ? 'Remove trust' : 'Mark trusted'}</button>}
                {acc.status === 'active' && <button type="button" className="btn-danger py-1.5 px-3 text-xs" onClick={() => reject(acc, 'suspended')}>Pause</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </section>
  );
}

function Sponsors() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const q = useQuery({ queryKey: ['adminSponsorships'], queryFn: listSponsorships });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['adminSponsorships'] });

  const quote = async (s: Sponsorship) => {
    const res = await ask({
      title: `Quote ${s.brandName}`,
      message: `Flat fee in ₹. Razorpay emails a payment link to ${s.contactEmail}; the sponsor goes live automatically once paid.${s.budgetInr ? ` Their budget: ${formatInr(s.budgetInr)}.` : ''}`,
      placeholder: '5000', required: true, confirmText: 'Send payment link', maxLength: 7,
    });
    if (!res) return;
    const amount = parseInt(res.text.replace(/[^0-9]/g, ''), 10);
    try {
      const out = await quoteSponsorship(s.id, amount);
      await navigator.clipboard?.writeText(out.payUrl).catch(() => {});
      showToast('Payment link sent (and copied)', 'success');
      refresh();
    } catch (e: any) {
      showToast(e?.message || 'Could not create the payment link', 'error');
    }
  };

  const attach = async (s: Sponsorship) => {
    const res = await ask({
      title: 'Show sponsor on…',
      message: 'Paste the id of the challenge or event (open it, copy from the URL / admin content tab).',
      choices: [{ label: 'Challenge', value: 'challenge' }, { label: 'Event', value: 'event' }],
      initialChoice: s.targetType === 'event' ? 'event' : 'challenge',
      placeholder: 'document id', required: true, confirmText: 'Show sponsor', maxLength: 128,
    });
    if (!res) return;
    try {
      await applySponsor(s, res.choice as 'challenge' | 'event', res.text.trim());
      showToast('Sponsor is live', 'success');
      refresh();
    } catch (e: any) { showToast(e?.message || 'Could not apply', 'error'); }
  };

  const status = useMutation({
    mutationFn: ({ s, st }: { s: Sponsorship; st: Sponsorship['status'] }) => setSponsorshipStatus(s, st),
    onSuccess: refresh,
    onError: (e: any) => showToast(e?.message || 'Could not update', 'error'),
  });

  return (
    <section className="card p-5">
      <SectionHeader icon={Gift} title="Sponsorship requests" description="Quote a flat fee, get paid via Razorpay, and the brand appears on the challenge." actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState>No sponsorship requests yet.</EmptyState> : (
        <div className="space-y-2">
          {q.data.map(s => (
            <div key={s.id} className="rounded-xl border border-line/60 bg-ink-2 p-3 flex flex-wrap gap-3 items-start">
              <div className="w-12 h-12 rounded-lg bg-white overflow-hidden flex items-center justify-center shrink-0">
                {s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-contain" /> : <Gift size={18} className="text-gray-500" />}
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{s.brandName}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill(s.status === 'live' || s.status === 'paid' ? 'ok' : s.status === 'pending' || s.status === 'quoted' ? 'warn' : 'off')}`}>{s.status}</span>
                  {s.amountInr ? <span className="text-xs font-mono">{formatInr(s.amountInr)}</span> : null}
                  {s.budgetInr ? <span className="text-[11px] text-bone-dim">budget {formatInr(s.budgetInr)}</span> : null}
                </div>
                <div className="text-xs mt-0.5"><b>Prize:</b> {s.prize}</div>
                <div className="text-xs text-bone-dim mt-0.5">
                  {s.targetType === 'host' ? `Wants ${BRAND.name} to host` : `${s.targetType}: ${s.targetTitle || s.targetId}`} · {s.contactEmail}{s.contactPhone ? ` · ${s.contactPhone}` : ''} · {formatWhen(s.createdAt)}
                </div>
                {s.message && <div className="text-xs mt-1 whitespace-pre-wrap">{s.message}</div>}
                <div className="mt-1 flex gap-3 flex-wrap">
                  {s.website && isSafeAffiliateUrl(s.website) && <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sienna inline-flex items-center gap-1"><ExternalLink size={11} /> website</a>}
                  {s.payUrl && <CopyId value={s.payUrl} label="payment link" />}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(s.status === 'pending' || s.status === 'quoted') && <button type="button" className="btn-primary py-1.5 px-3 text-xs" onClick={() => quote(s)}>{s.status === 'quoted' ? 'Re-quote' : 'Quote'}</button>}
                {(s.status === 'paid' || s.status === 'live') && <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={() => attach(s)}>{s.status === 'live' ? 'Move' : 'Attach'}</button>}
                {(s.status === 'pending' || s.status === 'quoted') && (
                  <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={async () => { if (await confirm({ title: 'Decline request?', message: 'The requester sees it as declined.', confirmText: 'Decline', type: 'danger' })) status.mutate({ s, st: 'declined' }); }}>Decline</button>
                )}
                {s.status === 'live' && s.targetId && (s.targetType === 'challenge' || s.targetType === 'event') && (
                  <button type="button" className="btn-danger py-1.5 px-3 text-xs" onClick={async () => {
                    if (!(await confirm({ title: 'Remove sponsor?', message: 'The badge disappears from the challenge.', confirmText: 'Remove', type: 'danger' }))) return;
                    try { await applySponsor(s, s.targetType as 'challenge' | 'event', s.targetId!, false); await setSponsorshipStatus(s, 'paid'); refresh(); } catch (e: any) { showToast(e?.message || 'Failed', 'error'); }
                  }}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </section>
  );
}

const EMPTY_LINK = { title: '', url: '', imageUrl: '', priceText: '', partner: '', keywords: '', placements: ['exercise'] as AffiliatePlacement[], priority: 0, active: true };

function Affiliates() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const links = useQuery({ queryKey: ['adminAffiliates'], queryFn: listAffiliateLinks });
  const settings = useQuery({ queryKey: ['adminAffiliateSettings'], queryFn: getAffiliateSettings });
  const [tag, setTag] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_LINK, id: '' });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['adminAffiliates'] }); queryClient.invalidateQueries({ queryKey: ['affiliateCatalog'] }); };

  const save = useMutation({
    mutationFn: () => {
      if (!form.title.trim()) throw new Error('Add a title.');
      if (!isSafeAffiliateUrl(form.url.trim())) throw new Error('Link must start with https://');
      if (form.imageUrl.trim() && !isSafeAffiliateUrl(form.imageUrl.trim())) throw new Error('Image must start with https://');
      if (!form.placements.length) throw new Error('Pick where to show it.');
      return saveAffiliateLink({
        id: form.id || undefined, title: form.title, url: form.url, imageUrl: form.imageUrl, priceText: form.priceText, partner: form.partner,
        keywords: form.keywords.split(','), placements: form.placements, priority: form.priority, active: form.active,
      });
    },
    onSuccess: () => { showToast(form.id ? 'Link updated' : 'Link added'); setForm({ ...EMPTY_LINK, id: '' }); refresh(); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });
  const saveTag = useMutation({
    mutationFn: () => saveAffiliateSettings({ amazonTag: (tag ?? settings.data?.amazonTag ?? '').trim() }),
    onSuccess: () => { showToast('Amazon tag saved'); queryClient.invalidateQueries({ queryKey: ['affiliateCatalog'] }); settings.refetch(); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });

  const edit = (l: AffiliateLink) => setForm({
    id: l.id, title: l.title, url: l.url, imageUrl: l.imageUrl || '', priceText: l.priceText || '', partner: l.partner || '',
    keywords: (l.keywords || []).join(', '), placements: l.placements || [], priority: l.priority || 0, active: l.active,
  });
  const togglePlacement = (p: AffiliatePlacement) => setForm(f => ({ ...f, placements: f.placements.includes(p) ? f.placements.filter(x => x !== p) : [...f.placements, p] }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5">
      <section className="card p-5 space-y-4">
        <SectionHeader icon={Link2} title={form.id ? 'Edit link' : 'New affiliate link'} description="Shown on matching exercises and in nutrition." />
        <div>
          <label className="label" htmlFor="af-tag">Amazon Associates tag</label>
          <div className="flex gap-2">
            <input id="af-tag" className="input-field font-mono" placeholder="yourtag-21" value={tag ?? settings.data?.amazonTag ?? ''} onChange={e => setTag(e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40))} />
            <button type="button" className="btn-secondary px-3" onClick={() => saveTag.mutate()} disabled={saveTag.isPending}>Save</button>
          </div>
          <p className="text-[11px] text-bone-dim mt-1">Added automatically to every amazon.in / amazon.com link.</p>
        </div>
        <hr className="border-line/50" />
        <div><label className="label" htmlFor="af-title">Product title</label><input id="af-title" className="input-field" maxLength={100} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Doorway pull-up bar" /></div>
        <div><label className="label" htmlFor="af-url">Link (https)</label><input id="af-url" className="input-field font-mono text-xs" value={form.url} onChange={e => setForm({ ...form, url: e.target.value.trim() })} placeholder="https://www.amazon.in/dp/..." /></div>
        <div><label className="label" htmlFor="af-img">Image URL (optional)</label><input id="af-img" className="input-field font-mono text-xs" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value.trim() })} placeholder="https://m.media-amazon.com/..." /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="af-price">Price text</label><input id="af-price" className="input-field" maxLength={30} value={form.priceText} onChange={e => setForm({ ...form, priceText: e.target.value })} placeholder="₹1,299" /></div>
          <div><label className="label" htmlFor="af-partner">Store</label><input id="af-partner" className="input-field" maxLength={40} value={form.partner} onChange={e => setForm({ ...form, partner: e.target.value })} placeholder="Amazon / MuscleBlaze" /></div>
        </div>
        <div>
          <label className="label" htmlFor="af-kw">Keywords (comma separated)</label>
          <input id="af-kw" className="input-field" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder="pull-up, chin-up, hanging leg raise" />
          <p className="text-[11px] text-bone-dim mt-1">Matched against the exercise name, or the user's goal/diet for nutrition (lose, gain, vegan, protein…). Use * to show everywhere.</p>
        </div>
        <div>
          <span className="label">Show on</span>
          <div className="flex gap-2">
            {(['exercise', 'nutrition'] as AffiliatePlacement[]).map(p => (
              <button key={p} type="button" onClick={() => togglePlacement(p)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border capitalize ${form.placements.includes(p) ? 'border-sienna bg-sienna/10 text-sienna' : 'border-line text-bone-dim'}`}>{p}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div><label className="label" htmlFor="af-pri">Priority</label><input id="af-pri" type="number" className="input-field" value={form.priority} onChange={e => setForm({ ...form, priority: Math.max(-99, Math.min(99, Number(e.target.value) || 0)) })} /></div>
          <label className="flex items-center gap-2 text-sm pb-3"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label>
        </div>
        <div className="flex gap-2">
          {form.id && <button type="button" className="btn-secondary flex-1" onClick={() => setForm({ ...EMPTY_LINK, id: '' })}>Cancel</button>}
          <button type="button" className="btn-primary flex-1" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : form.id ? 'Save changes' : 'Add link'}</button>
        </div>
      </section>

      <section className="card p-5 min-w-0">
        <SectionHeader title="Affiliate links" description="Clicks are counted when users tap Shop." actions={<RefreshButton busy={links.isFetching} onClick={() => links.refetch()} />} />
        {links.isLoading ? <LoadingState /> : links.error ? <ErrorState error={links.error} onRetry={() => links.refetch()} /> : !links.data?.length ? <EmptyState>No links yet. Add your first product on the left.</EmptyState> : (
          <div className="space-y-2">
            {[...links.data].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).map(l => (
              <div key={l.id} className="rounded-xl border border-line/60 bg-ink-2 p-3 flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-white overflow-hidden shrink-0 flex items-center justify-center">
                  {l.imageUrl ? <img src={l.imageUrl} alt="" className="w-full h-full object-contain" /> : <Link2 size={16} className="text-gray-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{l.title}</div>
                  <div className="text-[11px] text-bone-dim truncate">{(l.placements || []).join(' + ')} · {(l.keywords || []).join(', ') || 'no keywords'}</div>
                </div>
                <span className="text-xs font-mono">{l.clicks || 0} clicks</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${pill(l.active ? 'ok' : 'off')}`}>{l.active ? 'ON' : 'OFF'}</span>
                <button type="button" className="btn-secondary py-1.5 px-2.5" aria-label="Edit" onClick={() => edit(l)}><Pencil size={13} /></button>
                <button
                  type="button"
                  className="btn-danger py-1.5 px-2.5"
                  aria-label="Delete"
                  onClick={async () => { if (await confirm({ title: 'Delete link?', message: l.title, confirmText: 'Delete', type: 'danger' })) deleteAffiliateLink(l.id).then(refresh).catch((e: any) => showToast(e?.message || 'Failed', 'error')); }}
                ><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Orders() {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['adminOrders'], queryFn: listRecentOrders });
  const retry = useMutation({
    mutationFn: (id: string) => retryTransfer(id),
    onSuccess: (r) => { showToast(r.status === 'created' ? 'Payout sent' : `Payout ${r.status}${r.error ? `: ${r.error}` : ''}`, r.status === 'created' ? 'success' : 'error'); queryClient.invalidateQueries({ queryKey: ['adminOrders'] }); },
    onError: (e: any) => showToast(e?.message || 'Retry failed', 'error'),
  });
  const paid = (q.data || []).filter(o => o.status === 'fulfilled');
  const revenue = paid.reduce((n, o) => n + (o.fee || 0), 0) / 100;
  const gross = paid.reduce((n, o) => n + (o.amount || 0), 0) / 100;

  return (
    <section className="card p-5">
      <SectionHeader icon={Receipt} title="Orders" description={`Last ${q.data?.length || 0} checkouts · ${formatInr(gross)} sold · ${formatInr(revenue)} platform revenue (before Razorpay fees).`} actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState>No orders yet.</EmptyState> : (
        <div className="space-y-2">
          {q.data.map(o => (
            <div key={o.id} className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${o.status === 'refund_due' ? 'border-danger/50 bg-danger/5' : 'border-line/60 bg-ink-2'}`}>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">{o.title}</span>
                  <span className="text-[10px] font-mono uppercase text-bone-dim">{o.kind}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill(o.status === 'fulfilled' ? 'ok' : o.status === 'created' ? 'warn' : o.status === 'refund_due' ? 'bad' : 'off')}`}>{o.status === 'refund_due' ? 'refund due' : o.status}</span>
                </div>
                <div className="text-[11px] text-bone-dim mt-0.5">{o.buyerName || o.buyerId} · {formatWhen(o.createdAt)} · <CopyId value={o.id} /></div>
                {o.status === 'refund_due' && <div className="text-[11px] text-danger mt-1">Item was deleted after payment. Refund it from Razorpay Dashboard → Payments.</div>}
                {o.transfer?.status === 'failed' && <div className="text-[11px] text-danger mt-1">Payout failed: {o.transfer.error}</div>}
              </div>
              <div className="text-right text-xs font-mono">
                <div className="text-sm font-semibold">{formatInr(o.amount / 100)}</div>
                <div className="text-bone-dim">fee {formatInr((o.fee || 0) / 100)}{o.sellerAmount ? ` · seller ${formatInr(o.sellerAmount / 100)}` : ''}</div>
                {o.transfer && <div className={o.transfer.status === 'created' ? 'text-emerald-500' : o.transfer.status === 'failed' ? 'text-danger' : 'text-amber-500'}>payout {o.transfer.status}</div>}
              </div>
              {o.status === 'fulfilled' && o.sellerAmount > 0 && (o.transfer?.status === 'failed' || o.transfer?.status === 'pending' || !o.transfer) && (
                <button type="button" className="btn-secondary py-1.5 px-3 text-xs" disabled={retry.isPending} onClick={() => retry.mutate(o.id)}><RotateCw size={12} /> Retry payout</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AdminMarketTab() {
  const [section, setSection] = useState<Section>('payments');
  return (
    <div className="space-y-5">
      <FilterPills<Section>
        value={section}
        onChange={setSection}
        options={[
          { id: 'payments', label: 'Payments switch' },
          { id: 'requests', label: 'Listing requests' },
          { id: 'listings', label: 'Listings' },
          { id: 'affiliates', label: 'Affiliate links' },
          { id: 'payouts', label: 'Payouts' },
          { id: 'sponsors', label: 'Sponsorships' },
          { id: 'orders', label: 'Orders' },
        ]}
      />
      {section === 'payments' && <PaymentsSwitch />}
      {section === 'requests' && <ListingRequests />}
      {section === 'listings' && <ListingsModeration />}
      {section === 'payouts' && <Payouts />}
      {section === 'sponsors' && <Sponsors />}
      {section === 'affiliates' && <Affiliates />}
      {section === 'orders' && <Orders />}
      <p className="text-[11px] text-bone-dim flex items-center gap-1.5"><BadgeIndianRupee size={12} /> Fees and limits are set on the backend (MARKET_FEE_PCT_TICKET / MARKET_FEE_PCT_COACH).</p>
    </div>
  );
}
