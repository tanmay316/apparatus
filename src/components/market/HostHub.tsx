import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { BadgeCheck, CalendarDays, Clock, Download, Loader2, Plus, ShieldAlert, Ticket, Trophy, Wallet } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { exportCsv, toCsv } from '@/lib/csv-export';
import { getChallengeParticipants, getEventParticipants } from '@/services/community';
import { formatInr, listMySales, type MarketOrder } from '@/services/market';
import type { ChallengeV2, SimpleEvent } from '@/types';
import { CreateEventSheet } from '@/components/community/CreateEventSheet';
import { CreateChallengeSheet } from '@/components/community/CreateChallengeSheet';
import { useMarketConfig, usePayoutAccount } from './CheckoutButton';
import { PayoutSheet } from './SellerHub';

type Hosted =
  | { type: 'event'; id: string; item: SimpleEvent }
  | { type: 'challenge'; id: string; item: ChallengeV2 };

const startOf = (h: Hosted) => (h.type === 'event' ? h.item.startTime : h.item.startDate)?.toDate?.();

async function myHosted(uid: string): Promise<Hosted[]> {
  const [ev, ch] = await Promise.all([
    getDocs(query(collection(db, 'simple_events'), where('createdBy', '==', uid), limit(50))),
    getDocs(query(collection(db, 'challenges_v2'), where('createdBy', '==', uid), limit(50))),
  ]);
  const all: Hosted[] = [
    ...ev.docs.map(d => ({ type: 'event' as const, id: d.id, item: { id: d.id, ...d.data() } as SimpleEvent })),
    ...ch.docs.map(d => ({ type: 'challenge' as const, id: d.id, item: { id: d.id, ...d.data() } as ChallengeV2 })),
  ];
  return all
    .filter(h => h.item.status !== 'removed')
    .sort((a, b) => (startOf(b)?.getTime() || 0) - (startOf(a)?.getTime() || 0));
}

