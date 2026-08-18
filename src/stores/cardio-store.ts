import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RoutePoint, CardioActivityType } from '@/types';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeWorkoutLocation, type NativeWorkoutPoint, type NativeWorkoutSessionSummary } from '@/utils/native-workout-location';

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
// Web Fallback GPS Engine (Used only when not running on native Android)
// ────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.25;
const SPEED_BUFFER_SIZE = 5;
let rawSpeedBuffer: number[] = [];
let emaSpeed = 0;

let lastAcceptedWebPoint: RoutePoint | null = null;
let lastMovementTs = 0;

const ALTITUDE_BUFFER_SIZE = 5;
let altitudeBuffer: number[] = [];
let lastElevationAnchorAlt: number | null = null;

const GPS_SETTLING_DURATION_MS = 6000;
let gpsSettledAt = 0;

function getSmoothedAltitude(alt: number): number {
  altitudeBuffer.push(alt);
  if (altitudeBuffer.length > ALTITUDE_BUFFER_SIZE) altitudeBuffer.shift();
  const sorted = [...altitudeBuffer].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function pushSpeed(raw: number): number {
  rawSpeedBuffer.push(raw);
  if (rawSpeedBuffer.length > SPEED_BUFFER_SIZE) {
    rawSpeedBuffer.shift();
  }
  const sorted = [...rawSpeedBuffer].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  if (emaSpeed === 0 && median > 0) {
    emaSpeed = median;
  } else {
    emaSpeed = (EMA_ALPHA * median) + ((1 - EMA_ALPHA) * emaSpeed);
  }
  return emaSpeed;
}


function resampleRoute(points: RoutePoint[], maxPoints: number): RoutePoint[] {
  if (!points || points.length <= maxPoints) return points || [];
  if (maxPoints <= 1) return [points[0]];

  const result: RoutePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

function resetWebGpsEngine() {
  rawSpeedBuffer = [];
  emaSpeed = 0;
  lastAcceptedWebPoint = null;
  altitudeBuffer = [];
  lastElevationAnchorAlt = null;
  gpsSettledAt = 0;
  lastMovementTs = 0;
}

// ────────────────────────────────────────────────────────────
// Background Resilience — Page Visibility + Native Sync
// ────────────────────────────────────────────────────────────

let visibilityListenerAttached = false;
let watchIdRef: string | number | null = null;
let nativeLocationListener: PluginListenerHandle | null = null;
let nativeStateListener: PluginListenerHandle | null = null;

/**
 * Re-attach native event listeners that were lost when the WebView was suspended.
 */
async function reattachNativeListeners() {
  if (nativeLocationListener) {
    try { await nativeLocationListener.remove(); } catch {}
    nativeLocationListener = null;
  }
  if (nativeStateListener) {
    try { await nativeStateListener.remove(); } catch {}
    nativeStateListener = null;
  }

  try {
    nativeLocationListener = await NativeWorkoutLocation.addListener('location', handleNativeLocation);
    nativeStateListener = await NativeWorkoutLocation.addListener('stateChange', (ev) => {
      if (ev.state === 'PAUSED') useCardioStore.setState({ isPaused: true });
      else if (ev.state === 'TRACKING') useCardioStore.setState({ isPaused: false });
    });
    watchIdRef = 'native-workout-location';
  } catch (e) {
    console.warn('[CardioStore] Failed to reattach native listeners:', e);
  }
}

function attachVisibilityListener() {
  if (visibilityListenerAttached) return;
  visibilityListenerAttached = true;

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const state = useCardioStore.getState();
      if (Capacitor.isNativePlatform() && state.isTracking) {
        await reattachNativeListeners();
        await syncWithNativeSession();
      }
    }
  });
}

/**
 * Replays or syncs the native service's state directly into the store.
 */
