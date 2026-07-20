import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plan, PlanDay, ExerciseLog, SetData, Exercise } from '@/types';

/** Parse the sets count from a sets string like "3 x 8-12". Shared utility. */
function parseSetsCount(setsStr: string): number {
  if (!setsStr) return 1;
  const m = setsStr.match(/^(\d+)\s*x\s*(.+)$/i);
  return m ? parseInt(m[1], 10) : 1;
}

/** Determines the exercise mode from the sets string. */
function inferMode(setsStr: string): 'hold' | 'reps' {
  return setsStr.includes('sec') || setsStr.includes('min') ? 'hold' : 'reps';
}

/** The idle/reset state shape. Used by finishWorkout and cancelWorkout. */
const IDLE_STATE = {
  isActive: false,
  planId: null,
  dayId: null,
  planTitle: '',
  dayTitle: '',
  startedAt: null,
  warmup: [] as Exercise[],
  skillWork: [] as Exercise[],
  strength: [] as Exercise[],
  cooldown: [] as Exercise[],
  logs: {} as Record<string, ExerciseLog>,
} as const;

interface WorkoutState {
  isActive: boolean;
  planId: string | null;
  dayId: string | null;
  planTitle: string;
  dayTitle: string;
  startedAt: number | null;
  
  // Dynamic exercises lists during this workout
  warmup: Exercise[];
  skillWork: Exercise[];
  strength: Exercise[];
  cooldown: Exercise[];
  
  logs: Record<string, ExerciseLog>; // Keyed by exercise name for easy lookup
  
  startWorkout: (plan: Plan, day: PlanDay) => void;
  startTimer: () => void;
  updateSet: (exerciseName: string, mode: 'reps' | 'hold' | 'freeform', setIndex: number, data: SetData) => void;
  addSet: (exerciseName: string, mode: 'reps' | 'hold' | 'freeform') => void;
  removeSet: (exerciseName: string, setIndex: number) => void;
  markSetComplete: (exerciseName: string, setIndex: number, isComplete: boolean) => void;
  updateNotes: (exerciseName: string, notes: string) => void;
  finishWorkout: () => void;
  cancelWorkout: () => void;
  
  editExercise: (section: 'warmup' | 'skillWork' | 'strength' | 'cooldown', idx: number, updated: Exercise) => void;
  deleteExercise: (section: 'warmup' | 'skillWork' | 'strength' | 'cooldown', idx: number) => void;
  addExercise: (section: 'warmup' | 'skillWork' | 'strength' | 'cooldown', exercise: Exercise) => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      ...IDLE_STATE,

      startWorkout: (plan, day) => {
        const logs: Record<string, ExerciseLog> = {};
        
        const initLogs = (exs: Exercise[], section: 'warmup' | 'skillWork' | 'strength' | 'cooldown') => {
          exs.forEach((e) => {
            const count = parseSetsCount(e.sets);
            const mode = inferMode(e.sets);
            logs[e.name] = {
              name: e.name,
              mode,
              order: 0,
              sets: Array.from({ length: count }, () => ({ completed: false })),
              rpe: null,
              durationSec: 0,
              notes: '',
              isPR: false,
              muscleGroup: e.muscleGroup,
              section
            };
          });
        };

        initLogs(day.warmup || [], 'warmup');
        initLogs(day.skillWork || [], 'skillWork');
        initLogs(day.strength || [], 'strength');
        initLogs(day.cooldown || [], 'cooldown');

        set({
          isActive: true,
          planId: plan.id!,
          dayId: day.id!,
          planTitle: plan.title,
          dayTitle: day.title,
          startedAt: null,
          warmup: day.warmup || [],
          skillWork: day.skillWork || [],
          strength: day.strength || [],
          cooldown: day.cooldown || [],
          logs,
        });
      },

      startTimer: () => {
        set({ startedAt: Date.now() });
      },

      updateSet: (exerciseName, mode, setIndex, data) => {
        set((state) => {
          const logs = { ...state.logs };
          if (!logs[exerciseName]) {
            logs[exerciseName] = { name: exerciseName, mode, order: 0, sets: [], rpe: null, durationSec: 0, notes: '', isPR: false };
          }
          const exercise = logs[exerciseName];
          const newSets = [...exercise.sets];
          newSets[setIndex] = { ...newSets[setIndex], ...data };
          
          return { logs: { ...logs, [exerciseName]: { ...exercise, sets: newSets } } };
        });
      },

