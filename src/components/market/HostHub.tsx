import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { CalendarDays, Download, Loader2, Plus, Trophy } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { exportCsv, toCsv } from '@/lib/csv-export';
import { getChallengeParticipants, getEventParticipants } from '@/services/community';
import { formatInr, listMySales, type MarketOrder } from '@/services/market';
import type { ChallengeV2, SimpleEvent } from '@/types';
import { CreateEventSheet } from '@/components/community/CreateEventSheet';
import { CreateChallengeSheet } from '@/components/community/CreateChallengeSheet';

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

/** The seller's events and challenges with ticket sales, earnings and the participant export. */
export function HostedEvents({ canCharge }: { canCharge: boolean }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const [create, setCreate] = useState<'event' | 'challenge' | null>(null);
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

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setCreate('event')} className="dx-btn"><CalendarDays size={16} /> New paid event</button>
        <button type="button" onClick={() => setCreate('challenge')} className="dx-btn"><Trophy size={16} /> New paid challenge</button>
      </section>
      {!canCharge && (
        <p className="text-[12.5px] dx-muted -mt-1">You can create events now; the ticket price field unlocks once payouts are active.</p>
      )}

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
    </div>
  );
}
