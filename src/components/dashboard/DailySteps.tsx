import { usePedometerStore } from '@/stores/pedometer-store';
import { useAuthStore } from '@/stores/auth-store';
import { Footprints } from 'lucide-react';
import { motion } from 'framer-motion';

export function DailyStepsWidget() {
  const { isSupported, backgroundEnabled, dailySteps } = usePedometerStore();
  const { profile } = useAuthStore();

  if (!isSupported || !backgroundEnabled) {
    return null;
  }

  const stepGoal = profile?.stepGoal || 10000;
  const progress = Math.min((dailySteps / stepGoal) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 mb-8 flex items-center shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden"
    >
      <div className="flex items-center gap-3 sm:gap-4 w-full relative z-10">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sienna/10 text-sienna flex items-center justify-center shrink-0 shadow-inner">
          <Footprints size={20} className="sm:w-6 sm:h-6" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-end justify-between mb-2">
            <span className="font-mono text-[var(--muted)] uppercase tracking-wider text-xs sm:text-sm font-semibold truncate">
              Daily Steps
            </span>
            <div className="font-mono text-sm sm:text-base">
              <span className="font-bold text-[var(--text)]">{dailySteps.toLocaleString()}</span>
              <span className="text-[var(--muted)] ml-1">/ {stepGoal.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="h-1.5 sm:h-2 w-full bg-[var(--border)] rounded-full overflow-hidden shadow-inner">
            <motion.div 
              className="h-full bg-sienna"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
