import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Trash2, Pencil, History, Activity, Target, Dumbbell, Wind, Clock, Layers, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlan, getPlanDays, savePlanDay } from '@/services/plans';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { ExerciseAutocomplete } from '@/components/ui/ExerciseAutocomplete';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PlanDay, Exercise } from '@/types';

function ExerciseSection({ 
  title, 
  icon: Icon,
  exercises, 
  isOwner, 
  onUpdate,
  workoutHistory = []
}: { 
  title: string, 
  icon: typeof Activity,
  exercises: Exercise[], 
  isOwner: boolean,
  onUpdate: (exs: Exercise[]) => void,
  workoutHistory?: any[]
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const addExercise = () => {
    onUpdate([...exercises, { name: 'New Exercise', sets: '3 x 10', tempo: '2-1-2', rest: '90s', cues: [], yt: '' }]);
    setEditingIdx(exercises.length);
  };

  const updateExercise = (idx: number, field: keyof Exercise, val: any) => {
    const next = [...exercises];
    next[idx] = { ...next[idx], [field]: val };
    onUpdate(next);
  };

  const handleSelectAutocomplete = (idx: number, libEx: any) => {
    const next = [...exercises];
    next[idx] = {
      ...next[idx],
      name: libEx.name,
      cues: libEx.instructions || [],
      yt: libEx.youtubeSearch || ''
    };
    onUpdate(next);
  };

  const removeExercise = (idx: number) => {
    if(confirm('Remove this exercise?')) {
      const next = [...exercises];
      next.splice(idx, 1);
      onUpdate(next);
      setEditingIdx(null);
    }
  };

  if (exercises.length === 0 && !isOwner) return null;

  return (
    <section className="dx-card overflow-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3">
        <span className="dx-badge-icon"><Icon size={17} /></span>
        <div className="flex-1 min-w-0">
          <h3 className="dx-section-title">{title}</h3>
          <p className="text-[12px] dx-muted">{exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}</p>
        </div>
      </header>

      <div className="dx-list border-t" style={{ borderColor: 'var(--dx-border)' }}>
        {exercises.map((ex, i) => (
          <div key={i} className="px-4 sm:px-5 py-3.5">
            {editingIdx === i ? (
              <div className="space-y-3">
                <div>
                  <label className="dx-label">Exercise</label>
                  <ExerciseAutocomplete
                    value={ex.name}
                    onChange={(val) => updateExercise(i, 'name', val)}
                    onSelect={(libEx) => handleSelectAutocomplete(i, libEx)}
                    placeholder="Exercise name (e.g. Pull-up)"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="dx-label">Sets × reps</label>
                    <input className="dx-input" value={ex.sets} onChange={e => updateExercise(i, 'sets', e.target.value)} placeholder="3 x 10" />
                  </div>
                  <div>
                    <label className="dx-label">Tempo</label>
                    <input className="dx-input" value={ex.tempo} onChange={e => updateExercise(i, 'tempo', e.target.value)} placeholder="2-1-2" />
                  </div>
                  <div>
                    <label className="dx-label">Rest</label>
                    <input className="dx-input" value={ex.rest} onChange={e => updateExercise(i, 'rest', e.target.value)} placeholder="90s" />
                  </div>
                </div>
                <div>
                  <label className="dx-label">YouTube link or search</label>
                  <input className="dx-input" value={ex.yt || ''} onChange={e => updateExercise(i, 'yt', e.target.value)} placeholder="Leave blank to search by name" />
                </div>
                <div>
                  <label className="dx-label">Form cues (one per line)</label>
                  <textarea
                    className="dx-input text-[13px]"
                    value={ex.cues.join('\n')}
                    onChange={e => updateExercise(i, 'cues', e.target.value.split('\n').filter(s=>s.trim()))}
                    placeholder="Keep core tight..."
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button onClick={() => removeExercise(i)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-600 dark:text-red-400"><Trash2 size={14}/> Remove</button>
                  <button onClick={() => setEditingIdx(null)} className="dx-btn h-10 px-5 text-[13px]">Done</button>
                </div>
              </div>
            ) : (
              <div
                className={`flex gap-3 ${isOwner ? 'cursor-pointer group' : ''}`}
                onClick={() => isOwner && setEditingIdx(i)}
              >
                <span className="w-7 h-7 mt-0.5 rounded-full flex items-center justify-center text-[12px] font-semibold tabular shrink-0" style={{ background: 'var(--dx-card-2)', color: 'var(--dx-muted)' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[15px] font-semibold leading-snug">{ex.name}</div>
                    {isOwner && <Pencil size={14} className="mt-1 shrink-0 dx-muted opacity-60 group-hover:opacity-100 transition-opacity" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {ex.sets && <span className="dx-tag"><strong>{ex.sets}</strong></span>}
                    {ex.tempo && <span className="dx-tag">Tempo <strong>{ex.tempo}</strong></span>}
                    {ex.rest && <span className="dx-tag">Rest <strong>{ex.rest}</strong></span>}
                  </div>
                  {(() => {
                    const targetName = ex.name?.trim().toLowerCase();
                    const prevWorkout = workoutHistory.find((w: any) =>
                      w.exercises?.some((e: any) => e.name?.trim().toLowerCase() === targetName && e.sets?.some((s: any) => s.completed !== false && ((s.reps ?? 0) > 0 || (s.seconds ?? 0) > 0 || (s.weight ?? 0) > 0)))
                    );
                    const prevEx = prevWorkout?.exercises?.find((e: any) => e.name?.trim().toLowerCase() === targetName);
                    const prevCompletedSets = prevEx?.sets?.filter((s: any) => s.completed !== false && ((s.reps ?? 0) > 0 || (s.seconds ?? 0) > 0 || (s.weight ?? 0) > 0)) || [];
                    if (prevCompletedSets.length === 0) return null;
                    const prevSummary = prevCompletedSets
                      .map((s: any) => `${s.reps || s.seconds || 0}${s.seconds ? 's' : ''}${s.weight ? `@${s.weight}kg` : ''}`)
                      .join(', ');
                    return (
                      <div className="flex items-center gap-1.5 text-[12px] dx-muted mt-2 min-w-0">
                        <History size={12} className="shrink-0" />
                        <span className="truncate">Last: <span className="font-medium tabular" style={{ color: 'var(--dx-text)' }}>{prevSummary}</span></span>
                      </div>
                    );
                  })()}
                  {ex.cues && ex.cues.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
                      {ex.cues.map((cue, ci) => (
                        <li key={ci} className="flex gap-2 text-[12.5px] leading-snug dx-muted">
                          <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--dx-accent)' }} />
                          <span>{cue}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {exercises.length === 0 && (
          <div className="px-5 py-6 text-center text-[13px] dx-muted">No exercises yet.</div>
        )}

        {isOwner && (
          <button onClick={addExercise} className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-[13px] font-semibold dx-accent transition-colors hover:bg-[var(--dx-card-2)]">
            <Plus size={15}/> Add exercise
          </button>
        )}
      </div>
    </section>
  );
}

export function DayView() {
  const { planId, dayId } = useParams<{ planId: string, dayId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [day, setDay] = useState<PlanDay | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data: plan } = useQuery({ queryKey: ['plan', planId], queryFn: () => getPlan(planId!) });
  const { data: days } = useQuery({ queryKey: ['planDays', planId], queryFn: () => getPlanDays(planId!) });

  const { data: workoutHistory = [] } = useQuery({
    queryKey: ['workoutHistory', user?.uid],
    queryFn: async () => {
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', user!.uid)
      );
      const snap = await getDocs(q);
      const getWorkoutTime = (w: any): number => {
        if (w.startedAt?.toMillis) return w.startedAt.toMillis();
        if (w.startedAt?.seconds) return w.startedAt.seconds * 1000;
        if (w.finishedAt?.toMillis) return w.finishedAt.toMillis();
        if (w.finishedAt?.seconds) return w.finishedAt.seconds * 1000;
        if (w.date) {
          const t = new Date(w.date).getTime();
          if (!isNaN(t)) return t;
        }
        return 0;
      };
      return snap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .sort((a, b) => getWorkoutTime(b) - getWorkoutTime(a));
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (days) {
      const d = days.find(d => d.id === dayId);
      if (d && !day) setDay(JSON.parse(JSON.stringify(d))); // deep copy for local edits
    }
  }, [days, dayId, day]);

  const isOwner = user && plan && user.uid === plan.ownerId && plan.type !== 'sample';

  const saveMutation = useMutation({
    mutationFn: () => savePlanDay(planId!, day!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planDays', planId] });
      setIsDirty(false);
      showToast('Day saved successfully');
    },
  });

  const handleUpdate = (updates: Partial<PlanDay>) => {
    setDay(prev => ({ ...prev!, ...updates }));
    setIsDirty(true);
  };

  if (!day || !plan) {
    return (
      <div className="dx max-w-3xl mx-auto space-y-4 pt-2 animate-pulse">
        <div className="h-9 w-9 rounded-xl" style={{ background: 'var(--dx-card-2)' }} />
        <div className="h-48 rounded-3xl" style={{ background: 'var(--dx-card-2)' }} />
        <div className="h-40 rounded-3xl" style={{ background: 'var(--dx-card-2)' }} />
      </div>
    );
  }

  const sections = [day.warmup, day.skillWork, day.strength, day.cooldown];
  const totalExercises = sections.reduce((n, s) => n + (s?.length || 0), 0);
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const doneToday = workoutHistory.some((w: any) => w.dayId === dayId && w.date === todayKey);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="dx pro-scope max-w-3xl mx-auto pb-28 pt-1 sm:pt-3">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="dx-icon-btn dx-icon-btn--sm" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className="dx-eyebrow">Workout plan</div>
          <div className="text-[14px] font-semibold truncate">{plan.title}</div>
        </div>
      </div>

      <section className="dx-hero p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-75">
            Day {day.dayNumber} · {day.type || 'Strength'}
          </span>
          {doneToday && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-semibold" style={{ background: 'rgba(52, 211, 153, 0.18)', color: '#a7f3d0' }}>
              Done today
            </span>
          )}
        </div>
        <h1 className="mt-2 text-[24px] sm:text-[28px] font-semibold tracking-tight leading-tight">{day.title || 'Untitled day'}</h1>
        {day.skill && <p className="mt-1 text-[14px] opacity-80">Skill focus · {day.skill}</p>}

        <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-medium">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 h-7" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <Layers size={13} /> {totalExercises} exercises
          </span>
          {day.time && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 h-7" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <Clock size={13} /> {day.time}
            </span>
          )}
        </div>

        <Link to={`/workout/${planId}/day/${dayId}`} className="dx-hero-btn w-full mt-5">
          {doneToday ? <RotateCcw size={18} /> : <Play size={18} fill="currentColor" />}
          {doneToday ? 'View or redo workout' : 'Start workout'}
        </Link>
      </section>

      {isOwner && (
        <section className="dx-card p-4 sm:p-5 mt-4">
          <h2 className="dx-section-title mb-3">Day details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
            <div>
              <label className="dx-label">Title</label>
              <input className="dx-input" value={day.title} onChange={e => handleUpdate({ title: e.target.value })}/>
            </div>
            <div>
              <label className="dx-label">Skill focus</label>
              <input className="dx-input" value={day.skill} onChange={e => handleUpdate({ skill: e.target.value })} placeholder="e.g. Handstand"/>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-4 mt-4">
        <ExerciseSection title="Warm-up" icon={Activity} exercises={day.warmup || []} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ warmup: exs })} workoutHistory={workoutHistory} />
        <ExerciseSection title="Skill work" icon={Target} exercises={day.skillWork || []} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ skillWork: exs })} workoutHistory={workoutHistory} />
        <ExerciseSection title="Strength" icon={Dumbbell} exercises={day.strength || []} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ strength: exs })} workoutHistory={workoutHistory} />
        <ExerciseSection title="Cool-down" icon={Wind} exercises={day.cooldown || []} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ cooldown: exs })} workoutHistory={workoutHistory} />
      </div>

      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="dx-actionbar z-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex-1 pl-2 text-[13px] font-semibold">Unsaved changes</span>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="dx-btn">
                {saveMutation.isPending ? 'Saving…' : 'Save day'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