      addSet: (exerciseName, mode) => {
        set((state) => {
          const logs = { ...state.logs };
          if (!logs[exerciseName]) {
            logs[exerciseName] = { name: exerciseName, mode, order: 0, sets: [], rpe: null, durationSec: 0, notes: '', isPR: false };
          }
          const exercise = logs[exerciseName];
          // Determine previous set data to copy over
          const lastSet = exercise.sets[exercise.sets.length - 1] || {};
          return {
            logs: {
              ...logs,
              [exerciseName]: {
                ...exercise,
                sets: [...exercise.sets, { reps: lastSet.reps, weight: lastSet.weight, seconds: lastSet.seconds, completed: false } as SetData & { completed?: boolean }]
              }
            }
          };
        });
      },

      removeSet: (exerciseName, setIndex) => {
        set((state) => {
          const logs = { ...state.logs };
          if (!logs[exerciseName]) return state;
          const exercise = logs[exerciseName];
          const newSets = [...exercise.sets];
          newSets.splice(setIndex, 1);
          return { logs: { ...logs, [exerciseName]: { ...exercise, sets: newSets } } };
        });
      },

      markSetComplete: (exerciseName, setIndex, isComplete) => {
        set((state) => {
          const logs = { ...state.logs };
          if (!logs[exerciseName]) return state;
          const exercise = logs[exerciseName];
          const newSets = [...exercise.sets];
          // We add a transient `completed` property to SetData for UI purposes
          newSets[setIndex] = { ...newSets[setIndex], completed: isComplete } as SetData & { completed?: boolean };
          return { logs: { ...logs, [exerciseName]: { ...exercise, sets: newSets } } };
        });
      },

      updateNotes: (exerciseName, notes) => {
         set((state) => {
          const logs = { ...state.logs };
          if (!logs[exerciseName]) return state;
          return { logs: { ...logs, [exerciseName]: { ...logs[exerciseName], notes } } };
        });
      },

      finishWorkout: () => {
        set({ ...IDLE_STATE });
      },

      cancelWorkout: () => {
        set({ ...IDLE_STATE });
      },

      editExercise: (section, idx, updated) => {
        set((state) => {
          const list = [...state[section]];
          const oldName = list[idx].name;
          list[idx] = updated;
          
          const logs = { ...state.logs };
          if (oldName !== updated.name) {
            logs[updated.name] = logs[oldName] || { name: updated.name, mode: 'reps' as const, order: 0, sets: [], rpe: null, durationSec: 0, notes: '', isPR: false };
            delete logs[oldName];
            logs[updated.name].name = updated.name;
          }
          logs[updated.name].muscleGroup = updated.muscleGroup;
          logs[updated.name].section = section;
          
          return { [section]: list, logs };
        });
      },

      deleteExercise: (section, idx) => {
        set((state) => {
          const list = [...state[section]];
          const removed = list.splice(idx, 1)[0];
          const logs = { ...state.logs };
          if (removed) delete logs[removed.name];
          return { [section]: list, logs };
        });
      },

      addExercise: (section, exercise) => {
        set((state) => {
          const parseSetsCount = (setsStr: string): number => {
            if (!setsStr) return 1;
            const m = setsStr.match(/^(\d+)\s*x\s*(.+)$/i);
            return m ? parseInt(m[1], 10) : 1;
          };

          const list = [...state[section], exercise];
          const count = parseSetsCount(exercise.sets);
          const mode = inferMode(exercise.sets);
          const logs = {
            ...state.logs,
            [exercise.name]: {
              name: exercise.name,
              mode,
              order: 0,
              sets: Array.from({ length: count }, () => ({ completed: false })),
              rpe: null,
              durationSec: 0,
              notes: '',
              isPR: false,
              muscleGroup: exercise.muscleGroup,
              section
            }
          };

          return { [section]: list, logs };
        });
      },
    }),
    {
      name: 'apparatus-workout-storage',
    }
  )
);
