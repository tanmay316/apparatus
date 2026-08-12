import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pedometerService } from '@/services/pedometer';

const PEDOMETER_CONFIG = {
  counterResetThreshold: 100,
};

interface PedometerState {
  isSupported: boolean | null;
  sessionSteps: number;
  lastUpdated: number;
  lastStepAt: number | null;
  isSessionActive: boolean;
  
  nativeBaseline: number | null;
  accumulatedBeforeReset: number;
  lastNativeSteps: number | null;
  
  stepSource: 'native' | 'gps_estimate' | 'motion_estimate' | 'none';
  
  startSession: () => Promise<boolean>;
  stopSession: () => Promise<void>;
  resetSession: () => void;
  setSupported: (supported: boolean) => void;
}

export const usePedometerStore = create<PedometerState>()(
  persist(
    (set, get) => ({
      isSupported: null,
      sessionSteps: 0,
      lastUpdated: Date.now(),
      lastStepAt: null,
      isSessionActive: false,
      
      nativeBaseline: null,
      accumulatedBeforeReset: 0,
      lastNativeSteps: null,
      stepSource: 'none',
      
      setSupported: (supported) => set({ isSupported: supported }),


      
      startSession: async () => {
        set({ 
          sessionSteps: 0, 
          isSupported: true, 
          isSessionActive: true, 
          nativeBaseline: null, 
          accumulatedBeforeReset: 0,
          lastNativeSteps: null,
          stepSource: 'none',
          lastStepAt: null 
        });
        
        const started = await pedometerService.start((steps, isNative) => {
          const state = get();
          if (!state.isSessionActive) return;

          if (typeof steps === 'number') {
            if (!isNative) {
               set({ sessionSteps: steps, stepSource: 'motion_estimate' });
            }
             if (isNative) {
               let { nativeBaseline, accumulatedBeforeReset, lastNativeSteps } = state;
               
               if (nativeBaseline === null) {
                 nativeBaseline = steps;
               } else if (
                 lastNativeSteps !== null && 
                 steps < lastNativeSteps && 
                 (lastNativeSteps - steps > PEDOMETER_CONFIG.counterResetThreshold)
               ) {
                 // Sensor reset/reboot detected (huge backwards movement)
                 accumulatedBeforeReset = state.sessionSteps; // Freeze current total
                 nativeBaseline = steps; // Set new baseline
               }
               
               // Small backwards movements (temporary anomalies) are ignored for baseline resets, 
               // but we still update the step count relative to the stable baseline.
               const currentContribution = Math.max(0, steps - nativeBaseline);
               const calculatedSession = accumulatedBeforeReset + currentContribution;
               
               // Never allow session steps to decrease during an active session
               const sessionSteps = Math.max(state.sessionSteps, calculatedSession);
               
               // Update lastStepAt only if the session steps actually increased
               const lastStepAt = sessionSteps > state.sessionSteps ? Date.now() : state.lastStepAt;
               
               set({ 
                 nativeBaseline,
                 accumulatedBeforeReset,
                 lastNativeSteps: steps,
                 sessionSteps,
                 stepSource: 'native',
                 lastUpdated: Date.now(),
                 lastStepAt
               });
             }
          }
        });

        if (!started) {
          set({
            stepSource: 'none',
            isSessionActive: false,
            isSupported: false,
          });
          return false;
        }
        return true;
      },
      
      stopSession: async () => {
        set({ isSessionActive: false });
        await pedometerService.stop();
      },
      
      resetSession: () => set({ sessionSteps: 0, nativeBaseline: null, accumulatedBeforeReset: 0, lastNativeSteps: null, stepSource: 'none' }),
    }),
    {
      name: 'pedometer-storage',
      partialize: (state) => ({ 
        lastUpdated: state.lastUpdated
      }),
    }
  )
);
