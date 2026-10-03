import brand from '../../brand.config.json';

/**
 * App name and identity, from brand.config.json at the repo root (the one place to rename the app).
 * Storage keys, Firestore collections and the Firebase project keep their old ids on purpose.
 */
export const BRAND = {
  name: brand.name,
  upper: brand.name.toUpperCase(),
  /** Lowercase, file-name safe form (downloads, exports). */
  slug: brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app',
  wordmark: brand.wordmark || brand.name.toUpperCase(),
  aiName: `${brand.name} AI`,
  proName: `${brand.name} Pro`,
  tagline: brand.tagline,
  shortDescription: brand.shortDescription,
  supportEmail: brand.supportEmail,
  webUrl: brand.webUrl.replace(/\/$/, ''),
} as const;
