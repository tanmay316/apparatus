import { useNavigate } from 'react-router-dom';
import { BadgeIndianRupee, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { usePaymentsEnabled } from '@/lib/payments-mode';
import { formatInr, isPaid, sellerShare, type MarketConfig } from '@/services/market';
import { useMarketConfig, usePayoutAccount } from './CheckoutButton';

const MAX_ENTRY_FEE = 100000;

/** Display-only entry fee ('' = none). */
export function parseEntryFee(raw: string): { value: number | null; error?: string } {
  const s = raw.trim();
  if (!s || s === '0') return { value: null };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ENTRY_FEE) return { value: null, error: `Entry fee must be a whole amount up to ${formatInr(MAX_ENTRY_FEE)}.` };
  return { value: n };
}

/** Entry fee shown on an event or challenge; an older in-app ticket price counts too while payments are off. */
export function entryFeeOf(item: { entryFee?: number | null; ticketPrice?: number | null } | null | undefined, payments: boolean): number | null {
  if (!item) return null;
  if (typeof item.entryFee === 'number' && item.entryFee > 0) return item.entryFee;
  return !payments && isPaid(item.ticketPrice) ? item.ticketPrice : null;
}

export function useEntryFee(item: { entryFee?: number | null; ticketPrice?: number | null } | null | undefined): number | null {
  return entryFeeOf(item, usePaymentsEnabled());
}

export function EntryFeeNote({ fee, compact }: { fee: number | null; compact?: boolean }) {
  if (!fee) return null;
  if (compact) return <span className="inline-flex items-center gap-1"><BadgeIndianRupee size={12} /> {formatInr(fee)} entry</span>;
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-2xl border border-line/60 text-sm">
      <BadgeIndianRupee size={16} className="shrink-0 text-emerald-500" />
      <span><span className="font-semibold">Entry fee {formatInr(fee)}</span> <span className="text-bone-dim">· paid to the organiser</span></span>
    </div>
  );
}

/** Optional entry fee on events and challenges. Only shown while in-app payments are off. */
export function EntryFeeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const payments = usePaymentsEnabled();
  if (payments) return null;
  const parsed = parseEntryFee(value);
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium mb-1.5 flex items-center gap-1.5">
        <BadgeIndianRupee size={13} className="text-emerald-500" /> Entry fee <span className="text-bone-dim font-normal">(optional)</span>
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-bone-dim pointer-events-none">₹</span>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="Free"
          className="dx-input input-field w-full !pl-7"
          aria-invalid={!!parsed.error}
        />
      </div>
      <p className={`text-[12px] mt-1.5 ${parsed.error ? 'text-red-500' : 'text-bone-dim'}`}>
        {parsed.error || 'Shown to people before they join. You collect it yourself.'}
      </p>
    </div>
  );
}

/** '' = free. Returns the integer price or an error message. */
export function parsePriceInput(raw: string, config: MarketConfig): { value: number; error?: string } {
  const s = raw.trim();
  if (!s || s === '0') return { value: 0 };
  const n = Number(s);
  if (!Number.isInteger(n)) return { value: 0, error: 'Use a whole rupee amount.' };
  if (n < config.minPrice || n > config.maxPrice) {
    return { value: 0, error: `Price must be between ${formatInr(config.minPrice)} and ${formatInr(config.maxPrice)}.` };
  }
  return { value: n };
}

/**
 * Optional price input for events, challenges and clans. Only the person who gets paid sees it,
 * and only once their payout account is approved (the Firestore rules enforce the same).
 */
export function PriceField({ value, onChange, bucket, sellerUid, label, unit }: {
  value: string;
  onChange: (v: string) => void;
  bucket: 'ticket' | 'coach';
  sellerUid?: string;
  label: string;
  unit: string;
}) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const config = useMarketConfig();
  const payments = usePaymentsEnabled();
  const isSeller = !!user && (!sellerUid || sellerUid === user.uid);
  const account = usePayoutAccount(isSeller && payments ? user?.uid : undefined);
  if (!payments || !isSeller || account === undefined) return null;

  const labelCls = 'text-[13px] font-medium text-bone mb-1.5 flex items-center gap-1.5';
  if (account?.status !== 'active') {
    return (
      <div>
        <span className={labelCls}><BadgeIndianRupee size={13} className="text-emerald-400" /> {label}</span>
        <button
          type="button"
          onClick={() => navigate('/seller?tab=payouts')}
          className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-line text-left hover:bg-ink-2 transition-colors"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-bone">{account?.status === 'pending' ? 'Payout setup under review' : 'Want to charge for this?'}</span>
            <span className="block text-xs text-bone-dim mt-0.5">
              {account?.status === 'pending' ? 'You can add a price once it\'s approved.' : 'Set up payouts once and earn from every sale.'}
            </span>
          </span>
          <ChevronRight size={16} className="text-bone-dim shrink-0" />
        </button>
      </div>
    );
  }

  const parsed = parsePriceInput(value, config);
  const pct = bucket === 'ticket' ? config.fees.ticket : config.fees.coach;
  return (
    <div>
      <label htmlFor={`price-${bucket}`} className={labelCls}>
        <BadgeIndianRupee size={13} className="text-emerald-400" /> {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-bone-dim">₹</span>
        <input
          id={`price-${bucket}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="Free"
          className={`input-field w-full text-sm text-bone pl-7 ${parsed.error ? 'border-red-500' : ''}`}
        />
      </div>
      <p className={`text-[12px] mt-1.5 ${parsed.error ? 'text-red-500' : 'text-bone-dim'}`}>
        {parsed.error || (parsed.value > 0
          ? `You get ${formatInr(sellerShare(parsed.value, pct))} per ${unit} (${pct}% platform fee).`
          : 'Leave empty to keep it free.')}
      </p>
    </div>
  );
}
