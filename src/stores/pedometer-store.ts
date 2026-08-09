import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pedometerService } from '@/services/pedometer';

interface PedometerState {
  backgroundEnabled: boolean;
  isSupported: boolean;
  dailySteps: number;
  sessionSteps: number;
  lastUpdated: number;
  isSessionActive: boolean;
  nativeInitialSteps: number | null;
  
  toggleBackground: () => Promise<void>;
  startSession: () => Promise<boolean>;
  stopSession: () => void;
  resetSession: () => void;
  setSupported: (supported: boolean) => void;
}

export const usePedometerStore = create<PedometerState>()(
  persist(
    (set, get) => ({
      backgroundEnabled: false,
      isSupported: true, // assume true until it fails
      dailySteps: 0,
      sessionSteps: 0,
      lastUpdated: Date.now(),
      isSessionActive: false,
      nativeInitialSteps: null,
      
      setSupported: (supported) => set({ isSupported: supported }),

      toggleBackground: async () => {
        const { backgroundEnabled } = get();
        if (!backgroundEnabled) {
          const granted = await pedometerService.requestPermission();
          if (granted) {
            set({ backgroundEnabled: true, isSupported: true });
          } else {
            set({ isSupported: false, backgroundEnabled: false });
          }
        } else {
          set({ backgroundEnabled: false });
        }
      },
      
      startSession: async () => {
        const granted = await pedometerService.requestPermission();
        if (!granted) {
          set({ isSupported: false });
          return false;
        }

        set({ sessionSteps: 0, isSupported: true, isSessionActive: true, nativeInitialSteps: null });
        
        pedometerService.start((steps) => {
          // 'steps' could be absolute daily steps from native or absolute session steps from web
          const state = get();
          if (!state.isSessionActive) return;

          if (typeof steps === 'number') {
            // Check if it's the web fallback which starts from 1
            // or native which might return 5430.
            if (steps < 1000 && state.nativeInitialSteps === null && steps <= 2) {
               // Likely web fallback
               set({ sessionSteps: steps });
            } else {
               // Likely native absolute steps
               if (state.nativeInitialSteps === null) {
                 set({ nativeInitialSteps: steps, sessionSteps: 0 });
               } else {
                 set({ sessionSteps: Math.max(0, steps - state.nativeInitialSteps) });
               }
            }
          }
        });
        return true;
      },
      
      stopSession: () => {
        set({ isSessionActive: false });
        pedometerService.stop();
      },
      
      resetSession: () => set({ sessionSteps: 0, nativeInitialSteps: null }),
    }),
    {
      name: 'pedometer-storage',
      partialize: (state) => ({ 
        backgroundEnabled: state.backgroundEnabled, 
        dailySteps: state.dailySteps,
        lastUpdated: state.lastUpdated
      }),
    }
  )
);
