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
  { key: 'workouts', label: 'Workouts', icon: Zap, color: 'text-teal', bg: 'bg-teal/10', border: 'border-teal/15', glow: 'hover:shadow-[0_0_16px_rgba(79,158,141,0.12)]', suffix: '' },
  { key: 'calories', label: 'Calories', icon: TrendingUp, color: 'text-amber', bg: 'bg-amber/10', border: 'border-amber/15', glow: 'hover:shadow-[0_0_16px_rgba(210,154,54,0.12)]', suffix: '' },
  { key: 'hours', label: 'Hours', icon: Clock, color: 'text-teal', bg: 'bg-teal/10', border: 'border-teal/15', glow: 'hover:shadow-[0_0_16px_rgba(79,158,141,0.12)]', suffix: 'h' },
];

export function StatsPills({ totalWorkouts, totalCalories, totalHours }: StatsPillsProps) {
  const values: Record<string, number> = { workouts: totalWorkouts, calories: totalCalories, hours: totalHours };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6"
    >
      {pills.map((pill) => {
        const Icon = pill.icon;
        return (
          <div
            key={pill.key}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border ${pill.border} ${pill.bg} transition-all duration-300 ${pill.glow} cursor-default group`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pill.bg} ${pill.color} shrink-0 group-hover:scale-110 transition-transform duration-200`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-xl text-bone leading-none">
                <AnimatedCounter value={values[pill.key]} suffix={pill.suffix} />
              </div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider mt-0.5">{pill.label.toUpperCase()}</div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
