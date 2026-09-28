import { useCallback, useEffect, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { MediaControl, isMediaControlSupported, type NowPlayingState } from '@/utils/media-control';

/** Interpolated playback position for a snapshot at wall-clock time `now`. */
export function positionAt(state: NowPlayingState | null, now = Date.now()): number {
  if (!state?.hasSession) return 0;
  const base = state.positionMs || 0;
  const elapsed = state.isPlaying ? Math.max(0, now - state.timestamp) * (state.playbackSpeed || 1) : 0;
  const pos = base + elapsed;
  return state.durationMs ? Math.min(pos, state.durationMs) : pos;
}

/**
 * Mirrors the phone's active media session (Spotify, YouTube Music, …) while
 * `active` is true. Android APK only; returns `supported: false` elsewhere.
 */
export function useNowPlaying(active: boolean) {
  const supported = isMediaControlSupported();
  const [state, setState] = useState<NowPlayingState | null>(null);

  useEffect(() => {
    if (!supported || !active) return;
    let cancelled = false;
    let handle: PluginListenerHandle | undefined;

    MediaControl.addListener('mediaChange', (s) => {
      if (!cancelled) setState(s);
    }).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    }).catch(() => {});

    const refresh = () => {
      MediaControl.startObserving()
        .then((s) => { if (!cancelled) setState(s); })
        .catch(() => {});
    };
    refresh();

    // Re-check after the user returns from the notification-access settings screen.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      handle?.remove();
      MediaControl.stopObserving().catch(() => {});
    };
  }, [supported, active]);

  const run = useCallback((fn: () => Promise<void>) => {
    fn().catch(() => {
      MediaControl.getNowPlaying().then(setState).catch(() => {});
    });
  }, []);

  const togglePlayPause = useCallback(() => {
    setState((s) => (s && s.hasSession
      ? { ...s, positionMs: positionAt(s), timestamp: Date.now(), isPlaying: !s.isPlaying }
      : s));
    run(() => MediaControl.togglePlayPause());
  }, [run]);

  const next = useCallback(() => run(() => MediaControl.next()), [run]);
  const previous = useCallback(() => run(() => MediaControl.previous()), [run]);

  const seekTo = useCallback((positionMs: number) => {
    setState((s) => (s ? { ...s, positionMs, timestamp: Date.now() } : s));
    run(() => MediaControl.seekTo({ positionMs: Math.round(positionMs) }));
  }, [run]);

  const openSettings = useCallback(() => run(() => MediaControl.openAccessSettings()), [run]);
  const openApp = useCallback(() => run(() => MediaControl.openApp()), [run]);

  return { supported, state, togglePlayPause, next, previous, seekTo, openSettings, openApp };
}
