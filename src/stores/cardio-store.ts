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
// 1. Spike Detection & Speed Engine
// ────────────────────────────────────────────────────────────

// No artificial speed caps — instead we detect sudden spikes
// that are inconsistent with the rolling speed trend.
// Genuine gradual acceleration (walk → motorbike) passes through.

const EMA_ALPHA = 0.25; 
const SPEED_BUFFER_SIZE = 5;
const SPIKE_HISTORY_SIZE = 7;
let rawSpeedBuffer: number[] = [];
let emaSpeed = 0;
let spikeSpeedHistory: number[] = [];

let lastRawGpsPoint: RoutePoint | null = null;
let lastAcceptedDistancePoint: RoutePoint | null = null;
let lastRoutePoint: RoutePoint | null = null;
let lastMovementPoint: RoutePoint | null = null;
let lastMovementTs = 0;

// Elevation smoothing buffer
const ALTITUDE_BUFFER_SIZE = 5;
let altitudeBuffer: number[] = [];
let lastElevationAnchorAlt: number | null = null;

// GPS settling phase — suppress distance for first few seconds after warm-up
const GPS_SETTLING_DURATION_MS = 5000;
let gpsSettledAt = 0; // timestamp when settling ended (0 = not yet settled)

function getSmoothedAltitude(alt: number): number {
  altitudeBuffer.push(alt);
  if (altitudeBuffer.length > ALTITUDE_BUFFER_SIZE) altitudeBuffer.shift();
  const sorted = [...altitudeBuffer].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Spike detection: checks if a candidate speed is consistent with
 * the recent speed history. Rejects sudden jumps that look like
 * GPS glitches (e.g. 5→80→3 km/h). Allows genuine gradual
 * acceleration (5→8→12→18→25) because each step is close to
 * the previous trend.
 */
function isSpeedSpike(candidateSpeedKmh: number): boolean {
  if (spikeSpeedHistory.length < 3) return false; // Not enough data

  const sorted = [...spikeSpeedHistory].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const recentMax = sorted[sorted.length - 1];

  let allowedCeiling: number;
  if (median < 2.0) {
    // Nearly stationary — allow up to 30 km/h to start moving
    allowedCeiling = 30.0;
  } else {
    // Allow generous envelope: 3x median, or 2x recent max, or median+40
    allowedCeiling = Math.max(median * 3.0, Math.max(recentMax * 2.0, median + 40.0));
  }

  return candidateSpeedKmh > allowedCeiling;
}

function acceptSpeedToHistory(speedKmh: number) {
  spikeSpeedHistory.push(speedKmh);
  if (spikeSpeedHistory.length > SPIKE_HISTORY_SIZE) spikeSpeedHistory.shift();
}

function resetTrackingSegmentState() {
  lastRawGpsPoint = null;
  lastAcceptedDistancePoint = null;
  lastRoutePoint = null;
  lastMovementPoint = null;
  altitudeBuffer = [];
  lastElevationAnchorAlt = null;
  gpsSettledAt = 0;
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

function resetSpeedEngine() {
  rawSpeedBuffer = [];
  emaSpeed = 0;
  spikeSpeedHistory = [];
  altitudeBuffer = [];
  lastElevationAnchorAlt = null;
}

// ────────────────────────────────────────────────────────────
// Background Resilience — Page Visibility + Native Sync
// ────────────────────────────────────────────────────────────

let visibilityListenerAttached = false;

/**
 * Re-attach native event listeners that were lost when the WebView was suspended.
 * This does NOT restart the native service — it only re-subscribes to its broadcasts.
 */
async function reattachNativeListeners() {
  // Clean up any stale listener handles
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
        // Re-attach native listeners that were killed during background suspension
        await reattachNativeListeners();
        // Sync full session state from native SharedPreferences
        await syncWithNativeSession();
      }
    }
  });
}

let watchIdRef: string | number | null = null;
let nativeLocationListener: PluginListenerHandle | null = null;
let nativeStateListener: PluginListenerHandle | null = null;

/**
 * Replays or syncs the native service's state directly into the store.
 */
