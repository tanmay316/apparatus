import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PRODUCTION_URL } from '@/lib/share';
import { BRAND } from '@/lib/brand';

export const SUPPORT_EMAIL = BRAND.supportEmail;

export const LEGAL_URLS = {
  privacy: `${PRODUCTION_URL}/privacy.html`,
  terms: `${PRODUCTION_URL}/terms.html`,
  deleteAccount: `${PRODUCTION_URL}/delete-account.html`,
} as const;

export async function openLegal(kind: keyof typeof LEGAL_URLS) {
  const url = LEGAL_URLS[kind];
  if (Capacitor.isNativePlatform()) {
    try { await Browser.open({ url }); return; } catch { /* fall back */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
