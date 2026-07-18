import { motion } from 'framer-motion';
import { Zap, TrendingUp, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface StatsPillsProps {
  totalWorkouts: number;
  totalCalories: number;
  totalHours: number;
}

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplayed(value);
      return;
    }
    hasAnimated.current = true;
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplayed(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  return <span ref={ref}>{displayed.toLocaleString()}{suffix}</span>;
}

const pills = [
  {
    key: 'workouts',
    label: 'Workouts Completed',
    tag: 'Total Sessions',
    icon: Zap,
    iconBg: 'bg-[#edf4ff]',
    iconColor: 'text-[#2563eb]',
    suffix: '',
  },
  {
    key: 'calories',
    label: 'Calories Burned',
    tag: 'Energy Output',
    icon: TrendingUp,
    iconBg: 'bg-[#fff4ed]',
    iconColor: 'text-[#ea580c]',
    suffix: '',
  },
  {
    key: 'hours',
    label: 'Training Hours',
    tag: 'Time Invested',
    icon: Clock,
    iconBg: 'bg-[#f5f3ff]',
    iconColor: 'text-[#9333ea]',
    suffix: 'h',
  },
];

export function StatsPills({ totalWorkouts, totalCalories, totalHours }: StatsPillsProps) {
  const values: Record<string, number> = { workouts: totalWorkouts, calories: totalCalories, hours: totalHours };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="flex gap-4 overflow-x-auto px-4 -mx-4 pb-5 pt-1 sm:overflow-visible sm:px-0 sm:mx-0 sm:pb-0 sm:pt-0 sm:grid sm:grid-cols-3 sm:gap-5 mb-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {pills.map((pill) => {
        const Icon = pill.icon;
        return (
          <motion.div
            key={pill.key}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="p-5 sm:p-6 min-w-[220px] sm:min-w-0 shrink-0 sm:shrink rounded-[24px] bg-ink border border-line shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_20px_25px_-5px_rgba(0,0,0,0.06),0_8px_10px_-6px_rgba(0,0,0,0.04)] flex items-center justify-between text-bone relative z-0 hover:z-10"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-12 h-12 rounded-full ${pill.iconBg} flex items-center justify-center ${pill.iconColor} shrink-0`}>
                <Icon size={20} strokeWidth={2} />
              </div>

              <div className="min-w-0">
                <div className="text-[14px] font-sans font-normal text-bone-dim">
                  {pill.label}
                </div>
                <div className="font-sans font-semibold text-2xl text-bone leading-tight mt-0.5">
                  <AnimatedCounter value={values[pill.key]} suffix={pill.suffix} />
                </div>
              </div>
            </div>

            <div className="hidden xl:block text-right">
              <span className="text-xs font-sans text-bone-dim">
                {pill.tag}
              </span>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
