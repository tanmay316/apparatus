import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';

export const PRODUCTION_URL = 'https://apparatus-46b1b.web.app';

/**
 * Returns a guaranteed production web URL for sharing, even when running
 * inside Capacitor Android / iOS (where window.location.origin is localhost).
 */
export function getAppShareUrl(path: string = ''): string {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const isLocal =
      !origin ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('https://localhost');

    if (isLocal) {
      return `${PRODUCTION_URL}${cleanPath}`;
    }
    return `${origin}${cleanPath}`;
  }

  return `${PRODUCTION_URL}${cleanPath}`;
}

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

/**
 * Native cross-platform share helper. Uses Capacitor Native Share on mobile,
 * Web Share API on modern browsers, and gracefully falls back to clipboard copying.
 */
export async function shareContent(options: ShareOptions): Promise<{ success: boolean; method: 'native' | 'clipboard' }> {
  const shareUrl = options.url || getAppShareUrl();
  const title = options.title || 'Apparatus';
  const text = options.text ? `${options.text}\n${shareUrl}` : shareUrl;

  // 1. Try Capacitor Native Share
  try {
    const canShare = await Share.canShare().then(r => r.value).catch(() => true);
    if (canShare) {
      await Share.share({
        title,
        text: options.text || title,
        url: shareUrl,
        dialogTitle: options.dialogTitle || 'Share with Athletes',
      });
      return { success: true, method: 'native' };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('cancelled')) {
      return { success: false, method: 'native' };
    }
  }

  // 2. Try Web Share API (Mobile web / Safari / Chrome)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text: options.text || title,
        url: shareUrl,
      });
      return { success: true, method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { success: false, method: 'native' };
    }
  }

  // 3. Fallback: Copy production URL to clipboard
  try {
    await Clipboard.write({ string: text });
    return { success: true, method: 'clipboard' };
  } catch {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'clipboard' };
    }
  }

  return { success: false, method: 'clipboard' };
}
