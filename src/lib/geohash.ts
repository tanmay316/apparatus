// Geohash cells: used to query Nearby presence by area.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision: number): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngMin = mid; } else { ch <<= 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export interface GeohashCell { lat: number; lng: number; latErr: number; lngErr: number }

/** Centre of a cell and its half-size in degrees. */
export function decodeGeohash(hash: string): GeohashCell {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let even = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) break;
    for (let b = 4; b >= 0; b--) {
      const bitOn = (idx >> b) & 1;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (bitOn) lngMin = mid; else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitOn) latMin = mid; else latMax = mid;
      }
      even = !even;
    }
  }
  return { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2, latErr: (latMax - latMin) / 2, lngErr: (lngMax - lngMin) / 2 };
}

/** The cell containing the point plus its 8 neighbours. */
export function geohashNeighbourhood(lat: number, lng: number, precision: number): string[] {
  const own = decodeGeohash(encodeGeohash(lat, lng, precision));
  const cells = new Set<string>();
  for (const dLat of [-1, 0, 1]) {
    for (const dLng of [-1, 0, 1]) {
      const la = Math.max(-89.999, Math.min(89.999, own.lat + dLat * own.latErr * 2));
      let ln = own.lng + dLng * own.lngErr * 2;
      if (ln > 180) ln -= 360;
      if (ln < -180) ln += 360;
      cells.add(encodeGeohash(la, ln, precision));
    }
  }
  return [...cells];
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