export const syncWithNativeSession = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const summary: NativeWorkoutSessionSummary = await NativeWorkoutLocation.getSessionSummary();
    if (summary.state === 'TRACKING' || summary.state === 'PAUSED') {
      // Use native SQLite downsampling (max 500 points) for instant UI hydration without bridge freezing
      const stored = await NativeWorkoutLocation.getDownsampledPoints({ maxPoints: 500 });
      const displayRoute: RoutePoint[] = stored.points
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(p => ({
          lat: p.lat,
          lng: p.lng,
          ts: p.timestamp,
          alt: p.altitude ?? undefined,
          speed: p.speed ?? undefined,
        }));

      const currentStore = useCardioStore.getState();
      const nativeDistKm = Math.max(0, summary.distanceMeters / 1000);

      useCardioStore.setState({
        isTracking: true,
        isPaused: summary.state === 'PAUSED',
        activityType: summary.activityType,
        startedAt: summary.startedAt || currentStore.startedAt,
        pausedAt: summary.pausedAt > 0 ? summary.pausedAt : null,
        totalPausedMs: Math.max(currentStore.totalPausedMs, summary.totalPausedMs),
        movingDurationSec: Math.max(currentStore.movingDurationSec, summary.movingDurationSec),
        distanceKm: Math.max(currentStore.distanceKm, nativeDistKm),
        currentSpeedKmh: summary.currentSpeedKmh,
        maxSpeedKmh: Math.max(currentStore.maxSpeedKmh, summary.maxSpeedKmh),
        elevationGainM: Math.max(currentStore.elevationGainM, summary.elevationGainM),
        currentLocation: summary.lastLat != null && summary.lastLng != null ? {
          lat: summary.lastLat,
          lng: summary.lastLng,
          heading: summary.lastBearing ?? undefined,
        } : currentStore.currentLocation,
        gpsAccuracy: summary.lastAccuracy,
        gpsStatus: 'active',
        lastGpsTimestamp: summary.lastTimestamp,
        routePoints: displayRoute.length > 0 ? displayRoute : currentStore.routePoints,
        isRecovering: false,
      });
      return true;
    }
  } catch (error) {
    console.warn('[CardioStore] Failed to sync native session:', error);
  }
  return false;
};

/** Flush native points before stopping and retrieve full resolution route for saving. */
export const finishTracking = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const summary = await NativeWorkoutLocation.getSessionSummary();
      const allPoints = await NativeWorkoutLocation.getDownsampledPoints({ maxPoints: 1500 });
      const fullRoute: RoutePoint[] = allPoints.points
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(p => ({
          lat: p.lat,
          lng: p.lng,
          ts: p.timestamp,
          alt: p.altitude ?? undefined,
          speed: p.speed ?? undefined,
        }));

      useCardioStore.setState({
        distanceKm: summary.distanceMeters / 1000,
        movingDurationSec: summary.movingDurationSec,
        maxSpeedKmh: summary.maxSpeedKmh,
        elevationGainM: summary.elevationGainM,
        routePoints: fullRoute.length > 0 ? fullRoute : useCardioStore.getState().routePoints,
      });
    } catch (e) {
      console.warn('[CardioStore] Error reading final session data:', e);
    }
  }

  await stopGpsWatch();
  const finalState = useCardioStore.getState();
  finalState.stopTracking();
  return useCardioStore.getState();
};

// ────────────────────────────────────────────────────────────
// Native Android Ingestion Handler (Single Source of Truth Adapter)
// ────────────────────────────────────────────────────────────

