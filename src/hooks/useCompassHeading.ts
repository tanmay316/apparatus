import { useState, useEffect, useCallback, useRef } from 'react';

export type CompassConfidence = 'high' | 'medium' | 'low' | 'calibrating' | 'unavailable';
export type HeadingSource = 'none' | 'ios' | 'absolute' | 'relative';

const MAX_ACCEPTED_ANGULAR_VELOCITY = 1080;
const NOISE_VELOCITY_HIGH = 360;
const NOISE_VELOCITY_MED = 180;
const VISUAL_DEADBAND = 0.5;
const DISCOVERY_WINDOW_MS = 500;
const REACT_UPDATE_INTERVAL_MS = 200;

function normalize(deg: number) {
  return ((deg % 360) + 360) % 360;
}

function angleDelta(target: number, current: number) {
  return ((target - current + 540) % 360) - 180;
}

function sourcePriority(source: HeadingSource): number {
  switch (source) {
    case 'ios': return 3;
    case 'absolute': return 2;
    case 'relative': return 1;
    default: return 0;
  }
}

function getCleanHeading(event: DeviceOrientationEvent): number | null {
  // iOS provides calibrated true heading directly
  if ((event as any).webkitCompassHeading !== undefined) {
    const iosHeading = (event as any).webkitCompassHeading;
    if (typeof iosHeading === 'number' && !isNaN(iosHeading)) {
      const screenAngle = window.screen?.orientation?.angle || 0;
      return normalize(iosHeading + screenAngle);
    }
  }

  // Android: alpha is clockwise azimuth / rotation around Z axis
  if (event.alpha !== null && !isNaN(event.alpha)) {
    const screenAngle = window.screen?.orientation?.angle || 0;
    // Standard Android W3C deviceorientation azimuth to true heading
    const heading = 360 - event.alpha;
    return normalize(heading + screenAngle);
  }

  return null;
}

export function useCompassHeading() {
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
        // We explicitly pass true to request absolute orientation / magnetometer access on iOS
        const permissionState = await (DeviceOrientationEvent as any).requestPermission(true);
        if (permissionState === 'granted') {
          setPermissionGranted(true);
          return true;
        } else {
          setError('Permission to access absolute device orientation was denied.');
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

  // Sensor Event Loop
  useEffect(() => {
    if (!permissionGranted) return;
    
    // Start discovery timer immediately on mount/permission granted
    initTimeRef.current = performance.now();

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const now = performance.now();
      
      let rawHeading: number | null = null;
      let currentAccuracy: number | null = null;
      let isSourceAbsolute = false;
      let eventSource: HeadingSource = 'relative';

      // Identify event source
      if ((event as any).webkitCompassHeading !== undefined) {
        eventSource = 'ios';
      } else if (event.type === 'deviceorientationabsolute' && event.alpha !== null) {
        eventSource = 'absolute';
      } else if (event.type === 'deviceorientation' && event.alpha !== null && (event as any).absolute === true) {
        eventSource = 'absolute';
      } else if (event.type === 'deviceorientation' && event.alpha !== null) {
        eventSource = 'relative';
      }

      // 1. Source Discovery & Lock
      const timeSinceInit = now - initTimeRef.current!;
      if (timeSinceInit < DISCOVERY_WINDOW_MS) {
        // During first 500ms, upgrade source lock if we find a better one
        if (sourcePriority(eventSource) > sourcePriority(sourceRef.current)) {
          sourceRef.current = eventSource;
        }
      } else if (sourceRef.current === 'none') {
        // Fallback if 500ms passed and we got nothing better
        sourceRef.current = 'relative';
      }

      // Reject events that are lower priority than our locked source
      if (sourcePriority(eventSource) < sourcePriority(sourceRef.current)) {
        return; 
      }

      // 2. Math & Orientation
      rawHeading = getCleanHeading(event);
      if (eventSource === 'ios') {
        currentAccuracy = (event as any).webkitCompassAccuracy;
        isSourceAbsolute = true;
      } else if (eventSource === 'absolute') {
        isSourceAbsolute = true;
      }

      if (rawHeading !== null) {
        // 3. Continuous Target Tracking & Angular Velocity
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
          // Reject physically impossible jumps as magnetic interference
          if (currentAngularVelocity < MAX_ACCEPTED_ANGULAR_VELOCITY) {
            const delta = angleDelta(rawHeading, targetHeadingRef.current);
            targetHeadingRef.current = normalize(targetHeadingRef.current + delta);
          }
        }
        
        // 4. Advanced Confidence System
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
              // Stability check for Android based on raw velocity
              if (currentAngularVelocity > NOISE_VELOCITY_HIGH) {
                currentConfidence = 'low'; // High interference / noisy
              } else if (currentAngularVelocity > NOISE_VELOCITY_MED) {
                currentConfidence = 'medium';
              } else {
                currentConfidence = 'high';
              }
            }
          } else {
            currentConfidence = 'unavailable'; // Relative fallback cannot provide true North
          }
        }

        // Always update raw refs for accurate velocity on next tick
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
  }, [permissionGranted]);

  // Visual Animation Loop (requestAnimationFrame) - ONLY updates visualHeadingRef for DOM controller to consume
  useEffect(() => {
    if (!permissionGranted) return;

    let lastReactUpdate = 0;

    const animate = (time: number) => {
      const target = targetHeadingRef.current;
      const current = visualHeadingRef.current;

      if (target !== null && current !== null) {
        const delta = angleDelta(target, current);
        const absDelta = Math.abs(delta);

        // Deadband filter
        if (absDelta > VISUAL_DEADBAND) {
          // Adaptive Smoothing
          let alpha = 0.7; // default fast
          if (absDelta < 2) alpha = 0.12;       // heavy
          else if (absDelta < 8) alpha = 0.25;  // normal
          else if (absDelta < 25) alpha = 0.45; // light

          visualHeadingRef.current = normalize(current + delta * alpha);
        }

        // Throttle React State updates for UI text purposes only
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