export const syncWithNativeSession = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const summary: NativeWorkoutSessionSummary = await NativeWorkoutLocation.getSessionSummary();
    if (summary.state === 'TRACKING' || summary.state === 'PAUSED') {
      const downsampled = await NativeWorkoutLocation.getDownsampledPoints({ maxPoints: 500 });
      const pts: RoutePoint[] = downsampled.points.map(p => ({
        lat: p.lat,
        lng: p.lng,
        ts: p.timestamp,
        alt: p.altitude ?? undefined,
        speed: p.speed ?? undefined,
      }));

      const currentStore = useCardioStore.getState();
      const nativeDistKm = summary.distanceMeters / 1000;
      const finalDistKm = Math.max(currentStore.distanceKm, nativeDistKm);
      const finalMovingSec = Math.max(currentStore.movingDurationSec, summary.movingDurationSec);
      const finalMaxSpeed = Math.max(currentStore.maxSpeedKmh, summary.maxSpeedKmh);
      const finalElevation = Math.max(currentStore.elevationGainM, summary.elevationGainM);
      const finalRoute = pts.length >= currentStore.routePoints.length ? pts : currentStore.routePoints;

      useCardioStore.setState({
        isTracking: true,
        isPaused: summary.state === 'PAUSED',
        activityType: summary.activityType,
        startedAt: summary.startedAt,
        pausedAt: summary.pausedAt > 0 ? summary.pausedAt : null,
        totalPausedMs: summary.totalPausedMs,
        movingDurationSec: finalMovingSec,
        distanceKm: finalDistKm,
        currentSpeedKmh: summary.currentSpeedKmh,
        maxSpeedKmh: finalMaxSpeed,
        elevationGainM: finalElevation,
        currentLocation: summary.lastLat && summary.lastLng ? {
          lat: summary.lastLat,
          lng: summary.lastLng,
          heading: summary.lastBearing ?? undefined,
        } : currentStore.currentLocation,
        gpsAccuracy: summary.lastAccuracy,
        gpsStatus: 'active',
        lastGpsTimestamp: summary.lastTimestamp,
        routePoints: finalRoute,
        isRecovering: false,
      });
      return true;
    }
  } catch (error) {
    console.warn('[CardioStore] Failed to sync native session summary:', error);
  }
  return false;
};

