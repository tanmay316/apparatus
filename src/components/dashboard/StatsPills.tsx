import { motion } from 'framer-motion';
import { Dumbbell, Flame, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface StatsPillsProps {
  totalWorkouts: number;
  totalCalories: number;
  totalHours: number;
}

function AnimatedCounter({ value, formatter }: { value: number; formatter?: (v: number) => string | number }) {
  const [displayed, setDisplayed] = useState(0);
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
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplayed(Math.min(increment * step, value));
      if (step >= steps) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  return <span>{formatter ? formatter(displayed) : Math.round(displayed).toLocaleString()}</span>;
}

export function StatsPills({ totalWorkouts, totalCalories, totalHours }: StatsPillsProps) {
  const cards = [
    { key: 'workouts', label: 'Workouts', value: totalWorkouts, icon: Dumbbell, tint: '#5d2a1a', tintDark: '#b07458' },
    {
      key: 'calories', label: 'Calories', value: totalCalories, icon: Flame, tint: '#c2410c', tintDark: '#fb923c',
      formatter: (v: number) => {
        const r = Math.round(v);
        return r >= 10000 ? `${(r / 1000).toFixed(1)}k` : r.toLocaleString();
      },
    },
    {
      key: 'hours', label: 'Hours', value: totalHours, icon: Clock, tint: '#0f766e', tintDark: '#5eead4',
      formatter: (v: number) => v < 1 ? `${Math.round(v * 60)}m` : `${v.toFixed(1)}h`,
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="dx-card grid grid-cols-3"
      aria-label="Lifetime totals"
    >
      {cards.map((card, i) => (
        <div key={card.key} className={`px-3 py-4 sm:px-4 min-w-0 ${i > 0 ? 'border-l' : ''}`} style={{ borderColor: 'var(--dx-border)' }}>
          <div className="flex items-center gap-1.5 text-[12px] font-medium dx-muted">
            <card.icon size={14} className="shrink-0 dx-stat-icon" style={{ ['--tint' as any]: card.tint, ['--tint-dark' as any]: card.tintDark }} />
            <span className="truncate">{card.label}</span>
          </div>
          <div className="mt-1.5 text-[20px] sm:text-[23px] font-semibold leading-none tracking-tight tabular truncate">
            <AnimatedCounter value={card.value} formatter={card.formatter} />
          </div>
        </div>
      ))}
    </motion.section>
  );
}
