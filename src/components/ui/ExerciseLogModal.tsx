import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, RotateCcw, Plus, Trash2, ExternalLink, LoaderCircle } from 'lucide-react';
import { useWorkoutStore } from '@/stores/workout-store';
import type { Exercise, SetData } from '@/types';

interface Props {
  exercise: Exercise;
  section: 'warmup' | 'skillWork' | 'strength' | 'cooldown';
  index: number;
  isOpen: boolean;
  onClose: () => void;
  historicalLog?: any;
  previousLog?: any;
}

function ExerciseMedia({ exercise }: { exercise: Exercise }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const youtubeId = (() => {
    const value = exercise.yt || '';
    const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
    return match?.[1] || null;
  })();
  const formUrl = exercise.yt?.startsWith('http')
    ? exercise.yt
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} correct form`)}`;

  useEffect(() => {
    let cancelled = false;
    if (youtubeId) {
      setImageUrl(`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    fetch('https://wger.de/api/v2/exerciseinfo/?language=2&limit=1000')
      .then(response => response.ok ? response.json() : null)
      .then(catalog => {
        const needle = exercise.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const scored = (catalog?.results || []).map((item: any) => {
          const names = (item.translations || []).map((translation: any) => String(translation.name || '').toLowerCase());
          const exact = names.some((name: string) => name.replace(/[^a-z0-9]+/g, ' ').trim() === needle);
          const partial = names.some((name: string) => name.includes(needle) || needle.includes(name));
          const tokenScore = names.reduce((best: number, name: string) => {
            const tokens = needle.split(' ').filter(token => token.length > 2);
            const matches = tokens.filter(token => name.includes(token)).length;
            return Math.max(best, tokens.length ? matches / tokens.length : 0);
          }, 0);
          return { item, score: exact ? 3 : partial ? 2 : tokenScore >= 0.6 ? 1 : 0 };
        }).filter((entry: any) => entry.score > 0).sort((a: any, b: any) => b.score - a.score)[0]?.item;
        return scored || null;
      })
      .then(details => {
        if (cancelled) return;
        const image = details?.images?.find((item: any) => item.image)?.image || null;
        if (image) {
          setImageUrl(image);
          return null;
        }
        return fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${exercise.name} exercise`)}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`)
          .then(response => response.ok ? response.json() : null)
          .then(search => {
            const page = search?.query?.pages ? Object.values(search.query.pages)[0] as any : null;
            return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null;
          });
      })
      .then(image => { if (!cancelled && image) setImageUrl(image); })
      .catch(() => { if (!cancelled) setImageUrl(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [exercise.name, exercise.yt, youtubeId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line/60 bg-ink">
      {imageUrl ? (
        <img src={imageUrl} alt={`${exercise.name} correct form`} className="h-48 w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-32 items-center justify-center gap-3 px-5 text-center text-xs text-bone-dim">
          {loading ? <><LoaderCircle size={18} className="animate-spin text-sienna" /> Finding an exercise reference…</> : <>No image reference is available for this movement yet.</>}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line/60 px-4 py-3">
        <div><div className="text-[10px] font-mono uppercase tracking-widest text-sienna">Technique reference</div><div className="mt-1 text-xs text-bone-dim">{imageUrl ? 'Exercise-specific media' : 'Open the exercise demo'}</div></div>
        <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sienna/40 px-3 py-1.5 text-[10px] font-bold text-sienna hover:bg-sienna/10"><ExternalLink size={12} /> Demo</a>
      </div>
    </div>
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
      yt: editYt
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-0 sm:pb-4">
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-lg bg-ink-2 rounded-t-xl sm:rounded-xl border border-line flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex-1 mr-4">
            <h3 className="font-display text-xl uppercase tracking-wide">{exercise.name}</h3>
            <p className="text-xs text-bone-dim mt-0.5">
              {exercise.sets} {exercise.tempo ? `· tempo ${exercise.tempo}` : ''} {exercise.rest ? `· rest ${exercise.rest}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <>
                <button onClick={() => setIsEditingEx(!isEditingEx)} className="text-xs font-mono text-sienna hover:underline px-2 py-1">
                  Edit
                </button>
                <button onClick={handleDelete} className="text-xs font-mono text-danger hover:underline px-2 py-1">
                  Delete
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 text-bone-dim hover:text-bone rounded-lg border border-line ml-2">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="p-5 overflow-y-auto space-y-6 max-h-[65vh]">
          {isEditingEx ? (
            <div className="space-y-4 bg-ink p-4 rounded-lg border border-line">
              <h4 className="font-display text-base">Edit Exercise details</h4>
              <div>
                <label className="text-xs font-mono text-bone-dim block mb-1">Exercise Name</label>
                <input type="text" className="input-field w-full" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-bone-dim block mb-1">Sets String</label>
                  <input type="text" className="input-field w-full" value={editSetsStr} onChange={e => setEditSetsStr(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-mono text-bone-dim block mb-1">Tempo</label>
                  <input type="text" className="input-field w-full" value={editTempo} onChange={e => setEditTempo(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-bone-dim block mb-1">Rest</label>
                  <input type="text" className="input-field w-full" value={editRest} onChange={e => setEditRest(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-mono text-bone-dim block mb-1">YouTube Link / Search</label>
                  <input type="text" className="input-field w-full" value={editYt} onChange={e => setEditYt(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-mono text-bone-dim block mb-1">Cues (one per line)</label>
                <textarea className="input-field w-full h-20 text-xs" value={editCues} onChange={e => setEditCues(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleEditSave} className="btn-primary flex-1">Save changes</button>
                <button onClick={() => setIsEditingEx(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <ExerciseMedia exercise={exercise} />

              {/* Form Cues */}
              {exercise.cues && exercise.cues.length > 0 && (
                <div className="space-y-1 text-xs text-bone-dim leading-relaxed">
                  {exercise.cues.map((cue, i) => (
                    <div key={i} className="flex gap-1.5">
                      <span className="text-sienna">—</span>
                      <span>{cue}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Last Session History */}
              <div>
                <div className="text-xs font-mono text-bone-dim tracking-wider mb-2 uppercase">Last Session</div>
                <div className="bg-ink border border-line/50 p-4 rounded text-sm text-bone-dim">
                  {previousLog ? (
                    <div className="space-y-1">
                      <div className="text-bone">{previousLog.sets?.filter((set: any) => set.completed !== false).length || 0} completed sets</div>
                      <div>{previousLog.sets?.map((set: any) => `${set.reps || set.seconds || 0}${set.seconds ? ' sec' : ' reps'}${set.weight ? ` @ ${set.weight} kg` : ''}`).join(' · ')}</div>
                    </div>
                  ) : 'No previous data yet — this will be your first logged session.'}
                </div>
              </div>

              {/* Logging Section */}
              <div>
                <div className="text-xs font-mono text-bone-dim tracking-wider mb-4 uppercase">
                  Log this session — {log.mode === 'reps' ? 'Reps / Added weight per set' : 'Seconds held'}
                </div>

                <div className="space-y-3">
                  {log.sets.map((set: any, idx: number) => (
                    <div key={idx} className={`grid grid-cols-[auto_1fr_auto] items-center gap-4 p-2 rounded border ${set.completed ? 'bg-amber/10 border-amber/30' : 'bg-ink border-line'}`}>
                      <div className="w-8 text-center font-mono text-sm text-bone-dim font-bold">#{idx + 1}</div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {log.mode === 'reps' ? (
                          <>
                            <input 
                              type="number"
                              placeholder="reps"
                              className="input-field text-center font-mono text-base bg-ink-2"
                              value={set.reps ?? ''}
                              onChange={(e) => store.updateSet(exercise.name, log.mode, idx, { reps: parseInt(e.target.value) || 0 })}
                              disabled={set.completed || isReadOnly}
                            />
                            <input 
                              type="number"
                              placeholder="+kg"
                              className="input-field text-center font-mono text-base bg-ink-2"
                              value={set.weight ?? ''}
                              onChange={(e) => store.updateSet(exercise.name, log.mode, idx, { weight: parseFloat(e.target.value) || 0 })}
                              disabled={set.completed || isReadOnly}
                            />
                          </>
                        ) : (
                          <input 
                            type="number"
                            placeholder="seconds"
                            className="input-field col-span-2 text-center font-mono text-base bg-ink-2"
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
                        className={`w-8 h-8 rounded flex items-center justify-center font-mono text-sm font-bold border transition-all ${set.completed ? 'bg-sienna text-bone border-sienna' : 'bg-line/50 border-line hover:border-sienna'}`}
                      >
                        {set.completed ? '✓' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>

                {!isReadOnly && (
                  <div className="flex justify-between items-center mt-3">
                    <button onClick={() => store.addSet(exercise.name, log.mode)} className="text-sienna text-sm font-mono flex items-center gap-1 hover:underline">
                      <Plus size={14} /> Add set
                    </button>
                    {log.sets.length > 0 && (
                      <button onClick={() => store.removeSet(exercise.name, log.sets.length - 1)} className="text-danger text-sm font-mono flex items-center gap-1 hover:underline">
                        <Trash2 size={14} /> Remove last
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <div className="text-xs font-mono text-bone-dim mb-2 uppercase">Notes</div>
                <textarea 
                  className="input-field w-full h-20 text-sm"
                  placeholder={isReadOnly ? "No notes logged." : "e.g. left shoulder felt tight, form breaking down on last set..."}
                  value={log.notes}
                  onChange={e => store.updateNotes(exercise.name, e.target.value)}
                  disabled={isReadOnly}
                />
              </div>

              {/* Timers Section */}
              <div className="border border-line rounded-lg p-4 bg-ink space-y-4">
                <div className="flex border-b border-line pb-2">
                  <div className="text-xs font-mono text-bone-dim tracking-wider uppercase flex-1">Timers</div>
                  <div className="flex gap-2 text-xs font-mono overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button onClick={() => setTimerMode('rest')} className={`px-2 py-0.5 rounded whitespace-nowrap ${timerMode === 'rest' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim'}`}>Rest</button>
                    <button onClick={() => setTimerMode('stopwatch')} className={`px-2 py-0.5 rounded whitespace-nowrap ${timerMode === 'stopwatch' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim'}`}>Stopwatch</button>
                    <button onClick={() => setTimerMode('countdown')} className={`px-2 py-0.5 rounded whitespace-nowrap ${timerMode === 'countdown' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim'}`}>Countdown</button>
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
                          className={`px-3 py-1 font-mono text-xs rounded-full border ${restDuration === s ? 'bg-sienna text-bone border-sienna font-bold' : 'border-line text-bone-dim hover:border-bone-dim'}`}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                    
                    {/* Custom Rest Input */}
                    <div className="flex justify-center items-center gap-2 text-xs font-mono text-bone-dim">
                      <span>Custom:</span>
                      <input 
                        type="number"
                        min="1"
                        className="input-field w-16 py-1 text-center bg-ink-2"
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

                    <div className="text-4xl font-mono font-bold tracking-widest text-bone">
                      {formatMMSS(restTimeLeft)}
                    </div>
                    <div className="flex gap-3 max-w-xs mx-auto">
                      <button onClick={() => setIsRestRunning(!isRestRunning)} className="btn-primary py-2 flex-1">
                        {isRestRunning ? 'Pause' : 'Start'}
                      </button>
                      <button onClick={() => { setRestTimeLeft(restDuration); setIsRestRunning(false); }} className="btn-secondary py-2 px-4 flex items-center justify-center">
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Stopwatch Block */}
                {timerMode === 'stopwatch' && (
                  <div className="space-y-4 text-center">
                    <div className="text-4xl font-mono font-bold tracking-widest text-bone">
                      {formatMMSS(stopwatchElapsed)}
                    </div>
                    <div className="flex gap-3 max-w-xs mx-auto">
                      <button onClick={() => setIsStopwatchRunning(!isStopwatchRunning)} className="btn-primary py-2 flex-1">
                        {isStopwatchRunning ? 'Pause' : 'Start'}
                      </button>
                      <button onClick={() => { setStopwatchElapsed(0); setIsStopwatchRunning(false); }} className="btn-secondary py-2 px-4 flex items-center justify-center">
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
                          className={`px-3 py-1 font-mono text-xs rounded-full border ${countdownDuration === s ? 'bg-sienna text-bone border-sienna font-bold' : 'border-line text-bone-dim hover:border-bone-dim'}`}
                        >
                          {s === 60 ? '1m' : s === 180 ? '3m' : s === 300 ? '5m' : '10m'}
                        </button>
                      ))}
                    </div>

                    {/* Custom Countdown Input */}
                    <div className="flex justify-center items-center gap-2 text-xs font-mono text-bone-dim">
                      <span>Custom:</span>
                      <input 
                        type="number"
                        min="1"
                        className="input-field w-16 py-1 text-center bg-ink-2"
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

                    <div className="text-4xl font-mono font-bold tracking-widest text-bone">
                      {formatMMSS(countdownTimeLeft)}
                    </div>
                    <div className="flex gap-3 max-w-xs mx-auto">
                      <button onClick={() => setIsCountdownRunning(!isCountdownRunning)} className="btn-primary py-2 flex-1">
                        {isCountdownRunning ? 'Pause' : 'Start'}
                      </button>
                      <button onClick={() => { setCountdownTimeLeft(countdownDuration); setIsCountdownRunning(false); }} className="btn-secondary py-2 px-4 flex items-center justify-center">
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-line">
          <button onClick={handleSaveSession} className="btn-primary w-full py-3 tracking-wider font-bold">
            {isReadOnly ? 'CLOSE' : 'SAVE SESSION'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
