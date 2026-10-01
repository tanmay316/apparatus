import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  BadgeIndianRupee, CalendarDays, ChevronRight, CircleHelp, LayoutGrid, Megaphone, Receipt, Search, Shield, ShieldCheck,
  ShoppingBag, Store, Ticket, Trophy, Users, Wallet, X, Zap,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, listActiveListings, listMyPurchases, listPaidClans, listTicketed, type PlanListing, type TicketedItem } from '@/services/market';
import { recordAffiliateClick, useAffiliateCatalog } from '@/services/affiliates';
import { isAmazonUrl, isSafeAffiliateUrl, withAffiliateTag, type AffiliateLink } from '@/lib/affiliates';
import { ListingCard, ListingSheet } from '@/components/market/ListingSheet';
import { MarketSheet } from '@/components/market/MarketSheet';
import { SellerHub } from '@/components/market/SellerHub';
import { SponsorHub } from '@/components/market/SponsorHub';
import { SponsorBanner } from '@/components/market/SponsorBanner';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';

type Tab = 'shop' | 'sell' | 'sponsor';
const TABS: Tab[] = ['shop', 'sell', 'sponsor'];
type Category = 'all' | 'plans' | 'clubs' | 'events' | 'gear';
const CATEGORIES: { id: Category; label: string; icon: typeof Store }[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'plans', label: 'Training plans', icon: CalendarDays },
  { id: 'clubs', label: 'Paid clans', icon: Shield },
  { id: 'events', label: 'Events & challenges', icon: Ticket },
  { id: 'gear', label: 'Gear', icon: ShoppingBag },
];
const INTRO_KEY = 'apparatus.market-intro-seen';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

function SectionHead({ icon: Icon, title, hint, count, onMore }: { icon: typeof Store; title: string; hint?: string; count?: number; onMore?: () => void }) {
  return (
    <div className="flex items-end justify-between gap-3 mt-3">
      <div className="min-w-0">
        <div className="dx-section-title flex items-center gap-2"><Icon size={15} className="dx-accent" /> {title}</div>
        {hint && <div className="text-[12px] dx-muted mt-0.5">{hint}</div>}
      </div>
      {onMore ? (
        <button type="button" onClick={onMore} className="dx-link text-[13px] shrink-0">See all{count ? ` (${count})` : ''}</button>
      ) : !!count && <span className="text-[12px] dx-muted tabular shrink-0">{count}</span>}
    </div>
  );
}

function dateParts(t: TicketedItem) {
  const ts = t.kind === 'event' ? t.item.startTime : t.item.startDate;
  const d: Date | undefined = ts?.toDate?.();
  return d ? { day: d.getDate(), month: d.toLocaleDateString(undefined, { month: 'short' }) } : null;
}

const has = (q: string, ...fields: (string | undefined)[]) => !q || fields.some(f => (f || '').toLowerCase().includes(q));

