import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RoutePoint, CardioActivityType } from '@/types';

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

// ────────────────────────────────────────────────────────────
// Global GPS & Wake Lock (lives outside React for persistence)
// ────────────────────────────────────────────────────────────
let watchIdRef: string | number | null = null;
let wakeLockRef: any = null;

const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator) {
      wakeLockRef = await (navigator as any).wakeLock.request('screen');
    }
  } catch { /* silent */ }
};

const releaseWakeLock = () => {
  if (wakeLockRef) {
    wakeLockRef.release().catch(() => {});
    wakeLockRef = null;
  }
};

const checkPermissionsNative = async () => {
  try {
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      perm = await Geolocation.requestPermissions();
    }
    return perm.location === 'granted';
  } catch (err) {
    return true; 
  }
};

const startGpsWatch = async () => {
  if (watchIdRef !== null) return; // already watching
  
  requestWakeLock();

  if (Capacitor.isNativePlatform()) {
    // NATIVE CAPACITOR APP
    const hasPerm = await checkPermissionsNative();
    if (!hasPerm) {
      console.warn('[CardioStore] GPS permission denied natively');
      useCardioStore.setState({ gpsStatus: 'denied' });
      return;
    }
    try {
      useCardioStore.setState({ gpsStatus: 'waiting' });
      watchIdRef = await Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
        (pos, err) => {
          if (err) {
            useCardioStore.setState({ gpsStatus: 'error' });
            return;
          }
          if (pos) {
            useCardioStore.setState({ gpsStatus: 'active' });
            useCardioStore.getState().addPoint({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              alt: pos.coords.altitude ?? undefined,
              speed: pos.coords.speed ?? undefined,
              ts: Date.now(),
            });
          }
        }
      );
    } catch (e) {
      console.warn('[CardioStore] Failed native GPS:', e);
      useCardioStore.setState({ gpsStatus: 'error' });
    }
  } else {
    // WEB BROWSER
    if (!navigator.geolocation) {
      useCardioStore.setState({ gpsStatus: 'error' });
      return;
    }
    
    useCardioStore.setState({ gpsStatus: 'waiting' });
    watchIdRef = navigator.geolocation.watchPosition(
      (pos) => {
        useCardioStore.setState({ gpsStatus: 'active' });
        useCardioStore.getState().addPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude ?? undefined,
          speed: pos.coords.speed ?? undefined,
          ts: Date.now(),
        });
      },
      (err) => {
        console.warn('[CardioStore] Web GPS error:', err.code, err.message);
        if (err.code === 1) {
          useCardioStore.setState({ gpsStatus: 'denied' });
        } else {
          useCardioStore.setState({ gpsStatus: 'error' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }
};

const stopGpsWatch = async () => {
  if (watchIdRef !== null) {
    if (Capacitor.isNativePlatform()) {
      try { await Geolocation.clearWatch({ id: watchIdRef as string }); } catch {}
    } else {
      navigator.geolocation.clearWatch(watchIdRef as number);
    }
    watchIdRef = null;
  }
  releaseWakeLock();
};

// ────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────

type GpsStatus = 'off' | 'waiting' | 'active' | 'error' | 'denied';

interface CardioState {
  isTracking: boolean;
  isPaused: boolean;
  activityType: CardioActivityType | null;
  startedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  routePoints: RoutePoint[];
  distanceKm: number;
  currentSpeedKmh: number;
  maxSpeedKmh: number;
  elevationGainM: number;
  gpsStatus: GpsStatus;

  // Actions
  startTracking: (type: CardioActivityType) => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  addPoint: (point: RoutePoint) => void;
  stopTracking: () => void;
  reset: () => void;
}

const IDLE: Partial<CardioState> = {
  isTracking: false,
  isPaused: false,
  activityType: null,
  startedAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  routePoints: [],
  distanceKm: 0,
  currentSpeedKmh: 0,
  maxSpeedKmh: 0,
  elevationGainM: 0,
  gpsStatus: 'off' as GpsStatus,
};

export const useCardioStore = create<CardioState>()(
  persist(
    (set, get) => ({
      ...(IDLE as CardioState),

      startTracking: (type) => {
        // IMPORTANT: set isTracking FIRST so GPS callbacks aren't dropped
        set({
          isTracking: true,
          isPaused: false,
          activityType: type,
          startedAt: Date.now(),
          pausedAt: null,
          totalPausedMs: 0,
          routePoints: [],
          distanceKm: 0,
          currentSpeedKmh: 0,
          maxSpeedKmh: 0,
          elevationGainM: 0,
          gpsStatus: 'waiting' as GpsStatus,
        });
        // Start GPS after state is ready
        startGpsWatch();
      },

      pauseTracking: () => {
        stopGpsWatch();
        set({ isPaused: true, pausedAt: Date.now() });
      },

      resumeTracking: () => {
        startGpsWatch();
        const { pausedAt, totalPausedMs } = get();
        const addedPause = pausedAt ? Date.now() - pausedAt : 0;
        set({ isPaused: false, pausedAt: null, totalPausedMs: totalPausedMs + addedPause });
      },

      addPoint: (point) => {
        const state = get();
        if (!state.isTracking || state.isPaused) return;

        const prev = state.routePoints[state.routePoints.length - 1];
        let addedDistance = 0;
        let addedElevation = 0;
        let speed = 0;

        if (prev) {
          const rawDistance = haversineKm(prev.lat, prev.lng, point.lat, point.lng);
          const dtSec = (point.ts - prev.ts) / 1000;

          // ── Strava-style distance filtering ──────────────────
          // 1. Ignore micro-jitter (< 3 meters) — GPS drift noise
          // 2. Ignore teleport jumps (> 500 meters) — GPS glitches
          // 3. Sanity-check implied speed to reject impossible bursts
          if (rawDistance >= 0.003 && rawDistance < 0.5) {
            // Calculate implied speed from this segment
            const impliedSpeedKmh = dtSec > 0 ? (rawDistance / dtSec) * 3600 : 0;

            // Max plausible speeds: walk ~10, run ~35, cycle ~80 km/h
            // Use a generous 100 km/h ceiling to reject only true outliers
            if (impliedSpeedKmh < 100) {
              addedDistance = rawDistance;
            }
          }

          // Elevation gain (only count uphill)
          if (point.alt !== undefined && prev.alt !== undefined) {
            const diff = point.alt - prev.alt;
            // Ignore small fluctuations (< 2m) as barometric noise
            if (diff > 2) addedElevation = diff;
          }

          // Calculate speed from distance/time
          if (dtSec > 0 && addedDistance > 0) {
            speed = (addedDistance / dtSec) * 3600; // km/h
          }
        }

        // Prefer GPS-reported speed when available (more accurate than derived)
        if (point.speed !== undefined && point.speed > 0) {
          const gpsSpeedKmh = point.speed * 3.6; // m/s → km/h
          // Only trust GPS speed if it's within a reasonable range
          if (gpsSpeedKmh < 100) {
            speed = gpsSpeedKmh;
          }
        }

        set({
          routePoints: [...state.routePoints, point],
          distanceKm: state.distanceKm + addedDistance,
          currentSpeedKmh: Math.round(speed * 10) / 10,
          maxSpeedKmh: Math.max(state.maxSpeedKmh, Math.round(speed * 10) / 10),
          elevationGainM: state.elevationGainM + addedElevation,
        });
      },

      stopTracking: () => {
        stopGpsWatch();
        set({ isTracking: false, isPaused: false, gpsStatus: 'off' as GpsStatus });
      },

      reset: () => {
        set({ ...(IDLE as CardioState) });
      },
    }),
    { name: 'apparatus-cardio-storage' }
  )
);
