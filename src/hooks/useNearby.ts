import { useCallback, useEffect, useId, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { getFollowing } from '@/services/social';
import { subscribeNearby, type NearbyAthlete } from '@/services/nearby';

export type NearbyStatus = 'idle' | 'needs-permission' | 'locating' | 'denied' | 'ready' | 'error';
export interface LatLngPoint { lat: number; lng: number }

/** A fix older than this is refreshed (the viewer may have moved). */
const FIX_MAX_AGE_MS = 5 * 60_000;

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

interface NearbyState {
  consumers: Record<string, { radiusKm: number; autoAsk: boolean }>;
  status: NearbyStatus;
  fix: (LatLngPoint & { at: number }) | null;
  athletes: NearbyAthlete[];
  loaded: boolean;
  following: string[];
}

/** One shared location fix + Firestore subscription for every Nearby widget on screen. */
const useNearbyState = create<NearbyState>(() => ({
  consumers: {},
  status: 'idle',
  fix: null,
  athletes: [],
  loaded: false,
  following: [],
}));

let locating = false;

async function locate(ask: boolean) {
  if (locating) return;
  locating = true;
  const set = useNearbyState.setState;
  try {
    const state = await permissionState();
    if (state === 'denied') { set({ status: 'denied' }); return; }
    if (state === 'prompt' && !ask) { set({ status: 'needs-permission' }); return; }
    if (!useNearbyState.getState().fix) set({ status: 'locating' });
    if (Capacitor.isNativePlatform() && state === 'prompt') {
      const perm = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') { set({ status: 'denied' }); return; }
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 2 * 60_000 });
    set({ fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }, status: 'ready' });
  } catch (err: any) {
    const denied = /denied|permission/i.test(String(err?.message || err));
    set(s => ({ status: denied ? 'denied' : s.fix ? 'ready' : 'error' }));
  } finally {
    locating = false;
  }
}

/** Mounted once (App): owns the location fix and the Firestore listeners while any widget needs them. */
export function NearbyDataProvider() {
  const uid = useAuthStore(s => s.user?.uid);
  const consumers = useNearbyState(s => s.consumers);
  const fix = useNearbyState(s => s.fix);
  const following = useNearbyState(s => s.following);
  const liveLocation = useCardioStore(s => (s.isTracking ? s.currentLocation : null));
  const list = Object.values(consumers);
  const active = !!uid && list.length > 0;
  const autoAsk = list.some(c => c.autoAsk);
  const radiusKm = list.reduce((m, c) => Math.max(m, c.radiusKm), 0);

  useEffect(() => {
    if (!active || !uid) return;
    let cancelled = false;
    getFollowing(uid).then(f => { if (!cancelled) useNearbyState.setState({ following: f }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, uid]);

  useEffect(() => {
    if (!active) return;
    if (liveLocation) { useNearbyState.setState({ status: 'ready' }); return; }
    const stale = !fix || Date.now() - fix.at > FIX_MAX_AGE_MS;
    if (stale || useNearbyState.getState().status !== 'ready') void locate(autoAsk);
    const id = window.setInterval(() => void locate(false), FIX_MAX_AGE_MS);
    return () => window.clearInterval(id);
  }, [active, autoAsk, !!liveLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewer = liveLocation ?? fix;
  // Re-subscribe only when the viewer moves to a different ~1 km area.
  const areaKey = viewer ? `${viewer.lat.toFixed(2)},${viewer.lng.toFixed(2)}` : '';
  const followingKey = following.join(',');

  useEffect(() => {
    if (!active || !uid || !viewer) return;
    useNearbyState.setState({ loaded: false });
    const unsubscribe = subscribeNearby(uid, viewer, following, radiusKm, athletes => {
      useNearbyState.setState({ athletes, loaded: true });
    }, err => console.warn('[Nearby] listener failed', err));
    return () => {
      unsubscribe();
      // Nothing keeps the list fresh anymore; don't let passive readers show stale people.
      if (!Object.keys(useNearbyState.getState().consumers).length) useNearbyState.setState({ athletes: [], loaded: false });
    };
  }, [active, uid, areaKey, followingKey, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/**
 * Athletes training (or who just trained) near the viewer. Uses the live run position when
 * recording, otherwise a position fix (never asks for location on its own unless `autoAsk`).
 */
export function useNearby(radiusKm: number, opts: { autoAsk?: boolean; enabled?: boolean } = {}) {
  const { autoAsk = false, enabled = true } = opts;
  const id = useId();
  const status = useNearbyState(s => s.status);
  const fix = useNearbyState(s => s.fix);
  const all = useNearbyState(s => s.athletes);
  const loaded = useNearbyState(s => s.loaded);
  const following = useNearbyState(s => s.following);
  const liveLocation = useCardioStore(s => (s.isTracking ? s.currentLocation : null));

  useEffect(() => {
    if (!enabled) return;
    useNearbyState.setState(s => ({ consumers: { ...s.consumers, [id]: { radiusKm, autoAsk } } }));
    return () => useNearbyState.setState(s => {
      const consumers = { ...s.consumers };
      delete consumers[id];
      return { consumers };
    });
  }, [id, radiusKm, autoAsk, enabled]);

  const athletes = useMemo(() => all.filter(a => a.distanceKm <= radiusKm), [all, radiusKm]);
  const requestLocation = useCallback(() => locate(true), []);

  return {
    status: liveLocation ? 'ready' as const : status,
    viewer: liveLocation ?? fix,
    athletes,
    live: athletes,
    loaded,
    following,
    requestLocation,
    retry: requestLocation,
  };
}
