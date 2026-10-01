/** Affiliate product matching. Pure so it can be unit-tested (scratch/affiliate-test.ts). */

export type AffiliatePlacement = 'exercise' | 'nutrition';

export interface AffiliateLink {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  priceText?: string;
  partner?: string;
  /** Words matched against the exercise name (exercise) or the nutrition context (nutrition). "*" matches everything. */
  keywords: string[];
  placements: AffiliatePlacement[];
  active: boolean;
  clicks?: number;
  priority?: number;
}

const AMAZON_HOST = /(^|\.)amazon\.(in|com|co\.uk|ca|de|ae|com\.au)$/i;

export function normalizeWords(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(w => (w.length >= 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ')} `;
}

/** Whole-word, plural-insensitive match: "pull-up bar" matches "Weighted Pull-Ups". */
export function keywordMatches(haystack: string, keyword: string): boolean {
  const k = keyword.trim();
  if (!k) return false;
  if (k === '*') return true;
  return normalizeWords(haystack).includes(normalizeWords(k));
}

export function isSafeAffiliateUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Adds the Amazon Associates tag to Amazon product URLs; other URLs are returned untouched. */
export function withAffiliateTag(url: string, amazonTag?: string): string {
  if (!amazonTag || !/^[A-Za-z0-9-]{3,40}$/.test(amazonTag)) return url;
  try {
    const u = new URL(url);
    if (!AMAZON_HOST.test(u.hostname)) return url;
    u.searchParams.set('tag', amazonTag);
    return u.toString();
  } catch {
    return url;
  }
}

export const isAmazonUrl = (url: string) => {
  try { return AMAZON_HOST.test(new URL(url).hostname) || new URL(url).hostname === 'amzn.to'; } catch { return false; }
};

export function matchAffiliateLinks(links: AffiliateLink[], placement: AffiliatePlacement, context: string[], max = 3): AffiliateLink[] {
  const text = context.filter(Boolean).join(' | ');
  return links
    .filter(l => l.active && l.placements?.includes(placement) && isSafeAffiliateUrl(l.url))
    .map(l => {
      const hits = (l.keywords || []).filter(k => keywordMatches(text, k));
      const specific = hits.filter(k => k.trim() !== '*').length;
      return { l, score: specific * 10 + (hits.length ? 1 : 0) + (l.priority || 0) / 100 };
    })
    .filter(x => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.l);
}
