import { useEffect, useState } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { positionAt, useNowPlaying } from '@/hooks/useNowPlaying';

const HINT_KEY = 'apparatus_music_spotify_hint_dismissed';
// Keep the card up briefly after pausing so playback can be resumed from here.
const PAUSE_GRACE_MS = 60_000;

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Live "now playing" card, shown only while music is playing on the phone.
 * Styled with the CardioTracker theme variables (--text, --muted, --border, --bg, --sienna).
 */
export function NowPlayingCard({ className = '' }: { className?: string }) {
  const { supported, state, togglePlayPause, next, previous, seekTo, openApp } = useNowPlaying(true);
  const [now, setNow] = useState(() => Date.now());
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem(HINT_KEY) === '1');
  const [artFailed, setArtFailed] = useState(false);
  const [lastPlayingAt, setLastPlayingAt] = useState(0);

  const playing = Boolean(state?.hasSession && state.isPlaying);
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setLastPlayingAt(t);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (playing || !lastPlayingAt) return;
    const t = window.setTimeout(() => setNow(Date.now()), Math.max(0, lastPlayingAt + PAUSE_GRACE_MS - Date.now()) + 50);
    return () => window.clearTimeout(t);
  }, [playing, lastPlayingAt]);

  const art = state?.artwork || state?.artworkUrl;
  useEffect(() => setArtFailed(false), [art]);

  if (!supported || !state) return null;
  if (!playing && (!lastPlayingAt || now - lastPlayingAt > PAUSE_GRACE_MS)) return null;

  const controls = (size: 'sm' | 'md') => (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={previous}
        disabled={state.canSkipPrevious === false}
        className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text)] disabled:opacity-30 active:scale-90 transition-transform"
        aria-label="Previous track"
      >
        <SkipBack size={size === 'sm' ? 17 : 18} fill="currentColor" />
      </button>
      <button
        onClick={togglePlayPause}
        className={`${size === 'sm' ? 'w-9 h-9' : 'w-10 h-10'} rounded-full flex items-center justify-center active:scale-90 transition-transform`}
        style={{ background: 'var(--text)', color: 'var(--bg)' }}
        aria-label={playing ? 'Pause music' : 'Play music'}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <button
        onClick={next}
        disabled={state.canSkipNext === false}
        className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text)] disabled:opacity-30 active:scale-90 transition-transform"
        aria-label="Next track"
      >
        <SkipForward size={size === 'sm' ? 17 : 18} fill="currentColor" />
      </button>
    </div>
  );

  if (state.basic) {
    return (
      <div className={`rounded-[22px] border border-[var(--border)] bg-[var(--bg)] pl-3 pr-1.5 py-1.5 ${className}`}>
        <div className="flex items-center gap-3">
          <Music2 size={16} className="text-[var(--muted)] shrink-0" />
          <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-[var(--text)] truncate">
            {playing ? 'Music playing' : 'Music paused'}
          </span>
          {controls('sm')}
        </div>
        {!hintDismissed && (
          <div className="flex items-start gap-2 pr-1.5 pb-1 pt-0.5">
            <p className="flex-1 text-[11px] text-[var(--muted)] leading-snug">
              Using Spotify? Turn on <b>Device Broadcast Status</b> in Spotify settings to see the song, cover and progress here.
            </p>
            <button
              onClick={() => { localStorage.setItem(HINT_KEY, '1'); setHintDismissed(true); }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--muted)] shrink-0"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    );
  }

  const duration = state.durationMs || 0;
  const position = positionAt(state, now);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const title = state.title || 'Unknown track';
  const subtitle = [state.artist, state.appName].filter(Boolean).join(' · ');

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!state.canSeek || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(frac * duration);
  };

  return (
    <div className={`rounded-[22px] border border-[var(--border)] bg-[var(--bg)] px-3 pt-2.5 pb-2 ${className}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={openApp}
          className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 border border-[var(--border)] flex items-center justify-center"
          style={{ background: 'var(--card)' }}
          aria-label={`Open ${state.appName || 'music app'}`}
        >
          {art && !artFailed ? (
            <img
              src={art}
              alt=""
              className="w-full h-full object-cover animate-[spin_14s_linear_infinite]"
              style={{ animationPlayState: playing ? 'running' : 'paused' }}
              onError={() => setArtFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <Music2 size={18} className="text-[var(--muted)]" />
          )}
          <span className="absolute w-2.5 h-2.5 rounded-full" style={{ background: 'var(--bg)', boxShadow: '0 0 0 1px var(--border)' }} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-[var(--text)] leading-tight truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-[var(--muted)] leading-tight truncate mt-0.5">{subtitle}</div>}
        </div>

        {controls('md')}
      </div>

      {duration > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-mono text-[var(--muted)] tabular-nums w-9 shrink-0">{formatMs(position)}</span>
          <div
            className={`relative flex-1 h-4 flex items-center ${state.canSeek ? 'cursor-pointer' : ''}`}
            onClick={handleSeek}
            role={state.canSeek ? 'slider' : 'progressbar'}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration / 1000)}
            aria-valuenow={Math.round(position / 1000)}
          >
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'var(--sienna)', transition: 'width 0.5s linear' }} />
            </div>
          </div>
          <span className="text-[10px] font-mono text-[var(--muted)] tabular-nums w-10 text-right shrink-0">-{formatMs(Math.max(0, duration - position))}</span>
        </div>
      )}
    </div>
  );
}
