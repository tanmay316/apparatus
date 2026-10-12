import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { encodeGeohash } from '@/lib/geohash';
import {
  CARDIO_TTL_MS, SHARE_PRECISION, START_HIDE_KM, WORKOUT_TTL_MS,
  clearPresence, inPrivacyZone, nearbyVisibilityOf, placeNameForCell, publishPresence, type NearbyActivity,
} from '@/services/nearby';

const TICK_MS = 20_000;
/** Re-publish this often even without moving (keeps expiresAt ahead of the TTL with margin). */
const REFRESH_MS = { cardio: 3 * 60_000, workout: 10 * 60_000 };

async function coarseFix(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      let perm = await Geolocation.checkPermissions();
      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') return null;
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Shares the user's approximate area on Nearby while a run or workout is being recorded (opt-in),
 * and removes it the moment the session ends, they opt out, or they enter their privacy zone.
 */
export function NearbyPresencePublisher() {
  const profile = useAuthStore(s => s.profile);
  const uid = profile?.uid;
  const visibility = nearbyVisibilityOf(profile);
  const cardioLive = useCardioStore(s => s.isTracking);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const live = cardioLive || workoutLive;
  const shared = useRef<{ uid: string; cell: string; at: number; audience: string } | null>(null);

  useEffect(() => {
    if (!uid || visibility === 'off' || !live) {
      if (shared.current) {
        void clearPresence(shared.current.uid);
        shared.current = null;
      }
      return;
    }

    let cancelled = false;
    let workoutFix: { lat: number; lng: number } | null = null;
    let busy = false;

    const hide = () => {
      if (shared.current) {
        void clearPresence(shared.current.uid);
        shared.current = null;
      }
    };

    const tick = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const cardio = useCardioStore.getState();
        const isCardio = cardio.isTracking && !!cardio.activityType;
        let pos: { lat: number; lng: number } | null = null;
        let activity: NearbyActivity;
        let startedAt: number;
        if (isCardio) {
          activity = cardio.activityType!;
          startedAt = cardio.startedAt || Date.now();
          // Keep the start (often home) private: appear only once the run is underway.
          if (cardio.distanceKm < START_HIDE_KM || !cardio.currentLocation) return hide();
          // A paused run is a stop somewhere (often a café or home), not training.
          if (cardio.isPaused) return hide();
          pos = cardio.currentLocation;
        } else {
          activity = 'workout';
          startedAt = useWorkoutStore.getState().startedAt || Date.now();
          workoutFix = workoutFix || await coarseFix();
          pos = workoutFix;
        }
        if (cancelled || !pos) return;
        if (inPrivacyZone(pos.lat, pos.lng)) return hide();

        const cell = encodeGeohash(pos.lat, pos.lng, SHARE_PRECISION);
        const prev = shared.current;
        const refresh = isCardio ? REFRESH_MS.cardio : REFRESH_MS.workout;
        if (prev && prev.cell === cell && prev.audience === visibility && Date.now() - prev.at < refresh) return;

        const place = await placeNameForCell(cell);
        if (cancelled) return;
        const current = useAuthStore.getState().profile;
        if (!current) return;
        await publishPresence(current, {
          audience: visibility,
          activity,
          lat: pos.lat,
          lng: pos.lng,
          startedAt,
          place,
          ttlMs: isCardio ? CARDIO_TTL_MS : WORKOUT_TTL_MS,
        });
        shared.current = { uid: current.uid, cell, at: Date.now(), audience: visibility };
      } catch (err) {
        console.warn('[Nearby] presence update failed', err);
      } finally {
        busy = false;
      }
    };

    void tick();
    const id = window.setInterval(() => { void tick(); }, TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [uid, visibility, live]);

  // Leaving the app entirely (sign-out) must not leave a stale presence behind.
  useEffect(() => () => {
    if (shared.current) void clearPresence(shared.current.uid);
  }, []);

  return null;
}
