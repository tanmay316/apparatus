import { useState, useEffect, useCallback, useRef } from 'react';

export type CompassConfidence = 'high' | 'medium' | 'low' | 'calibrating' | 'unavailable';
export type HeadingSource = 'none' | 'gps_bearing' | 'ios' | 'absolute' | 'relative';

const MAX_ACCEPTED_ANGULAR_VELOCITY = 1080;
const NOISE_VELOCITY_HIGH = 360;
const NOISE_VELOCITY_MED = 180;
const VISUAL_DEADBAND = 2.5; // Sub-2.5° changes are filtered to prevent flicker
const DISCOVERY_WINDOW_MS = 500;
const REACT_UPDATE_INTERVAL_MS = 200;
const SENSOR_THROTTLE_MS = 50; // Throttle to 20Hz

export function normalizeAngle(deg: number) {
  return ((deg % 360) + 360) % 360;
}

/** Strict circular difference handling 359° -> 1° (+2°) without jumping */
export function angleDelta(target: number, current: number) {
  return ((target - current + 540) % 360) - 180;
}

function sourcePriority(source: HeadingSource): number {
  switch (source) {
    case 'gps_bearing': return 4;
    case 'ios': return 3;
    case 'absolute': return 2;
    case 'relative': return 1;
    default: return 0;
  }
}

function getCleanSensorHeading(event: DeviceOrientationEvent): number | null {
  // iOS provides calibrated true heading directly
  if ((event as any).webkitCompassHeading !== undefined) {
    const iosHeading = (event as any).webkitCompassHeading;
    if (typeof iosHeading === 'number' && !isNaN(iosHeading)) {
      const screenAngle = window.screen?.orientation?.angle || 0;
      return normalizeAngle(iosHeading + screenAngle);
    }
  }

  // Android: alpha is clockwise azimuth / rotation around Z axis
  if (event.alpha !== null && !isNaN(event.alpha)) {
    const screenAngle = window.screen?.orientation?.angle || 0;
    const heading = 360 - event.alpha;
    return normalizeAngle(heading + screenAngle);
  }

  return null;
}

interface UseCompassHeadingOptions {
  movementBearing?: number | null;
  speedKmh?: number;
}

