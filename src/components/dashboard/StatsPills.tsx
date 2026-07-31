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
      icon: Zap,
      iconBg: 'bg-blue-50 text-blue-600'
    },
    {
      key: 'calories',
      label: 'Calories',
      value: totalCalories,
      icon: TrendingUp,
      iconBg: 'bg-orange-50 text-orange-600',
      formatter: (v: number) => `${Math.round(v).toLocaleString()} kcal`
    },
    {
      key: 'hours',
      label: 'Time',
      value: totalHours,
      icon: Clock,
      iconBg: 'bg-purple-50 text-purple-600',
      formatter: (v: number) => v < 1 ? `${Math.round(v * 60)}m` : `${v.toFixed(1)}h`
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="grid grid-cols-3 gap-2 sm:gap-3 mb-8"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.key}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="p-3 sm:p-4 rounded-[20px] sm:rounded-[24px] bg-white border border-[#ececec] shadow-sm flex flex-col justify-center overflow-hidden"
          >
            <div className="flex flex-col xl:flex-row items-start xl:items-center gap-2 sm:gap-3 min-w-0">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col justify-center min-w-0 w-full">
                <span className="text-[10px] sm:text-[11px] font-sans font-medium text-gray-500 uppercase tracking-wider truncate">
                  {card.label}
                </span>
                <span className="font-sans font-bold text-lg sm:text-xl text-gray-900 leading-tight truncate">
                  <AnimatedCounter value={card.value} formatter={card.formatter} />
                </span>
              </div>
            </div>
            {card.trend && (
              <div className="mt-2 sm:mt-3 flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-emerald-600 truncate w-full">
                <TrendingUp size={12} className="shrink-0" /> <span className="truncate">{card.trend}</span>
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
