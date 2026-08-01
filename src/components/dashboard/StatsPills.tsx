import { motion } from 'framer-motion';
import { Zap, TrendingUp, Clock, Flame } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface StatsPillsProps {
  totalWorkouts: number;
  totalCalories: number;
  totalHours: number;
}

function AnimatedCounter({ value, formatter }: { value: number; formatter?: (v: number) => string | number }) {
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
      current = Math.min(increment * step, value);
      setDisplayed(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  const displayValue = formatter ? formatter(displayed) : Math.round(displayed).toLocaleString();
  return <span ref={ref}>{displayValue}</span>;
}

export function StatsPills({ totalWorkouts, totalCalories, totalHours }: StatsPillsProps) {
  const cards = [
    {
      key: 'workouts',
      label: 'Workouts',
      value: totalWorkouts,
      emoji: '🔥',
      gradient: 'from-[#ff6b6b]/10 to-transparent',
    },
    {
      key: 'calories',
      label: 'Calories',
      value: totalCalories,
      emoji: '⚡',
      formatter: (v: number) => `${Math.round(v).toLocaleString()}`,
      gradient: 'from-[#ffbe0b]/10 to-transparent',
    },
    {
      key: 'hours',
      label: 'Hours',
      value: totalHours,
      emoji: '⏱',
      formatter: (v: number) => v < 1 ? `${Math.round(v * 60)}m` : `${v.toFixed(1)}h`,
      gradient: 'from-[#4ea8de]/10 to-transparent',
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="grid grid-cols-3 gap-2 sm:gap-3 mb-8"
    >
      {cards.map((card) => (
          <motion.div
            key={card.key}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`rounded-2xl bg-[var(--card)] p-2 sm:p-4 flex items-center shadow-lg relative overflow-hidden bg-gradient-to-br ${card.gradient}`}
          >
            <div className="flex items-center gap-1.5 sm:gap-3 w-full">
              <span className="text-lg sm:text-2xl w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-[var(--bg)] flex items-center justify-center shadow-inner shrink-0">
                {card.emoji}
              </span>
              <div className="flex flex-col justify-center min-w-0 flex-1">
                <span className="text-[9px] sm:text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider sm:tracking-widest truncate">
                  {card.label}
                </span>
                <span className="font-mono font-bold text-base sm:text-xl text-[var(--text)] leading-tight mt-0.5 truncate">
                  <AnimatedCounter value={card.value} formatter={card.formatter} />
                </span>
              </div>
            </div>
          </motion.div>
      ))}
    </motion.div>
  );
}
