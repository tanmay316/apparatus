import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RoutePoint, CardioActivityType } from '@/types';

// ────────────────────────────────────────────────────────────
// Haversine distance (km)
// ────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ────────────────────────────────────────────────────────────
// 1. Kalman Filter — smooths GPS lat/lng to eliminate drift
// ────────────────────────────────────────────────────────────

class KalmanFilter1D {
  private x: number;    // estimated value
  private p: number;    // estimation error covariance
  private q: number;    // process noise (how much we expect the value to change)
  private r: number;    // measurement noise (how noisy the GPS readings are)
  private initialized = false;

  constructor(q = 0.00001, r = 0.0005) {
    this.x = 0;
    this.p = 1;
    this.q = q;
    this.r = r;
  }

  /** Filter a new measurement. Returns smoothed value. */
  filter(measurement: number, accuracy?: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.p = accuracy ? accuracy * 0.00001 : 1;
      this.initialized = true;
      return measurement;
    }

    // Prediction step (position is the state, so prediction = last estimate)
    this.p += this.q;

    // If we have GPS accuracy info, scale measurement noise accordingly
    // Higher accuracy number = less accurate = trust measurement less
    const effectiveR = accuracy ? this.r * Math.max(1, accuracy / 10) : this.r;

    // Update step
    const k = this.p / (this.p + effectiveR); // Kalman gain
    this.x += k * (measurement - this.x);
    this.p *= (1 - k);

    return this.x;
  }

  /** Adjust process noise — higher = tracks fast movement more closely */
  setProcessNoise(q: number) {
    this.q = q;
  }

  reset() {
    this.initialized = false;
    this.x = 0;
    this.p = 1;
  }
}

// Global Kalman filter instances (live outside React for persistence across renders)
let kalmanLat = new KalmanFilter1D();
let kalmanLng = new KalmanFilter1D();

function resetKalmanFilters() {
  kalmanLat = new KalmanFilter1D();
  kalmanLng = new KalmanFilter1D();
}

// ────────────────────────────────────────────────────────────
// 2. Smart Accuracy Thresholds
// ────────────────────────────────────────────────────────────

/** Returns the max acceptable GPS accuracy (meters) based on current speed */
function getAccuracyThreshold(speedKmh: number): number {
  if (speedKmh > 15) return 25;   // Fast cycling — need tight accuracy
  if (speedKmh > 5) return 40;    // Running — medium accuracy
  return 80;                      // Walking / stationary — lenient
}

// ────────────────────────────────────────────────────────────
// 3. Auto-Pause — pause timer when user is standing still
// ────────────────────────────────────────────────────────────

// Universal "stopped" threshold — 0.5 km/h ≈ standing completely still.
// A tired runner walking slowly (~3-4 km/h) won't trigger this.
const AUTO_PAUSE_SPEED_THRESHOLD = 0.5; // km/h
const AUTO_PAUSE_DELAY_MS = 10_000;     // 10 seconds of being "stopped"

let lastMovementTs = 0;  // timestamp of last point where speed > threshold

// ────────────────────────────────────────────────────────────
// 4. Background Resilience — Page Visibility + Wake Lock
// ────────────────────────────────────────────────────────────

let pageHiddenAt: number | null = null;
let visibilityListenerAttached = false;
let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;

function attachVisibilityListener() {
  if (visibilityListenerAttached) return;
  visibilityListenerAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Page going to background — record timestamp
      pageHiddenAt = Date.now();
    } else {
      // Page coming back to foreground
      pageHiddenAt = null;

      // Re-acquire wake lock (it's automatically released when screen turns off)
      const state = useCardioStore.getState();
      if (state.isTracking && !state.isPaused) {
        requestWakeLock();
      }
    }
  });
}

