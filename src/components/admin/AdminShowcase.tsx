import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CreditCard, ExternalLink, Mail, Phone, Star, Store, Trash2, UserCheck, UserX } from 'lucide-react';
import { db } from '@/lib/firebase';
import { usePaymentsMode, type PaymentsMode } from '@/lib/payments-mode';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { logAdminAction } from '@/services/admin';
import {
  adminDeleteShowcase, adminUpdateShowcase, declineMarketRequest, listAllShowcase, listMarketPartners, listMarketRequests,
  setMarketPartner, type MarketRequest, type ShowcaseItem,
} from '@/services/showcase';
import { CopyId, EmptyState, ErrorState, LoadingState, RefreshButton, SectionHeader, formatWhen, useReasonDialog } from './AdminShared';

const pill = (tone: 'ok' | 'warn' | 'off' | 'bad') => ({
  ok: 'bg-emerald-500/15 text-emerald-500', warn: 'bg-amber-500/15 text-amber-500', off: 'bg-bone/10 text-bone-dim', bad: 'bg-danger/15 text-danger',
}[tone]);

const MODES: { id: PaymentsMode; title: string; body: string }[] = [
  { id: 'off', title: 'Off', body: 'No checkout, payouts, ticket prices or paid clans anywhere. Events and challenges can show an entry fee that organisers collect themselves.' },
  { id: 'admin', title: 'Admins only (testing)', body: 'Everything payment-related works for admin accounts only, so you can test checkout and payouts before launch.' },
  { id: 'on', title: 'On for everyone', body: 'Paid tickets, paid clans, plan sales, seller sign-up and payouts are live for all users.' },
];

