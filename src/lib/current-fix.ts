import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * One position fix, asking for permission only when `ask`. Precise when allowed; an
 * "approximate only" grant still returns a (coarser) fix instead of nothing.
 */
export async function currentFix(ask = true): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      let perm = await Geolocation.checkPermissions();
      const prompt = (s: string) => s === 'prompt' || s === 'prompt-with-rationale';
      if (ask && prompt(perm.location) && prompt(perm.coarseLocation)) perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') return null;
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
