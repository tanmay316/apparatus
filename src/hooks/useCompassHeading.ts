import { useState, useEffect, useCallback } from 'react';

export function useCompassHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);

  // Request permission for iOS 13+
  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceOrientationEvent as any).requestPermission();
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
      // Non-iOS 13+ devices don't need this explicit request
      setPermissionGranted(true);
      return true;
    }
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      let compassHeading = null;
      
      // iOS gives webkitCompassHeading
      if ((event as any).webkitCompassHeading) {
        compassHeading = (event as any).webkitCompassHeading;
      } 
      // Android / standard uses absolute alpha
      else if (event.absolute && event.alpha !== null) {
        // Absolute alpha is 0 when pointing North, but it grows counter-clockwise.
        // So heading is 360 - alpha.
        compassHeading = 360 - event.alpha;
      } else if (event.alpha !== null) {
        // Fallback to relative alpha if absolute is missing
        compassHeading = 360 - event.alpha;
      }

      if (compassHeading !== null) {
        setHeading(compassHeading);
      }
    };

    // Try absolute first, fallback to regular
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener);
    window.addEventListener('deviceorientation', handleOrientation as EventListener);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener);
    };
  }, [permissionGranted]);

  return { heading, error, requestPermission };
}
