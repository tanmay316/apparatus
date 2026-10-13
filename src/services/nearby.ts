import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { decodeGeohash, distanceKm, encodeGeohash, geohashNeighbourhood } from '@/lib/geohash';
import { decodePolyline, encodePolyline, type LatLng } from '@/lib/polyline';
import { simplifyRoute } from '@/lib/route-simplify';
import { shareablePhotoURL } from '@/utils/image-compression';
import type { UserProfile } from '@/types';

/**
 * Nearby: opt-in "who's training around me" (Strava-style). People are listed only while a
 * run/ride/walk/workout is being recorded, with their live position and path; never inside their
 * privacy zone. Audience is followers or everyone, enforced by Firestore rules.
 */

export type NearbyAudience = 'followers' | 'everyone';
export type NearbyVisibility = 'off' | NearbyAudience;
export type NearbyActivity = 'run' | 'walk' | 'cycle' | 'workout';

export interface NearbyPresence {
  uid: string;
  displayName: string;
  username?: string;
  photoURL?: string;
  activity: NearbyActivity;
  audience: NearbyAudience;
  /** Older app versions also wrote 'finished' cards; those are ignored. */
  status?: 'live' | 'finished';
  lat?: number;
  lng?: number;
  geohash4: string;
  geohash5: string;
  geohash6: string;
  place?: string;
  /** Live cardio only: the path so far (encoded polyline, privacy-zone points removed). */
  trail?: string;
  startedAt?: Timestamp;
  updatedAt?: Timestamp;
  expiresAt?: Timestamp;
}

export interface NearbyAthlete extends NearbyPresence {
  distanceKm: number;
  lat: number;
  lng: number;
  path?: LatLng[];
}

const COLLECTION = 'nearby_presence';
export const SHARE_PRECISION = 6;
/**
 * Live presence must survive a locked/minimised phone (JS frozen), so it lasts close to the rules'
 * 8 h cap and is removed explicitly when the session ends.
 */
export const LIVE_TTL_MS = 7.5 * 60 * 60_000;

export function nearbyVisibilityOf(profile?: Pick<UserProfile, 'privacySettings'> | null): NearbyVisibility {
  const v = profile?.privacySettings?.nearbyVisibility;
  return v === 'followers' || v === 'everyone' ? v : 'off';
}

// ─── Privacy zone (kept on this device only) ─────────────────────

const ZONE_KEY = 'apparatus.nearby-zone.v1';
export interface PrivacyZone { lat: number; lng: number; radiusM: number }

export function getPrivacyZone(): PrivacyZone | null {
  try {
    const z = JSON.parse(localStorage.getItem(ZONE_KEY) || 'null');
    if (z && Number.isFinite(z.lat) && Number.isFinite(z.lng) && Number.isFinite(z.radiusM)) return z;
  } catch { /* corrupt value */ }
  return null;
}

export function setPrivacyZone(zone: PrivacyZone | null) {
  try {
    if (zone) localStorage.setItem(ZONE_KEY, JSON.stringify(zone));
    else localStorage.removeItem(ZONE_KEY);
  } catch { /* storage unavailable */ }
}

/** True when the point is inside the privacy zone. */
export function inPrivacyZone(lat: number, lng: number, zone = getPrivacyZone()): boolean {
  if (!zone) return false;
  return distanceKm(lat, lng, zone.lat, zone.lng) * 1000 <= zone.radiusM;
}

// ─── Coarse place names ───────────────────────────────────────────

const PLACE_CACHE_KEY = 'apparatus.nearby-places.v1';
const PUBLIC_PLACE = /^(park|garden|pitch|track|stadium|sports_centre|fitness_centre|fitness_station|gym|swimming_pool|recreation_ground|playground|beach|nature_reserve|golf_course|ice_rink|dog_park)$/;

/**
 * A public landmark (park, stadium, gym) or the neighbourhood name for a cell. Street and house
 * details are never used. Cached per cell so each area is looked up at most once.
 */
export async function placeNameForCell(geohash6: string): Promise<string | undefined> {
  let cache: Record<string, string> = {};
  try { cache = JSON.parse(localStorage.getItem(PLACE_CACHE_KEY) || '{}'); } catch { /* reset */ }
  if (geohash6 in cache) return cache[geohash6] || undefined;
  const { lat, lng } = decodeGeohash(geohash6);
  let name = '';
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&zoom=16&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const type = String(data?.type || '');
      const a = data?.address || {};
      if (data?.name && PUBLIC_PLACE.test(type)) name = String(data.name);
      else name = String(a.park || a.neighbourhood || a.suburb || a.quarter || a.village || a.town || a.city_district || a.city || '');
    }
  } catch { /* offline: no label */ }
  name = name.slice(0, 60);
  const keys = Object.keys(cache);
  if (keys.length > 200) delete cache[keys[0]];
  cache[geohash6] = name;
  try { localStorage.setItem(PLACE_CACHE_KEY, JSON.stringify(cache)); } catch { /* full */ }
  return name || undefined;
}

// ─── Publishing ───────────────────────────────────────────────────

/** Cell currently shared by this device (null when hidden); handed to the native run heartbeat. */
let sharedCell: string | null = null;
export const getSharedCell = () => sharedCell;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const MAX_TRAIL_POINTS = 300;
const MAX_TRAIL_CHARS = 20_000;

