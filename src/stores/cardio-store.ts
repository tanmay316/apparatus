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

// Global references for background tracking
let watchIdRef: number | null = null;
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

const startGpsWatch = () => {
  if (watchIdRef !== null) return;
  if (!navigator.geolocation) return;

  requestWakeLock();
  watchIdRef = navigator.geolocation.watchPosition(
    (pos) => {
      useCardioStore.getState().addPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        alt: pos.coords.altitude ?? undefined,
        speed: pos.coords.speed ?? undefined,
        ts: Date.now(),
      });
    },
    (err) => console.warn('GPS error:', err),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );
};

const stopGpsWatch = () => {
  if (watchIdRef !== null) {
    navigator.geolocation.clearWatch(watchIdRef);
    watchIdRef = null;
  }
  releaseWakeLock();
};

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
};

export const useCardioStore = create<CardioState>()(
  persist(
    (set, get) => ({
      ...(IDLE as CardioState),

      startTracking: (type) => {
        startGpsWatch();
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
        });
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
          
          // Filter noise: ignore jumps less than 10 meters to prevent stationary drift
          if (rawDistance >= 0.01 && rawDistance < 0.5) {
            addedDistance = rawDistance;
          }

          if (point.alt !== undefined && prev.alt !== undefined) {
            const diff = point.alt - prev.alt;
            if (diff > 0) addedElevation = diff;
          }

          const dtSec = (point.ts - prev.ts) / 1000;
          if (dtSec > 0 && addedDistance > 0) {
            speed = (addedDistance / dtSec) * 3600; // km/h
          }
        }

        // Use GPS-reported speed if available and more reliable
        if (point.speed !== undefined && point.speed > 0) {
          speed = point.speed * 3.6; // m/s → km/h
        }

        set({
          routePoints: [...state.routePoints, point],
          distanceKm: state.distanceKm + addedDistance,
          currentSpeedKmh: Math.round(speed * 10) / 10,
          maxSpeedKmh: Math.max(state.maxSpeedKmh, speed),
          elevationGainM: state.elevationGainM + addedElevation,
        });
      },

      stopTracking: () => {
        stopGpsWatch();
        set({ isTracking: false, isPaused: false });
      },

      reset: () => {
        set({ ...(IDLE as CardioState) });
      },
    }),
    { name: 'apparatus-cardio-storage' }
  )
);