/** Flush native points before stopping and retrieve full resolution route for saving. */
export const finishTracking = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const summary = await NativeWorkoutLocation.getSessionSummary();
      const allPoints = await NativeWorkoutLocation.getLocationsAfter({ timestamp: 0 });
      const fullRoute: RoutePoint[] = allPoints.points.map(p => ({
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

function handleNativeLocation(point: NativeWorkoutPoint) {
  handleGpsPosition({
    coords: {
      latitude: point.lat,
      longitude: point.lng,
      accuracy: point.accuracy ?? 999,
      altitude: point.altitude,
      altitudeAccuracy: point.verticalAccuracy ?? null,
      heading: point.bearing ?? null,
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

/** Central GPS point handler */
function handleGpsPosition(pos: GeolocationPosition) {
  const storeState = useCardioStore.getState();
  const accuracy = pos.coords.accuracy;
  const newLat = pos.coords.latitude;
  const newLng = pos.coords.longitude;
  const rawHeading = pos.coords.heading;
  const hasValidHeading = rawHeading != null && !Number.isNaN(rawHeading);
  
  if (!storeState.currentLocation) {
    useCardioStore.setState({ 
      currentLocation: { 
        lat: newLat, 
        lng: newLng,
        heading: hasValidHeading ? rawHeading : undefined
      }
    });
  } else if ((Number.isFinite(accuracy) && accuracy <= 40) || Capacitor.isNativePlatform() === false) {
    const cur = storeState.currentLocation;
    const distM = haversineKm(cur.lat, cur.lng, newLat, newLng) * 1000;
    const isStationary = storeState.currentSpeedKmh < 0.8 && distM < 4;
    
    let lat = newLat;
    let lng = newLng;
    let heading = hasValidHeading ? rawHeading : cur.heading;

    if (isStationary) {
      lat = cur.lat * 0.8 + newLat * 0.2;
      lng = cur.lng * 0.8 + newLng * 0.2;
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

  // Reject inaccurate fixes
  if (!Number.isFinite(accuracy) || accuracy > 60) return;

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
          (pos) => { if (pos) handleGpsPosition(pos as unknown as GeolocationPosition); }
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
        resetSpeedEngine();
        resetTrackingSegmentState();
        lastMovementTs = Date.now();

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
        resetTrackingSegmentState();
        const { autoPauseStatus, autoPausedAt } = get();
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
        if (Capacitor.isNativePlatform()) {
          NativeWorkoutLocation.resume().catch(console.warn);
        } else {
          startGpsWatch();
        }
        resetSpeedEngine();
        resetTrackingSegmentState();
        lastMovementTs = Date.now();

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

        let { gpsStatus, autoPauseStatus, autoPausedAt, totalPausedMs, movingDurationSec } = state;
        
        if (gpsStatus === 'waiting' || gpsStatus === 'off') {
           gpsStatus = 'warming_up';
        }
        
        if (gpsStatus === 'warming_up') {
           const targetAccuracy = Capacitor.isNativePlatform() ? 30 : 50;
           if (accuracy && accuracy <= targetAccuracy) {
             gpsStatus = 'active';
             // Start GPS settling period — suppress distance for first few seconds
             gpsSettledAt = now + GPS_SETTLING_DURATION_MS;
             lastRawGpsPoint = rawPt;
             lastAcceptedDistancePoint = rawPt;
             lastRoutePoint = rawPt;
             lastMovementPoint = rawPt;
             lastMovementTs = now;
             if (rawPt.alt !== undefined) {
               lastElevationAnchorAlt = rawPt.alt;
               altitudeBuffer = [rawPt.alt];
             }
           }
           set({ gpsStatus, gpsAccuracy: accuracy || 0, lastGpsTimestamp: now });
           return;
        }

        const prev = lastRawGpsPoint;
        lastRawGpsPoint = rawPt;

        let addedDistance = 0;
        let addedElevation = 0;
        let dtSec = 0;

        const nativeSpeedKmh = point.speed != null && point.speed >= 0 ? point.speed * 3.6 : null;
        let currentSpeed = 0;

        if (prev) {
          dtSec = Math.max(0.1, (now - prev.ts) / 1000);
          const rawDistanceKm = haversineKm(prev.lat, prev.lng, rawPt.lat, rawPt.lng);
          const derivedSpeedKmh = (rawDistanceKm / dtSec) * 3600;

          // Pick best speed source
          if (nativeSpeedKmh !== null && nativeSpeedKmh >= 0) {
            currentSpeed = nativeSpeedKmh;
          } else {
            currentSpeed = derivedSpeedKmh;
          }

          // Spike detection: reject if speed is wildly inconsistent with recent trend
          if (isSpeedSpike(currentSpeed)) {
            // Glitch point — skip it entirely, don't accumulate anything
            set({ lastGpsTimestamp: now });
            return;
          }

          const distanceAnchor = lastAcceptedDistancePoint ?? prev;
          const distanceCandidateKm = haversineKm(distanceAnchor.lat, distanceAnchor.lng, rawPt.lat, rawPt.lng);
          const distanceCandidateM = distanceCandidateKm * 1000;
          const anchorDtSec = Math.max(0.1, (now - distanceAnchor.ts) / 1000);
          const candidateSpeedKmh = (distanceCandidateKm / anchorDtSec) * 3600;

          const isAccurate = !accuracy || accuracy <= 30;

          // Also check if the distance-implied speed is a spike
          const isDistanceSpike = isSpeedSpike(candidateSpeedKmh);

          // Stationary jitter suppression
          const isStationaryCandidate = currentSpeed < 1.0 && distanceCandidateM < 4.5;
          if (isStationaryCandidate) {
            currentSpeed = 0;
          }

          // During GPS settling, require larger movement threshold to suppress jitter
          const isSettling = gpsSettledAt > 0 && now < gpsSettledAt;
          const movementThreshold = isSettling ? 7.0 : Math.max(4.5, (accuracy || 20) * 0.25);
          const hasMovedThreshold = distanceCandidateM >= movementThreshold;
          const isMovementConfirmed = !isStationaryCandidate && (currentSpeed >= 1.0 || candidateSpeedKmh >= 1.5 || hasMovedThreshold);

          // Suppress distance during settling if speed seems unreasonable for a stationary start
          const settlingSpeedGate = !isSettling || candidateSpeedKmh <= 3.5;

          if (isAccurate && !isDistanceSpike && hasMovedThreshold && isMovementConfirmed && settlingSpeedGate) {
            addedDistance = distanceCandidateKm;
            lastAcceptedDistancePoint = rawPt;
            lastMovementTs = now;
            lastMovementPoint = rawPt;
          }

          // Elevation filtering
          if (rawPt.alt !== undefined && (!accuracy || accuracy <= 25)) {
            const smoothedAlt = getSmoothedAltitude(rawPt.alt);
            if (lastElevationAnchorAlt !== null) {
              const diff = smoothedAlt - lastElevationAnchorAlt;
              if (diff >= 1.5 && diff < 80) {
                addedElevation = diff;
                lastElevationAnchorAlt = smoothedAlt;
              } else if (diff <= -1.5 && diff > -80) {
                lastElevationAnchorAlt = smoothedAlt;
              }
            } else {
              lastElevationAnchorAlt = smoothedAlt;
            }
          }
        } else {
          lastAcceptedDistancePoint = rawPt;
          lastRoutePoint = rawPt;
          lastMovementPoint = rawPt;
          lastMovementTs = now;
          if (nativeSpeedKmh !== null) currentSpeed = nativeSpeedKmh;
          if (rawPt.alt !== undefined) {
            lastElevationAnchorAlt = rawPt.alt;
            altitudeBuffer = [rawPt.alt];
          }
        }

        // Accept this speed into the spike detection history
        acceptSpeedToHistory(currentSpeed);

        const smoothedSpeed = pushSpeed(currentSpeed);
        const displaySpeed = Math.round(smoothedSpeed * 10) / 10;

        // Auto-pause & Moving Time Accumulator — Never auto-stop when user is moving at speed!
        const isMoving = currentSpeed >= 1.0 || addedDistance > 0;
        const isStationaryNow = !isMoving;

        if (isStationaryNow) {
          if (autoPauseStatus === 'MOVING') {
            autoPauseStatus = 'CANDIDATE_STOP';
            lastMovementTs = now;
          } else if (autoPauseStatus === 'CANDIDATE_STOP') {
            if (now - lastMovementTs > 6_000) {
              autoPauseStatus = 'PAUSED';
              autoPausedAt = now;
            }
          }
        } else {
          if (autoPauseStatus === 'PAUSED' && autoPausedAt) {
            totalPausedMs += (now - autoPausedAt);
          }
          autoPauseStatus = 'MOVING';
          autoPausedAt = null;
          lastMovementTs = now;
          if (dtSec > 0 && dtSec < 30) movingDurationSec += Math.round(dtSec);
        }

        // Rolling Moving-Pace Window
        let newPaceWindow = [...state.paceWindow];
        if (addedDistance > 0 && dtSec > 0) {
          newPaceWindow.push({ dist: addedDistance, dt: dtSec, ts: now });
        }
        
        const LIVE_PACE_WINDOW_MS = 45_000;
        newPaceWindow = newPaceWindow.filter(p => now - p.ts < LIVE_PACE_WINDOW_MS);

        let currentPaceMs = state.currentPaceMs;
        if (newPaceWindow.length > 0) {
          const sumDist = newPaceWindow.reduce((a, b) => a + b.dist, 0);
          const sumDt = newPaceWindow.reduce((a, b) => a + b.dt, 0);
          if (sumDist >= 0.005) {
            currentPaceMs = (sumDt * 1000) / sumDist;
          }
        } else if (autoPauseStatus === 'PAUSED' || isStationaryNow) {
          if (now - lastMovementTs > 5_000) {
            currentPaceMs = 0;
          }
        }

        // Route Point addition — Filter stationary jitter from drawing noisy spiderwebs
        const routeDistM = lastRoutePoint
          ? haversineKm(lastRoutePoint.lat, lastRoutePoint.lng, rawPt.lat, rawPt.lng) * 1000
          : Infinity;
        const shouldAddRoutePoint = (routeDistM >= 5.0 && isMoving) || addedDistance > 0 || state.routePoints.length === 0;
        if (shouldAddRoutePoint) lastRoutePoint = rawPt;
        let nextRoutePoints = shouldAddRoutePoint ? [...state.routePoints, rawPt] : state.routePoints;

        if (nextRoutePoints.length > MAX_DISPLAY_POINTS) {
          const half = Math.floor(nextRoutePoints.length / 2);
          nextRoutePoints = nextRoutePoints.filter((_, i) => i >= half || i % 2 === 0);
        }

        // Don't update max speed during GPS settling (jitter causes phantom 2-3 km/h)
        const isSettlingNow = gpsSettledAt > 0 && now < gpsSettledAt;
        const newMaxSpeed = !isSettlingNow && currentSpeed >= 1.5 && !isSpeedSpike(currentSpeed)
          ? Math.max(state.maxSpeedKmh, currentSpeed)
          : state.maxSpeedKmh;

        set({
          routePoints: nextRoutePoints,
          currentLocation: rawPt,
          distanceKm: state.distanceKm + addedDistance,
          movingDurationSec,
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
    {
      name: 'apparatus-cardio-storage',
      partialize: (state) => {
        const { routePoints, paceWindow, ...rest } = state;
        return rest;
      },
    }
  )
);