/** A periodic no-op interval that helps keep the browser process alive in background */
function startKeepAlive() {
  if (keepAliveIntervalId !== null) return;
  keepAliveIntervalId = setInterval(() => {
    // No-op tick — this periodic work keeps the JS event loop alive,
    // reducing the chance the browser suspends our tab while GPS is active.
    // We also take this opportunity to re-request wake lock if needed.
    if (document.visibilityState === 'visible') {
      const state = useCardioStore.getState();
      if (state.isTracking && !state.isPaused) {
        requestWakeLock();
      }
    }
  }, 5000);
}

function stopKeepAlive() {
  if (keepAliveIntervalId !== null) {
    clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
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
      // Re-acquire on release (e.g. screen off on some browsers)
      wakeLockRef.addEventListener('release', () => {
        wakeLockRef = null;
        // Try to re-acquire if still tracking
        const state = useCardioStore.getState();
        if (state.isTracking && !state.isPaused) {
          setTimeout(() => requestWakeLock(), 1000);
        }
      });
    }
  } catch { /* silent — wake lock can fail if page isn't visible */ }
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

/** Central GPS point handler — applies smart accuracy check and feeds to store */
function handleGpsPosition(pos: GeolocationPosition) {
  useCardioStore.setState({ gpsStatus: 'active' });
  const storeState = useCardioStore.getState();
  
  const accuracy = pos.coords.accuracy;
  const currentSpeed = storeState.currentSpeedKmh;
  const maxAccuracy = getAccuracyThreshold(currentSpeed);

  // Smart accuracy thresholding: always accept the first point,
  // then apply dynamic accuracy filtering
  if (storeState.routePoints.length > 0 && accuracy > maxAccuracy) {
    return; // Reject inaccurate point
  }

  const pt = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    ts: Date.now(),
    accuracy,
  } as RoutePoint & { accuracy?: number };
  if (pos.coords.altitude != null) pt.alt = pos.coords.altitude;
  if (pos.coords.speed != null) pt.speed = pos.coords.speed;

  storeState.addPoint(pt);
}

