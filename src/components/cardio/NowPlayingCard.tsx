import { useEffect, useState } from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { positionAt, useNowPlaying } from '@/hooks/useNowPlaying';

const DISMISS_KEY = 'apparatus_music_prompt_dismissed';

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Live "now playing" card that mirrors whatever music app is playing on the
 * phone (same session the system media notification shows). Styled with the
 * CardioTracker theme variables (--text, --muted, --border, --bg, --sienna).
 */
export function NowPlayingCard({ className = '' }: { className?: string }) {
  const { supported, state, togglePlayPause, next, previous, seekTo, openSettings, openApp } = useNowPlaying(true);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [askedOnce, setAskedOnce] = useState(false);
  const [artFailed, setArtFailed] = useState(false);

  const playing = Boolean(state?.hasSession && state.isPlaying);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [playing]);

  const art = state?.artwork || state?.artworkUrl;
  useEffect(() => setArtFailed(false), [art]);

  if (!supported || !state) return null;

  if (!state.granted) {
    if (dismissed) return null;
    return (
      <div className={`flex items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 ${className}`}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sienna)', color: '#fff' }}>
          <Music2 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[var(--text)] leading-tight">Control your music</div>
          <div className="text-[11px] text-[var(--muted)] leading-snug mt-0.5">
            {askedOnce
              ? 'Toggle Apparatus on. If it is greyed out: App info → ⋮ → Allow restricted settings.'
              : 'Allow notification access to show Spotify & other players here.'}
          </div>
        </div>
        <button
          onClick={() => { setAskedOnce(true); openSettings(); }}
          className="h-8 px-3 rounded-full text-[12px] font-bold shrink-0 active:scale-95 transition-transform"
          style={{ background: 'var(--sienna)', color: '#fff' }}
        >
          Connect
        </button>
        <button
          onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (!state.hasSession) {
    return (
      <div className={`flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 ${className}`}>
        <Music2 size={14} className="text-[var(--muted)] shrink-0" />
        <span className="text-[12px] text-[var(--muted)] truncate">No music playing · start a song in any music app</span>
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

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={previous}
            disabled={state.canSkipPrevious === false}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text)] disabled:opacity-30 active:scale-90 transition-transform"
            aria-label="Previous track"
          >
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button
            onClick={togglePlayPause}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'var(--text)', color: 'var(--bg)' }}
            aria-label={playing ? 'Pause music' : 'Play music'}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            onClick={next}
            disabled={state.canSkipNext === false}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text)] disabled:opacity-30 active:scale-90 transition-transform"
            aria-label="Next track"
          >
            <SkipForward size={18} fill="currentColor" />
          </button>
        </div>
      </div>

      {duration > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-mono text-[var(--muted)] tabular-nums w-9 shrink-0">{formatMs(position)}</span>
          <div
            className={`relative flex-1 h-4 flex items-center ${state.canSeek ? 'cursor-pointer' : ''}`}
            onClick={handleSeek}
            role={state.canSeek ? 'slider' : undefined}
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
