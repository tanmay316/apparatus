import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { distanceKm, encodeGeohash } from '@/lib/geohash';
import { currentFix } from '@/lib/current-fix';
import {
  LIVE_TTL_MS, SHARE_PRECISION, buildTrail,
  clearPresence, inPrivacyZone, nearbyVisibilityOf, placeNameForCell, publishPresence, type NearbyActivity,
} from '@/services/nearby';

const TICK_MS = 15_000;
/** Re-publish this often even without moving (keeps expiresAt ahead of the TTL with margin). */
const REFRESH_MS = { cardio: 60_000, workout: 10 * 60_000 };
/** Movement that triggers an immediate update. */
const MOVE_KM = 0.04;
/** A gym doesn't move; refresh its fix now and then in case the first one was poor. */
const WORKOUT_FIX_MS = 5 * 60_000;

/**
 * Shares the user's live position on Nearby from the moment a run or workout starts until it ends
 * (opt-in). The long expiry keeps them listed while the phone is locked; leaving the privacy zone,
 * opting out or ending the session removes it.
 */
export function NearbyPresencePublisher() {
  const profile = useAuthStore(s => s.profile);
  const uid = profile?.uid;
  const visibility = nearbyVisibilityOf(profile);
  const cardioLive = useCardioStore(s => s.isTracking);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const live = cardioLive || workoutLive;
  const shared = useRef<{ uid: string; lat: number; lng: number; at: number; audience: string } | null>(null);

  useEffect(() => {
    if (!uid || visibility === 'off' || !live) {
      if (shared.current) {
        void clearPresence(shared.current.uid);
        shared.current = null;
      }
      return;
    }

    let cancelled = false;
    let fallbackFix: { lat: number; lng: number; at: number } | null = null;
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
          pos = cardio.currentLocation;
        } else {
          activity = 'workout';
          startedAt = useWorkoutStore.getState().startedAt || Date.now();
        }
        // Before the first GPS point of a run (and for gym sessions) use a one-off fix, so people appear right away.
        if (!pos) {
          if (!fallbackFix || Date.now() - fallbackFix.at > WORKOUT_FIX_MS) {
            const fix = await currentFix();
            if (fix) fallbackFix = { ...fix, at: Date.now() };
          }
          pos = fallbackFix;
        }
        if (cancelled || !pos) return;
        if (inPrivacyZone(pos.lat, pos.lng)) return hide();

        const prev = shared.current;
        const refresh = isCardio ? REFRESH_MS.cardio : REFRESH_MS.workout;
        if (
          prev && prev.audience === visibility && Date.now() - prev.at < refresh
          && distanceKm(prev.lat, prev.lng, pos.lat, pos.lng) < MOVE_KM
        ) return;

        const place = await placeNameForCell(encodeGeohash(pos.lat, pos.lng, SHARE_PRECISION));
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
          ttlMs: LIVE_TTL_MS,
          trail: isCardio ? buildTrail(cardio.routePoints) : undefined,
        });
        shared.current = { uid: current.uid, lat: pos.lat, lng: pos.lng, at: Date.now(), audience: visibility };
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
