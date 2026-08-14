import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RoutePoint, CardioActivityType } from '@/types';
import { usePedometerStore } from './pedometer-store';

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
// 1. Plausibility & Speed Engine Configuration
// ────────────────────────────────────────────────────────────

/** Returns the maximum believable speed (km/h) and acceleration (km/h/s) */
const ACTIVITY_SPEED_LIMITS = {
  walk: { maxSpeed: 15, maxAccel: 5 },
  run: { maxSpeed: 35, maxAccel: 10 },
  cycle: { maxSpeed: 100, maxAccel: 15 },
};

function getSpeedLimits(type: CardioActivityType | null) {
  if (!type) return ACTIVITY_SPEED_LIMITS.walk;
  return ACTIVITY_SPEED_LIMITS[type] || ACTIVITY_SPEED_LIMITS.walk;
}

// EMA Alpha determines smoothing factor. Lower = smoother but more lag.
const EMA_ALPHA = 0.3; 
const SPEED_BUFFER_SIZE = 3; // For median filter
let rawSpeedBuffer: number[] = [];
let emaSpeed = 0;
let lastTrustedSpeedKmh: number | null = null;

let lastRawGpsPoint: RoutePoint | null = null;
let lastAcceptedDistancePoint: RoutePoint | null = null;
let lastRoutePoint: RoutePoint | null = null;
let lastMovementPoint: RoutePoint | null = null;
let lastStationaryAnchor: RoutePoint | null = null;
let consecutiveMovingCount = 0;
let gpsFixCount = 0;
let goodFixCount = 0;
let gapRecoveryFixes = 0;
let warmupConsecutiveFixes = 0;
let consecutiveHighSpeedFixes = 0;
let lastWarmupGoodPoint: RoutePoint | null = null;
let stepsAtLastMovement = 0;

function resetTrackingSegmentState() {
  lastRawGpsPoint = null;
  lastAcceptedDistancePoint = null;
  lastRoutePoint = null;
  lastMovementPoint = null;
  lastStationaryAnchor = null;
  consecutiveMovingCount = 0;
  lastTrustedSpeedKmh = null;
  gpsFixCount = 0;
  goodFixCount = 0;
  gapRecoveryFixes = 0;
  warmupConsecutiveFixes = 0;
  consecutiveHighSpeedFixes = 0;
  lastWarmupGoodPoint = null;
  stepsAtLastMovement = 0;
}

function pushSpeed(raw: number): number {
  // 1. Sliding window for Median
  rawSpeedBuffer.push(raw);
  if (rawSpeedBuffer.length > SPEED_BUFFER_SIZE) {
    rawSpeedBuffer.shift();
  }
  
  // Calculate median
  const sorted = [...rawSpeedBuffer].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // 2. Exponential Moving Average
  if (emaSpeed === 0 && median > 0) {
    emaSpeed = median; // Initialize EMA on first movement
  } else {
    emaSpeed = (EMA_ALPHA * median) + ((1 - EMA_ALPHA) * emaSpeed);
  }
  
  return emaSpeed;
}

function resetSpeedEngine() {
  rawSpeedBuffer = [];
  emaSpeed = 0;
  lastTrustedSpeedKmh = null;
}

function accuracyConfidence(accuracy?: number): number {
  if (accuracy == null || !Number.isFinite(accuracy)) return 0.5;
  if (accuracy <= 10) return 1;
  if (accuracy <= 20) return 0.8;
  if (accuracy <= 40) return 0.55;
  if (accuracy <= 60) return 0.3;
  return 0;
}

// ────────────────────────────────────────────────────────────
// 3. Auto-Pause — pause timer when user is standing still
// ────────────────────────────────────────────────────────────

// Universal "stopped" threshold — 0.8 km/h ≈ standing completely still.
const AUTO_PAUSE_SPEED_THRESHOLD = 0.8; // km/h
const AUTO_PAUSE_DELAY_MS = 4_000;      // 4 seconds of being "stopped"

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
      // Page coming back to foreground. The Android foreground service owns
      // collection while the WebView is suspended; never stop/restart it here.
      // Restarting discarded the native listener and repeatedly put sessions
      // back into GPS warm-up after screen lock.
      pageHiddenAt = null;
      const state = useCardioStore.getState();
      if (state.isTracking && !state.isPaused) {
        if (Capacitor.isNativePlatform()) {
          // Recover every point collected while the screen was off.
          if (watchIdRef === 'native-workout-location') {
            replayNativeLocationBuffer(state.lastGpsTimestamp);
          } else {
            startGpsWatch();
          }
        } else {
          // Browser watches can be suspended, unlike the native service.
          if (watchIdRef !== null) stopGpsWatch().then(() => startGpsWatch());
          else startGpsWatch();
        }
      }
    }
  });
}

