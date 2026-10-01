import { ExternalLink, Gift } from 'lucide-react';
import type { SponsorBadge } from '@/types';
import { isSafeAffiliateUrl } from '@/lib/affiliates';

/** "Presented by …" strip for brand-backed challenges and events. */
export function SponsorBanner({ sponsor, compact }: { sponsor?: SponsorBadge | null; compact?: boolean }) {
  if (!sponsor?.name) return null;
  const logo = sponsor.logoUrl && (sponsor.logoUrl.startsWith('data:image/') || isSafeAffiliateUrl(sponsor.logoUrl)) ? sponsor.logoUrl : '';
  const site = sponsor.website && isSafeAffiliateUrl(sponsor.website) ? sponsor.website : '';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 pl-1 pr-2.5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-semibold border border-amber-500/30 max-w-full">
        {logo ? <img src={logo} alt="" className="w-4 h-4 rounded-full object-cover bg-white" /> : <Gift size={12} className="ml-1" />}
        <span className="truncate">Presented by {sponsor.name}</span>
      </span>
    );
  }

  return (
    <div className="p-3 rounded-2xl flex items-center gap-3 border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-transparent">
      <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
        {logo ? <img src={logo} alt={`${sponsor.name} logo`} className="w-full h-full object-contain" /> : <Gift size={18} className="text-amber-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase font-black tracking-wider text-amber-500">Presented by {sponsor.name}</div>
        {sponsor.prize && <div className="text-xs font-bold text-bone mt-0.5 line-clamp-2">{sponsor.prize}</div>}
      </div>
      {site && (
        <a href={site} target="_blank" rel="sponsored noopener noreferrer" className="shrink-0 p-2 rounded-lg bg-ink-2 hover:bg-ink-3 text-bone-dim" aria-label={`Visit ${sponsor.name}`}>
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}