/** Encoded path of a live run so far, without points inside the privacy zone. */
export function buildTrail(route: { lat: number; lng: number }[], zone = getPrivacyZone()): string | undefined {
  const visible = route.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !inPrivacyZone(p.lat, p.lng, zone));
  if (visible.length < 2) return undefined;
  let max = MAX_TRAIL_POINTS;
  let encoded = '';
  do {
    encoded = encodePolyline(simplifyRoute(visible, max).map(p => [p.lat, p.lng] as LatLng));
    max = Math.floor(max * 0.7);
  } while (encoded.length > MAX_TRAIL_CHARS && max > 20);
  return encoded.length <= MAX_TRAIL_CHARS ? encoded : undefined;
}

type PresenceProfile = Pick<UserProfile, 'uid' | 'displayName' | 'username' | 'photoURL'>;

function presenceDoc(
  profile: PresenceProfile,
  opts: { audience: NearbyAudience; activity: NearbyActivity; lat: number; lng: number; startedAt: number; place?: string; ttlMs: number; trail?: string },
) {
  const geohash6 = encodeGeohash(opts.lat, opts.lng, SHARE_PRECISION);
  return {
    geohash6,
    data: {
      uid: profile.uid,
      displayName: (profile.displayName || 'Athlete').slice(0, 80),
      username: (profile.username || '').slice(0, 40),
      photoURL: shareablePhotoURL(profile.photoURL).slice(0, 1000),
      activity: opts.activity,
      audience: opts.audience,
      status: 'live',
      lat: round5(opts.lat),
      lng: round5(opts.lng),
      geohash4: geohash6.slice(0, 4),
      geohash5: geohash6.slice(0, 5),
      geohash6,
      ...(opts.place ? { place: opts.place.slice(0, 60) } : {}),
      ...(opts.trail ? { trail: opts.trail } : {}),
      startedAt: Timestamp.fromMillis(opts.startedAt),
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + opts.ttlMs),
    },
  };
}

export async function publishPresence(
  profile: PresenceProfile,
  opts: { audience: NearbyAudience; activity: NearbyActivity; lat: number; lng: number; startedAt: number; place?: string; ttlMs: number; trail?: string },
) {
  const { geohash6, data } = presenceDoc(profile, opts);
  await setDoc(doc(db, COLLECTION, profile.uid), data);
  sharedCell = geohash6;
  return geohash6;
}

export async function clearPresence(uid: string) {
  sharedCell = null;
  await deleteDoc(doc(db, COLLECTION, uid)).catch(() => {});
}

// ─── Discovery ────────────────────────────────────────────────────

function toAthlete(p: NearbyPresence, viewer: { lat: number; lng: number }): NearbyAthlete {
  // Older app versions only write the cell; their background heartbeat may also move the cell without the point.
  const hasPoint = Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && encodeGeohash(p.lat!, p.lng!, SHARE_PRECISION) === p.geohash6;
  const point = hasPoint ? { lat: p.lat!, lng: p.lng! } : decodeGeohash(p.geohash6);
  let path: LatLng[] | undefined;
  if (typeof p.trail === 'string' && p.trail) {
    try { path = decodePolyline(p.trail); } catch { /* malformed trail: show the point only */ }
  }
  return {
    ...p,
    lat: point.lat,
    lng: point.lng,
    distanceKm: distanceKm(viewer.lat, viewer.lng, point.lat, point.lng),
    path,
  };
}

export function formatNearbyDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/**
 * People training right now within `radiusKm` of the viewer: everyone who shares publicly, plus
 * followed people who share with followers.
 */
export function subscribeNearby(
  viewerUid: string,
  viewer: { lat: number; lng: number },
  followingUids: string[],
  radiusKm: number,
  onChange: (athletes: NearbyAthlete[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const sources = new Map<string, NearbyPresence[]>();
  const emit = () => {
    const now = Date.now();
    const byUid = new Map<string, NearbyPresence>();
    for (const list of sources.values()) for (const p of list) byUid.set(p.uid, p);
    const athletes = [...byUid.values()]
      .filter(p => p.uid !== viewerUid && p.status !== 'finished' && (p.expiresAt?.toMillis?.() ?? 0) > now)
      .map(p => toAthlete(p, viewer))
      .filter(a => a.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    onChange(athletes);
  };
  const listen = (key: string, q: ReturnType<typeof query>) => onSnapshot(q, snap => {
    sources.set(key, snap.docs.map(d => d.data() as NearbyPresence));
    emit();
  }, err => {
    sources.set(key, []);
    emit();
    onError?.(err);
  });

  const coll = collection(db, COLLECTION);
  let everyone;
  if (radiusKm <= 15) {
    // p5 cells (~4.9 km) cover a 5 km radius around the viewer; p4 (~20–39 km) cover 15 km.
    const precision = radiusKm <= 5 ? 5 : 4;
    const cells = geohashNeighbourhood(viewer.lat, viewer.lng, precision);
    everyone = query(coll, where('audience', '==', 'everyone'), where(`geohash${precision}`, 'in', cells), limit(200));
  } else {
    everyone = query(coll, where('audience', '==', 'everyone'), limit(300));
  }
  const unsubs = [listen('everyone', everyone)];
  // Capped so a huge following list can't open dozens of listeners.
  const others = [...new Set(followingUids)].filter(u => u && u !== viewerUid).slice(0, 100);
  for (let i = 0; i < others.length; i += 10) {
    const chunk = others.slice(i, i + 10);
    unsubs.push(listen(`followers-${i}`, query(coll, where('audience', '==', 'followers'), where('uid', 'in', chunk))));
  }
  // Expiry is time-based, so re-filter even when nothing changes in Firestore.
  const tick = window.setInterval(emit, 30_000);
  return () => {
    window.clearInterval(tick);
    unsubs.forEach(u => u());
  };
}
