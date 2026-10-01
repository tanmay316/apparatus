import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { ShoppingBag } from 'lucide-react';
import { isAmazonUrl, matchAffiliateLinks, withAffiliateTag, type AffiliateLink, type AffiliatePlacement } from '@/lib/affiliates';
import { recordAffiliateClick, useAffiliateCatalog } from '@/services/affiliates';

async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) {
    try { await Browser.open({ url }); return; } catch { /* fall through */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Admin-curated product picks (affiliate links). Renders nothing when nothing matches. */
export function GearPicks({ placement, context, title, variant = 'dx' }: {
  placement: AffiliatePlacement;
  context: string[];
  title?: string;
  variant?: 'dx' | 'cal';
}) {
  const catalog = useAffiliateCatalog();
  const links = catalog.data ? matchAffiliateLinks(catalog.data.links, placement, context, 3) : [];
  if (!links.length) return null;
  const tag = catalog.data?.settings?.amazonTag;
  const anyAmazon = links.some(l => isAmazonUrl(l.url));

  const open = (l: AffiliateLink) => {
    recordAffiliateClick(l.id);
    openExternal(withAffiliateTag(l.url, tag));
  };

  const cal = variant === 'cal';
  const card = cal ? 'cal-card' : 'dx-inset';
  const muted = cal ? 'cal-muted' : 'dx-muted';

  return (
    <section>
      <div className={cal ? '' : 'dx-eyebrow mb-2.5'} style={cal ? { fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', margin: '22px 2px 10px' } : undefined}>
        {title || (placement === 'exercise' ? 'Gear for this exercise' : 'Picks for your plan')}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {links.map(l => (
          <button
            key={l.id}
            type="button"
            onClick={() => open(l)}
            className={card}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, textAlign: 'left', width: '100%', borderRadius: cal ? 20 : undefined }}
          >
            <span style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {l.imageUrl && /^https:\/\//.test(l.imageUrl)
                ? <img src={l.imageUrl} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <ShoppingBag size={20} color="#6b7280" />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, lineHeight: 1.25 }} className="line-clamp-2">{l.title}</span>
              <span className={muted} style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                {[l.priceText, l.partner || (isAmazonUrl(l.url) ? 'Amazon' : '')].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={cal ? 'cal-btn' : 'dx-btn'} style={{ height: 34, padding: '0 14px', fontSize: 13, flexShrink: 0, width: 'auto' }}>Shop</span>
          </button>
        ))}
      </div>
      <p className={muted} style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
        {anyAmazon ? 'As an Amazon Associate, Apparatus earns from qualifying purchases. ' : ''}We may earn a commission from these links at no extra cost to you.
      </p>
    </section>
  );
}