function handleNativeLocation(point: NativeWorkoutPoint) {
  const store = useCardioStore.getState();
  if (!store.isTracking || store.isPaused) return;

  const now = point.timestamp || Date.now();
  const newLat = point.lat;
  const newLng = point.lng;
  const heading = point.bearing != null && !Number.isNaN(point.bearing) ? point.bearing : undefined;

  // 1. Live Map Marker Position Update
  const currentLocation = { lat: newLat, lng: newLng, heading };

  // 2. Authoritative Metrics from Native Service
  const nativeDistKm = point.distanceMeters != null ? point.distanceMeters / 1000 : store.distanceKm;
  const movingDurationSec = point.movingDurationSec != null ? point.movingDurationSec : store.movingDurationSec;
  const currentSpeedKmh = point.currentSpeedKmh != null ? point.currentSpeedKmh : 0;
  const maxSpeedKmh = point.maxSpeedKmh != null ? point.maxSpeedKmh : store.maxSpeedKmh;
  const elevationGainM = point.elevationGainM != null ? point.elevationGainM : store.elevationGainM;

  // 3. Route Point Append (Only when native engine confirms point was accepted)
  let nextRoutePoints = store.routePoints;
  if (point.isAccepted) {
    const acceptedPt: RoutePoint = {
      lat: newLat,
      lng: newLng,
      ts: now,
      alt: point.altitude ?? undefined,
      speed: point.speed ?? undefined,
    };
    nextRoutePoints = [...store.routePoints, acceptedPt];

    if (nextRoutePoints.length > MAX_DISPLAY_POINTS) {
      nextRoutePoints = resampleRoute(nextRoutePoints, MAX_DISPLAY_POINTS);
    }
  }

  // 4. Rolling Moving-Pace Window from Native Distance Deltas
  let newPaceWindow = [...store.paceWindow];
  const deltaDistKm = nativeDistKm - store.distanceKm;
  const deltaSec = movingDurationSec - store.movingDurationSec;
  if (deltaDistKm > 0 && deltaSec > 0) {
    newPaceWindow.push({ dist: deltaDistKm, dt: deltaSec, ts: now });
  }

  const LIVE_PACE_WINDOW_MS = 45_000;
  newPaceWindow = newPaceWindow.filter(p => now - p.ts < LIVE_PACE_WINDOW_MS);

  let currentPaceMs = store.currentPaceMs;
  if (newPaceWindow.length > 0) {
    const sumDist = newPaceWindow.reduce((a, b) => a + b.dist, 0);
    const sumDt = newPaceWindow.reduce((a, b) => a + b.dt, 0);
    if (sumDist >= 0.005) {
      currentPaceMs = (sumDt * 1000) / sumDist;
    }
  } else if (currentSpeedKmh < 1.0) {
    currentPaceMs = 0;
  }

  // 5. Auto-Pause State Machine
  let autoPauseStatus = store.autoPauseStatus;
  let autoPausedAt = store.autoPausedAt;
  let totalPausedMs = store.totalPausedMs;

  const isPointMoving = point.isMoving === true || currentSpeedKmh >= 2.0;
  if (isPointMoving) {
    if (autoPauseStatus === 'PAUSED' && autoPausedAt) {
      totalPausedMs += (now - autoPausedAt);
    }
    autoPauseStatus = 'MOVING';
    autoPausedAt = null;
    lastMovementTs = now;
  } else {
    // Stationary candidate
    const stationaryTimeMs = lastMovementTs > 0 ? (now - lastMovementTs) : 4000;
    if (point.isAutoPaused || stationaryTimeMs >= 3000) {
      if (autoPauseStatus !== 'PAUSED') {
        autoPauseStatus = 'PAUSED';
        autoPausedAt = now;
      }
    }
  }

  useCardioStore.setState({
    currentLocation,
    routePoints: nextRoutePoints,
    distanceKm: nativeDistKm,
    movingDurationSec,
    currentSpeedKmh: Math.round(currentSpeedKmh * 10) / 10,
    maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
    elevationGainM: Math.round(elevationGainM * 10) / 10,
    gpsAccuracy: point.accuracy ?? store.gpsAccuracy,
    gpsStatus: 'active',
    paceWindow: newPaceWindow,
    currentPaceMs,
    autoPauseStatus,
    autoPausedAt,
    totalPausedMs,
    lastGpsTimestamp: now,
  });
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

/** Central GPS handler for Web/Browser fallback */
function handleWebGpsPosition(pos: GeolocationPosition) {
  const store = useCardioStore.getState();
  const accuracy = pos.coords.accuracy;
  const newLat = pos.coords.latitude;
  const newLng = pos.coords.longitude;
  const rawHeading = pos.coords.heading;
  const heading = rawHeading != null && !Number.isNaN(rawHeading) ? rawHeading : undefined;
  const now = pos.timestamp || Date.now();

  if (!Number.isFinite(accuracy) || accuracy > 35) return;

  const pt: RoutePoint & { accuracy?: number } = {
    lat: newLat,
    lng: newLng,
    ts: now,
    accuracy,
    alt: pos.coords.altitude ?? undefined,
    speed: pos.coords.speed ?? undefined,
  };

  store.addPoint(pt);
}

export const startGpsWatch = async (newSession = false) => {
  if (watchIdRef !== null) {
    if (newSession && Capacitor.isNativePlatform() && watchIdRef !== 'native-workout-location') {
      await stopGpsWatch();
    } else {
      if (Capacitor.isNativePlatform() && watchIdRef === 'native-workout-location' && useCardioStore.getState().isTracking) {
        await syncWithNativeSession();
      }
      return;
    }
  }

  attachVisibilityListener();

  if (Capacitor.isNativePlatform()) {
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
          (pos) => {
            if (pos) {
              const coords = pos.coords;
              useCardioStore.setState({
                currentLocation: {
                  lat: coords.latitude,
                  lng: coords.longitude,
                  heading: coords.heading ?? undefined,
                },
                gpsAccuracy: coords.accuracy || 0,
                gpsStatus: 'active',
              });
            }
          }
        );
        return;
      }

      nativeLocationListener = await NativeWorkoutLocation.addListener('location', handleNativeLocation);
      nativeStateListener = await NativeWorkoutLocation.addListener('stateChange', (ev) => {
        if (ev.state === 'PAUSED') useCardioStore.setState({ isPaused: true });
        else if (ev.state === 'TRACKING') useCardioStore.setState({ isPaused: false });
      });

      await NativeWorkoutLocation.start({
        reset: newSession,
        activityType: useCardioStore.getState().activityType ?? undefined,
      });
      watchIdRef = 'native-workout-location';
      await syncWithNativeSession();
    } catch (e) {
      console.warn('[CardioStore] Failed native GPS:', e);
      useCardioStore.setState({ gpsStatus: 'error' });
    }
  } else {
    if (!navigator.geolocation) {
      useCardioStore.setState({ gpsStatus: 'error' });
      return;
    }

    useCardioStore.setState({ gpsStatus: 'waiting' });
    watchIdRef = navigator.geolocation.watchPosition(
      handleWebGpsPosition,
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
      await nativeStateListener?.remove();
      nativeLocationListener = null;
      nativeStateListener = null;
    } else if (watchIdRef !== null) {
      try { await Geolocation.clearWatch({ id: watchIdRef as string }); } catch {}
    }
    try { await NativeWorkoutLocation.stop(); } catch {}
  } else if (watchIdRef !== null) {
    navigator.geolocation.clearWatch(watchIdRef as number);
  }
  watchIdRef = null;
};