const startGpsWatch = async () => {
  if (watchIdRef !== null) return; // already watching
  
  requestWakeLock();
  attachVisibilityListener();
  startKeepAlive();

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
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
        (pos, err) => {
          if (err) {
            useCardioStore.setState({ gpsStatus: 'error' });
            return;
          }
          if (pos) {
            handleGpsPosition(pos as unknown as GeolocationPosition);
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
      handleGpsPosition,
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
  stopKeepAlive();
};

// ────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────

type GpsStatus = 'off' | 'waiting' | 'active' | 'error' | 'denied';

interface CardioState {
  isTracking: boolean;
  isPaused: boolean;
  isAutoPaused: boolean;
  autoPausedAt: number | null;
  totalAutoPausedMs: number;
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
  gpsAccuracy: number;

  // Actions
  startTracking: (type: CardioActivityType) => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  addPoint: (point: RoutePoint & { accuracy?: number }) => void;
  stopTracking: () => void;
  reset: () => void;
}

const IDLE: Partial<CardioState> = {
  isTracking: false,
  isPaused: false,
  isAutoPaused: false,
  autoPausedAt: null,
  totalAutoPausedMs: 0,
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
  gpsAccuracy: 0,
};

export const useCardioStore = create<CardioState>()(
  persist(
    (set, get) => ({
      ...(IDLE as CardioState),

      startTracking: (type) => {
        // Reset Kalman filters for a fresh session
        resetKalmanFilters();
        lastMovementTs = Date.now();

        // IMPORTANT: set isTracking FIRST so GPS callbacks aren't dropped
        set({
          isTracking: true,
          isPaused: false,
          isAutoPaused: false,
          autoPausedAt: null,
          totalAutoPausedMs: 0,
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
          gpsAccuracy: 0,
        });
        // Start GPS after state is ready
        startGpsWatch();
      },

      pauseTracking: () => {
        stopGpsWatch();
        const { isAutoPaused, autoPausedAt, totalAutoPausedMs } = get();
        // If auto-paused, collapse the auto-pause into totalPausedMs before manual pause
        let extraAutoPause = 0;
        if (isAutoPaused && autoPausedAt) {
          extraAutoPause = Date.now() - autoPausedAt;
        }
        set({
          isPaused: true,
          pausedAt: Date.now(),
          isAutoPaused: false,
          autoPausedAt: null,
          totalAutoPausedMs: 0,
          totalPausedMs: get().totalPausedMs + totalAutoPausedMs + extraAutoPause,
        });
      },

      resumeTracking: () => {
        // Reset Kalman filters when resuming so we don't smooth across the gap
        resetKalmanFilters();
        lastMovementTs = Date.now();

        startGpsWatch();
        const { pausedAt, totalPausedMs } = get();
        const addedPause = pausedAt ? Date.now() - pausedAt : 0;
        set({
          isPaused: false,
          pausedAt: null,
          isAutoPaused: false,
          autoPausedAt: null,
          totalAutoPausedMs: 0,
          totalPausedMs: totalPausedMs + addedPause,
        });
      },

      addPoint: (point) => {
        const state = get();
        if (!state.isTracking || state.isPaused) return;

        const accuracy = (point as any).accuracy as number | undefined;
        const now = point.ts;

        // ── Kalman Filtering ──────────────────────────────
        // Adapt Kalman process noise based on speed — fast movement
        // needs tighter tracking, slow movement needs heavier smoothing
        const speedForKalman = state.currentSpeedKmh;
        if (speedForKalman > 10) {
          kalmanLat.setProcessNoise(0.00005);  // Track closely at speed
          kalmanLng.setProcessNoise(0.00005);
        } else if (speedForKalman > 3) {
          kalmanLat.setProcessNoise(0.00002);  // Medium smoothing
          kalmanLng.setProcessNoise(0.00002);
        } else {
          kalmanLat.setProcessNoise(0.000005); // Heavy smoothing when slow/still
          kalmanLng.setProcessNoise(0.000005);
        }

        const smoothedLat = kalmanLat.filter(point.lat, accuracy);
        const smoothedLng = kalmanLng.filter(point.lng, accuracy);

        // Build the smoothed point (without the accuracy field for storage)
        const smoothedPoint: RoutePoint = {
          lat: smoothedLat,
          lng: smoothedLng,
          ts: now,
        };
        if (point.alt !== undefined) smoothedPoint.alt = point.alt;
        if (point.speed !== undefined) smoothedPoint.speed = point.speed;

        const prev = state.routePoints[state.routePoints.length - 1];
        let addedDistance = 0;
        let addedElevation = 0;
        let speed = 0;

        if (prev) {
          const rawDistance = haversineKm(prev.lat, prev.lng, smoothedPoint.lat, smoothedPoint.lng);
          const dtSec = (now - prev.ts) / 1000;

          // ── Background Gap Detection ──────────────────
          // If > 30 seconds between points, GPS was probably suspended.
          // Add the point (to resume trace) but do NOT count distance
          // (prevents "teleport line" across buildings).
          const isGpsGap = dtSec > 30;

          // ── Stillness Detection ───────────────────────
          // If device hasn't moved more than 3 meters, don't add the point at all.
          // This prevents GPS drift circles when standing still.
          if (rawDistance < 0.003 && !isGpsGap) {
            // Still update speed to 0 so auto-pause can detect stillness
            const gpsSpeed = point.speed != null && point.speed > 0
              ? Math.min(point.speed * 3.6, 100) : 0;
            
            // ── Auto-Pause Logic (while stationary) ──────
            if (gpsSpeed < AUTO_PAUSE_SPEED_THRESHOLD) {
              if (!state.isAutoPaused && (now - lastMovementTs > AUTO_PAUSE_DELAY_MS)) {
                // User has been still for 10+ seconds — trigger auto-pause
                set({
                  isAutoPaused: true,
                  autoPausedAt: now,
                  currentSpeedKmh: 0,
                  gpsAccuracy: accuracy || 0,
                });
                return;
              }
            } else {
              lastMovementTs = now;
            }

            // Update GPS accuracy display but don't add the still point
            set({ currentSpeedKmh: 0, gpsAccuracy: accuracy || 0 });
            return;
          }

          if (!isGpsGap) {
            // ── Strava-style distance filtering ──────────────────
            // Ignore teleport jumps (> 500 meters) — GPS glitches
            // Sanity-check implied speed to reject impossible bursts
            if (rawDistance < 0.5) {
              const impliedSpeedKmh = dtSec > 0 ? (rawDistance / dtSec) * 3600 : 0;
              // Max plausible speeds: walk ~10, run ~35, cycle ~80 km/h
              if (impliedSpeedKmh < 100) {
                addedDistance = rawDistance;
              }
            }
          }

          // Elevation gain (only count uphill)
          if (smoothedPoint.alt !== undefined && prev.alt !== undefined) {
            const diff = smoothedPoint.alt - prev.alt;
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
          if (gpsSpeedKmh < 100) {
            speed = gpsSpeedKmh;
          }
        }

        // ── Auto-Pause Logic ──────────────────────────────
        if (speed >= AUTO_PAUSE_SPEED_THRESHOLD) {
          lastMovementTs = now;

          // Was auto-paused? Resume and accumulate the paused duration
          if (state.isAutoPaused && state.autoPausedAt) {
            const autoPauseDuration = now - state.autoPausedAt;
            set({
              isAutoPaused: false,
              autoPausedAt: null,
              totalAutoPausedMs: state.totalAutoPausedMs + autoPauseDuration,
            });
          }
        } else {
          // Speed is below threshold — check if we should auto-pause
          if (!state.isAutoPaused && (now - lastMovementTs > AUTO_PAUSE_DELAY_MS)) {
            set({
              isAutoPaused: true,
              autoPausedAt: now,
              currentSpeedKmh: Math.round(speed * 10) / 10,
              gpsAccuracy: accuracy || 0,
            });
            // Still add the point to the route (for trace continuity) but don't count distance
            set({
              routePoints: [...state.routePoints, smoothedPoint],
            });
            return;
          }
        }

        // If currently auto-paused, add point for trace continuity but don't count distance
        if (state.isAutoPaused) {
          set({
            routePoints: [...state.routePoints, smoothedPoint],
            currentSpeedKmh: Math.round(speed * 10) / 10,
            gpsAccuracy: accuracy || 0,
          });
          return;
        }

        set({
          routePoints: [...state.routePoints, smoothedPoint],
          distanceKm: state.distanceKm + addedDistance,
          currentSpeedKmh: Math.round(speed * 10) / 10,
          maxSpeedKmh: Math.max(state.maxSpeedKmh, Math.round(speed * 10) / 10),
          elevationGainM: state.elevationGainM + addedElevation,
          gpsAccuracy: accuracy || 0,
        });
      },

      stopTracking: () => {
        stopGpsWatch();
        // Collapse any remaining auto-pause time into totalPausedMs
        const { isAutoPaused, autoPausedAt, totalAutoPausedMs, totalPausedMs } = get();
        let finalAutoPause = totalAutoPausedMs;
        if (isAutoPaused && autoPausedAt) {
          finalAutoPause += Date.now() - autoPausedAt;
        }
        set({
          isTracking: false,
          isPaused: false,
          isAutoPaused: false,
          autoPausedAt: null,
          totalAutoPausedMs: 0,
          totalPausedMs: totalPausedMs + finalAutoPause,
          gpsStatus: 'off' as GpsStatus,
        });
      },

      reset: () => {
        resetKalmanFilters();
        lastMovementTs = 0;
        set({ ...(IDLE as CardioState) });
      },
    }),
    { name: 'apparatus-cardio-storage' }
  )
);