import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeWorkoutLocation, type NativeWorkoutPoint } from '@/utils/native-workout-location';

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
let nativeLocationListener: PluginListenerHandle | null = null;

/**
 * Replays the native service's durable journal into the store. Android can
 * suspend the WebView while the screen is locked, so listener events are only
 * a live UI convenience; the journal is the authoritative record.
 */
export const replayNativeLocationBuffer = async (fromTimestamp?: number) => {
  if (!Capacitor.isNativePlatform()) return;

  const state = useCardioStore.getState();
  const timestamp = fromTimestamp ?? state.startedAt ?? state.lastGpsTimestamp;
  try {
    const buffered = await NativeWorkoutLocation.getLocationsAfter({ timestamp });
    buffered.points
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(handleNativeLocation);
  } catch (error) {
    // The live listener remains useful if a device/vendor blocks database access.
    console.warn('[CardioStore] Failed to replay native location buffer:', error);
  }
};

/** Flush native points before stopping so a locked-screen route is not lost. */
export const finishTracking = async () => {
  const beforeFinish = useCardioStore.getState();
  if (beforeFinish.isTracking) {
    // Read the entire session rather than only points newer than the last JS
    // callback. addPoint de-duplicates timestamps, and this recovers callbacks
    // the WebView missed while Android kept the foreground service alive.
    await replayNativeLocationBuffer(beforeFinish.startedAt ?? 0);
  }
  // Wait for the native stop command before returning. This removes the
  // location-service notification immediately when a workout is saved.
  await stopGpsWatch();
  const finalState = useCardioStore.getState();
  finalState.stopTracking();
  return useCardioStore.getState();
};

function handleNativeLocation(point: NativeWorkoutPoint) {
  handleGpsPosition({
    coords: {
      latitude: point.lat,
      longitude: point.lng,
      accuracy: point.accuracy ?? 999,
      altitude: point.altitude,
      altitudeAccuracy: null,
      heading: null,
      speed: point.speed,
      toJSON: () => ({}),
    },
    timestamp: point.timestamp || Date.now(),
    toJSON: () => ({}),
  } as unknown as GeolocationPosition);
}
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
  const storeState = useCardioStore.getState();
  const accuracy = pos.coords.accuracy;
  const newLat = pos.coords.latitude;
  const newLng = pos.coords.longitude;
  const rawHeading = pos.coords.heading;
  const hasValidHeading = rawHeading != null && !Number.isNaN(rawHeading);
  
  // Prevent wild map jumps during warmup and while stationary by smoothing visual marker
  if (!storeState.currentLocation) {
    useCardioStore.setState({ 
      currentLocation: { 
        lat: newLat, 
        lng: newLng,
        heading: hasValidHeading ? rawHeading : undefined
      }
    });
  } else if ((Number.isFinite(accuracy) && accuracy <= 75) || Capacitor.isNativePlatform() === false) {
    const cur = storeState.currentLocation;
    const distM = haversineKm(cur.lat, cur.lng, newLat, newLng) * 1000;
    const isStationary = storeState.currentSpeedKmh < 1.0 && distM < 6;
    
    let lat = newLat;
    let lng = newLng;
    let heading = hasValidHeading ? rawHeading : cur.heading;

    if (isStationary) {
      // Apply low-pass dampening when stationary so icon settles gracefully without jumping
      lat = cur.lat * 0.75 + newLat * 0.25;
      lng = cur.lng * 0.75 + newLng * 0.25;
      // Do not jitter heading when stationary
      heading = cur.heading;
    }

    useCardioStore.setState({ 
      currentLocation: { 
        lat, 
        lng,
        heading
      }
    });
  }

  // ── GPS Warmup: discard early inaccurate points ──────────
  if (!Number.isFinite(accuracy) || accuracy > 150) return;

  const pt = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    ts: pos.timestamp || Date.now(),
    accuracy,
  } as RoutePoint & { accuracy?: number };
  if (pos.coords.altitude != null) pt.alt = pos.coords.altitude;
  if (pos.coords.speed != null) pt.speed = pos.coords.speed;

  storeState.addPoint(pt);
}

