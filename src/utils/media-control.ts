import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

/** Snapshot of the system "now playing" media session (e.g. Spotify). */
export interface NowPlayingState {
  granted: boolean;
  hasSession: boolean;
  packageName?: string;
  appName?: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  /** data: URL (JPEG) of the session artwork. */
  artwork?: string;
  artworkUrl?: string;
  durationMs?: number;
  positionMs?: number;
  playbackSpeed?: number;
  isPlaying?: boolean;
  canSkipNext?: boolean;
  canSkipPrevious?: boolean;
  canSeek?: boolean;
  /** Epoch ms at which positionMs was sampled. */
  timestamp: number;
}

interface MediaControlPlugin {
  isAccessGranted(): Promise<{ granted: boolean }>;
  openAccessSettings(): Promise<void>;
  startObserving(): Promise<NowPlayingState>;
  stopObserving(): Promise<void>;
  getNowPlaying(): Promise<NowPlayingState>;
  play(): Promise<void>;
  pause(): Promise<void>;
  togglePlayPause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(options: { positionMs: number }): Promise<void>;
  openApp(): Promise<void>;
  addListener(eventName: 'mediaChange', listener: (state: NowPlayingState) => void): Promise<PluginListenerHandle>;
}

export const MediaControl = registerPlugin<MediaControlPlugin>('MediaControl');

/**
 * Controlling other apps' playback needs Android's MediaSession APIs.
 * Browsers and iOS expose no equivalent to third-party apps.
 */
export const isMediaControlSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MediaControl');
