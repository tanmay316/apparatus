/** Google encoded polyline (precision 5): compact storage for route geometry. */

export type LatLng = [number, number];

export function encodePolyline(points: LatLng[]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

export function decodePolyline(str: string): LatLng[] {
  const points: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Path length in km. */
export function pathKm(points: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const [a1, o1] = points[i - 1];
    const [a2, o2] = points[i];
    const p1 = (a1 * Math.PI) / 180;
    const p2 = (a2 * Math.PI) / 180;
    const dp = p2 - p1;
    const dl = ((o2 - o1) * Math.PI) / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    m += 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return m / 1000;
}
