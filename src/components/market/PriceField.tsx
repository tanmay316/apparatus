import { useNavigate } from 'react-router-dom';
import { BadgeIndianRupee, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatInr, sellerShare, type MarketConfig } from '@/services/market';
import { useMarketConfig, usePayoutAccount } from './CheckoutButton';

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
  const isSeller = !!user && (!sellerUid || sellerUid === user.uid);
  const account = usePayoutAccount(isSeller ? user?.uid : undefined);
  if (!isSeller || account === undefined) return null;

  const labelCls = 'block text-xs font-mono text-bone-dim uppercase mb-1 flex items-center gap-1';
  if (account?.status !== 'active') {
    return (
      <div>
        <span className={labelCls}><BadgeIndianRupee size={13} className="text-emerald-400" /> {label}</span>
        <button
          type="button"
          onClick={() => navigate('/marketplace?tab=sell')}
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
      <p className={`text-[11px] font-mono mt-1 ${parsed.error ? 'text-red-400' : 'text-bone-dim'}`}>
        {parsed.error || (parsed.value > 0
          ? `You get ${formatInr(sellerShare(parsed.value, pct))} per ${unit} (${pct}% platform fee).`
          : 'Leave empty to keep it free.')}
      </p>
    </div>
  );
}
