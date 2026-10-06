import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  CalendarDays, ChevronRight, CircleHelp, Dumbbell, LayoutGrid, MousePointerClick, Package, Receipt, Search, Shield,
  ShoppingBag, Store, Ticket, Trophy, Users, X,
} from 'lucide-react';
import { formatInr, listActiveListings, listPaidClans, listTicketed, type PlanListing, type TicketedItem } from '@/services/market';
import { listShowcase, type ShowcaseItem, type ShowcaseKind } from '@/services/showcase';
import { recordAffiliateClick, useAffiliateCatalog } from '@/services/affiliates';
import { isAmazonUrl, isSafeAffiliateUrl, withAffiliateTag, type AffiliateLink } from '@/lib/affiliates';
import { usePaymentsEnabled } from '@/lib/payments-mode';
import { ListingCard, ListingSheet } from '@/components/market/ListingSheet';
import { MarketSheet } from '@/components/market/MarketSheet';
import { ShowcaseCard, ShowcaseSheet, useMarketPartner } from '@/components/market/Showcase';
import { SponsorBanner } from '@/components/market/SponsorBanner';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';
import { BRAND } from '@/lib/brand';

// Seller tools used to live in marketplace tabs; old links land on My listings.
const LEGACY_TABS: Record<string, string> = { sell: 'plans', host: 'events', sponsor: 'events' };
type Category = 'all' | 'products' | 'plans' | 'events' | 'clubs' | 'services';
const CATEGORIES: { id: Category; label: string; icon: typeof Store }[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'products', label: 'Products & gear', icon: ShoppingBag },
  { id: 'plans', label: 'Training plans', icon: CalendarDays },
  { id: 'events', label: 'Events & challenges', icon: Ticket },
  { id: 'clubs', label: 'Clans & communities', icon: Shield },
  { id: 'services', label: 'Coaching & services', icon: Dumbbell },
];
const CATEGORY_OF: Record<ShowcaseKind, Exclude<Category, 'all'>> = {
  product: 'products', gear: 'products', offer: 'products', plan: 'plans', event: 'events', challenge: 'events', clan: 'clubs', service: 'services',
};
const INTRO_KEY = 'apparatus.market-intro-seen.v2';

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

function HowItWorksSheet({ onClose, onList }: { onClose: () => void; onList: () => void }) {
  const rows = [
    { icon: Store, t: 'Discover', b: 'Products, training plans, events, challenges and communities from brands, gyms, coaches and organisers.' },
    { icon: MousePointerClick, t: 'Tap through', b: 'Each listing opens the brand\'s own website, or the plan, event or clan right here in the app.' },
    { icon: ShoppingBag, t: 'Gear picks', b: 'Hand-picked products from stores like Amazon. We may earn a small commission at no extra cost to you.' },
    { icon: Users, t: 'List yours', b: 'Brands, gyms, coaches and community owners can ask to be listed. Our team will get in touch.' },
  ];
  return (
    <MarketSheet title="How the marketplace works" onClose={onClose}>
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
        <button type="button" className="dx-btn-secondary w-full" onClick={() => { onClose(); onList(); }}>List on the marketplace</button>
      </div>
    </MarketSheet>
  );
}

/** Odd last card of a 2-column phone grid takes the full row. */
const isWide = (i: number, n: number) => n % 2 === 1 && i === n - 1;

