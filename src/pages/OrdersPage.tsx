import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Lock, Receipt, Shield, Ticket, Trophy } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, listMyPurchases, type MarketOrder } from '@/services/market';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';
import { BRAND } from '@/lib/brand';

const KIND: Record<MarketOrder['kind'], { icon: typeof Receipt; label: string }> = {
  plan: { icon: CalendarDays, label: 'Training plan' },
  clan: { icon: Shield, label: 'Clan membership' },
  event: { icon: Ticket, label: 'Event ticket' },
  challenge: { icon: Trophy, label: 'Challenge entry' },
  sponsorship: { icon: Receipt, label: 'Promotion' },
};

export function OrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [open, setOpen] = useState<{ kind: 'event' | 'challenge'; id: string } | null>(null);
  const purchases = useQuery({ queryKey: ['myPurchases', user?.uid], queryFn: () => listMyPurchases(user!.uid), enabled: !!user });
  const list = purchases.data || [];

  const openOrder = (o: MarketOrder) => {
    if (o.kind === 'plan' && o.result?.planId) navigate(`/plans/${o.result.planId}`);
    else if (o.kind === 'clan') navigate(`/clan/${o.itemId}`);
    else if (o.kind === 'event' || o.kind === 'challenge') setOpen({ kind: o.kind, id: o.itemId });
  };

  return (
    <div className="dx pro-scope w-full min-w-0 max-w-3xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <header className="min-w-0">
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">Your orders</h1>
        <p className="text-[13px] dx-muted mt-0.5">Plans, memberships and tickets you've bought.</p>
      </header>

      {purchases.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="dx-card h-16 animate-pulse" />)}</div>
      ) : purchases.isError ? (
        <div className="dx-card p-6 text-center text-[13px] dx-muted">
          Couldn't load your orders.
          <button type="button" className="dx-link block mx-auto mt-2" onClick={() => purchases.refetch()}>Try again</button>
        </div>
      ) : !list.length ? (
        <div className="dx-card p-8 text-center">
          <span className="dx-badge-icon mx-auto"><Receipt size={18} /></span>
          <div className="text-[15px] font-semibold mt-3">No orders yet</div>
          <p className="text-[13px] dx-muted mt-1">Things you buy in the marketplace will show up here.</p>
          <button type="button" className="dx-btn mt-4" onClick={() => navigate('/marketplace')}>Browse the marketplace</button>
        </div>
      ) : (
        <div className="dx-card dx-list overflow-hidden">
          {list.map(o => {
            const k = KIND[o.kind] || KIND.sponsorship;
            return (
              <button key={o.id} type="button" className="w-full p-3.5 flex items-center gap-3 text-left" onClick={() => openOrder(o)}>
                <span className="dx-badge-icon shrink-0"><k.icon size={17} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate">{o.title}</span>
                  <span className="block text-[12px] dx-muted truncate">{k.label} · {o.createdAt?.toDate?.().toLocaleDateString() || ''}</span>
                </span>
                <span className="text-[13px] font-semibold tabular shrink-0">{formatInr(o.amount / 100)}</span>
                <ChevronRight size={16} className="dx-muted shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-2 text-[12px] dx-muted leading-snug px-1">
        <Lock size={13} className="shrink-0 mt-0.5" />
        Only you can see your orders. Payments are processed by Razorpay; {BRAND.name} never sees your card or UPI details.
      </p>

      <AnimatePresence>
        {open?.kind === 'event' && <EventDetailSheet key={open.id} eventId={open.id} onClose={() => setOpen(null)} />}
        {open?.kind === 'challenge' && <ChallengeDetailSheet key={open.id} challengeId={open.id} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
}