export function useCompassHeading(options?: UseCompassHeadingOptions) {
  const { movementBearing = null, speedKmh = 0 } = options || {};

  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<CompassConfidence>('calibrating');
  const [source, setSource] = useState<HeadingSource>('none');
  const [angularVelocity, setAngularVelocity] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);

  const targetHeadingRef = useRef<number | null>(null);
  const visualHeadingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const sourceRef = useRef<HeadingSource>('none');
  const initTimeRef = useRef<number | null>(null);
  
  const readingsCountRef = useRef<number>(0);
  const lastRawHeadingRef = useRef<number | null>(null);
  const lastRawTimestampRef = useRef<number | null>(null);

  // Request absolute permission
  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceOrientationEvent as any).requestPermission(true);
        if (permissionState === 'granted') {
          setPermissionGranted(true);
          return true;
        } else {
          setError('Permission to access device orientation was denied.');
          setPermissionGranted(false);
          return false;
        }
      } catch (err: any) {
        setError(err.message || 'Error requesting device orientation permission');
        setPermissionGranted(false);
        return false;
      }
    } else {
      setPermissionGranted(true);
      return true;
    }
  }, []);

  // GPS Movement Bearing Fusion: When moving (speed >= 3.6 km/h / 1.0 m/s), prioritize GPS movement bearing
  useEffect(() => {
    if (speedKmh >= 3.6 && movementBearing != null && !isNaN(movementBearing)) {
      const normalizedBearing = normalizeAngle(movementBearing);
      sourceRef.current = 'gps_bearing';
      
      if (targetHeadingRef.current === null || visualHeadingRef.current === null) {
        targetHeadingRef.current = normalizedBearing;
        visualHeadingRef.current = normalizedBearing;
      } else {
        const delta = angleDelta(normalizedBearing, targetHeadingRef.current);
        targetHeadingRef.current = normalizeAngle(targetHeadingRef.current + delta);
      }
      setConfidence('high');
      setSource('gps_bearing');
    }
  }, [movementBearing, speedKmh]);

  // Sensor Event Loop (used when stationary or as fallback)
  useEffect(() => {
    if (!permissionGranted) return;
    initTimeRef.current = performance.now();

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // If actively using GPS bearing at speed, skip sensor processing to save CPU
      if (speedKmh >= 3.6 && movementBearing != null) return;

      const now = performance.now();
      if (lastRawTimestampRef.current !== null && (now - lastRawTimestampRef.current) < SENSOR_THROTTLE_MS) {
        return;
      }
      
      let rawHeading: number | null = null;
      let currentAccuracy: number | null = null;
      let isSourceAbsolute = false;
      let eventSource: HeadingSource = 'relative';

      if ((event as any).webkitCompassHeading !== undefined) {
        eventSource = 'ios';
      } else if (event.type === 'deviceorientationabsolute' && event.alpha !== null) {
        eventSource = 'absolute';
      } else if (event.type === 'deviceorientation' && event.alpha !== null && (event as any).absolute === true) {
        eventSource = 'absolute';
      } else if (event.type === 'deviceorientation' && event.alpha !== null) {
        eventSource = 'relative';
      }

      const timeSinceInit = now - initTimeRef.current!;
      if (timeSinceInit < DISCOVERY_WINDOW_MS) {
        if (sourcePriority(eventSource) > sourcePriority(sourceRef.current)) {
          sourceRef.current = eventSource;
        }
      } else if (sourceRef.current === 'none' || sourceRef.current === 'gps_bearing') {
        sourceRef.current = eventSource;
      }

      if (sourcePriority(eventSource) < sourcePriority(sourceRef.current) && sourceRef.current !== 'gps_bearing') {
        return; 
      }

      rawHeading = getCleanSensorHeading(event);
      if (eventSource === 'ios') {
        currentAccuracy = (event as any).webkitCompassAccuracy;
        isSourceAbsolute = true;
      } else if (eventSource === 'absolute') {
        isSourceAbsolute = true;
      }

      if (rawHeading !== null) {
        let currentAngularVelocity = 0;
        
        if (lastRawHeadingRef.current !== null && lastRawTimestampRef.current !== null) {
          const rawDelta = angleDelta(rawHeading, lastRawHeadingRef.current);
          const dt = (now - lastRawTimestampRef.current) / 1000;
          if (dt > 0) {
            currentAngularVelocity = Math.abs(rawDelta) / dt;
          }
        }
        
        if (targetHeadingRef.current === null || visualHeadingRef.current === null) {
          targetHeadingRef.current = rawHeading;
          visualHeadingRef.current = rawHeading;
        } else {
          if (currentAngularVelocity < MAX_ACCEPTED_ANGULAR_VELOCITY) {
            const delta = angleDelta(rawHeading, targetHeadingRef.current);
            targetHeadingRef.current = normalizeAngle(targetHeadingRef.current + delta);
          }
        }
        
        readingsCountRef.current += 1;
        let currentConfidence: CompassConfidence = 'low';
        
        if (readingsCountRef.current < 20) {
          currentConfidence = 'calibrating';
        } else {
          if (isSourceAbsolute) {
            if (currentAccuracy !== null) {
              if (currentAccuracy <= 15) currentConfidence = 'high';
              else if (currentAccuracy <= 30) currentConfidence = 'medium';
              else currentConfidence = 'low';
            } else {
              if (currentAngularVelocity > NOISE_VELOCITY_HIGH) {
                currentConfidence = 'low';
              } else if (currentAngularVelocity > NOISE_VELOCITY_MED) {
                currentConfidence = 'medium';
              } else {
                currentConfidence = 'high';
              }
            }
          } else {
            currentConfidence = 'unavailable';
          }
        }

        lastRawHeadingRef.current = rawHeading;
        lastRawTimestampRef.current = now;
        
        setAccuracy(currentAccuracy);
        setConfidence(currentConfidence);
        setSource(sourceRef.current);
        setAngularVelocity(currentAngularVelocity);
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener);
    window.addEventListener('deviceorientation', handleOrientation as EventListener);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener);
    };
  }, [permissionGranted, speedKmh, movementBearing]);

  // Visual Animation Loop with circular angle wrapping
  useEffect(() => {
    if (!permissionGranted) return;
    let lastReactUpdate = 0;

    const animate = (time: number) => {
      const target = targetHeadingRef.current;
      const current = visualHeadingRef.current;

      if (target !== null && current !== null) {
        const delta = angleDelta(target, current);
        const absDelta = Math.abs(delta);

        if (absDelta > VISUAL_DEADBAND) {
          let alpha = 0.7;
          if (absDelta < 4) alpha = 0.06;
          else if (absDelta < 10) alpha = 0.15;
          else if (absDelta < 25) alpha = 0.35;

          visualHeadingRef.current = normalizeAngle(current + delta * alpha);
        }

        if (time - lastReactUpdate > REACT_UPDATE_INTERVAL_MS) {
          setHeading(visualHeadingRef.current);
          lastReactUpdate = time;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [permissionGranted]);

  return { heading, accuracy, confidence, source, angularVelocity, requestPermission, visualHeadingRef };
}
