import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Play, Clock, TrendingUp, History, Info, ChevronRight, Check, Dumbbell, ShieldAlert, ImagePlus, Loader2, Edit3, Trash2, RotateCcw, RotateCw, Plus, ExternalLink, LoaderCircle } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useWorkoutStore } from '@/stores/workout-store';
import { useUIStore } from '@/stores/ui-store';
import type { Exercise, SetData } from '@/types';
import { MUSCLE_GROUPS } from '@/lib/muscle-map';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface Props {
  exercise: Exercise;
  section: 'warmup' | 'skillWork' | 'strength' | 'cooldown';
  index: number;
  isOpen: boolean;
  onClose: () => void;
  historicalLog?: any;
  previousLog?: any;
}

/** Opens a URL inside the app's in-app browser (native) or a new tab (web). */
async function openInAppBrowser(url: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url, presentationStyle: 'popover' });
    } catch {
      window.open(url, '_blank');
    }
  } else {
    window.open(url, '_blank');
  }
}

function ExerciseMedia({ exercise }: { exercise: Exercise }) {
  // The resolver validates every candidate before returning it, so any ID we
  // get back is playable - no extra thumbnail probing that could discard it.
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [thumbStep, setThumbStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { showToast } = useUIStore();

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setVideoId(null);
    setVideoTitle(null);
    setIsPlaying(false);
    setThumbStep(0);

    import('@/lib/video-resolver')
      .then(({ resolveExerciseVideo }) => resolveExerciseVideo(exercise.name, exercise.yt, controller.signal))
      .then(id => {
        if (controller.signal.aborted) return;
        setVideoId(id);
        setStatus(id ? 'ready' : 'empty');
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.warn('Failed to resolve exercise video:', err);
        setStatus('empty');
      });

    return () => controller.abort();
  }, [exercise.name, exercise.yt, reloadKey]);

  const handleRefreshVideo = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isRefreshing || status === 'loading') return;

    setIsRefreshing(true);
    setIsPlaying(false);

    try {
      const { refreshExerciseVideo } = await import('@/lib/video-resolver');
      const result = await refreshExerciseVideo(exercise.name, videoId, exercise.yt);

      if (result?.youtubeId && result.youtubeId !== videoId) {
        setVideoId(result.youtubeId);
        setVideoTitle(result.title || null);
        setThumbStep(0);
        setStatus('ready');
        showToast('Switched to another technique video');
      } else if (videoId) {
        showToast('No other verified video yet, keeping the current one', 'info');
      } else {
        showToast('No video found. Opening YouTube search instead.', 'info');
        openInAppBrowser(searchUrl);
      }
    } catch (err) {
      console.warn('Failed to refresh exercise video:', err);
      showToast('Could not load another video. Check your connection.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} proper form technique`)}`;
  const formUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : searchUrl;
  const thumbSources = videoId
    ? [`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`]
    : [];
  const thumbnailUrl = thumbSources[thumbStep] ?? null;
  const busy = status === 'loading' || isRefreshing;

  const handleDemoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoId) {
      setIsPlaying(true);
    } else {
      openInAppBrowser(searchUrl);
    }
  };

  const overlayBtn = 'flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-white backdrop-blur-md transition active:scale-95 disabled:opacity-50 touch-manipulation';

  return (
    <section className="overflow-hidden rounded-2xl" style={{ background: 'var(--dx-card-2)' }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16/9', background: '#0c0a09' }}>
        {isPlaying && videoId ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&fs=1&origin=${encodeURIComponent(window.location.origin)}`}
            title={`${exercise.name} technique`}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : videoId ? (
          <button type="button" onClick={handleDemoClick} className="group absolute inset-0 block h-full w-full" aria-label={`Play ${exercise.name} technique video`}>
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setThumbStep(s => s + 1)}
              />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)' }} />
            <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-xl transition-transform duration-200 group-hover:scale-110" style={{ background: 'rgba(255,255,255,0.95)' }}>
              <Play size={22} className="ml-0.5" style={{ color: '#111' }} fill="#111" />
            </span>
            {videoTitle && (
              <span className="absolute inset-x-3 bottom-2.5 truncate text-left text-xs font-medium text-white/90">{videoTitle}</span>
            )}
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {busy ? (
              <>
                <LoaderCircle size={26} className="animate-spin" style={{ color: 'rgba(255,255,255,0.8)' }} />
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {isRefreshing ? 'Finding another demonstration…' : 'Loading technique video…'}
                </span>
              </>
            ) : (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <Dumbbell size={20} style={{ color: 'rgba(255,255,255,0.8)' }} />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">No verified demo yet</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Search YouTube or try loading again.</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleDemoClick} className={overlayBtn} style={{ background: 'rgba(255,255,255,0.16)' }}>
                    <ExternalLink size={13} /> Search YouTube
                  </button>
                  <button type="button" onClick={() => setReloadKey(k => k + 1)} className={overlayBtn} style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <RotateCcw size={13} /> Retry
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Busy veil while swapping away from a playing/visible video */}
        {isRefreshing && videoId && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <LoaderCircle size={26} className="animate-spin" style={{ color: 'rgba(255,255,255,0.85)' }} />
            <span className="text-xs font-medium text-white/80">Finding another demonstration…</span>
          </div>
        )}

        <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white" style={{ background: 'rgba(0,0,0,0.55)' }}>
          Technique
        </span>
      </div>

      <div className="flex items-center gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">
            {status === 'loading' ? 'Finding the best demonstration' : videoId ? (isPlaying ? 'Now playing' : 'Form reference') : 'Not available'}
          </div>
          <div className="truncate text-[12px] dx-muted">
            {videoId ? 'Watch the full movement before your first set' : 'Opens YouTube search in the browser'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefreshVideo}
          disabled={busy}
          aria-label="Change technique video"
          title="Show a different demonstration"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition active:scale-95 disabled:opacity-50"
          style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}
        >
          <RotateCw size={13} className={isRefreshing ? 'animate-spin' : ''} /> Change
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openInAppBrowser(formUrl); }}
          aria-label="Open on YouTube"
          title="Open on YouTube"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl dx-muted transition active:scale-95"
          style={{ background: 'var(--dx-card)', border: '1px solid var(--dx-border)' }}
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </section>
  );
}

export function ExerciseLogModal({ exercise, section, index, isOpen, onClose, historicalLog, previousLog }: Props) {
  const store = useWorkoutStore();
  const log = historicalLog || store.logs[exercise.name] || { name: exercise.name, mode: 'reps', sets: [], notes: '' };
  const isReadOnly = !!historicalLog;

  const [isEditingEx, setIsEditingEx] = useState(false);
  const [editName, setEditName] = useState(exercise.name);
  const [editSetsStr, setEditSetsStr] = useState(exercise.sets);
  const [editTempo, setEditTempo] = useState(exercise.tempo || '');
  const [editRest, setEditRest] = useState(exercise.rest || '');
  const [editCues, setEditCues] = useState(exercise.cues?.join('\n') || '');
  const [editYt, setEditYt] = useState(exercise.yt || '');
  const [editMuscleGroup, setEditMuscleGroup] = useState(exercise.muscleGroup || '');

  // Timer Modes: 'rest' | 'stopwatch' | 'countdown'
  const [timerMode, setTimerMode] = useState<'rest' | 'stopwatch' | 'countdown'>('rest');

  // Timer States
  const [restDuration, setRestDuration] = useState(90);
  const [restTimeLeft, setRestTimeLeft] = useState(90);
  const [isRestRunning, setIsRestRunning] = useState(false);

  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);

  const [countdownDuration, setCountdownDuration] = useState(300); // 5 min default
  const [countdownTimeLeft, setCountdownTimeLeft] = useState(300);
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const beep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        o.type = 'sine';
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.3);
      });
    } catch (e) {
      console.error("Audio beep failed:", e);
    }
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }
  };

  // General Timer Loop
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (timerMode === 'rest' && isRestRunning) {
        if (restTimeLeft > 0) {
          setRestTimeLeft(prev => prev - 1);
        } else {
          setIsRestRunning(false);
          beep();
        }
      }

      if (timerMode === 'stopwatch' && isStopwatchRunning) {
        setStopwatchElapsed(prev => prev + 1);
      }

      if (timerMode === 'countdown' && isCountdownRunning) {
        if (countdownTimeLeft > 0) {
          setCountdownTimeLeft(prev => prev - 1);
        } else {
          setIsCountdownRunning(false);
          beep();
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerMode, isRestRunning, restTimeLeft, isStopwatchRunning, isCountdownRunning, countdownTimeLeft]);

  if (!isOpen) return null;

  const handleEditSave = () => {
    store.editExercise(section, index, {
      name: editName,
      sets: editSetsStr,
      tempo: editTempo,
      rest: editRest,
      cues: editCues.split('\n').map(c => c.trim()).filter(Boolean),
      yt: editYt,
      muscleGroup: editMuscleGroup || undefined
    });
    setIsEditingEx(false);
  };

  const handleSaveSession = () => {
    // Automatically complete sets that have values populated
    log.sets.forEach((set: any, idx: number) => {
      const hasValue = (log.mode === 'reps' && ((set.reps && set.reps > 0) || (set.weight && set.weight > 0))) ||
        (log.mode === 'hold' && (set.seconds && set.seconds > 0));
      if (hasValue && !set.completed) {
        store.markSetComplete(exercise.name, idx, true);
      }
    });
    onClose();
  };

  const handleDelete = () => {
    if (confirm('Delete this exercise from this session?')) {
      store.deleteExercise(section, index);
      onClose();
    }
  };

  const formatMMSS = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sectionLabel = { warmup: 'Warm-up', skillWork: 'Skill work', strength: 'Strength', cooldown: 'Cool-down' }[section];
  const completedSets = log.sets.filter((s: any) => s.completed).length;
  const specs = [
    { label: 'Sets', value: exercise.sets },
    { label: 'Tempo', value: exercise.tempo },
    { label: 'Rest', value: exercise.rest },
  ].filter(s => s.value);
  const iconBtn = 'dx-icon-btn dx-icon-btn--sm';
  const sectionTitle = 'dx-eyebrow';

  return (
    <div className="dx pro-scope dx-overlay z-50">
      <div className="dx-backdrop" onClick={onClose} />

      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        role="dialog"
        aria-modal="true"
        aria-label={exercise.name}
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />

        {/* Header */}
        <div className="dx-sheet-header">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] dx-accent">
              {sectionLabel}{isReadOnly ? ' · History' : ''}
            </div>
            <h3 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight">{exercise.name}</h3>
            {specs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {specs.map(s => (
                  <span key={s.label} className="dx-tag">
                    {s.label} <strong>{s.value}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!isReadOnly && (
              <>
                <button onClick={() => setIsEditingEx(!isEditingEx)} className={iconBtn} style={isEditingEx ? { borderColor: 'var(--dx-accent)', color: 'var(--dx-accent)' } : undefined} aria-label="Edit exercise" title="Edit exercise">
                  <Edit3 size={15} />
                </button>
                <button onClick={handleDelete} className={`${iconBtn} hover:!text-red-500`} aria-label="Delete exercise" title="Delete exercise">
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={onClose} className={iconBtn} aria-label="Close">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="dx-sheet-body space-y-5">
          {isEditingEx ? (
            <div className="space-y-4">
              <h4 className="dx-section-title">Edit exercise</h4>
              <div>
                <label className="dx-label">Exercise name</label>
                <input type="text" className="dx-input" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="dx-label">Sets × reps</label>
                  <input type="text" className="dx-input" value={editSetsStr} onChange={e => setEditSetsStr(e.target.value)} />
                </div>
                <div>
                  <label className="dx-label">Tempo</label>
                  <input type="text" className="dx-input" value={editTempo} onChange={e => setEditTempo(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="dx-label">Rest</label>
                  <input type="text" className="dx-input" value={editRest} onChange={e => setEditRest(e.target.value)} />
                </div>
                <div>
                  <label className="dx-label">YouTube link</label>
                  <input type="text" className="dx-input" value={editYt} onChange={e => setEditYt(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="dx-label">Cues (one per line)</label>
                <textarea className="dx-input text-[13px]" value={editCues} onChange={e => setEditCues(e.target.value)} />
              </div>
              <div>
                <label className="dx-label">Target muscle group</label>
                <CustomSelect
                  className="w-full"
                  value={editMuscleGroup}
                  onChange={setEditMuscleGroup}
                  options={[
                    { value: '', label: 'Auto-detect' },
                    ...MUSCLE_GROUPS.map(mg => ({ value: mg, label: mg }))
                  ]}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setIsEditingEx(false)} className="dx-btn-secondary">Cancel</button>
                <button onClick={handleEditSave} className="dx-btn flex-1">Save changes</button>
              </div>
            </div>
          ) : (
            <>
              <ExerciseMedia exercise={exercise} />

              {/* Form Cues */}
              {exercise.cues && exercise.cues.length > 0 && (
                <section>
                  <div className={`${sectionTitle} mb-2.5`}>Form cues</div>
                  <ol className="space-y-2">
                    {exercise.cues.map((cue, i) => (
                      <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>{i + 1}</span>
                        <span>{cue}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Last Session History */}
              <section className="dx-inset flex items-start gap-3 p-3.5">
                <span className="dx-badge-icon" style={{ background: 'var(--dx-card)', color: 'var(--dx-muted)' }}>
                  <History size={16} />
                </span>
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="font-semibold">Last session</div>
                  {previousLog ? (
                    <div className="mt-0.5 dx-muted">
                      <span style={{ color: 'var(--dx-text)' }}>{previousLog.sets?.filter((set: any) => set.completed !== false).length || 0} sets</span>
                      {' · '}
                      <span className="tabular text-[12px]">{previousLog.sets?.map((set: any) => `${set.reps || set.seconds || 0}${set.seconds ? 's' : ''}${set.weight ? ` @ ${set.weight}kg` : ''}`).join('  ·  ')}</span>
                    </div>
                  ) : (
                    <div className="mt-0.5 dx-muted">No previous data. This will be your first logged session.</div>
                  )}
                </div>
              </section>

              {/* Logging Section */}
              <section>
                <div className="mb-2.5 flex items-baseline justify-between gap-3">
                  <div className={sectionTitle}>{log.mode === 'reps' ? 'Log sets' : 'Log holds'}</div>
                  {log.sets.length > 0 && (
                    <div className="text-[12px] dx-muted tabular">
                      <span className="font-semibold" style={{ color: 'var(--dx-text)' }}>{completedSets}</span>/{log.sets.length} done
                    </div>
                  )}
                </div>

                {log.sets.length > 0 && (
                  <div className="mb-1.5 grid grid-cols-[2.25rem_1fr_2.75rem] items-center gap-3 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] dx-muted">
                    <span className="text-center">Set</span>
                    {log.mode === 'reps' ? (
                      <span className="grid grid-cols-2 gap-2 text-center"><span>Reps</span><span>Added kg</span></span>
                    ) : (
                      <span className="text-center">Seconds</span>
                    )}
                    <span className="text-center">Done</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {log.sets.map((set: any, idx: number) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[2.25rem_1fr_2.75rem] items-center gap-3 rounded-2xl p-1.5 transition-colors"
                      style={{ background: set.completed ? 'var(--dx-success-soft)' : 'var(--dx-card-2)' }}
                    >
                      <div className="text-center text-[14px] font-semibold tabular dx-muted">{idx + 1}</div>

                      <div className="grid grid-cols-2 gap-2">
                        {log.mode === 'reps' ? (
                          <>
                            <input
                              type="number"
                              inputMode="numeric"
                              placeholder="0"
                              aria-label={`Set ${idx + 1} reps`}
                              className="dx-input !h-10 !min-h-0 !py-0 text-center text-[16px] font-semibold tabular"
                              style={{ background: 'var(--dx-card)' }}
                              value={set.reps ?? ''}
                              onChange={(e) => store.updateSet(exercise.name, log.mode, idx, { reps: parseInt(e.target.value) || 0 })}
                              disabled={set.completed || isReadOnly}
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0"
                              aria-label={`Set ${idx + 1} added weight`}
                              className="dx-input !h-10 !min-h-0 !py-0 text-center text-[16px] font-semibold tabular"
                              style={{ background: 'var(--dx-card)' }}
                              value={set.weight ?? ''}
                              onChange={(e) => store.updateSet(exercise.name, log.mode, idx, { weight: parseFloat(e.target.value) || 0 })}
                              disabled={set.completed || isReadOnly}
                            />
                          </>
                        ) : (
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Set ${idx + 1} seconds`}
                            className="dx-input col-span-2 !h-10 !min-h-0 !py-0 text-center text-[16px] font-semibold tabular"
                            style={{ background: 'var(--dx-card)' }}
                            value={set.seconds ?? ''}
                            onChange={(e) => store.updateSet(exercise.name, log.mode, idx, { seconds: parseInt(e.target.value) || 0 })}
                            disabled={set.completed || isReadOnly}
                          />
                        )}
                      </div>

                      <button
                        onClick={() => {
                          if (isReadOnly) return;
                          store.markSetComplete(exercise.name, idx, !set.completed);
                          if (!set.completed && timerMode === 'rest') {
                            setRestTimeLeft(restDuration);
                            setIsRestRunning(true);
                          }
                        }}
                        disabled={isReadOnly}
                        aria-label={set.completed ? `Mark set ${idx + 1} incomplete` : `Mark set ${idx + 1} complete`}
                        aria-pressed={!!set.completed}
                        className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95"
                        style={set.completed
                          ? { background: 'var(--dx-success)', color: '#fff' }
                          : { background: 'var(--dx-card)', color: 'var(--dx-muted)', border: '1px solid var(--dx-border)' }}
                      >
                        <Check size={18} strokeWidth={set.completed ? 3 : 2} className={set.completed ? '' : 'opacity-50'} />
                      </button>
                    </div>
                  ))}
                </div>

                {log.sets.length === 0 && (
                  <div className="rounded-2xl px-4 py-5 text-center text-[13px] dx-muted" style={{ border: '1px dashed var(--dx-border-strong)' }}>
                    {isReadOnly ? 'No sets were logged.' : 'No sets yet. Add your first set to start logging.'}
                  </div>
                )}

                {!isReadOnly && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button onClick={() => store.addSet(exercise.name, log.mode)} className="dx-btn-secondary !h-10 text-[13px]">
                      <Plus size={15} /> Add set
                    </button>
                    <button
                      onClick={() => store.removeSet(exercise.name, log.sets.length - 1)}
                      disabled={log.sets.length === 0}
                      className="dx-btn-secondary !h-10 text-[13px] dx-muted hover:!text-red-500"
                    >
                      <Trash2 size={14} /> Remove last
                    </button>
                  </div>
                )}
              </section>

              {/* Notes */}
              <section>
                <div className={`${sectionTitle} mb-2.5`}>Notes</div>
                <textarea
                  className="dx-input text-[14px]"
                  placeholder={isReadOnly ? "No notes logged." : "e.g. left shoulder felt tight, form breaking down on last set..."}
                  value={log.notes}
                  onChange={e => store.updateNotes(exercise.name, e.target.value)}
                  disabled={isReadOnly}
                />
              </section>

              {/* Timers Section */}
              <section className="dx-inset p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className={sectionTitle}>Timer</div>
                  <div className="dx-segment !p-[3px]" role="tablist" style={{ background: 'var(--dx-card)' }}>
                    {([['rest', 'Rest'], ['stopwatch', 'Stopwatch'], ['countdown', 'Countdown']] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        role="tab"
                        aria-selected={timerMode === mode}
                        onClick={() => setTimerMode(mode)}
                        className="!h-8 !px-2.5 !text-[12px]"
                        style={timerMode === mode ? { background: 'var(--dx-card-2)' } : undefined}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rest Timer Block */}
                {timerMode === 'rest' && (
                  <div className="space-y-4 text-center">
                    <div className="flex flex-wrap justify-center gap-2">
                      {[30, 45, 60, 75, 90, 120].map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            setRestDuration(s);
                            setRestTimeLeft(s);
                            setIsRestRunning(false);
                          }}
                          className="min-w-[3rem] h-8 rounded-full px-3 text-[12px] font-semibold tabular transition"
                          style={restDuration === s ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' } : { background: 'var(--dx-card)', color: 'var(--dx-muted)' }}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>

                    {/* Custom Rest Input */}
                    <div className="flex justify-center items-center gap-2 text-[12px] dx-muted">
                      <span>Custom</span>
                      <input
                        type="number"
                        min="1"
                        className="dx-input !w-20 !h-9 !min-h-0 !py-0 text-center tabular"
                        style={{ background: 'var(--dx-card)' }}
                        value={restDuration}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setRestDuration(val);
                          setRestTimeLeft(val);
                          setIsRestRunning(false);
                        }}
                      />
                      <span>sec</span>
                    </div>

                    <div className={`text-[48px] leading-none font-semibold tabular tracking-tight ${isRestRunning ? 'dx-accent' : ''}`}>
                      {formatMMSS(restTimeLeft)}
                    </div>
                    <div className="flex gap-2.5 max-w-xs mx-auto">
                      <button onClick={() => setIsRestRunning(!isRestRunning)} className="dx-btn flex-1">
                        {isRestRunning ? 'Pause' : 'Start'}
                      </button>
                      <button onClick={() => { setRestTimeLeft(restDuration); setIsRestRunning(false); }} className="dx-icon-btn" aria-label="Reset timer" style={{ background: 'var(--dx-card)' }}>
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Stopwatch Block */}
                {timerMode === 'stopwatch' && (
                  <div className="space-y-4 text-center">
                    <div className={`text-[48px] leading-none font-semibold tabular tracking-tight ${isStopwatchRunning ? 'dx-accent' : ''}`}>
                      {formatMMSS(stopwatchElapsed)}
                    </div>
                    <div className="flex gap-2.5 max-w-xs mx-auto">
                      <button onClick={() => setIsStopwatchRunning(!isStopwatchRunning)} className="dx-btn flex-1">
                        {isStopwatchRunning ? 'Pause' : 'Start'}
                      </button>
                      <button onClick={() => { setStopwatchElapsed(0); setIsStopwatchRunning(false); }} className="dx-icon-btn" aria-label="Reset stopwatch" style={{ background: 'var(--dx-card)' }}>
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Countdown Block */}
                {timerMode === 'countdown' && (
                  <div className="space-y-4 text-center">
                    <div className="flex flex-wrap justify-center gap-2">
                      {[60, 180, 300, 600].map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            setCountdownDuration(s);
                            setCountdownTimeLeft(s);
                            setIsCountdownRunning(false);
                          }}
                          className="min-w-[3rem] h-8 rounded-full px-3 text-[12px] font-semibold tabular transition"
                          style={countdownDuration === s ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' } : { background: 'var(--dx-card)', color: 'var(--dx-muted)' }}
                        >
                          {s === 60 ? '1m' : s === 180 ? '3m' : s === 300 ? '5m' : '10m'}
                        </button>
                      ))}
                    </div>

                    {/* Custom Countdown Input */}
                    <div className="flex justify-center items-center gap-2 text-[12px] dx-muted">
                      <span>Custom</span>
                      <input
                        type="number"
                        min="1"
                        className="dx-input !w-20 !h-9 !min-h-0 !py-0 text-center tabular"
                        style={{ background: 'var(--dx-card)' }}
                        value={Math.floor(countdownDuration / 60)}
                        onChange={(e) => {
                          const val = (parseInt(e.target.value) || 0) * 60;
                          setCountdownDuration(val);
                          setCountdownTimeLeft(val);
                          setIsCountdownRunning(false);
                        }}
                      />
                      <span>min</span>
                    </div>

                    <div className={`text-[48px] leading-none font-semibold tabular tracking-tight ${isCountdownRunning ? 'dx-accent' : ''}`}>
                      {formatMMSS(countdownTimeLeft)}
                    </div>
                    <div className="flex gap-2.5 max-w-xs mx-auto">
                      <button onClick={() => setIsCountdownRunning(!isCountdownRunning)} className="dx-btn flex-1">
                        {isCountdownRunning ? 'Pause' : 'Start'}
                      </button>
                      <button onClick={() => { setCountdownTimeLeft(countdownDuration); setIsCountdownRunning(false); }} className="dx-icon-btn" aria-label="Reset countdown" style={{ background: 'var(--dx-card)' }}>
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="dx-sheet-footer">
          <button onClick={handleSaveSession} className="dx-btn w-full h-12 text-[15px]">
            {isReadOnly ? 'Close' : `Save session${completedSets ? ` · ${completedSets}/${log.sets.length} sets` : ''}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