const fmtDate = (d?: Date | null) => (d ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** CSV of everyone who joined, with what they paid (from this host's own orders). */
async function exportParticipants(h: Hosted, sales: MarketOrder[]) {
  const people = h.type === 'event' ? await getEventParticipants(h.id) : await getChallengeParticipants(h.id);
  const orders = new Map(sales.filter(o => o.itemId === h.id && o.kind === h.type).map(o => [o.buyerId, o]));
  const challenge = h.type === 'challenge' ? h.item : null;
  const header = ['#', 'Name', 'User ID', 'Joined at', 'Paid (INR)', 'Your share (INR)', 'Payment', 'Order ID'];
  if (challenge) header.push(`Progress (${challenge.unit || ''})`, 'Rank');
  const rows = people.map((p, i) => {
    const o = orders.get(p.userId);
    const row: (string | number)[] = [
      i + 1,
      p.userName || 'Athlete',
      p.userId,
      fmtDate(p.joinedAt?.toDate?.()),
      o ? (o.amount / 100).toFixed(2) : (h.item.ticketPrice ? '' : '0'),
      o ? ((o.sellerAmount || 0) / 100).toFixed(2) : '',
      o ? (o.status === 'refund_due' ? 'Refunding' : 'Paid') : h.item.ticketPrice ? 'No payment found' : 'Free',
      o?.id || '',
    ];
    if (challenge) {
      const cp = p as { progress?: number; rank?: number };
      row.push(cp.progress ?? 0, cp.rank && cp.rank < 9999 ? cp.rank : '');
    }
    return row;
  });
  const stamp = new Date().toISOString().slice(0, 10);
  await exportCsv(`${h.item.title || h.type}-participants-${stamp}.csv`, toCsv([header, ...rows]));
  return people.length;
}

function PayoutStatus({ onSetup }: { onSetup: () => void }) {
  const { user } = useAuthStore();
  const account = usePayoutAccount(user?.uid);
  if (account === undefined) return <div className="dx-card h-20 animate-pulse" />;
  const state = !account
    ? { icon: Wallet, title: 'Set up payouts to sell tickets', body: 'One time. Razorpay checks your bank account (KYC) directly; we never see your bank details.', cta: 'Set up payouts' }
    : account.status === 'active'
      ? { icon: BadgeCheck, title: 'Payouts active', body: 'Add a ticket price when you create an event or challenge.', cta: '' }
      : account.status === 'pending'
        ? { icon: Clock, title: 'Bank verification in progress', body: 'Razorpay is verifying your payout account. You can create events now and add a price once it\'s done.', cta: '' }
        : { icon: ShieldAlert, title: 'Payout setup needs changes', body: account.adminNote || 'Please check your details and send them again.', cta: 'Edit details' };
  const ok = account?.status === 'active';
  return (
    <section className="dx-card p-4 flex items-start gap-3">
      <span className="dx-badge-icon" style={ok ? { background: 'var(--dx-success-soft)', color: 'var(--dx-success)' } : undefined}><state.icon size={18} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold">{state.title}</div>
        <p className="text-[13px] dx-muted mt-0.5 leading-snug">{state.body}</p>
        {state.cta && <button type="button" onClick={onSetup} className="dx-btn !h-10 mt-3">{state.cta}</button>}
      </div>
    </section>
  );
}

export function HostHub() {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const config = useMarketConfig();
  const account = usePayoutAccount(user?.uid);
  const [create, setCreate] = useState<'event' | 'challenge' | null>(null);
  const [payout, setPayout] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const hosted = useQuery({ queryKey: ['myHosted', user?.uid], queryFn: () => myHosted(user!.uid), enabled: !!user });
  const sales = useQuery({ queryKey: ['mySales', user?.uid], queryFn: () => listMySales(user!.uid), enabled: !!user });

  const byItem = useMemo(() => {
    const m = new Map<string, { count: number; earned: number }>();
    for (const o of sales.data || []) {
      if (o.status !== 'fulfilled' || (o.kind !== 'event' && o.kind !== 'challenge')) continue;
      const cur = m.get(o.itemId) || { count: 0, earned: 0 };
      m.set(o.itemId, { count: cur.count + 1, earned: cur.earned + (o.sellerAmount || 0) / 100 });
    }
    return m;
  }, [sales.data]);

  const download = async (h: Hosted) => {
    setBusy(h.id);
    try {
      const n = await exportParticipants(h, sales.data || []);
      showToast(n ? `Exported ${n} participant${n === 1 ? '' : 's'}` : 'Exported (nobody has joined yet)', 'success');
    } catch (err: any) {
      if (err?.message !== 'Share canceled') showToast(err?.message || 'Could not export the list', 'error');
    } finally {
      setBusy(null);
    }
  };

  const keep = 100 - config.fees.ticket;

  return (
    <div className="space-y-4">
      <section className="dx-hero p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="dx-hero-icon"><Ticket size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">For coaches, gyms & clubs</div>
            <h2 className="mt-1 text-[21px] font-semibold leading-tight">Host paid events & challenges</h2>
            <p className="mt-1.5 text-[13px] opacity-80 leading-relaxed">
              Run your own event or challenge with an entry ticket. People pay in the app; you keep {keep}% and we take {config.fees.ticket}% for handling payments. No approval needed; it's yours to run.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" onClick={() => setCreate('event')} className="dx-hero-btn"><CalendarDays size={16} /> Paid event</button>
          <button type="button" onClick={() => setCreate('challenge')} className="dx-hero-btn"><Trophy size={16} /> Paid challenge</button>
        </div>
      </section>

      <section className="dx-card p-4">
        <div className="text-[15px] font-semibold mb-3">How it works</div>
        <ol className="space-y-3">
          {[
            { t: 'Set up payouts once', b: 'So ticket money can reach your bank.' },
            { t: 'Create your event or challenge', b: 'Add a ticket price in the form. It appears in the Shop and in Community.' },
            { t: 'People pay to join', b: 'UPI, cards or netbanking. Each ticket shows up below.' },
            { t: 'Get paid and see who joined', b: `Your ${keep}% settles to your bank after the event. Download the participant list any time.` },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="w-6 h-6 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 tabular" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{s.t}</span>
                <span className="block text-[12.5px] dx-muted leading-snug mt-0.5">{s.b}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <PayoutStatus onSetup={() => setPayout(true)} />

      <section className="dx-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">Your events & challenges</div>
            <div className="text-[12px] dx-muted">Tickets sold, your earnings and the participant list.</div>
          </div>
          <button type="button" className="dx-icon-btn dx-icon-btn--sm" aria-label="Create" onClick={() => setCreate('event')}><Plus size={16} /></button>
        </div>
        <div className="mt-3 space-y-2">
          {hosted.isLoading ? <div className="dx-inset h-16 animate-pulse" /> : !(hosted.data || []).length ? (
            <div className="dx-inset p-4 text-[13px] dx-muted text-center">You haven't hosted anything yet. Create a paid event or challenge above.</div>
          ) : hosted.data!.map(h => {
            const s = byItem.get(h.id);
            const price = h.item.ticketPrice || 0;
            const joined = h.item.participantCount || 0;
            return (
              <div key={`${h.type}:${h.id}`} className="dx-inset p-3">
                <div className="flex items-start gap-3">
                  <span className="dx-badge-icon !w-9 !h-9 shrink-0">{h.type === 'event' ? <CalendarDays size={16} /> : <Trophy size={16} />}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{h.item.title}</div>
                    <div className="text-[12px] dx-muted truncate">
                      {h.type === 'event' ? 'Event' : 'Challenge'} · {startOf(h)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) || ''} · {price ? `${formatInr(price)} ticket` : 'Free'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><div className="text-[16px] font-semibold tabular">{joined}</div><div className="text-[11px] dx-muted">Joined</div></div>
                  <div><div className="text-[16px] font-semibold tabular">{s?.count || 0}</div><div className="text-[11px] dx-muted">Tickets paid</div></div>
                  <div><div className="text-[16px] font-semibold tabular">{formatInr(s?.earned || 0)}</div><div className="text-[11px] dx-muted">You earn</div></div>
                </div>
                <button type="button" onClick={() => download(h)} disabled={busy === h.id} className="dx-btn-secondary w-full !h-10 mt-3 text-[13px]">
                  {busy === h.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download participant list (CSV)
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {create === 'event' && <CreateEventSheet onClose={() => { setCreate(null); hosted.refetch(); }} />}
      {create === 'challenge' && <CreateChallengeSheet onClose={() => { setCreate(null); hosted.refetch(); }} />}
      <AnimatePresence>
        {payout && <PayoutSheet key="payout" existing={account ?? null} onClose={() => setPayout(false)} />}
      </AnimatePresence>
    </div>
  );
}
