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
// 2b. Per-Activity Max Plausible Speed (km/h)
// ────────────────────────────────────────────────────────────

/** Returns the maximum believable speed for any human-powered or e-assisted activity.
 *  This is NOT a cap — it's a GPS-glitch sanity filter. 150 km/h covers e-bikes
 *  on downhills while still rejecting obvious GPS teleportation artifacts. */
const MAX_SANE_SPEED_KMH = 150;

// ────────────────────────────────────────────────────────────
// 2c. Speed Smoothing Buffer — 3-sample moving average
// ────────────────────────────────────────────────────────────

const SPEED_BUFFER_SIZE = 3;
let speedBuffer: number[] = [];

function pushSpeed(raw: number): number {
  speedBuffer.push(raw);
  if (speedBuffer.length > SPEED_BUFFER_SIZE) speedBuffer.shift();
  return speedBuffer.reduce((a, b) => a + b, 0) / speedBuffer.length;
}

function resetSpeedBuffer() {
  speedBuffer = [];
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

      // Android/iOS aggressively kill watchPosition when locked.
      // However, we now have a true Native Foreground Service running in the background,
      // which automatically holds a native OS Wake Lock and prevents process death.
      // We no longer need legacy DOM keep-alive intervals or screen wake locks.
      
      const state = useCardioStore.getState();
      if (state.isTracking && !state.isPaused) {
        // Restart the GPS watch to ensure it's still alive.
        if (watchIdRef !== null) {
          stopGpsWatch().then(() => startGpsWatch());
        } else {
          startGpsWatch();
        }
      }
    }
  });
}

import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

// Haversine formula to calculate distance between two lat/lon coordinates in meters
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ────────────────────────────────────────────────────────────
// Global GPS (lives outside React for persistence)
// ────────────────────────────────────────────────────────────
let watchIdRef: string | number | null = null;

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
  useCardioStore.setState({ 
    gpsStatus: 'active',
    currentLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude }
  });
  const storeState = useCardioStore.getState();
  
  const accuracy = pos.coords.accuracy;
  const currentSpeed = storeState.currentSpeedKmh;
  const maxAccuracy = getAccuracyThreshold(currentSpeed);

  // ── GPS Warmup: discard early inaccurate points ──────────
  // When GPS first starts, the first few readings can be wildly off.
  // Wait until we get a reading with accuracy < 30m before recording.
  const pointCount = storeState.routePoints.length;
  if (pointCount < 5 && accuracy > 30) {
    return; // Skip inaccurate warmup readings
  }

  // Smart accuracy thresholding: apply dynamic accuracy filtering
  if (pointCount >= 5 && accuracy > maxAccuracy) {
    return; // Reject inaccurate point
  }

  // Distance Filtering (Save RAM & CPU):
  // Don't store the point if we have moved less than 2 meters from the last raw point.
  // This heavily reduces array bloat and React re-renders when the user is standing still!
  if (pointCount > 0) {
    const lastRawPt = storeState.routePoints[pointCount - 1];
    const distToLastRaw = getDistanceFromLatLonInMeters(
      lastRawPt.lat, lastRawPt.lng,
      pos.coords.latitude, pos.coords.longitude
    );
    if (distToLastRaw < 2) {
      return; 
    }
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

export const startGpsWatch = async () => {
  if (watchIdRef !== null) return; // already watching
  
  attachVisibilityListener();

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
      
      // Kickstart the location services by asking for a low-accuracy network fix first.
      // This often wakes up the GPS chip much faster on Android cold starts.
      Geolocation.getCurrentPosition({ enableHighAccuracy: false, maximumAge: Infinity }).catch(() => {});

      watchIdRef = await Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 3000 },
        (pos, err) => {
          if (err) {
            console.warn('[CardioStore] GPS watch error:', err);
            // Don't set error state immediately on timeout, let it keep trying.
            if (err.message && err.message.includes('timeout')) return;
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

export const stopGpsWatch = async () => {
  if (watchIdRef !== null) {
    if (Capacitor.isNativePlatform()) {
      try { await Geolocation.clearWatch({ id: watchIdRef as string }); } catch {}
    } else {
      navigator.geolocation.clearWatch(watchIdRef as number);
    }
    watchIdRef = null;
  }
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
  currentLocation: { lat: number, lng: number } | null;

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
  currentLocation: null,
};

export const useCardioStore = create<CardioState>()(
  persist(
    (set, get) => ({
      ...(IDLE as CardioState),

      startTracking: (type) => {
        // Reset Kalman filters and speed buffer for a fresh session
        resetKalmanFilters();
        resetSpeedBuffer();
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
          gpsStatus: get().currentLocation ? 'active' : 'waiting',
          gpsAccuracy: get().gpsAccuracy || 0,
          // Keep currentLocation to avoid the 20s re-locating delay on start
        });
        // Start GPS after state is ready (if not already running)
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
        // Reset Kalman filters and speed buffer when resuming so we don't smooth across the gap
        resetKalmanFilters();
        resetSpeedBuffer();
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
          // (Removed distance dropping on gap so background locked tracking still counts distance)
          const isGpsGap = dtSec > 30;

          // ── Stillness Detection ───────────────────────
          // If device hasn't moved more than 3 meters, don't add the point at all.
          // This prevents GPS drift circles when standing still.
          if (rawDistance < 0.003 && !isGpsGap) {
            // Still update speed to 0 so auto-pause can detect stillness
            const gpsSpeed = point.speed != null && point.speed > 0
              ? Math.min(point.speed * 3.6, MAX_SANE_SPEED_KMH) : 0;
            
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

          // ── Strava-style distance filtering ──────────────────
          // Ignore teleport jumps (> 500 meters) — GPS glitches
          // Sanity-check implied speed to reject impossible bursts
          if (rawDistance < 0.5 || isGpsGap) {
            const impliedSpeedKmh = dtSec > 0 ? (rawDistance / dtSec) * 3600 : 0;
            if (impliedSpeedKmh < MAX_SANE_SPEED_KMH) {
              addedDistance = rawDistance;
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
          if (gpsSpeedKmh < MAX_SANE_SPEED_KMH) {
            speed = gpsSpeedKmh;
          }
        }

        // Smooth speed through moving average to reject momentary spikes
        speed = pushSpeed(speed);

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

        const clampedSpeed = Math.min(speed, MAX_SANE_SPEED_KMH);
        set({
          routePoints: [...state.routePoints, smoothedPoint],
          distanceKm: state.distanceKm + addedDistance,
          currentSpeedKmh: Math.round(clampedSpeed * 10) / 10,
          maxSpeedKmh: Math.max(state.maxSpeedKmh, Math.round(clampedSpeed * 10) / 10),
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
        stopGpsWatch();
        resetKalmanFilters();
        resetSpeedBuffer();
        lastMovementTs = 0;
        set({ ...(IDLE as CardioState) });
      },
    }),
    { name: 'apparatus-cardio-storage' }
  )
);
