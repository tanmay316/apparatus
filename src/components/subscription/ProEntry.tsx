import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Crown } from 'lucide-react';
import { CAN_UPSELL, PRO_PRICE_LABEL, useIsPro, useSubscriptionStore } from '@/stores/subscription-store';
import { BRAND } from '@/lib/brand';

/** Animated gold ring + crown around a Pro member's avatar. Children should be a round image. */
export function ProRing({ pro, children, className = '', crown = 14 }: { pro?: boolean; children: ReactNode; className?: string; crown?: number }) {
  if (!pro) return <>{children}</>;
  return (
    <span className={`pro-ring ${className}`} title={`${BRAND.name} Pro member`}>
      {children}
      {crown > 0 && (
        <span className="pro-ring-crown" style={{ width: crown + 6, height: crown + 6 }} aria-label="Pro">
          <Crown size={crown * 0.7} strokeWidth={2.6} />
        </span>
      )}
    </span>
  );
}

const GOLD = 'linear-gradient(135deg,#f5b544,#d97706)';

/** Crown in the top bar: opens the paywall, or Pro settings for members. */
export function ProTopbarButton({ className }: { className: string }) {
  const isPro = useIsPro();
  const openPaywall = useSubscriptionStore(s => s.openPaywall);
  if (!CAN_UPSELL) return null;
  if (isPro) {
    return (
      <Link to="/settings#pro" className={className} aria-label={`${BRAND.name} Pro`} title={`${BRAND.name} Pro`}>
        <Crown size={19} style={{ color: '#f5b544' }} fill="#f5b544" />
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => openPaywall()} className={className} aria-label={`Get ${BRAND.name} Pro`} title={`Get ${BRAND.name} Pro`}>
      <Crown size={19} style={{ color: '#f5b544' }} />
    </button>
  );
}

/** Sidebar entry above Settings. */
export function ProSidebarItem({ onNavigate }: { onNavigate?: () => void }) {
  const isPro = useIsPro();
  const openPaywall = useSubscriptionStore(s => s.openPaywall);
  if (!CAN_UPSELL) return null;
  const content = (
    <>
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: GOLD, color: '#1a1206' }}>
        <Crown size={15} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[14px] font-semibold text-bone leading-tight">{BRAND.name} Pro</span>
        <span className="block text-[11px] text-bone-dim leading-tight">{isPro ? 'Active · manage plan' : `Unlock everything · ${PRO_PRICE_LABEL}`}</span>
      </span>
      <ChevronRight size={15} className="text-bone-dim shrink-0" />
    </>
  );
  const cls = 'w-full flex items-center gap-3 min-h-[48px] px-3 py-1.5 rounded-xl border border-[#f5b544]/30 bg-[#f5b544]/[0.07] hover:bg-[#f5b544]/[0.12] transition-colors mb-1';
  return isPro ? (
    <Link to="/settings#pro" onClick={onNavigate} className={cls}>{content}</Link>
  ) : (
    <button type="button" onClick={() => { onNavigate?.(); openPaywall(); }} className={cls}>{content}</button>
  );
}

/** Upgrade / membership card on your own profile. */
export function ProProfileCard() {
  const isPro = useIsPro();
  const openPaywall = useSubscriptionStore(s => s.openPaywall);
  if (!CAN_UPSELL) return null;
  const body = (
    <>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: GOLD, color: '#1a1206' }}>
        <Crown size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: 'var(--dx-text)' }}>
          {isPro ? `You're a ${BRAND.name} Pro member` : `Upgrade to ${BRAND.name} Pro`}
        </span>
        <span className="block text-[12px] dx-muted leading-snug">
          {isPro ? 'Unlimited AI, advanced analytics and every template. Manage your plan.' : `Unlimited AI coach, food scans, advanced analytics and more · ${PRO_PRICE_LABEL}`}
        </span>
      </span>
      <ChevronRight size={18} className="dx-muted shrink-0" />
    </>
  );
  const cls = 'mt-3 w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-opacity hover:opacity-90';
  const style = { background: 'rgba(245, 181, 68, 0.12)', border: '1px solid rgba(245, 181, 68, 0.35)' };
  return isPro ? (
    <Link to="/settings#pro" className={cls} style={style}>{body}</Link>
  ) : (
    <button type="button" onClick={() => openPaywall()} className={cls} style={style}>{body}</button>
  );
}
