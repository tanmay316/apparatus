import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Plus, X, Video, Share2 } from 'lucide-react';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { useUserWeight } from '@/hooks/use-user-weight';
import { getPlan, getPlanDays } from '@/services/plans';
import { saveWorkout } from '@/services/workouts';
import { postActivity } from '@/services/social';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { ExerciseLogModal } from '@/components/ui/ExerciseLogModal';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ExerciseAutocomplete } from '@/components/ui/ExerciseAutocomplete';
import type { Exercise } from '@/types';
import { calculateWorkoutCalories, calculateWorkoutVolume } from '@/lib/calories';
import { calculateBodyweightReps } from '@/lib/muscle-map';

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function historicalLogToExercise(log: any): Exercise {
  const setCount = Math.max(1, log.sets?.length || 1);
  const isHold = log.mode === 'hold' || log.sets?.some((set: any) => Number(set.seconds) > 0);
  const target = isHold ? `${log.sets?.[0]?.seconds || 0} sec` : `${log.sets?.[0]?.reps || 0}`;
  return {
    name: log.name,
    sets: `${setCount} x ${target}`,
    tempo: '',
    rest: '',
    cues: [],
    yt: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${log.name} correct form`)}`,
  };
}

export function WorkoutSession() {
  const { planId, dayId } = useParams<{ planId: string, dayId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { showToast, units } = useUIStore();
  const queryClient = useQueryClient();
  const userWeight = useUserWeight();
  
  const store = useWorkoutStore();

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId!),
    enabled: !!planId,
    refetchOnWindowFocus: false,
  });

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['planDays', planId],
    queryFn: () => getPlanDays(planId!),
    enabled: !!planId,
    refetchOnWindowFocus: false,
  });

  const { data: todayWorkouts = [], isLoading: todayWorkoutsLoading } = useQuery({
    queryKey: ['todayWorkouts', user?.uid],
    queryFn: async () => {
      const todayStr = localDateKey(new Date());
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', user!.uid),
        where('date', '==', todayStr)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => doc.data());
    },
    enabled: !!user,
  });

  const currentDay = days.find(d => d.id === dayId);
  const wasCompletedToday = todayWorkouts.some((w: any) => w.dayId === dayId);
  const [sessionFinished, setSessionFinished] = useState(false);

  // Initialize workout if not active or if plan/day mismatch
  useEffect(() => {
    if (todayWorkoutsLoading) return;
    if (plan && currentDay) {
      if (wasCompletedToday) {
        if (store.isActive) store.finishWorkout();
        setSessionFinished(true);
        return;
      }
      if (!store.isActive || store.planId !== plan.id || store.dayId !== currentDay.id) {
        store.startWorkout(plan, currentDay);
      }
    }
  }, [plan, currentDay, wasCompletedToday, todayWorkoutsLoading]); // Only re-run if plan/day/completion changes

  // Stopwatch state
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (store.isActive && store.startedAt && !sessionFinished) {
      const interval = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - store.startedAt!) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [store.isActive, store.startedAt, sessionFinished]);

  useEffect(() => {
    const completedWorkout = todayWorkouts.find((workout: any) => workout.dayId === dayId) as any;
    if (!todayWorkoutsLoading && completedWorkout) {
      setElapsedSec(Math.max(0, Number(completedWorkout.durationMin || 0) * 60));
    }
  }, [todayWorkoutsLoading, dayId, todayWorkouts]);

  const [activeExercise, setActiveExercise] = useState<{name: string, mode: 'reps'|'hold'|'freeform', index: number, section: 'warmup' | 'skillWork' | 'strength' | 'cooldown'} | null>(null);
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'private'>('followers');
  
  // Add exercise state
  const [addSection, setAddSection] = useState<'warmup' | 'skillWork' | 'strength' | 'cooldown' | null>(null);
  const [addName, setAddName] = useState('');
  const [addSets, setAddSets] = useState('');
  const [addTempo, setAddTempo] = useState('');
  const [addRest, setAddRest] = useState('');
  const [addCues, setAddCues] = useState('');
  const [addYt, setAddYt] = useState('');
  const [selectedExerciseMeta, setSelectedExerciseMeta] = useState<{ caloriesPerRep?: number; caloriesPerSecond?: number; muscleGroup?: string; equipment?: string; met?: number }>({});

  const formatStopwatch = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const completedWorkoutForDay = todayWorkouts.find((w: any) => w.dayId === dayId);
  const historicalLogs = (completedWorkoutForDay?.exercises || []) as any[];
  const historicalExercises = historicalLogs.map(historicalLogToExercise);
  const planExercises = [...(currentDay?.warmup || []), ...(currentDay?.skillWork || []), ...(currentDay?.strength || []), ...(currentDay?.cooldown || [])];
  const missingHistoricalExercises = historicalExercises.filter(exercise => !planExercises.some(item => item.name === exercise.name));
  const hasPlanExercises = planExercises.length > 0;
  const displayWarmup = currentDay?.warmup || [];
  const displaySkillWork = currentDay?.skillWork || [];
  const displayCooldown = currentDay?.cooldown || [];
  const displayStrength = hasPlanExercises ? [...(currentDay?.strength || []), ...missingHistoricalExercises] : historicalExercises;
  const displayExercises = [...displayWarmup, ...displaySkillWork, ...displayStrength, ...displayCooldown];
  const activeLogs = store.isActive ? Object.values(store.logs) : historicalLogs;
  const activeExercises = store.isActive
    ? [...store.warmup, ...store.skillWork, ...store.strength, ...store.cooldown]
    : displayExercises;
  const estimatedCalories = calculateWorkoutCalories(
    activeExercises,
    activeLogs.filter(ex => ex.sets.some((s: any) => s.completed)),
    userWeight,
    Math.max(1, Math.round(elapsedSec / 60)),
  );
  const displayCalories = activeLogs.length > 0
    ? estimatedCalories
    : Number(completedWorkoutForDay?.calories || 0);
  const externalVolume = calculateWorkoutVolume(activeExercises, activeLogs.filter(ex => ex.sets.some((s: any) => s.completed)), userWeight || 70);
  const bodyweightReps = calculateBodyweightReps(activeLogs);

  const displayWeight = userWeight ? (units === 'imperial' ? Math.round(userWeight * 2.20462) : userWeight) : null;
  const displayWeightUnit = units === 'imperial' ? 'lb' : 'kg';
  const bwLabel = displayWeight ? 'reps @ BW' : 'BW reps';

  const volumeDisplay = externalVolume > 0
    ? `${externalVolume.toLocaleString()} kg·reps${bodyweightReps ? ` · ${bodyweightReps} ${bwLabel}` : ''}`
    : bodyweightReps > 0 ? `${bodyweightReps} ${bwLabel}` : '0 kg·reps';

  const handleFinish = async () => {
    if (!user || !store.isActive) return;
    
    const exLogs = Object.values(store.logs).filter(ex => ex.sets.some(s => s.completed));
    const allExercises = [...store.warmup, ...store.skillWork, ...store.strength, ...store.cooldown];
    const totalVol = calculateWorkoutVolume(allExercises, exLogs, userWeight || 70);
    const finalDurationMin = Math.max(1, Math.round(elapsedSec / 60));
    const calories = displayCalories;

    try {
      // Award XP celebration values
      const streakBonus = 2; // static for now
      const xpEarned = 100 + Math.round(totalVol / 1000) + Math.round(elapsedSec / 60);

      const workoutId = await saveWorkout(user.uid, {
        userId: user.uid,
        userName: user.displayName || 'Unknown',
        userPhoto: user.photoURL || '',
        planId: store.planId!,
        planTitle: store.planTitle,
        dayId: store.dayId!,
        dayTitle: store.dayTitle,
        date: localDateKey(new Date()),
        startedAt: { seconds: Math.floor(store.startedAt! / 1000), nanoseconds: 0 } as any,
        finishedAt: null, // Set in backend
        durationMin: finalDurationMin,
        calories,
        volume: totalVol,
        bodyweight: userWeight || undefined,
        visibility: privacy,
        notes: '',
        mood: '',
        exercises: exLogs as any,
        likesCount: 0,
        commentsCount: 0
      });

      // Post to activity feed
      try {
        await postActivity({
          userId: user!.uid,
          userName: user!.displayName || 'Athlete',
          username: profile!.username,
          userPhoto: user!.photoURL || '',
          type: 'workout',
          workoutId: workoutId,
          summary: `Completed ${store.dayTitle} from ${plan!.title}`,
          details: {
            planTitle: plan!.title,
            dayTitle: store.dayTitle,
            durationMin: finalDurationMin,
            volume: totalVol,
            calories,
            bodyweight: userWeight || null,
            exercises: exLogs.map(e => e.name),
            // Preserve completion state so shared anatomy reflects this
            // workout's actual completed sets, not the planned exercises.
            exerciseLogs: exLogs.map(e => ({ name: e.name, sets: e.sets }))
          },
          visibility: privacy,
          likesCount: 0,
          commentsCount: 0,
        });
      } catch (e) {
        console.error('Failed to post activity:', e);
      }
      
      // Invalidate queries to refresh dashboard metrics immediately
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['todayWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['recentWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['progressWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['calendarWorkouts'] });

      // Navigate or show celebration! We'll show celebration by setting local state or let App handle it.
      // But user wanted: "after i log my day it should display this type of pop up"
      // We will show a custom celebration dialog
      setCelebrationData({
        heading: 'DAY COMPLETE',
        sub: `${store.dayTitle} — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        xpBreakdown: [
          { label: 'Day complete', val: 40 },
          { label: 'Streak bonus (1d)', val: 2 }
        ],
        totalXp: 42
      });

      // Prepare share data for the share card - filter out warmup and cooldown exercises
      const warmupNames = new Set((store.warmup || []).map(e => e.name.toLowerCase()));
      const cooldownNames = new Set((store.cooldown || []).map(e => e.name.toLowerCase()));
      const filteredShareExLogs = exLogs.filter(e => !warmupNames.has(e.name.toLowerCase()) && !cooldownNames.has(e.name.toLowerCase()));

      setShareData({
        dayTitle: store.dayTitle,
        planTitle: plan!.title,
        date: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        durationMin: finalDurationMin,
        volume: totalVol,
        calories,
        exerciseNames: filteredShareExLogs.map(e => e.name),
        exerciseLogs: filteredShareExLogs.map(e => ({ name: e.name, sets: e.sets })),
        bodyweight: userWeight || undefined,
      });
      // End and clear the persisted session immediately. The celebration and
      // share dialogs use the snapshots above and must not keep the stopwatch alive.
      setSessionFinished(true);
      store.finishWorkout();
    } catch (error) {
      showToast('Failed to save workout', 'error');
    }
  };

  const [celebrationData, setCelebrationData] = useState<{heading: string, sub: string, xpBreakdown: {label: string, val: number}[], totalXp: number} | null>(null);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  if (planLoading || daysLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan || !currentDay || (!store.isActive && !wasCompletedToday && !sessionFinished)) {
    return (
      <div className="text-center py-20 text-bone-dim">
        Workout initializing...
      </div>
    );
  }



  const exMode = (setsStr: string) => {
    if (!setsStr) return 'freeform';
    const m = setsStr.match(/^(\d+)\s*x\s*(.+)$/i);
    if (!m) return 'freeform';
    const rest = m[2];
    if (/sec|min/i.test(rest)) return 'hold';
    return 'reps';
  };

  const handleSelectAutocomplete = (libEx: any) => {
    setAddName(libEx.name);
    setAddCues(libEx.instructions?.join('\n') || '');
    setAddYt(libEx.youtubeSearch || '');
    setSelectedExerciseMeta({ caloriesPerRep: libEx.caloriesPerRep, caloriesPerSecond: libEx.caloriesPerSecond, muscleGroup: libEx.muscleGroup, equipment: libEx.equipment, met: libEx.met });
  };

  const handleAddExercise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addSection) return;
    store.addExercise(addSection, {
      name: addName.trim(),
      sets: addSets.trim() || '3 x 10',
      tempo: addTempo.trim(),
      rest: addRest.trim(),
      cues: addCues.split('\n').map(c => c.trim()).filter(Boolean),
      yt: addYt.trim()
      , ...selectedExerciseMeta
    });
    setAddSection(null);
    setAddName('');
    setAddSets('');
    setAddTempo('');
    setAddRest('');
    setAddCues('');
    setAddYt('');
    setSelectedExerciseMeta({});
    showToast('Exercise added to workout');
  };

  const renderSection = (title: string, tagLabel: string, tagColor: string, exercises: Exercise[], sectionKey: 'warmup' | 'skillWork' | 'strength' | 'cooldown') => {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`px-2 py-0.5 text-[10px] font-mono rounded font-bold uppercase tracking-wider ${tagColor}`}>
              {tagLabel}
            </div>
            <h4 className="font-display text-lg">{title}</h4>
          </div>
          <button 
            onClick={() => setAddSection(sectionKey)}
            className="text-[10px] text-teal font-mono border border-teal/30 px-1.5 py-0.5 rounded bg-teal/5 flex items-center gap-1 hover:bg-teal/15 transition-all"
          >
            <Plus size={10} /> Add
          </button>
        </div>
        
        <div className="space-y-3">
          {exercises.length === 0 ? (
            <div className="text-xs text-bone-dim py-4 px-4 border border-dashed border-line rounded">
              No exercises added.
            </div>
          ) : (
            exercises.map((e, idx) => {
              const log = activeLogs.find(item => item.name === e.name);
              const histLog = completedWorkoutForDay?.exercises?.find((ex: any) => ex.name === e.name);
              const isDone = wasCompletedToday
                ? !!(histLog && histLog.sets?.some((s: any) => s.completed))
                : !!(log && log.sets.some((s: any) => s.completed));
              
              return (
                <div 
                  key={idx} 
                  onClick={() => setActiveExercise({ name: e.name, mode: exMode(e.sets), index: idx, section: sectionKey })}
                  className="card-hover p-4 flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={(event) => {
                        event.stopPropagation();
                        if (wasCompletedToday) return;
                        const isCurrentlyDone = log && log.sets.some((s: any) => s.completed);
                        log?.sets.forEach((_: any, setIdx: number) => {
                          store.markSetComplete(e.name, setIdx, !isCurrentlyDone);
                        });
                        showToast(`All sets marked ${!isCurrentlyDone ? 'complete' : 'incomplete'}`);
                      }}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-none transition-colors ${isDone ? 'bg-teal border-teal text-ink font-bold' : 'border-line text-transparent hover:border-teal'}`}
                    >
                      {isDone ? '✓' : ''}
                    </button>
                    <div>
                      <h5 className={`font-semibold ${isDone ? 'text-teal' : ''}`}>{e.name}</h5>
                      <div className="text-xs text-bone-dim font-mono mt-0.5">
                        {e.sets} {e.tempo ? `· tempo ${e.tempo}` : ''} {e.rest ? `· rest ${e.rest}` : ''}
                      </div>
                      <div className="text-[10px] text-bone-dim mt-1">No history yet</div>
                    </div>
                  </div>
                  <div className="text-bone-dim group-hover:text-teal transition-colors">›</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pb-32">
      <div className="flex justify-between items-center mb-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-bone-dim hover:text-bone transition-colors">
          <ArrowLeft size={16} /> Quit
        </Link>
        <div className="flex items-center gap-2 font-mono text-teal">
          <Clock size={16} />
          {formatStopwatch(elapsedSec)}
        </div>
      </div>
      
      <div className="mb-8 pb-6 border-b border-line">
        <div className="font-mono text-amber text-[11px] tracking-widest mb-1 uppercase">
          DAY {currentDay.dayNumber.toString().padStart(2, '0')} / 07 · ~{currentDay.time}
        </div>
        <h1 className="font-display text-3xl mb-2">{currentDay.title}</h1>
        <div className="text-sm text-bone-dim font-mono">
          SKILL: <span className="text-bone">{currentDay.skill || 'None'}</span> • PROGRESS: <span className="text-teal">{activeLogs.filter(ex => ex.sets.some((s: any) => s.completed)).length}/{activeExercises.length}</span>
        </div>
        
        {/* Dynamic metrics strip */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-ink-2 border border-line p-4 rounded-lg">
            <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider">DURATION (TODAY)</div>
            <div className="text-xl font-bold font-mono mt-1 text-bone">{Math.round(elapsedSec / 60)} min</div>
          </div>
          <div className="bg-ink-2 border border-line p-4 rounded-lg">
            <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider">EXTERNAL VOLUME</div>
            <div className="text-xl font-bold font-mono mt-1 text-bone">{volumeDisplay}</div>
          </div>
          <div className="bg-ink-2 border border-line p-4 rounded-lg">
            <div className="text-[10px] font-mono text-bone-dim uppercase tracking-wider">EST. CALORIES</div>
            <div className="text-xl font-bold font-mono mt-1 text-bone">{displayCalories} kcal</div>
          </div>
        </div>
      </div>

      {renderSection(currentDay.time, 'WARM-UP', 'bg-bone text-ink', store.isActive ? store.warmup : displayWarmup, 'warmup')}
      {renderSection('~15 min', `SKILL — ${currentDay.skill || 'NONE'}`, 'bg-amber/20 text-amber border border-amber/30', store.isActive ? store.skillWork : displaySkillWork, 'skillWork')}
      {renderSection('Main sets', 'STRENGTH', 'bg-teal/20 text-teal border border-teal/30', store.isActive ? store.strength : displayStrength, 'strength')}
      {renderSection('5-10 min', 'COOLDOWN', 'bg-bone text-ink', store.isActive ? store.cooldown : displayCooldown, 'cooldown')}

      <div className="mt-12 flex flex-col items-center justify-center gap-3 pb-20">
         <div className="flex items-center gap-3 bg-ink-2 p-2 px-4 rounded border border-line">
           <span className="text-xs font-mono text-bone-dim uppercase">Workout Privacy:</span>
           <select 
             className="bg-transparent text-xs font-mono text-teal border-none focus:outline-none cursor-pointer"
             value={privacy}
             onChange={(e) => setPrivacy(e.target.value as any)}
           >
             <option value="followers" className="bg-ink text-bone">Followers only (Default)</option>
             <option value="public" className="bg-ink text-bone">Public</option>
             <option value="private" className="bg-ink text-bone">Private</option>
           </select>
         </div>
         <button 
           onClick={handleFinish}
           disabled={wasCompletedToday || sessionFinished}
           className={`py-3.5 px-8 text-base w-full max-w-md font-bold tracking-wider rounded-lg transition-all ${wasCompletedToday ? 'bg-line text-bone-dim cursor-not-allowed opacity-50' : 'btn-primary shadow-[0_0_20px_rgba(79,158,141,0.3)]'}`}
         >
           {wasCompletedToday || sessionFinished ? '✓ Day Logged' : 'Finish Workout'}
         </button>
      </div>

      {activeExercise && (store[activeExercise.section][activeExercise.index] || wasCompletedToday) && (
        <ExerciseLogModal 
          isOpen={true} 
          onClose={() => setActiveExercise(null)} 
          exercise={
            (store[activeExercise.section] && store[activeExercise.section][activeExercise.index]) || 
            activeExercises.find(e => e.name === activeExercise.name)!
          }
          section={activeExercise.section}
          index={activeExercise.index}
          historicalLog={wasCompletedToday ? completedWorkoutForDay?.exercises?.find((ex: any) => ex.name === activeExercise.name) : undefined}
        />
      )}

      {/* Add New Exercise Modal */}
      {addSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setAddSection(null)} />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-md bg-ink-2 border border-line rounded-xl p-6 z-10 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-display text-xl">Add New Exercise</h3>
                <p className="text-xs text-bone-dim mt-0.5">Create a new exercise for this section</p>
              </div>
              <button onClick={() => setAddSection(null)} className="p-1 text-bone-dim hover:text-bone">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleAddExercise} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-bone-dim block mb-1">Exercise Name</label>
                <ExerciseAutocomplete
                  value={addName}
                  onChange={setAddName}
                  onSelect={handleSelectAutocomplete}
                  placeholder="e.g. Lat Pulldown"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-bone-dim block mb-1">Sets (e.g., 4 x 10 or 3 x 20 sec)</label>
                  <input 
                    type="text" 
                    placeholder="e.g., 3 x 10"
                    className="input-field w-full"
                    value={addSets}
                    onChange={e => setAddSets(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-bone-dim block mb-1">Tempo (e.g., 2-1-2)</label>
                  <input 
                    type="text" 
                    placeholder="e.g., 2-1-2"
                    className="input-field w-full"
                    value={addTempo}
                    onChange={e => setAddTempo(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-bone-dim block mb-1">Rest (e.g., 90s or 2 min)</label>
                <input 
                  type="text" 
                  placeholder="e.g., 90s"
                  className="input-field w-full"
                  value={addRest}
                  onChange={e => setAddRest(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-mono text-bone-dim block mb-1">Form Cues (one per line)</label>
                <textarea 
                  placeholder="Keep arms locked..."
                  className="input-field w-full h-20 text-sm"
                  value={addCues}
                  onChange={e => setAddCues(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-mono text-bone-dim block mb-1">YouTube Search or Link</label>
                <input 
                  type="text" 
                  placeholder="Leave blank to search by name"
                  className="input-field w-full"
                  value={addYt}
                  onChange={e => setAddYt(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary w-full py-3 mt-2">
                Add Exercise
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Celebration Modal */}
      {celebrationData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/90 backdrop-blur" />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-md bg-ink-2 border border-line rounded-xl p-8 z-10 text-center"
          >
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="font-display text-3xl mb-1 text-bone">{celebrationData.heading}</h2>
            <p className="text-sm text-bone-dim mb-6">{celebrationData.sub}</p>
            
            <div className="bg-ink border border-line rounded-lg p-4 mb-6">
              {celebrationData.xpBreakdown.map((row, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm py-1.5 border-b border-line/30 last:border-b-0">
                  <span className="text-bone-dim">{row.label}</span>
                  <span className="font-mono text-teal">+{row.val} XP</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-sm font-bold pt-2 mt-1 border-t border-line">
                <span className="text-bone">Total</span>
                <span className="font-mono text-amber">+{celebrationData.totalXp} XP</span>
              </div>
            </div>

            <div className="bg-teal/5 border border-teal/30 rounded-lg p-4 flex gap-4 text-left mb-6 items-center">
              <div className="text-2xl">🏁</div>
              <div>
                <h4 className="font-semibold text-sm text-teal">Day One</h4>
                <p className="text-xs text-bone-dim mt-0.5">Complete your first full training day.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => {
                  setCelebrationData(null);
                  store.finishWorkout();
                  navigate('/');
                }} 
                className="btn-primary py-3"
              >
                Nice – back to it
              </button>
              <button
                onClick={() => setCelebrationData(null)}
                className="flex items-center justify-center gap-2 bg-ink-3 border border-teal/40 text-teal font-display font-bold uppercase tracking-wider py-3 rounded-md text-sm hover:bg-teal/10 active:scale-[0.98] transition-all"
              >
                <Share2 size={18} />
                Share
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Share Card Modal */}
      {shareData && !celebrationData && (
        <ShareCardModal
          data={shareData}
          onClose={() => {
            setShareData(null);
            store.finishWorkout();
            navigate('/');
          }}
        />
      )}
    </motion.div>
  );
}