async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) {
    try { await Browser.open({ url }); return; } catch { /* fall back to a tab */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Plain-language explanation of everything the marketplace does. */
function HowItWorksSheet({ onClose, onGo }: { onClose: () => void; onGo: (t: Tab) => void }) {
  const rows = [
    { icon: ShoppingBag, t: 'Shop', b: 'Buy training plans made by coaches, join paid clans, and get tickets for events and challenges. Pay by UPI, card or netbanking; access unlocks instantly.' },
    { icon: Wallet, t: 'Sell & earn', b: 'Coaches and gyms put a price on their plans, clans, events and challenges. Buyers pay through Razorpay and the money settles to your bank, minus a small fee.' },
    { icon: Megaphone, t: 'Advertise', b: 'Brands pay to show their logo and a prize on a challenge. This is for businesses; regular users never need it.' },
    { icon: ShoppingBag, t: 'Gear', b: 'Hand-picked products from partner stores like Amazon. You buy on their site at the normal price; we may earn a small commission.' },
  ];
  return (
    <MarketSheet title="How the marketplace works" subtitle="Everything here is optional. The app stays free to use." onClose={onClose}>
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.t} className="dx-inset p-3.5 flex gap-3">
            <span className="dx-badge-icon"><r.icon size={16} /></span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">{r.t}</div>
              <p className="text-[12.5px] dx-muted leading-snug mt-0.5">{r.b}</p>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" className="dx-btn-secondary" onClick={() => { onClose(); onGo('sell'); }}>I'm a coach</button>
          <button type="button" className="dx-btn-secondary" onClick={() => { onClose(); onGo('sponsor'); }}>I'm a brand</button>
        </div>
      </div>
    </MarketSheet>
  );
}

function GearCard({ link, tag }: { link: AffiliateLink; tag?: string }) {
  return (
    <button
      type="button"
      onClick={() => { recordAffiliateClick(link.id); openExternal(withAffiliateTag(link.url, tag)); }}
      className="dx-card overflow-hidden text-left flex flex-col"
    >
      <div className="aspect-square bg-white flex items-center justify-center p-3">
        {link.imageUrl && /^https:\/\//.test(link.imageUrl)
          ? <img src={link.imageUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
          : <ShoppingBag size={28} color="#9ca3af" />}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <div className="text-[13px] font-semibold leading-snug line-clamp-2">{link.title}</div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-[13px] font-semibold tabular">{link.priceText || ''}</span>
          <span className="text-[11px] dx-muted truncate">{link.partner || (isAmazonUrl(link.url) ? 'Amazon' : 'Store')}</span>
        </div>
      </div>
    </button>
  );
}

function Shop({ onGo }: { onGo: (t: Tab) => void }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [listing, setListing] = useState<PlanListing | null>(null);
  const [open, setOpen] = useState<{ kind: 'event' | 'challenge'; id: string } | null>(null);
  const [cat, setCat] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [intro, setIntro] = useState(() => !localStorage.getItem(INTRO_KEY));
  const [help, setHelp] = useState(false);
  const listings = useQuery({ queryKey: ['marketListings'], queryFn: listActiveListings, staleTime: 60_000 });
  const clans = useQuery({ queryKey: ['marketPaidClans'], queryFn: listPaidClans, staleTime: 60_000 });
  const tickets = useQuery({ queryKey: ['marketTickets'], queryFn: listTicketed, staleTime: 60_000 });
  const gear = useAffiliateCatalog();
  const purchases = useQuery({ queryKey: ['myPurchases', user?.uid], queryFn: () => listMyPurchases(user!.uid), enabled: !!user });

  const q = search.trim().toLowerCase();
  const plans = useMemo(() => (listings.data || []).filter(l => has(q, l.title, l.description, l.sellerName)), [listings.data, q]);
  const paidClans = useMemo(() => (clans.data || []).filter(c => has(q, c.name, c.description)), [clans.data, q]);
  const ticketed = useMemo(() => (tickets.data || []).filter(t => has(q, t.item.title, t.item.description)), [tickets.data, q]);
  const products = useMemo(() => (gear.data?.links || []).filter(l => isSafeAffiliateUrl(l.url) && has(q, l.title, l.partner)), [gear.data, q]);
  const loading = listings.isLoading || clans.isLoading || tickets.isLoading;
  const show = (c: Category) => cat === 'all' || cat === c;
  const preview = cat === 'all' ? 4 : 60;
  const nothing = !loading && ![plans, paidClans, ticketed, products].some((list, i) => list.length && show((['plans', 'clubs', 'events', 'gear'] as Category[])[i]));

  const closeIntro = () => { localStorage.setItem(INTRO_KEY, '1'); setIntro(false); };

  return (
    <>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 dx-muted pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value.slice(0, 60))}
          placeholder="Search plans, clans, events, gear"
          className="dx-input w-full !pl-10 !h-11 !rounded-2xl"
          aria-label="Search the marketplace"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Categories">
        {CATEGORIES.map(c => {
          const on = cat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setCat(c.id)}
              className="shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors"
              style={{ background: on ? 'var(--dx-text)' : 'var(--dx-card-2)', color: on ? 'var(--dx-card)' : 'var(--dx-text)' }}
            >
              <c.icon size={14} /> {c.label}
            </button>
          );
        })}
      </div>

      {intro && (
        <section className="dx-card p-4 relative">
          <button type="button" onClick={closeIntro} className="absolute right-3 top-3 dx-icon-btn dx-icon-btn--sm" aria-label="Dismiss"><X size={14} /></button>
          <div className="text-[15px] font-semibold pr-10">New here? This is how it works</div>
          <ol className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { t: 'Pick something', b: 'Coach-made plans, paid clans, event tickets or gear.' },
              { t: 'Pay securely', b: 'UPI, card or netbanking through Razorpay.' },
              { t: 'Use it instantly', b: 'Plans land in Plans; clans and tickets unlock right away.' },
            ].map((s, i) => (
              <li key={s.t} className="flex gap-2.5">
                <span className="w-6 h-6 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 tabular" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>{i + 1}</span>
                <span className="min-w-0"><span className="block text-[13.5px] font-semibold">{s.t}</span><span className="block text-[12px] dx-muted leading-snug">{s.b}</span></span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setHelp(true)} className="dx-link text-[13px] mt-3">Learn more</button>
        </section>
      )}

      <div className="grid grid-cols-3 gap-2 text-[11.5px]">
        {[
          { icon: BadgeIndianRupee, t: 'UPI & cards' },
          { icon: Zap, t: 'Instant access' },
          { icon: ShieldCheck, t: 'Secure by Razorpay' },
        ].map(s => (
          <div key={s.t} className="dx-inset px-2 py-2 flex items-center justify-center gap-1.5 font-medium text-center">
            <s.icon size={13} className="dx-accent shrink-0" /> {s.t}
          </div>
        ))}
      </div>

      {loading && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="dx-card h-44 animate-pulse" />)}</div>}

      {show('plans') && plans.length > 0 && (
        <>
          <SectionHead icon={CalendarDays} title="Training plans" hint="Made by coaches. Yours to keep after buying." count={plans.length} onMore={cat === 'all' && plans.length > preview ? () => setCat('plans') : undefined} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.slice(0, preview).map(l => <ListingCard key={l.id} listing={l} onOpen={() => setListing(l)} />)}
          </div>
        </>
      )}

      {show('clubs') && paidClans.length > 0 && (
        <>
          <SectionHead icon={Shield} title="Paid clans" hint="One-time fee to join a coached community." count={paidClans.length} onMore={cat === 'all' && paidClans.length > preview ? () => setCat('clubs') : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {paidClans.slice(0, preview).map(c => (
              <button key={c.id} type="button" onClick={() => navigate(`/clan/${c.id}`)} className="dx-card overflow-hidden text-left flex flex-col">
                <div className="h-24 overflow-hidden" style={{ background: 'linear-gradient(135deg,#1f2937,#7a3a24)' }}>
                  {c.coverUrl && <img src={c.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate">{c.name}</div>
                  <div className="text-[12px] dx-muted inline-flex items-center gap-1"><Users size={12} /> {c.memberCount} members</div>
                  <div className="mt-auto pt-1 text-[14px] font-semibold tabular">{formatInr(c.joinPrice || 0)}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {show('events') && ticketed.length > 0 && (
        <>
          <SectionHead icon={Ticket} title="Events & challenges" hint="Tickets and entry fees. Book your spot." count={ticketed.length} onMore={cat === 'all' && ticketed.length > preview ? () => setCat('events') : undefined} />
          <div className="dx-card dx-list overflow-hidden">
            {ticketed.slice(0, preview).map(t => {
              const d = dateParts(t);
              return (
                <button key={`${t.kind}:${t.item.id}`} type="button" onClick={() => setOpen({ kind: t.kind, id: t.item.id! })} className="w-full p-3.5 flex items-center gap-3 text-left">
                  <span className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 leading-none" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
                    {d ? <><span className="text-[17px] font-bold tabular">{d.day}</span><span className="text-[10px] font-semibold uppercase mt-0.5">{d.month}</span></> : t.kind === 'event' ? <CalendarDays size={18} /> : <Trophy size={18} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate">{t.item.title}</span>
                    <span className="block text-[12px] dx-muted truncate">{t.kind === 'event' ? 'Event' : 'Challenge'} · {t.item.participantCount || 0} going</span>
                    {t.item.sponsor && <span className="block mt-1"><SponsorBanner sponsor={t.item.sponsor} compact /></span>}
                  </span>
                  <span className="text-[14px] font-semibold tabular shrink-0">{formatInr(t.item.ticketPrice || 0)}</span>
                  <ChevronRight size={16} className="dx-muted shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {show('gear') && products.length > 0 && (
        <>
          <SectionHead icon={ShoppingBag} title="Gear picks" hint="Bought on the partner's site at their price." count={products.length} onMore={cat === 'all' && products.length > preview ? () => setCat('gear') : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.slice(0, preview).map(l => <GearCard key={l.id} link={l} tag={gear.data?.settings?.amazonTag} />)}
          </div>
          <p className="text-[11px] dx-muted leading-snug">
            {products.some(l => isAmazonUrl(l.url)) ? 'As an Amazon Associate, Apparatus earns from qualifying purchases. ' : ''}We may earn a commission from these links at no extra cost to you.
          </p>
        </>
      )}

      {nothing && (
        <motion.div variants={item} className="dx-card p-8 text-center">
          <Store size={26} className="mx-auto dx-accent" />
          <div className="mt-2 text-[15px] font-semibold">{q ? `Nothing found for "${search.trim()}"` : 'Nothing here yet'}</div>
          <p className="mt-1 text-[13px] dx-muted">{q ? 'Try a different word or another category.' : 'Coaches are setting up their shops. Check back soon, or start selling yourself.'}</p>
          {!q && <button type="button" className="dx-btn mt-4" onClick={() => onGo('sell')}>Start selling</button>}
        </motion.div>
      )}

      {!!purchases.data?.length && cat === 'all' && !q && (
        <>
          <SectionHead icon={Receipt} title="Your orders" />
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

      <AnimatePresence>
        {listing && <ListingSheet key={listing.id} listing={listing} onClose={() => setListing(null)} />}
        {help && <HowItWorksSheet key="help" onClose={() => setHelp(false)} onGo={onGo} />}
      </AnimatePresence>
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
  const [help, setHelp] = useState(false);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope w-full min-w-0 max-w-5xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <motion.header variants={item} className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">Marketplace</h1>
            <p className="text-[13px] dx-muted mt-0.5">Training plans, paid clans, event tickets and gear.</p>
          </div>
          <button type="button" onClick={() => setHelp(true)} className="dx-icon-btn dx-icon-btn--sm sm:hidden" aria-label="How the marketplace works"><CircleHelp size={17} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="dx-segment flex-1 sm:w-[360px]" role="tablist">
            <button role="tab" aria-selected={tab === 'shop'} onClick={() => go('shop')}>Shop</button>
            <button role="tab" aria-selected={tab === 'sell'} onClick={() => go('sell')}>Sell & earn</button>
            <button role="tab" aria-selected={tab === 'sponsor'} onClick={() => go('sponsor')}>Advertise</button>
          </div>
          <button type="button" onClick={() => setHelp(true)} className="dx-icon-btn dx-icon-btn--sm hidden sm:flex" aria-label="How the marketplace works"><CircleHelp size={17} /></button>
        </div>
      </motion.header>

      <motion.div variants={item} className="space-y-4">
        {tab === 'shop' && <Shop onGo={go} />}
        {tab === 'sell' && <SellerHub />}
        {tab === 'sponsor' && <SponsorHub />}
      </motion.div>

      <AnimatePresence>{help && <HowItWorksSheet key="help" onClose={() => setHelp(false)} onGo={go} />}</AnimatePresence>
    </motion.div>
  );
}