// ────────────────────────────────────────────────────────────
// Store Definitions
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
  movingDurationSec: number;
  routePoints: RoutePoint[];
  paceWindow: { dist: number; dt: number; ts: number }[];
  distanceKm: number;
  currentSpeedKmh: number;
  currentPaceMs: number;
  maxSpeedKmh: number;
  elevationGainM: number;
  gpsStatus: GpsStatus;
  gpsAccuracy: number;
  currentLocation: { lat: number, lng: number, heading?: number } | null;
  lastGpsTimestamp: number;
  isRecovering: boolean;

  // Actions
  startTracking: (type: CardioActivityType) => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  addPoint: (point: RoutePoint & { accuracy?: number }) => void;
  syncWithNativeSession: () => Promise<boolean>;
  stopTracking: () => void;
  reset: () => void;
}

const MAX_DISPLAY_POINTS = 2000;

const IDLE: Partial<CardioState> = {
  isTracking: false,
  isPaused: false,
  autoPauseStatus: 'MOVING',
  autoPausedAt: null,
  activityType: null,
  startedAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  movingDurationSec: 0,
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
  isRecovering: false,
};

export const useCardioStore = create<CardioState>()(
  persist(
    (set, get) => ({
      ...(IDLE as CardioState),

      syncWithNativeSession: async () => {
        return await syncWithNativeSession();
      },

      startTracking: (type) => {
        resetWebGpsEngine();
        lastMovementTs = Date.now();
        const prevLocation = get().currentLocation;

        set({
          isTracking: true,
          isPaused: false,
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          activityType: type,
          startedAt: Date.now(),
          pausedAt: null,
          totalPausedMs: 0,
          movingDurationSec: 0,
          routePoints: [],
          paceWindow: [],
          distanceKm: 0,
          currentSpeedKmh: 0,
          currentPaceMs: 0,
          maxSpeedKmh: 0,
          elevationGainM: 0,
          gpsStatus: 'waiting',
          gpsAccuracy: get().gpsAccuracy || 0,
          currentLocation: prevLocation,
          lastGpsTimestamp: 0,
          isRecovering: false,
        });

        startGpsWatch(true);
      },

      pauseTracking: () => {
        if (Capacitor.isNativePlatform()) {
          NativeWorkoutLocation.pause().catch(console.warn);
        } else {
          stopGpsWatch();
        }
        set({
          isPaused: true,
          pausedAt: Date.now(),
          currentSpeedKmh: 0,
        });
      },

      resumeTracking: () => {
        if (Capacitor.isNativePlatform()) {
          NativeWorkoutLocation.resume().catch(console.warn);
        } else {
          startGpsWatch();
        }
        resetWebGpsEngine();
        lastMovementTs = Date.now();

        const { pausedAt, totalPausedMs, autoPauseStatus, autoPausedAt } = get();
        
        let newTotalPausedMs = totalPausedMs;
        const now = Date.now();
        
        if (pausedAt) {
          newTotalPausedMs += (now - pausedAt);
        } else if (autoPauseStatus === 'PAUSED' && autoPausedAt) {
          newTotalPausedMs += (now - autoPausedAt);
        }

        set({
          isPaused: false,
          pausedAt: null,
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          totalPausedMs: newTotalPausedMs,
        });
      },

      /**
       * Web/Browser Fallback point processor.
       * (On native Android, handleNativeLocation is used directly).
       */
      addPoint: (point) => {
        const state = get();
        if (!state.isTracking || state.isPaused) return;

        const accuracy = (point as any).accuracy as number | undefined;
        const now = point.ts;
        if (now <= state.lastGpsTimestamp && state.routePoints.length > 0) return;

        const rawPt: RoutePoint = { lat: point.lat, lng: point.lng, ts: now };
        if (point.alt !== undefined) rawPt.alt = point.alt;
        if (point.speed !== undefined) rawPt.speed = point.speed;

        let { gpsStatus, movingDurationSec, distanceKm, elevationGainM, maxSpeedKmh } = state;

        if (gpsStatus === 'waiting' || gpsStatus === 'off') {
          gpsStatus = 'warming_up';
        }

        if (gpsStatus === 'warming_up') {
          if (accuracy && accuracy <= 35) {
            gpsStatus = 'active';
            gpsSettledAt = now + GPS_SETTLING_DURATION_MS;
            lastAcceptedWebPoint = rawPt;
            if (rawPt.alt !== undefined) {
              lastElevationAnchorAlt = rawPt.alt;
              altitudeBuffer = [rawPt.alt];
            }
          }
          set({ gpsStatus, gpsAccuracy: accuracy || 0, lastGpsTimestamp: now, currentLocation: rawPt });
          return;
        }

        const prev = lastAcceptedWebPoint;
        let addedDistanceKm = 0;
        let addedElevationM = 0;
        let currentSpeed = 0;
        const isSettling = gpsSettledAt > 0 && now < gpsSettledAt;

        if (prev) {
          const dtSec = Math.max(0.1, (now - prev.ts) / 1000);
          const deltaDistanceKm = haversineKm(prev.lat, prev.lng, rawPt.lat, rawPt.lng);
          const deltaDistanceM = deltaDistanceKm * 1000;
          const derivedSpeedKmh = (deltaDistanceKm / dtSec) * 3600;

          const nativeSpeedKmh = point.speed != null && point.speed >= 0 ? point.speed * 3.6 : null;
          const candidateSpeed = nativeSpeedKmh != null ? nativeSpeedKmh : (deltaDistanceM < 6.0 ? 0 : derivedSpeedKmh);

          // Single EMA speed smoothing pass
          const smoothedSpeed = pushSpeed(isSettling ? 0 : candidateSpeed);
          const dynamicNoiseThreshold = Math.max(5.0, (accuracy || 20) * 0.35);

          const isStationary = smoothedSpeed < 1.2 && deltaDistanceM < dynamicNoiseThreshold;
          currentSpeed = isStationary || isSettling ? 0 : smoothedSpeed;

          const hasMovedThreshold = deltaDistanceM >= dynamicNoiseThreshold;
          const isMovementConfirmed = !isSettling && !isStationary && (
            (smoothedSpeed >= 1.2 && hasMovedThreshold) ||
            (hasMovedThreshold && derivedSpeedKmh >= 2.0)
          );

          if (isMovementConfirmed) {
            addedDistanceKm = deltaDistanceKm;
            lastAcceptedWebPoint = rawPt;
            lastMovementTs = now;
            if (dtSec < 30) movingDurationSec += Math.round(dtSec);

            if (rawPt.alt !== undefined && (!accuracy || accuracy <= 25)) {
              const smoothedAlt = getSmoothedAltitude(rawPt.alt);
              if (lastElevationAnchorAlt !== null) {
                const diff = smoothedAlt - lastElevationAnchorAlt;
                if (diff >= 1.5 && diff < 80) {
                  addedElevationM = diff;
                  lastElevationAnchorAlt = smoothedAlt;
                } else if (diff <= -1.5 && diff > -80) {
                  lastElevationAnchorAlt = smoothedAlt;
                }
              } else {
                lastElevationAnchorAlt = smoothedAlt;
              }
            }

            if (currentSpeed > 1.5 && currentSpeed <= 180) {
              maxSpeedKmh = Math.max(maxSpeedKmh, currentSpeed);
            }
          } else if (isSettling) {
            lastAcceptedWebPoint = rawPt;
            if (rawPt.alt !== undefined) lastElevationAnchorAlt = rawPt.alt;
          }
        } else {
          lastAcceptedWebPoint = rawPt;
          lastMovementTs = now;
          if (rawPt.alt !== undefined) {
            lastElevationAnchorAlt = rawPt.alt;
            altitudeBuffer = [rawPt.alt];
          }
        }

        const nextRoutePoints = addedDistanceKm > 0 || state.routePoints.length === 0
          ? [...state.routePoints, rawPt]
          : state.routePoints;

        set({
          routePoints: nextRoutePoints,
          currentLocation: rawPt,
          distanceKm: distanceKm + addedDistanceKm,
          movingDurationSec,
          currentSpeedKmh: Math.round(currentSpeed * 10) / 10,
          maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
          elevationGainM: Math.round((elevationGainM + addedElevationM) * 10) / 10,
          gpsAccuracy: accuracy || 0,
          gpsStatus: 'active',
          lastGpsTimestamp: now,
        });
      },

      stopTracking: () => {
        stopGpsWatch();
        resetWebGpsEngine();
        set({
          isTracking: false,
          isPaused: false,
          autoPauseStatus: 'MOVING',
          autoPausedAt: null,
          gpsStatus: 'off' as GpsStatus,
        });
      },

      reset: () => {
        stopGpsWatch();
        resetWebGpsEngine();
        set({ ...(IDLE as CardioState) });
      },
    }),
    {
      name: 'apparatus-cardio-storage',
      partialize: (state) => {
        const { routePoints, paceWindow, ...rest } = state;
        return rest;
      },
    }
  )
);
