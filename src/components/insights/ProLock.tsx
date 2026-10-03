import type { ReactNode } from 'react';
import { Crown, Lock } from 'lucide-react';
import { CAN_PURCHASE, requirePro, useHasPro } from '@/stores/subscription-store';
import { BRAND } from '@/lib/brand';

/** Small "PRO" pill for section titles. */
export function ProBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-bold tracking-wider ${className}`} style={{ background: 'linear-gradient(135deg,#f5b544,#d97706)', color: '#1a1206' }}>
      <Crown size={10} /> PRO
    </span>
  );
}

/**
 * Shows Pro content to subscribers; everyone else sees a blurred preview with an unlock button.
 * `compact` is for small sections inside a session analysis.
 */
export function ProLock({ children, title, reason, compact, maxHeight = 320, variant = 'app' }: {
  children: ReactNode;
  title: string;
  reason?: string;
  compact?: boolean;
  maxHeight?: number;
  /** 'cal' for the Cal AI-styled nutrition screens. */
  variant?: 'app' | 'cal';
}) {
  const hasPro = useHasPro();
  if (hasPro) return <>{children}</>;
  // Store builds have no way to buy Pro, so locked content is left out instead of teased.
  if (!CAN_PURCHASE) return null;
  const cal = variant === 'cal';
  const shade = cal
    ? 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--cal-bg) 60%, transparent) 40%, color-mix(in srgb, var(--cal-bg) 88%, transparent))'
    : 'linear-gradient(180deg, transparent, rgb(var(--color-ink) / 0.4) 40%, rgb(var(--color-ink) / 0.75))';
  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ maxHeight }}>
      <div aria-hidden className="pointer-events-none select-none" style={{ filter: 'blur(7px)', opacity: 0.55 }}>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4" style={{ background: shade }}>
        <div className={`text-center ${compact ? 'max-w-[260px]' : 'max-w-[320px]'}`}>
          <span className="mx-auto flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'linear-gradient(135deg,#f5b544,#d97706)', color: '#1a1206' }}>
            {compact ? <Lock size={17} /> : <Crown size={18} />}
          </span>
          <div className={`mt-2 text-[14px] font-semibold ${cal ? '' : 'text-bone'}`}>{title}</div>
          {!compact && reason && <p className={`mt-1 text-[12px] leading-snug ${cal ? 'cal-muted' : 'text-bone-dim'}`}>{reason}</p>}
          <button
            type="button"
            onClick={() => requirePro(reason || `${title} is part of ${BRAND.name} Pro.`)}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#f5b544,#d97706)', color: '#1a1206' }}
          >
            <Crown size={14} /> Unlock with Pro
          </button>
        </div>
      </div>
    </div>
  );
}
