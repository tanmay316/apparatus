import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Plus, GripVertical, Play, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlan, getPlanDays, savePlanDay } from '@/services/plans';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { ExerciseAutocomplete } from '@/components/ui/ExerciseAutocomplete';
import type { PlanDay, Exercise } from '@/types';

// A simple section component for Warm-up, Skill, Strength, Cooldown
function ExerciseSection({ 
  title, 
  exercises, 
  isOwner, 
  onUpdate 
}: { 
  title: string, 
  exercises: Exercise[], 
  isOwner: boolean,
  onUpdate: (exs: Exercise[]) => void
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
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base text-bone-dim tracking-wider uppercase border-b border-line/50 pb-1 flex-1">{title}</h3>
      </div>
      
      <div className="space-y-3">
        {exercises.map((ex, i) => (
          <div key={i} className="card p-4">
            {editingIdx === i ? (
              <div className="space-y-3">
                <ExerciseAutocomplete
                  value={ex.name}
                  onChange={(val) => updateExercise(i, 'name', val)}
                  onSelect={(libEx) => handleSelectAutocomplete(i, libEx)}
                  placeholder="Exercise Name (e.g. Pull-up)"
                />
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Sets x Reps/Time</label>
                    <input className="input-field" value={ex.sets} onChange={e => updateExercise(i, 'sets', e.target.value)} placeholder="3 x 10" />
                  </div>
                  <div>
                    <label className="label">Tempo</label>
                    <input className="input-field" value={ex.tempo} onChange={e => updateExercise(i, 'tempo', e.target.value)} placeholder="2-1-2" />
                  </div>
                  <div>
                    <label className="label">Rest</label>
                    <input className="input-field" value={ex.rest} onChange={e => updateExercise(i, 'rest', e.target.value)} placeholder="90s" />
                  </div>
                </div>
                <div>
                  <label className="label">YouTube Link or Search Query</label>
                  <input className="input-field" value={ex.yt || ''} onChange={e => updateExercise(i, 'yt', e.target.value)} placeholder="Leave blank to search by name" />
                </div>
                <div>
                  <label className="label">Cues (one per line)</label>
                  <textarea 
                    className="input-field text-xs min-h-[60px]" 
                    value={ex.cues.join('\n')} 
                    onChange={e => updateExercise(i, 'cues', e.target.value.split('\n').filter(s=>s.trim()))}
                    placeholder="Keep core tight..."
                  />
                </div>
                <div className="flex justify-between pt-2">
                  <button onClick={() => removeExercise(i)} className="text-danger text-sm flex items-center gap-1 hover:underline"><Trash2 size={14}/> Remove</button>
                  <button onClick={() => setEditingIdx(null)} className="btn-primary py-1.5 px-4 text-xs">Done</button>
                </div>
              </div>
            ) : (
              <div 
                className={isOwner ? "cursor-pointer group relative pl-6" : "pl-2"}
                onClick={() => isOwner && setEditingIdx(i)}
              >
                {isOwner && <GripVertical size={16} className="absolute left-0 top-1 text-bone-dim opacity-0 group-hover:opacity-100 transition-opacity" />}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm mb-1">{ex.name}</div>
                    <div className="flex items-center gap-3 font-mono text-[10px] text-teal">
                      <span className="bg-teal/10 px-1.5 py-0.5 rounded">{ex.sets}</span>
                      {ex.tempo && <span className="text-bone-dim">T: {ex.tempo}</span>}
                      {ex.rest && <span className="text-bone-dim">R: {ex.rest}</span>}
                    </div>
                  </div>
                </div>
                {ex.cues && ex.cues.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {ex.cues.map((cue, ci) => (
                      <li key={ci} className="text-[12px] text-bone-dim leading-snug pl-3 relative before:content-['—'] before:absolute before:left-0 before:text-teal/50">{cue}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
        
        {isOwner && (
          <button onClick={addExercise} className="w-full py-3 border border-dashed border-line rounded hover:border-teal hover:text-teal transition-colors text-sm font-mono text-bone-dim flex items-center justify-center gap-2">
            <Plus size={14}/> Add {title} Exercise
          </button>
        )}
      </div>
    </div>
  );
}

export function DayView() {
  const { planId, dayId } = useParams<{ planId: string, dayId: string }>();
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [day, setDay] = useState<PlanDay | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data: plan } = useQuery({ queryKey: ['plan', planId], queryFn: () => getPlan(planId!) });
  const { data: days } = useQuery({ queryKey: ['planDays', planId], queryFn: () => getPlanDays(planId!) });

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
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-24">
      <div className="flex items-center justify-between mb-6">
        <Link to={`/plans/${planId}`} className="inline-flex items-center gap-2 text-sm text-bone-dim hover:text-bone transition-colors">
          <ArrowLeft size={16} /> Back to Plan
        </Link>
        <button className="btn-primary flex items-center gap-2 bg-teal-light text-ink hover:bg-teal">
          <Play size={16} fill="currentColor"/> Start Workout
        </button>
      </div>

      <div className="border-b border-line pb-6 mb-8">
        <div className="font-mono text-amber text-xs tracking-widest mb-1 flex justify-between">
          <span>DAY {day.dayNumber} • {day.type.toUpperCase()}</span>
          {isOwner && <span>{day.time}</span>}
        </div>
        
        {isOwner ? (
          <div className="flex gap-4 items-end mt-2">
            <div className="flex-1">
              <label className="label">Title</label>
              <input className="input-field font-display text-2xl py-1 px-3" value={day.title} onChange={e => handleUpdate({ title: e.target.value })}/>
            </div>
            <div className="w-48">
              <label className="label">Skill Focus</label>
              <input className="input-field font-mono text-sm py-1.5 px-3" value={day.skill} onChange={e => handleUpdate({ skill: e.target.value })} placeholder="e.g. Handstand"/>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="font-display text-3xl mb-1">{day.title}</h1>
            {day.skill && <div className="font-mono text-teal text-sm mt-1">{day.skill}</div>}
          </div>
        )}
      </div>

      <ExerciseSection title="Warm-up" exercises={day.warmup} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ warmup: exs })} />
      <ExerciseSection title="Skill Work" exercises={day.skillWork} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ skillWork: exs })} />
      <ExerciseSection title="Strength" exercises={day.strength} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ strength: exs })} />
      <ExerciseSection title="Cool-down" exercises={day.cooldown} isOwner={!!isOwner} onUpdate={exs => handleUpdate({ cooldown: exs })} />

      {/* Save FAB */}
      <AnimatePresence>
        {isDirty && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none"
          >
            <div className="bg-ink-2 border border-line p-3 rounded-xl shadow-2xl flex items-center gap-4 pointer-events-auto max-w-[90vw]">
              <span className="text-sm font-bold text-amber px-2">Unsaved changes</span>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary py-2 px-6">
                {saveMutation.isPending ? 'Saving...' : 'Save Day'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
