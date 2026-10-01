import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Receipt, Shield, Store, Ticket, Trophy, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, listActiveListings, listMyPurchases, listPaidClans, listTicketed, type PlanListing, type TicketedItem } from '@/services/market';
import { ListingCard, ListingSheet } from '@/components/market/ListingSheet';
import { SellerHub } from '@/components/market/SellerHub';
import { SponsorHub } from '@/components/market/SponsorHub';
import { SponsorBanner } from '@/components/market/SponsorBanner';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';

type Tab = 'shop' | 'sell' | 'sponsor';
const TABS: Tab[] = ['shop', 'sell', 'sponsor'];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

function SectionHead({ icon: Icon, title, count }: { icon: typeof Store; title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mt-2">
      <div className="dx-section-title flex items-center gap-2"><Icon size={15} className="dx-accent" /> {title}</div>
      {!!count && <span className="text-[12px] dx-muted tabular">{count}</span>}
    </div>
  );
}

function when(t: TicketedItem) {
  const ts = t.kind === 'event' ? t.item.startTime : t.item.startDate;
  const d = ts?.toDate?.();
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
}

function Shop() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [listing, setListing] = useState<PlanListing | null>(null);
  const [open, setOpen] = useState<{ kind: 'event' | 'challenge'; id: string } | null>(null);
  const listings = useQuery({ queryKey: ['marketListings'], queryFn: listActiveListings, staleTime: 60_000 });
  const clans = useQuery({ queryKey: ['marketPaidClans'], queryFn: listPaidClans, staleTime: 60_000 });
  const tickets = useQuery({ queryKey: ['marketTickets'], queryFn: listTicketed, staleTime: 60_000 });
  const purchases = useQuery({ queryKey: ['myPurchases', user?.uid], queryFn: () => listMyPurchases(user!.uid), enabled: !!user });
  const loading = listings.isLoading || clans.isLoading || tickets.isLoading;
  const empty = !loading && !listings.data?.length && !clans.data?.length && !tickets.data?.length;

  return (
    <>
      {loading && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="dx-card h-44 animate-pulse" />)}</div>}

      {empty && (
        <motion.div variants={item} className="dx-card p-8 text-center">
          <Store size={26} className="mx-auto dx-accent" />
          <div className="mt-2 text-[15px] font-semibold">The marketplace is just opening</div>
          <p className="mt-1 text-[13px] dx-muted">Coaches are setting up their plans, clans and events. Are you a coach? Start selling in the Sell tab.</p>
        </motion.div>
      )}

      {!!listings.data?.length && (
        <>
          <SectionHead icon={CalendarDays} title="Coach plans" count={listings.data.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {listings.data.map(l => <ListingCard key={l.id} listing={l} onOpen={() => setListing(l)} />)}
          </div>
        </>
      )}

      {!!clans.data?.length && (
        <>
          <SectionHead icon={Shield} title="Premium clans" count={clans.data.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clans.data.map(c => (
              <button key={c.id} type="button" onClick={() => navigate(`/clan/${c.id}`)} className="dx-card overflow-hidden text-left flex items-stretch">
                <div className="w-24 shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg,#1f2937,#7a3a24)' }}>
                  {c.coverUrl && <img src={c.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
                </div>
                <div className="p-3.5 flex-1 min-w-0">
                  <div className="text-[15px] font-semibold truncate">{c.name}</div>
                  <div className="text-[12px] dx-muted line-clamp-2 mt-0.5">{c.description}</div>
                  <div className="mt-2 flex items-center gap-3 text-[12px]">
                    <span className="dx-pill dx-pill--accent">{formatInr(c.joinPrice || 0)}</span>
                    <span className="dx-muted inline-flex items-center gap-1"><Users size={12} /> {c.memberCount}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {!!tickets.data?.length && (
        <>
          <SectionHead icon={Ticket} title="Events & challenges" count={tickets.data.length} />
          <div className="dx-card dx-list overflow-hidden">
            {tickets.data.map(t => (
              <button key={`${t.kind}:${t.item.id}`} type="button" onClick={() => setOpen({ kind: t.kind, id: t.item.id! })} className="w-full p-3.5 flex items-center gap-3 text-left">
                <span className="dx-badge-icon" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>{t.kind === 'event' ? <CalendarDays size={16} /> : <Trophy size={16} />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate">{t.item.title}</span>
                  <span className="block text-[12px] dx-muted truncate">{t.kind === 'event' ? 'Event' : 'Challenge'} · {when(t)} · {t.item.participantCount || 0} going</span>
                  {t.item.sponsor && <span className="block mt-1"><SponsorBanner sponsor={t.item.sponsor} compact /></span>}
                </span>
                <span className="dx-pill dx-pill--accent tabular">{formatInr(t.item.ticketPrice || 0)}</span>
                <ChevronRight size={16} className="dx-muted" />
              </button>
            ))}
          </div>
        </>
      )}

      {!!purchases.data?.length && (
        <>
          <SectionHead icon={Receipt} title="Your purchases" />
          <div className="dx-card dx-list overflow-hidden">
            {purchases.data.map(o => (
              <button
                key={o.id}
                type="button"
                className="w-full p-3.5 flex items-center gap-3 text-left"
                onClick={() => {
                  if (o.kind === 'plan' && o.result?.planId) navigate(`/plans/${o.result.planId}`);
                  else if (o.kind === 'clan') navigate(`/clan/${o.itemId}`);
                  else if (o.kind === 'event' || o.kind === 'challenge') setOpen({ kind: o.kind, id: o.itemId });
                }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate">{o.title}</span>
                  <span className="block text-[12px] dx-muted">{o.createdAt?.toDate?.().toLocaleDateString() || ''}</span>
                </span>
                <span className="text-[13px] font-semibold tabular">{formatInr(o.amount / 100)}</span>
                <ChevronRight size={16} className="dx-muted" />
              </button>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>{listing && <ListingSheet key={listing.id} listing={listing} onClose={() => setListing(null)} />}</AnimatePresence>
      {open?.kind === 'event' && <EventDetailSheet eventId={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === 'challenge' && <ChallengeDetailSheet challengeId={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}

export function MarketplacePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'shop';
  const go = (t: Tab) => setParams(t === 'shop' ? {} : { tab: t }, { replace: true });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope w-full min-w-0 max-w-4xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <motion.header variants={item} className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="dx-eyebrow">Marketplace</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">Train with the best</h1>
          <p className="text-[13px] dx-muted mt-0.5">Coach plans, premium clans and ticketed events.</p>
        </div>
        <div className="dx-segment sm:w-[320px]" role="tablist">
          <button role="tab" aria-selected={tab === 'shop'} onClick={() => go('shop')}>Shop</button>
          <button role="tab" aria-selected={tab === 'sell'} onClick={() => go('sell')}>Sell</button>
          <button role="tab" aria-selected={tab === 'sponsor'} onClick={() => go('sponsor')}>Sponsor</button>
        </div>
      </motion.header>

      <motion.div variants={item} className="space-y-4">
        {tab === 'shop' && <Shop />}
        {tab === 'sell' && <SellerHub />}
        {tab === 'sponsor' && <SponsorHub />}
      </motion.div>
    </motion.div>
  );
}
