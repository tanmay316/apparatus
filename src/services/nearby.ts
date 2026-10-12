import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { decodeGeohash, distanceKm, encodeGeohash, geohashNeighbourhood } from '@/lib/geohash';
import { shareablePhotoURL } from '@/utils/image-compression';
import type { UserProfile } from '@/types';

/**
 * Nearby: opt-in "who's training around me". Privacy by design:
 *  - only while a workout/run is being recorded, removed when it ends;
 *  - only a ~1 km geohash cell is stored (never coordinates or the route);
 *  - hidden for the first 400 m of a run and inside the user's on-device privacy zone;
 *  - audience is followers or everyone, enforced by Firestore rules.
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
  geohash4: string;
  geohash5: string;
  geohash6: string;
  place?: string;
  startedAt?: Timestamp;
  updatedAt?: Timestamp;
  expiresAt?: Timestamp;
}

export interface NearbyAthlete extends NearbyPresence {
  /** Approximate distance from the viewer (cell centre to viewer). */
  distanceKm: number;
  /** Display position: cell centre nudged by a stable per-user offset, never the real spot. */
  lat: number;
  lng: number;
}

const COLLECTION = 'nearby_presence';
/** Storage precision (~1.2 × 0.6 km); queries use the 3×3 block of ~4.9 km (p5) or ~20–39 km (p4) cells. */
export const SHARE_PRECISION = 6;
/** Runs appear only after this much distance, so the start (often home) is never shown. */
export const START_HIDE_KM = 0.4;
/** Native heartbeat keeps run presence fresh; workouts have none, so they get a longer window. */
export const CARDIO_TTL_MS = 10 * 60_000;
export const WORKOUT_TTL_MS = 90 * 60_000;

export function nearbyVisibilityOf(profile?: Pick<UserProfile, 'privacySettings'> | null): NearbyVisibility {
  const v = profile?.privacySettings?.nearbyVisibility;
  if (v !== 'followers' && v !== 'everyone') return 'off';
  // A private profile is only ever shown to followers.
  return profile?.privacySettings?.profileVisibility === 'private' ? 'followers' : v;
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

/** True when the point (or the cell it would be shown in) touches the privacy zone. */
export function inPrivacyZone(lat: number, lng: number, zone = getPrivacyZone()): boolean {
  if (!zone) return false;
  // Pad by the cell size so the shared cell never reveals the zone either.
  return distanceKm(lat, lng, zone.lat, zone.lng) * 1000 <= zone.radiusM + 800;
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

export async function publishPresence(
  profile: Pick<UserProfile, 'uid' | 'displayName' | 'username' | 'photoURL'>,
  opts: { audience: NearbyAudience; activity: NearbyActivity; lat: number; lng: number; startedAt: number; place?: string; ttlMs: number },
) {
  const geohash6 = encodeGeohash(opts.lat, opts.lng, SHARE_PRECISION);
  await setDoc(doc(db, COLLECTION, profile.uid), {
    uid: profile.uid,
    displayName: (profile.displayName || 'Athlete').slice(0, 80),
    username: (profile.username || '').slice(0, 40),
    photoURL: shareablePhotoURL(profile.photoURL).slice(0, 1000),
    activity: opts.activity,
    audience: opts.audience,
    geohash4: geohash6.slice(0, 4),
    geohash5: geohash6.slice(0, 5),
    geohash6,
    ...(opts.place ? { place: opts.place.slice(0, 60) } : {}),
    startedAt: Timestamp.fromMillis(opts.startedAt),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + opts.ttlMs),
  });
  sharedCell = geohash6;
  return geohash6;
}

export async function clearPresence(uid: string) {
  sharedCell = null;
  await deleteDoc(doc(db, COLLECTION, uid)).catch(() => {});
}

// ─── Discovery ────────────────────────────────────────────────────

/** Stable 0..1 pseudo-random numbers per user+cell, so a marker doesn't jump between renders. */
function jitter(seed: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 1000) / 1000;
  const b = ((Math.imul(h, 2654435761) >>> 0) % 1000) / 1000;
  return [a, b];
}

function toAthlete(p: NearbyPresence, viewer: { lat: number; lng: number }): NearbyAthlete {
  const cell = decodeGeohash(p.geohash6);
  const [a, b] = jitter(`${p.uid}:${p.geohash6}`);
  return {
    ...p,
    distanceKm: distanceKm(viewer.lat, viewer.lng, cell.lat, cell.lng),
    lat: cell.lat + (a - 0.5) * cell.latErr * 1.2,
    lng: cell.lng + (b - 0.5) * cell.lngErr * 1.2,
  };
}

/** "<1 km", "~2 km", "~15 km": cells are ~1 km, so nothing finer is ever implied. */
export function formatNearbyDistance(km: number): string {
  if (km < 1.2) return '<1 km';
  return `~${Math.round(km)} km`;
}

/**
 * Live list of people training within `radiusKm` of the viewer: everyone who shares publicly in the
 * surrounding cells, plus people the viewer follows who share with followers.
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
      .filter(p => p.uid !== viewerUid && (p.expiresAt?.toMillis?.() ?? 0) > now)
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
  // p5 cells (~4.9 km) cover a 5 km radius around the viewer; wider searches use p4.
  const precision = radiusKm <= 5 ? 5 : 4;
  const cells = geohashNeighbourhood(viewer.lat, viewer.lng, precision);
  const unsubs = [listen('everyone', query(coll, where('audience', '==', 'everyone'), where(`geohash${precision}`, 'in', cells), limit(100)))];
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
