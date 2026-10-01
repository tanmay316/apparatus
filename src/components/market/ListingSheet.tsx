import { useNavigate } from 'react-router-dom';
import { CalendarDays, Dumbbell, ShieldCheck, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, type PlanListing } from '@/services/market';
import { CheckoutButton } from './CheckoutButton';
import { MarketSheet } from './MarketSheet';

const GRADIENTS = [
  'linear-gradient(135deg,#1f2937 0%,#7a3a24 100%)',
  'linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%)',
  'linear-gradient(135deg,#111827 0%,#047857 100%)',
  'linear-gradient(135deg,#1c1917 0%,#b45309 100%)',
  'linear-gradient(135deg,#18181b 0%,#7c3aed 100%)',
];

export function listingGradient(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function ListingCard({ listing, onOpen }: { listing: PlanListing; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="dx-card overflow-hidden text-left w-full flex flex-col">
      <div className="relative h-28 p-4 flex flex-col justify-end text-white" style={{ background: listingGradient(listing.id) }}>
        <span className="absolute right-3 top-3 h-7 px-2.5 rounded-full text-[13px] font-bold inline-flex items-center tabular" style={{ background: 'rgba(255,255,255,0.95)', color: '#111' }}>
          {formatInr(listing.price)}
        </span>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-80">Coach plan</div>
        <div className="text-[18px] font-semibold leading-tight line-clamp-2">{listing.title}</div>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="text-[13px] dx-muted">by <span className="font-semibold" style={{ color: 'var(--dx-text)' }}>{listing.sellerName || 'Coach'}</span></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] dx-muted">
          {listing.preview?.days ? <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {listing.preview.days} days</span> : null}
          {listing.preview?.exercises ? <span className="inline-flex items-center gap-1"><Dumbbell size={13} /> {listing.preview.exercises} exercises</span> : null}
          {listing.salesCount > 0 && <span className="inline-flex items-center gap-1"><Users size={13} /> {listing.salesCount} athletes</span>}
        </div>
      </div>
    </button>
  );
}

export function ListingSheet({ listing, onClose }: { listing: PlanListing; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const mine = user?.uid === listing.sellerId;

  return (
    <MarketSheet
      title={listing.title}
      subtitle={<>by {listing.sellerName || 'Coach'}{listing.salesCount > 0 ? ` · ${listing.salesCount} athletes` : ''}</>}
      onClose={onClose}
      footer={mine ? (
        <div className="text-center text-[13px] dx-muted">This is your listing.</div>
      ) : (
        <CheckoutButton
          kind="plan"
          itemId={listing.id}
          className="dx-btn w-full gap-2"
          onPurchased={(o) => { onClose(); navigate(o.result?.planId ? `/plans/${o.result.planId}` : '/plans'); }}
        >
          Buy plan · {formatInr(listing.price)}
        </CheckoutButton>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-2xl h-32 p-4 flex items-end text-white" style={{ background: listingGradient(listing.id) }}>
          <div className="flex gap-5 text-[13px]">
            <div><div className="text-[22px] font-semibold tabular">{listing.preview?.days || '—'}</div><div className="opacity-80">training days</div></div>
            <div><div className="text-[22px] font-semibold tabular">{listing.preview?.exercises || '—'}</div><div className="opacity-80">exercises</div></div>
          </div>
        </div>
        {listing.description && <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{listing.description}</p>}
        {!!listing.preview?.dayTitles?.length && (
          <section>
            <div className="dx-eyebrow mb-2">What's inside</div>
            <ol className="dx-card dx-list overflow-hidden">
              {listing.preview.dayTitles.map((t, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                  <span className="w-6 h-6 rounded-full text-[11px] font-semibold flex items-center justify-center tabular" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>{i + 1}</span>
                  <span className="truncate">{t || `Day ${i + 1}`}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="dx-inset p-3.5 flex items-start gap-3 text-[13px]">
          <ShieldCheck size={18} className="dx-accent shrink-0 mt-0.5" />
          <span className="dx-muted">The full plan is copied into your Plans right after payment. It's yours to train with and edit; it can't be re-shared publicly.</span>
        </div>
      </div>
    </MarketSheet>
  );
}