export const startGpsWatch = async (newSession = false) => {
  // Promote the ready-screen preview watch to the durable Android service when
  // the user actually starts the workout.
  if (watchIdRef !== null) {
    if (newSession && Capacitor.isNativePlatform() && watchIdRef !== 'native-workout-location') {
      await stopGpsWatch();
    } else {
      // Navigating back to the tracking screen does not necessarily trigger a
      // visibility event. Pull the durable native journal here as well so the
      // live distance catches up immediately instead of waiting for the next
      // GPS callback.
      if (Capacitor.isNativePlatform() && watchIdRef === 'native-workout-location' && useCardioStore.getState().isTracking) {
        await replayNativeLocationBuffer(useCardioStore.getState().lastGpsTimestamp);
      }
      return;
    }
  }
  
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
      if (!useCardioStore.getState().isTracking) {
        watchIdRef = await Geolocation.watchPosition(
          { enableHighAccuracy: true, maximumAge: 1000 },
          (pos) => { if (pos) handleGpsPosition(pos as unknown as GeolocationPosition); }
        );
        return;
      }
      nativeLocationListener = await NativeWorkoutLocation.addListener('location', handleNativeLocation);
      await NativeWorkoutLocation.start({
        reset: newSession,
        activityType: useCardioStore.getState().activityType ?? undefined,
      });
      watchIdRef = 'native-workout-location';
      await replayNativeLocationBuffer(useCardioStore.getState().lastGpsTimestamp);
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
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }
};

export const stopGpsWatch = async () => {
  if (Capacitor.isNativePlatform()) {
    if (watchIdRef === 'native-workout-location') {
      await nativeLocationListener?.remove();
      nativeLocationListener = null;
    } else if (watchIdRef !== null) {
      try { await Geolocation.clearWatch({ id: watchIdRef as string }); } catch {}
    }
    // The WebView can be recreated while the native service stays alive. Stop
    // it even when this in-memory watcher ID was lost, so discard/save always
    // removes the ongoing cardio notification.
    try { await NativeWorkoutLocation.stop(); } catch {}
  } else if (watchIdRef !== null) {
    navigator.geolocation.clearWatch(watchIdRef as number);
  }
  watchIdRef = null;
};

// ────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────

type GpsStatus = 'off' | 'waiting' | 'warming_up' | 'active' | 'degraded' | 'error' | 'denied';

interface CardioState {
  isTracking: boolean;
  isPaused: boolean;
  autoPauseStatus: 'MOVING' | 'CANDIDATE_STOP' | 'PAUSED';
  autoPausedAt: number | null;
  activityType: CardioActivityType | null;
  startedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  routePoints: RoutePoint[];
  paceWindow: { dist: number; dt: number; ts: number }[]; // Rolling moving-time pace
  distanceKm: number;
  currentSpeedKmh: number;
  currentPaceMs: number; // min/km in ms (e.g. 5:00 = 300000ms)
  maxSpeedKmh: number;
  elevationGainM: number;
  gpsStatus: GpsStatus;
  gpsAccuracy: number;
  currentLocation: { lat: number, lng: number, heading?: number } | null;
  lastGpsTimestamp: number;

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
  autoPauseStatus: 'MOVING',
  autoPausedAt: null,
  activityType: null,
  startedAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  routePoints: [],
  paceWindow: [],
  distanceKm: 0,
  currentSpeedKmh: 0,
  currentPaceMs: 0,
  maxSpeedKmh: 0,
  elevationGainM: 0,
  gpsStatus: 'off' as GpsStatus,
  gpsAccuracy: 0,
  currentLocation: null,
  lastGpsTimestamp: 0,
};

