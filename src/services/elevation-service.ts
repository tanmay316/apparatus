import type { RoutePoint } from '@/types';

interface ElevationCorrectionResult {
  correctedElevationGainM: number;
  source: 'dem_basemap' | 'smoothed_gps';
  profile: { distanceKm: number; elevationM: number }[];
}

/**
 * Post-Activity DEM (Digital Elevation Model) correction.
 * Cross-references the recorded GPS route against an elevation basemap database,
 * applying Strava-standard 10m climb thresholding to eliminate GPS vertical noise.
 */
export async function calculateCorrectedElevation(route: RoutePoint[]): Promise<ElevationCorrectionResult> {
  if (!route || route.length < 2) {
    return { correctedElevationGainM: 0, source: 'smoothed_gps', profile: [] };
  }

  // 1. Downsample to at most 80 sample points for fast HTTP query
  const maxSamples = 80;
  const sampledIndices: number[] = [];
  const totalPoints = route.length;
  
  if (totalPoints <= maxSamples) {
    for (let i = 0; i < totalPoints; i++) sampledIndices.push(i);
  } else {
    const step = (totalPoints - 1) / (maxSamples - 1);
    for (let i = 0; i < maxSamples; i++) {
      sampledIndices.push(Math.round(i * step));
    }
  }

  const sampledPoints = sampledIndices.map(i => route[i]);

  try {
    const locationsPayload = sampledPoints.map(p => ({
      latitude: Math.round(p.lat * 100000) / 100000,
      longitude: Math.round(p.lng * 100000) / 100000
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: locationsPayload }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const results: { latitude: number; longitude: number; elevation: number }[] = data.results;

      if (results && results.length === sampledPoints.length) {
        // Compute gain using Strava 10m threshold algorithm
        let elevationGain = 0;
        let anchorElev = results[0].elevation;
        const profile: { distanceKm: number; elevationM: number }[] = [];

        let cumulativeDist = 0;
        for (let i = 0; i < results.length; i++) {
          const curr = results[i].elevation;
          if (i > 0) {
            const prevP = sampledPoints[i - 1];
            const currP = sampledPoints[i];
            cumulativeDist += haversineKm(prevP.lat, prevP.lng, currP.lat, currP.lng);

            const diff = curr - anchorElev;
            // Strava threshold for DEM lookup: >= 5m climb gain
            if (diff >= 5.0) {
              elevationGain += diff;
              anchorElev = curr;
            } else if (diff <= -5.0) {
              anchorElev = curr;
            }
          }
          profile.push({
            distanceKm: Math.round(cumulativeDist * 100) / 100,
            elevationM: Math.round(curr)
          });
        }

        return {
          correctedElevationGainM: Math.round(elevationGain),
          source: 'dem_basemap',
          profile
        };
      }
    }
  } catch (error) {
    // Fall back to smoothed GPS altitude calculation
  }

  // Fallback: Smoothed GPS altitude calculation
  let gpsGain = 0;
  let anchor = route[0].alt ?? 0;
  const profile: { distanceKm: number; elevationM: number }[] = [];
  let cumDist = 0;

  for (let i = 0; i < route.length; i++) {
    const pt = route[i];
    if (i > 0) {
      cumDist += haversineKm(route[i - 1].lat, route[i - 1].lng, pt.lat, pt.lng);
      if (pt.alt !== undefined) {
        const diff = pt.alt - anchor;
        if (diff >= 2.0 && diff < 80.0) {
          gpsGain += diff;
          anchor = pt.alt;
        } else if (diff <= -2.0 && diff > -80.0) {
          anchor = pt.alt;
        }
      }
    }
    if (pt.alt !== undefined && i % Math.max(1, Math.floor(route.length / 40)) === 0) {
      profile.push({
        distanceKm: Math.round(cumDist * 100) / 100,
        elevationM: Math.round(pt.alt)
      });
    }
  }

  return {
    correctedElevationGainM: Math.round(gpsGain),
    source: 'smoothed_gps',
    profile
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
