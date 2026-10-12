import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { getFollowing } from '@/services/social';
import { subscribeNearby, type NearbyAthlete } from '@/services/nearby';

export type NearbyStatus = 'idle' | 'needs-permission' | 'locating' | 'denied' | 'ready' | 'error';
export interface LatLngPoint { lat: number; lng: number }

async function permissionState(): Promise<'granted' | 'prompt' | 'denied'> {
  if (!Capacitor.isNativePlatform()) {
    try {
      const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (p?.state === 'granted') return 'granted';
      if (p?.state === 'denied') return 'denied';
    } catch { /* Permissions API unavailable */ }
    return 'prompt';
  }
  const perm = await Geolocation.checkPermissions();
  if (perm.location === 'granted' || perm.coarseLocation === 'granted') return 'granted';
  if (perm.location === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Athletes training near the viewer. Uses the live run position when recording, otherwise one
 * low-accuracy fix (never asks for location on its own unless `autoAsk`).
 */
export function useNearby(radiusKm: number, opts: { autoAsk?: boolean; enabled?: boolean } = {}) {
  const { autoAsk = false, enabled = true } = opts;
  const uid = useAuthStore(s => s.user?.uid);
  const liveLocation = useCardioStore(s => (s.isTracking ? s.currentLocation : null));
  const [fix, setFix] = useState<LatLngPoint | null>(null);
  const [status, setStatus] = useState<NearbyStatus>('idle');
  const [athletes, setAthletes] = useState<NearbyAthlete[]>([]);
  const [loaded, setLoaded] = useState(false);

  const { data: following = [] } = useQuery({
    queryKey: ['following', uid],
    queryFn: () => getFollowing(uid!),
    enabled: !!uid && enabled,
  });

  const locate = useCallback(async (ask: boolean) => {
    try {
      const state = await permissionState();
      if (state === 'denied') { setStatus('denied'); return; }
      if (state === 'prompt' && !ask) { setStatus('needs-permission'); return; }
      setStatus('locating');
      if (Capacitor.isNativePlatform() && state === 'prompt') {
        const perm = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
        if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') { setStatus('denied'); return; }
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 });
      setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setStatus('ready');
    } catch (err: any) {
      const denied = /denied|permission/i.test(String(err?.message || err));
      setStatus(denied ? 'denied' : 'error');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (liveLocation) { setStatus('ready'); return; }
    void locate(autoAsk);
  }, [enabled, autoAsk, locate, !!liveLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-subscribe only when the viewer moves to a different ~1 km area.
  const viewer = liveLocation ?? fix;
  const areaKey = viewer ? `${viewer.lat.toFixed(2)},${viewer.lng.toFixed(2)}` : '';
  const followingKey = following.join(',');

  useEffect(() => {
    if (!uid || !viewer || !enabled) return;
    setLoaded(false);
    return subscribeNearby(uid, viewer, following, radiusKm, list => {
      setAthletes(list);
      setLoaded(true);
    }, err => console.warn('[Nearby] listener failed', err));
  }, [uid, areaKey, followingKey, radiusKm, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    viewer,
    athletes,
    loaded,
    following,
    requestLocation: () => locate(true),
    retry: () => locate(true),
  };
}