export const useCardioStore = create<CardioState>()(
  persist(
    (set, get) => ({
      ...(IDLE as CardioState),

      startTracking: (type) => {
        resetSpeedEngine();
        resetTrackingSegmentState();
        lastMovementTs = Date.now();

        // IMPORTANT: set isTracking FIRST so GPS callbacks aren't dropped
        set({
          isTracking: true,
          isPaused: false,
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          activityType: type,
          startedAt: Date.now(),
          pausedAt: null,
          totalPausedMs: 0,
          routePoints: [],
          paceWindow: [],
          distanceKm: 0,
          currentSpeedKmh: 0,
          currentPaceMs: 0,
          maxSpeedKmh: 0,
          elevationGainM: 0,
          gpsStatus: 'waiting',
          gpsAccuracy: get().gpsAccuracy || 0,
          lastGpsTimestamp: 0,
          // Keep currentLocation to avoid the 20s re-locating delay on start
        });
        // Start GPS after state is ready (if not already running)
        startGpsWatch(true);
      },

      pauseTracking: () => {
        stopGpsWatch();
        resetTrackingSegmentState();
        const { autoPauseStatus, autoPausedAt } = get();
        // If auto-paused, collapse the auto-pause into totalPausedMs before manual pause
        let extraAutoPause = 0;
        if (autoPauseStatus === 'PAUSED' && autoPausedAt) {
          extraAutoPause = Date.now() - autoPausedAt;
        }
        set({
          isPaused: true,
          pausedAt: Date.now(),
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          totalPausedMs: get().totalPausedMs + extraAutoPause,
        });
      },

      resumeTracking: () => {
        resetSpeedEngine();
        resetTrackingSegmentState();
        lastMovementTs = Date.now();

        startGpsWatch();
        const { pausedAt, totalPausedMs } = get();
        const addedPause = pausedAt ? Date.now() - pausedAt : 0;
        set({
          isPaused: false,
          pausedAt: null,
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          totalPausedMs: totalPausedMs + addedPause,
        });
      },

      addPoint: (point) => {
        const state = get();
        if (!state.isTracking || state.isPaused) return;

        const accuracy = (point as any).accuracy as number | undefined;
        const now = point.ts;
        if (now <= state.lastGpsTimestamp && state.routePoints.length > 0) return;

        const rawPt: RoutePoint = { lat: point.lat, lng: point.lng, ts: now };
        if (point.alt !== undefined) rawPt.alt = point.alt;
        if (point.speed !== undefined) rawPt.speed = point.speed;

        let { gpsStatus, autoPauseStatus, autoPausedAt, totalPausedMs } = state;
        const limits = getSpeedLimits(state.activityType);
        
        // ── Phase 1: GPS Warmup Logic ──
        if (gpsStatus === 'waiting' || gpsStatus === 'off') {
           gpsStatus = 'warming_up';
        }
        
        if (gpsStatus === 'warming_up') {
           const targetAccuracy = Capacitor.isNativePlatform() ? 65 : 200;
           if (accuracy && accuracy <= targetAccuracy) {
             warmupConsecutiveFixes++;
             if (warmupConsecutiveFixes >= 2) {
               gpsStatus = 'active';
               lastRawGpsPoint = rawPt;
               lastAcceptedDistancePoint = rawPt;
               lastRoutePoint = rawPt;
               lastMovementPoint = rawPt;
               lastMovementTs = now;
             }
           } else {
             warmupConsecutiveFixes = 0;
           }
           set({ gpsStatus, gpsAccuracy: accuracy || 0, lastGpsTimestamp: now });
           return;
        }

        const prev = lastRawGpsPoint;
        lastRawGpsPoint = rawPt;
        gpsFixCount += 1;

        let addedDistance = 0;
        let addedElevation = 0;
        let dtSec = 0;

        const nativeSpeedKmh = point.speed != null && point.speed >= 0 ? point.speed * 3.6 : null;
        let currentSpeed = 0;

        if (prev) {
          dtSec = Math.max(0.1, (now - prev.ts) / 1000);
          const rawDistanceKm = haversineKm(prev.lat, prev.lng, rawPt.lat, rawPt.lng);
          const derivedSpeedKmh = (rawDistanceKm / dtSec) * 3600;

          // ── Speed Calculation ──
          if (nativeSpeedKmh !== null && nativeSpeedKmh > 0 && nativeSpeedKmh <= limits.maxSpeed) {
            currentSpeed = nativeSpeedKmh;
          } else if (derivedSpeedKmh <= limits.maxSpeed) {
            // If very slow jitter (< 0.5 km/h over < 2m), treat as stationary jitter
            if (derivedSpeedKmh < 0.6 && (rawDistanceKm * 1000) < 2) {
              currentSpeed = 0;
            } else {
              currentSpeed = derivedSpeedKmh;
            }
          }

          // ── Distance Filtering & Quality Gate ──
          const distanceAnchor = lastAcceptedDistancePoint ?? prev;
          const distanceCandidateKm = haversineKm(distanceAnchor.lat, distanceAnchor.lng, rawPt.lat, rawPt.lng);
          const distanceCandidateM = distanceCandidateKm * 1000;
          const anchorDtSec = Math.max(0.1, (now - distanceAnchor.ts) / 1000);
          const candidateSpeedKmh = (distanceCandidateKm / anchorDtSec) * 3600;

          // Distance acceptance: accuracy within reasonable limits (< 60m), speed realistic
          const isAccurate = !accuracy || accuracy <= 60;
          const isReasonableSpeed = candidateSpeedKmh <= limits.maxSpeed * 1.35;
          const hasMovedThreshold = distanceCandidateM >= 2.5;

          if (isAccurate && isReasonableSpeed && hasMovedThreshold) {
            addedDistance = distanceCandidateKm;
            lastAcceptedDistancePoint = rawPt;
            lastMovementTs = now;
            lastMovementPoint = rawPt;
          }

          if (rawPt.alt !== undefined && distanceAnchor.alt !== undefined) {
            const diff = rawPt.alt - distanceAnchor.alt;
            if (diff > 1.5 && diff < 80 && addedDistance > 0) addedElevation = diff;
          }
        } else {
          lastAcceptedDistancePoint = rawPt;
          lastRoutePoint = rawPt;
          lastMovementPoint = rawPt;
          lastMovementTs = now;
          if (nativeSpeedKmh !== null) currentSpeed = nativeSpeedKmh;
        }

        const smoothedSpeed = pushSpeed(currentSpeed);
        const displaySpeed = Math.round(smoothedSpeed * 10) / 10;

        // ── Auto-Pause State Machine (10s tolerance) ──
        const isStationaryNow = currentSpeed < 0.6 && addedDistance === 0;

        if (isStationaryNow) {
          if (autoPauseStatus === 'MOVING') {
            autoPauseStatus = 'CANDIDATE_STOP';
            lastMovementTs = now;
          } else if (autoPauseStatus === 'CANDIDATE_STOP') {
            // Require 10 seconds of true zero movement before entering PAUSED state
            if (now - lastMovementTs > 10_000) {
              autoPauseStatus = 'PAUSED';
              autoPausedAt = now;
            }
          }
        } else {
          // Immediately unpause when movement resumes
          if (autoPauseStatus === 'PAUSED' && autoPausedAt) {
            totalPausedMs += (now - autoPausedAt);
          }
          autoPauseStatus = 'MOVING';
          autoPausedAt = null;
          lastMovementTs = now;
        }

        // ── Pace Engine (Rolling 30s window) ───────────────
        let newPaceWindow = [...state.paceWindow];
        if (addedDistance > 0 && dtSec > 0) {
          newPaceWindow.push({ dist: addedDistance, dt: dtSec, ts: now });
        }
        
        const LIVE_PACE_WINDOW_MS = 30_000;
        newPaceWindow = newPaceWindow.filter(p => now - p.ts < LIVE_PACE_WINDOW_MS);

        let currentPaceMs = 0;
        if (newPaceWindow.length > 0) {
          const sumDist = newPaceWindow.reduce((a, b) => a + b.dist, 0);
          const sumDt = newPaceWindow.reduce((a, b) => a + b.dt, 0);
          if (sumDist >= 0.02) {
            currentPaceMs = (sumDt * 1000) / sumDist;
          }
        }

        // Route Point addition: preserve full route with smooth spacing (~2.5m)
        const routeDistM = lastRoutePoint
          ? haversineKm(lastRoutePoint.lat, lastRoutePoint.lng, rawPt.lat, rawPt.lng) * 1000
          : Infinity;
        const shouldAddRoutePoint = routeDistM >= 2.5 || addedDistance > 0 || state.routePoints.length === 0;
        if (shouldAddRoutePoint) lastRoutePoint = rawPt;
        const nextRoutePoints = shouldAddRoutePoint ? [...state.routePoints, rawPt] : state.routePoints;

        // Max Speed: only register if realistic and sustained
        const newMaxSpeed = currentSpeed >= 1.5 && currentSpeed <= limits.maxSpeed
          ? Math.max(state.maxSpeedKmh, currentSpeed)
          : state.maxSpeedKmh;

        set({
          routePoints: nextRoutePoints,
          currentLocation: rawPt,
          distanceKm: state.distanceKm + addedDistance,
          currentSpeedKmh: autoPauseStatus === 'PAUSED' ? 0 : displaySpeed,
          maxSpeedKmh: newMaxSpeed,
          elevationGainM: state.elevationGainM + addedElevation,
          gpsAccuracy: accuracy || 0,
          gpsStatus: 'active',
          autoPauseStatus,
          autoPausedAt,
          totalPausedMs,
          paceWindow: newPaceWindow,
          currentPaceMs,
          lastGpsTimestamp: now,
        });
      },

      stopTracking: () => {
        stopGpsWatch();
        resetTrackingSegmentState();
        const { autoPauseStatus, autoPausedAt, totalPausedMs } = get();
        let finalPausedMs = totalPausedMs;
        if (autoPauseStatus === 'PAUSED' && autoPausedAt) {
          finalPausedMs += Date.now() - autoPausedAt;
        }
        set({
          isTracking: false,
          isPaused: false,
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          totalPausedMs: finalPausedMs,
          gpsStatus: 'off' as GpsStatus,
        });
      },

      reset: () => {
        stopGpsWatch();
        resetSpeedEngine();
        resetTrackingSegmentState();
        lastMovementTs = 0;
        set({ ...(IDLE as CardioState) });
      },
    }),
    { name: 'apparatus-cardio-storage' }
  )
);
