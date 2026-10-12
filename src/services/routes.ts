import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { idbGet, idbSet } from '@/lib/persist';
import { decodePolyline, encodePolyline, type LatLng } from '@/lib/polyline';
import { apiRequest } from '@/services/nutrition-api';
import type { CardioActivityType } from '@/types';

export interface PlannedRoute {
  name: string;
  type: CardioActivityType;
  distanceKm: number;
  elevationGainM: number | null;
  elevationProfile: number[] | null;
  points: LatLng[];
  source: 'suggested' | 'drawn';
}

export interface SavedRoute extends PlannedRoute {
  id: string;
  createdAt: number;
  /** Stored on this phone, so it opens without a connection. */
  offline?: boolean;
}

interface ApiRoute {
  id?: string;
  name?: string;
  distanceKm: number;
  elevationGainM: number | null;
  elevationProfile: number[] | null;
  points: LatLng[];
}

// ─── Planner API (Pro, backend) ──────────────────────────────

export async function suggestRoutes(lat: number, lng: number, distanceKm: number, type: CardioActivityType, seed = 0): Promise<PlannedRoute[]> {
  const res = await apiRequest<{ routes: ApiRoute[] }>('/routes/suggest', {
    method: 'POST',
    body: JSON.stringify({ lat, lng, distanceKm, type, seed }),
  });
  return res.routes.map(r => ({
    name: r.name || `${distanceKm} km loop`,
    type,
    distanceKm: r.distanceKm,
    elevationGainM: r.elevationGainM,
    elevationProfile: r.elevationProfile,
    points: r.points,
    source: 'suggested',
  }));
}

export async function snapRoute(waypoints: LatLng[], type: CardioActivityType): Promise<ApiRoute> {
  return apiRequest<ApiRoute>('/routes/snap', { method: 'POST', body: JSON.stringify({ type, points: waypoints }) });
}

export async function routeElevation(points: LatLng[]): Promise<{ elevationGainM: number | null; elevationProfile: number[] | null }> {
  return apiRequest('/routes/elevation', { method: 'POST', body: JSON.stringify({ points: points.slice(0, 2000) }) });
}

// ─── Saved routes (Firestore users/{uid}/routes + offline copy on the phone) ──

const OFFLINE_KEY = (uid: string) => `offline-routes.${uid}`;

async function readOffline(uid: string): Promise<Record<string, SavedRoute>> {
  return (await idbGet<Record<string, SavedRoute>>(OFFLINE_KEY(uid)).catch(() => undefined)) || {};
}

function fromDoc(id: string, d: any): SavedRoute {
  const created = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Number(d.createdAt) || Date.now();
  return {
    id,
    name: d.name || 'Route',
    type: d.type || 'run',
    distanceKm: Number(d.distanceKm) || 0,
    elevationGainM: typeof d.elevationGainM === 'number' ? d.elevationGainM : null,
    elevationProfile: Array.isArray(d.elevationProfile) ? d.elevationProfile : null,
    points: typeof d.path === 'string' ? decodePolyline(d.path) : [],
    source: d.source === 'drawn' ? 'drawn' : 'suggested',
    createdAt: created,
  };
}

/** Saved routes, newest first. Falls back to the copies stored on the phone when offline. */
export async function getSavedRoutes(uid: string): Promise<SavedRoute[]> {
  const offline = await readOffline(uid);
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'routes'), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ ...fromDoc(d.id, d.data()), offline: !!offline[d.id] }));
  } catch (err) {
    const local = Object.values(offline).sort((a, b) => b.createdAt - a.createdAt);
    if (local.length) return local.map(r => ({ ...r, offline: true }));
    throw err;
  }
}

export async function getSavedRoute(uid: string, id: string): Promise<SavedRoute | null> {
  const offline = await readOffline(uid);
  if (offline[id]) return { ...offline[id], offline: true };
  const list = await getSavedRoutes(uid).catch(() => []);
  return list.find(r => r.id === id) || null;
}

export async function saveRoute(uid: string, route: PlannedRoute, offline = true): Promise<SavedRoute> {
  const ref = doc(collection(db, 'users', uid, 'routes'));
  const name = route.name.trim().slice(0, 80) || 'Route';
  await setDoc(ref, {
    name,
    type: route.type,
    distanceKm: Math.round(route.distanceKm * 100) / 100,
    elevationGainM: route.elevationGainM ?? null,
    elevationProfile: route.elevationProfile?.slice(0, 120) ?? null,
    path: encodePolyline(route.points),
    source: route.source,
    createdAt: serverTimestamp(),
  });
  const saved: SavedRoute = { ...route, name, id: ref.id, createdAt: Date.now() };
  if (offline) await setRouteOffline(uid, saved, true);
  return { ...saved, offline };
}

export async function renameRoute(uid: string, id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80) || 'Route';
  await setDoc(doc(db, 'users', uid, 'routes', id), { name: clean }, { merge: true });
  const offline = await readOffline(uid);
  if (offline[id]) {
    offline[id] = { ...offline[id], name: clean };
    await idbSet(OFFLINE_KEY(uid), offline);
  }
}

export async function deleteRoute(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'routes', id));
  await setRouteOffline(uid, { id } as SavedRoute, false);
}

export async function setRouteOffline(uid: string, route: SavedRoute, on: boolean): Promise<void> {
  const offline = await readOffline(uid);
  if (on) offline[route.id] = { ...route, offline: true };
  else delete offline[route.id];
  await idbSet(OFFLINE_KEY(uid), offline);
}

/** Rough moving time from a typical pace for the activity (min/km). */
export function estimateRouteSec(route: Pick<PlannedRoute, 'distanceKm' | 'elevationGainM' | 'type'>, paceSecPerKm?: number): number {
  const base = paceSecPerKm || (route.type === 'cycle' ? 150 : route.type === 'walk' ? 720 : 360);
  const climb = (route.elevationGainM || 0) * (route.type === 'cycle' ? 4 : 6);
  return Math.round(route.distanceKm * base + climb);
}