/** One switch for all in-app marketplace payments. Pro subscriptions are not affected. */
export function PaymentsSwitch() {
  const mode = usePaymentsMode();
  const user = useAuthStore(s => s.user);
  const { showToast, confirm } = useUIStore();
  const save = useMutation({
    mutationFn: async (next: PaymentsMode) => {
      await setDoc(doc(db, 'admin_settings', 'market'), { paymentsMode: next, updatedAt: serverTimestamp(), updatedBy: user?.uid || '' }, { merge: true });
      await logAdminAction('market.payments_mode', 'admin_settings', 'market', { details: next });
    },
    onSuccess: (_, next) => showToast(`Marketplace payments: ${MODES.find(m => m.id === next)?.title}`, 'success'),
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });

  const pick = async (next: PaymentsMode) => {
    if (next === mode || save.isPending) return;
    if (next === 'on' && !await confirm({
      title: 'Turn on payments for everyone?',
      message: 'Users will be able to buy tickets, plans and clan memberships, and sellers can apply for payouts. Make sure refunds and support are ready.',
      confirmText: 'Turn on', type: 'danger',
    })) return;
    save.mutate(next);
  };

  return (
    <section className="card p-5">
      <SectionHeader icon={CreditCard} title="Marketplace payments" description="Controls paid tickets, paid clans, plan sales, seller sign-up and payouts. Pro subscriptions always stay on." />
      <div className="grid gap-2">
        {MODES.map(m => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              disabled={save.isPending}
              className={`text-left rounded-xl border p-3 flex items-start gap-3 transition-colors ${on ? 'border-sienna bg-sienna/10' : 'border-line/60 bg-ink-2 hover:border-sienna/40'}`}
              aria-pressed={on}
            >
              <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 ${on ? 'border-sienna bg-sienna' : 'border-bone-dim'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="block text-xs text-bone-dim mt-0.5 leading-snug">{m.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-bone-dim mt-3">Takes effect in the app immediately and on the server within 15 seconds.</p>
    </section>
  );
}

const KIND_LABEL: Record<MarketRequest['kind'], string> = {
  brand: 'Brand / store', gym: 'Gym / studio', coach: 'Coach', community: 'Community', organizer: 'Organiser', other: 'Other',
};

/** People asking to list on the marketplace, and who currently can. */
export function ListingRequests() {
  const { showToast, confirm } = useUIStore();
  const user = useAuthStore(s => s.user);
  const queryClient = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const requests = useQuery({ queryKey: ['adminMarketRequests'], queryFn: listMarketRequests });
  const partners = useQuery({ queryKey: ['adminMarketPartners'], queryFn: listMarketPartners });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminMarketRequests'] });
    queryClient.invalidateQueries({ queryKey: ['adminMarketPartners'] });
  };
  const grant = useMutation({
    mutationFn: ({ uid, name, active }: { uid: string; name: string; active: boolean }) => setMarketPartner(uid, name, active, user!.uid),
    onSuccess: (_, v) => { refresh(); showToast(v.active ? 'Access granted. They were notified in the app.' : 'Access removed and listings hidden'); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });
  const decline = useMutation({
    mutationFn: ({ uid, note }: { uid: string; note: string }) => declineMarketRequest(uid, note),
    onSuccess: () => { refresh(); showToast('Request declined'); },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });

  const order: Record<string, number> = { pending: 0, declined: 1, approved: 2 };
  const rows = [...(requests.data || [])].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  const active = (partners.data || []).filter(p => p.active);

  const grantById = async () => {
    const res = await ask({ title: 'Give listing access', message: 'Paste the user ID (from their profile or the Users tab).', placeholder: 'User ID', required: true, confirmText: 'Continue', maxLength: 128 });
    const uid = res?.text.trim();
    if (!uid || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) { if (uid) showToast('That doesn\'t look like a user ID', 'error'); return; }
    const named = await ask({ title: 'Business name', message: 'Shown to admins only.', placeholder: 'e.g. Iron Temple Gym', required: true, confirmText: 'Grant access', maxLength: 80 });
    if (named) grant.mutate({ uid, name: named.text.trim(), active: true });
  };

  return (
    <section className="card p-5 space-y-5">
      <SectionHeader
        icon={Store}
        title="Listing requests"
        description="Brands, gyms, coaches and community owners who asked to list. Contact them, then grant access."
        actions={<RefreshButton busy={requests.isFetching || partners.isFetching} onClick={refresh} />}
      />
      {requests.isLoading ? <LoadingState /> : requests.error ? <ErrorState error={requests.error} onRetry={() => requests.refetch()} /> : !rows.length ? <EmptyState>No requests yet.</EmptyState> : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.uid} className="rounded-xl border border-line/60 bg-ink-2 p-3 flex flex-wrap gap-3 items-start">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{r.business}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill(r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'off')}`}>{r.status}</span>
                  <span className="text-[11px] text-bone-dim">{KIND_LABEL[r.kind] || r.kind}</span>
                </div>
                <div className="text-xs text-bone-dim mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {r.name && <span>{r.name}</span>}
                  <a className="inline-flex items-center gap-1 hover:text-bone" href={`mailto:${encodeURIComponent(r.contactEmail)}`}><Mail size={11} /> {r.contactEmail}</a>
                  {r.contactPhone && <a className="inline-flex items-center gap-1 hover:text-bone" href={`tel:${r.contactPhone.replace(/[^0-9+]/g, '')}`}><Phone size={11} /> {r.contactPhone}</a>}
                  {r.website && /^https:\/\//.test(r.website) && <a className="inline-flex items-center gap-1 hover:text-bone" href={r.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={11} /> Website</a>}
                </div>
                {r.message && <div className="text-xs mt-1.5 whitespace-pre-line">{r.message}</div>}
                <div className="mt-1 flex gap-3 flex-wrap items-center"><CopyId value={r.uid} label={`uid ${r.uid.slice(0, 8)}…`} /><span className="text-[11px] text-bone-dim">{formatWhen(r.updatedAt || r.createdAt)}</span></div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {r.status !== 'approved' && <button type="button" className="btn-primary py-1.5 px-3 text-xs" disabled={grant.isPending} onClick={() => grant.mutate({ uid: r.uid, name: r.business, active: true })}>Grant access</button>}
                {r.status === 'pending' && (
                  <button
                    type="button" className="btn-secondary py-1.5 px-3 text-xs"
                    onClick={async () => { const res = await ask({ title: 'Decline request', message: 'They see this note.', required: true, danger: true, confirmText: 'Decline', maxLength: 300 }); if (res) decline.mutate({ uid: r.uid, note: res.text }); }}
                  >
                    Decline
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-semibold">Can list ({active.length})</div>
          <button type="button" className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1.5" onClick={grantById}><UserCheck size={13} /> Grant by user ID</button>
        </div>
        {partners.isLoading ? <LoadingState /> : !active.length ? <EmptyState>Nobody yet.</EmptyState> : (
          <div className="space-y-1.5">
            {active.map(p => (
              <div key={p.uid} className="rounded-xl border border-line/60 bg-ink-2 px-3 py-2 flex items-center gap-3">
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{p.name || p.uid}</span>
                <CopyId value={p.uid} label={`${p.uid.slice(0, 8)}…`} />
                <button
                  type="button" className="btn-danger py-1 px-2.5 text-xs inline-flex items-center gap-1"
                  onClick={async () => { if (await confirm({ title: `Remove access for ${p.name || 'this user'}?`, message: 'Their listings will be hidden from the Marketplace.', confirmText: 'Remove', type: 'danger' })) grant.mutate({ uid: p.uid, name: p.name, active: false }); }}
                >
                  <UserX size={12} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {dialog}
    </section>
  );
}

/** Every marketplace listing, with hide / feature / delete. */
export function ListingsModeration() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['adminShowcase'], queryFn: listAllShowcase });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['adminShowcase'] }); queryClient.invalidateQueries({ queryKey: ['showcase'] }); };
  const update = useMutation({
    mutationFn: ({ item, patch }: { item: ShowcaseItem; patch: Partial<Pick<ShowcaseItem, 'active' | 'featured'>> }) => adminUpdateShowcase(item, patch),
    onSuccess: refresh,
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });
  const remove = useMutation({
    mutationFn: (item: ShowcaseItem) => adminDeleteShowcase(item),
    onSuccess: () => { refresh(); showToast('Listing deleted'); },
    onError: (e: any) => showToast(e?.message || 'Could not delete', 'error'),
  });
  const term = filter.trim().toLowerCase();
  const rows = (q.data || []).filter(i => !term || `${i.title} ${i.ownerName} ${i.url}`.toLowerCase().includes(term));

  return (
    <section className="card p-5">
      <SectionHeader icon={Store} title="Marketplace listings" description="Everything partners have listed. Hide or delete anything misleading or reported; feature the best." actions={<RefreshButton busy={q.isFetching} onClick={() => q.refetch()} />} />
      <input className="input-field w-full text-sm mb-3" placeholder="Search title, owner or link" value={filter} onChange={e => setFilter(e.target.value)} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState>No listings.</EmptyState> : (
        <div className="space-y-2">
          {rows.map(i => (
            <div key={i.id} className="rounded-xl border border-line/60 bg-ink-2 p-3 flex flex-wrap gap-3 items-center">
              <span className="w-12 h-12 rounded-lg overflow-hidden bg-bone/5 shrink-0">{i.imageUrl && <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />}</span>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{i.title}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill(i.active ? 'ok' : 'off')}`}>{i.active ? 'live' : 'hidden'}</span>
                  {i.featured && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${pill('warn')}`}>featured</span>}
                </div>
                <div className="text-xs text-bone-dim mt-0.5 truncate">
                  {i.kind} · {i.ownerName || i.ownerId} · {i.clicks || 0} views · {i.targetType === 'url' ? i.url : `${i.targetType} ${i.targetId}`}
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button type="button" className="btn-secondary py-1.5 px-2.5 text-xs inline-flex items-center gap-1" onClick={() => update.mutate({ item: i, patch: { featured: !i.featured } })}><Star size={12} /> {i.featured ? 'Unfeature' : 'Feature'}</button>
                <button type="button" className="btn-secondary py-1.5 px-2.5 text-xs" onClick={() => update.mutate({ item: i, patch: { active: !i.active } })}>{i.active ? 'Hide' : 'Show'}</button>
                <button
                  type="button" className="btn-danger py-1.5 px-2.5 text-xs inline-flex items-center gap-1"
                  onClick={async () => { if (await confirm({ title: 'Delete this listing?', message: i.title, confirmText: 'Delete', type: 'danger' })) remove.mutate(i); }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