function GearCard({ link, tag, wide = false }: { link: AffiliateLink; tag?: string; wide?: boolean }) {
  const image = link.imageUrl && /^https:\/\//.test(link.imageUrl);
  return (
    <button
      type="button"
      onClick={() => { recordAffiliateClick(link.id); openExternal(withAffiliateTag(link.url, tag)); }}
      className={`dx-card overflow-hidden text-left flex min-w-0 ${wide ? 'col-span-2 sm:col-span-1 flex-row sm:flex-col' : 'flex-col'}`}
    >
      <div className={`${wide ? 'w-[38%] shrink-0 sm:w-full' : 'w-full'} ${image ? 'aspect-square bg-white p-3' : 'aspect-[4/3]'} flex items-center justify-center`} style={image ? undefined : { background: 'var(--dx-inset, rgba(127,127,127,0.08))' }}>
        {image
          ? <img src={link.imageUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
          : <ShoppingBag size={26} className="dx-muted" />}
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

const SECTION: Record<Exclude<Category, 'all'>, { title: string; icon: typeof Store }> = {
  products: { title: 'Products & offers', icon: Package },
  plans: { title: 'Training plans', icon: CalendarDays },
  events: { title: 'Events & challenges', icon: Trophy },
  clubs: { title: 'Clans & communities', icon: Shield },
  services: { title: 'Coaching & services', icon: Dumbbell },
};

function Shop({ onList }: { onList: () => void }) {
  const navigate = useNavigate();
  const payments = usePaymentsEnabled();
  const [listing, setListing] = useState<PlanListing | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseItem | null>(null);
  const [open, setOpen] = useState<{ kind: 'event' | 'challenge'; id: string } | null>(null);
  const [cat, setCat] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [intro, setIntro] = useState(() => !localStorage.getItem(INTRO_KEY));
  const [help, setHelp] = useState(false);
  const items = useQuery({ queryKey: ['showcase'], queryFn: listShowcase, staleTime: 60_000 });
  const listings = useQuery({ queryKey: ['marketListings'], queryFn: listActiveListings, staleTime: 60_000, enabled: payments });
  const clans = useQuery({ queryKey: ['marketPaidClans'], queryFn: listPaidClans, staleTime: 60_000, enabled: payments });
  const tickets = useQuery({ queryKey: ['marketTickets'], queryFn: listTicketed, staleTime: 60_000, enabled: payments });
  const gear = useAffiliateCatalog();

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => (items.data || []).filter(i => has(q, i.title, i.description, i.ownerName, i.priceText)), [items.data, q]);
  const plans = useMemo(() => payments ? (listings.data || []).filter(l => has(q, l.title, l.description, l.sellerName)) : [], [payments, listings.data, q]);
  const paidClans = useMemo(() => payments ? (clans.data || []).filter(c => has(q, c.name, c.description)) : [], [payments, clans.data, q]);
  const ticketed = useMemo(() => payments ? (tickets.data || []).filter(t => has(q, t.item.title, t.item.description)) : [], [payments, tickets.data, q]);
  const products = useMemo(() => (gear.data?.links || []).filter(l => isSafeAffiliateUrl(l.url) && has(q, l.title, l.partner)), [gear.data, q]);
  const loading = items.isLoading || (payments && (listings.isLoading || clans.isLoading || tickets.isLoading));
  const preview = cat === 'all' ? 4 : 60;
  const groups = (Object.keys(SECTION) as Exclude<Category, 'all'>[])
    .filter(c => cat === 'all' || cat === c)
    .map(c => ({ c, list: shown.filter(i => CATEGORY_OF[i.kind] === c) }));
  const show = (c: Category) => cat === 'all' || cat === c;
  const nothing = !loading && !groups.some(g => g.list.length)
    && !(show('products') && products.length) && !(show('plans') && plans.length)
    && !(show('clubs') && paidClans.length) && !(show('events') && ticketed.length);

  const closeIntro = () => { localStorage.setItem(INTRO_KEY, '1'); setIntro(false); };

  return (
    <>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 dx-muted pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value.slice(0, 60))}
          placeholder="Search products, plans, events, clans"
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
              { t: 'Browse', b: 'Products, plans, events and communities from brands, gyms and coaches.' },
              { t: 'Tap through', b: 'Open their website, or the plan, event or clan in the app.' },
              { t: 'Deal with them directly', b: 'Questions and orders go straight to the brand or organiser.' },
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

      {loading && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="dx-card h-44 animate-pulse" />)}</div>}

      {groups.map(({ c, list }) => list.length > 0 && (
        <div key={c} className="space-y-3">
          <SectionHead icon={SECTION[c].icon} title={SECTION[c].title} count={list.length} onMore={cat === 'all' && list.length > preview ? () => setCat(c) : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {list.slice(0, preview).map((i, idx, arr) => <ShowcaseCard key={i.id} item={i} wide={isWide(idx, arr.length)} onOpen={() => setShowcase(i)} />)}
          </div>
        </div>
      ))}

      {show('plans') && plans.length > 0 && (
        <>
          <SectionHead icon={CalendarDays} title="Plans from coaches" hint="Yours to keep after buying." count={plans.length} onMore={cat === 'all' && plans.length > preview ? () => setCat('plans') : undefined} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.slice(0, preview).map(l => <ListingCard key={l.id} listing={l} onOpen={() => setListing(l)} />)}
          </div>
        </>
      )}

      {show('clubs') && paidClans.length > 0 && (
        <>
          <SectionHead icon={Shield} title="Member clans" count={paidClans.length} onMore={cat === 'all' && paidClans.length > preview ? () => setCat('clubs') : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {paidClans.slice(0, preview).map((c, idx, arr) => (
              <button key={c.id} type="button" onClick={() => navigate(`/clan/${c.id}`)} className={`dx-card overflow-hidden text-left flex flex-col ${isWide(idx, arr.length) ? 'col-span-2 sm:col-span-1' : ''}`}>
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
          <SectionHead icon={Ticket} title="Tickets" count={ticketed.length} onMore={cat === 'all' && ticketed.length > preview ? () => setCat('events') : undefined} />
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

      {show('products') && products.length > 0 && (
        <>
          <SectionHead icon={ShoppingBag} title="Gear picks" hint="Bought on the store's own site." count={products.length} onMore={cat === 'all' && products.length > preview ? () => setCat('products') : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.slice(0, preview).map((l, idx, arr) => <GearCard key={l.id} link={l} wide={isWide(idx, arr.length)} tag={gear.data?.settings?.amazonTag} />)}
          </div>
          <p className="text-[11px] dx-muted leading-snug">
            {products.some(l => isAmazonUrl(l.url)) ? `As an Amazon Associate, ${BRAND.name} earns from qualifying purchases. ` : ''}We may earn a commission from these links at no extra cost to you.
          </p>
        </>
      )}

      {nothing && (
        <motion.div variants={item} className="dx-card p-8 text-center">
          <Store size={26} className="mx-auto dx-accent" />
          <div className="mt-2 text-[15px] font-semibold">{q ? `Nothing found for "${search.trim()}"` : 'Nothing here yet'}</div>
          <p className="mt-1 text-[13px] dx-muted">{q ? 'Try a different word or another category.' : 'Listings from brands, gyms and coaches will show up here.'}</p>
          {!q && <button type="button" className="dx-btn mt-4" onClick={onList}>List yours</button>}
        </motion.div>
      )}
      <AnimatePresence>
        {listing && <ListingSheet key={listing.id} listing={listing} onClose={() => setListing(null)} />}
        {showcase && <ShowcaseSheet key={showcase.id} item={showcase} onClose={() => setShowcase(null)} />}
        {help && <HowItWorksSheet key="help" onClose={() => setHelp(false)} onList={onList} />}
      </AnimatePresence>
      {open?.kind === 'event' && <EventDetailSheet eventId={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === 'challenge' && <ChallengeDetailSheet challengeId={open.id} onClose={() => setOpen(null)} />}
    </>
  );
}

export function MarketplacePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const payments = usePaymentsEnabled();
  const partner = useMarketPartner();
  const legacy = LEGACY_TABS[params.get('tab') || ''];
  const [help, setHelp] = useState(false);
  const toListings = () => navigate('/seller');
  useEffect(() => {
    if (legacy) navigate('/seller', { replace: true });
  }, [legacy, navigate]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope w-full min-w-0 max-w-5xl mx-auto pt-1 sm:pt-4 space-y-4 pb-24">
      <motion.header variants={item} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">Marketplace</h1>
          <p className="text-[13px] dx-muted mt-0.5">Products, plans, events and communities from brands, gyms and coaches.</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setHelp(true)} className="dx-icon-btn dx-icon-btn--sm" aria-label="How the marketplace works"><CircleHelp size={17} /></button>
          {payments && <button type="button" onClick={() => navigate('/marketplace/orders')} className="dx-btn-secondary !h-9 !px-3 text-[13px]"><Receipt size={15} /> Orders</button>}
        </div>
      </motion.header>

      <motion.div variants={item} className="space-y-4">
        <Shop onList={toListings} />
        <button type="button" onClick={toListings} className="dx-card w-full p-4 flex items-center gap-3 text-left">
          <span className="dx-badge-icon"><Store size={18} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold">{partner ? 'My listings' : 'List on the marketplace'}</span>
            <span className="block text-[12.5px] dx-muted">{partner ? 'Add or update what you show here.' : 'For brands, gyms, coaches and community owners.'}</span>
          </span>
          <ChevronRight size={18} className="dx-muted shrink-0" />
        </button>
      </motion.div>

      <AnimatePresence>{help && <HowItWorksSheet key="help" onClose={() => setHelp(false)} onList={toListings} />}</AnimatePresence>
    </motion.div>
  );
}
