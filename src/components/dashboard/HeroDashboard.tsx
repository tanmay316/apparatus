import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Flame, Shield } from 'lucide-react';

interface HeroDashboardProps {
  displayName: string;
  streak: number;
  /** Athlete rank label, e.g. "Developing II · Strength". */
  rankLabel: string;
  rankScore?: number;
  completedCount: number;
  targetDays: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

export function HeroDashboard({ displayName, streak, rankLabel, completedCount, targetDays }: HeroDashboardProps) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const progressPct = targetDays ? Math.min(Math.round((completedCount / targetDays) * 100), 100) : 0;

  return (
    <motion.header
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mb-5"
    >
      <div className="min-w-0">
        <p className="dx-eyebrow">{today}</p>
        <h1 className="mt-1 text-[22px] sm:text-[27px] leading-[1.2] font-semibold tracking-tight break-words">
          {getGreeting()},{' '}
          <span className="dx-accent">{displayName.split(' ')[0]}</span>
        </h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 mt-3 flex-nowrap w-full overflow-hidden">
        <span className="dx-chip shrink-0 text-[10px] sm:text-[11px] h-7 px-2 sm:px-2.5 gap-1 sm:gap-1.5">
          <Flame size={12} className="text-orange-500 shrink-0" />
          <span className="tabular font-semibold shrink-0">{streak}</span>
          <span className="whitespace-nowrap"><span className="hidden min-[380px]:inline">day </span>streak</span>
        </span>

        <Link
          to="/ranks"
          className="dx-chip hover:opacity-85 transition-opacity min-w-0 shrink flex-1 max-w-fit text-[10px] sm:text-[11px] h-7 px-2 sm:px-2.5 gap-1 sm:gap-1.5"
          aria-label={`Athlete rank ${rankLabel}`}
        >
          <Shield size={12} className="dx-accent shrink-0" />
          <span className="font-semibold truncate">{rankLabel}</span>
        </Link>

        {/* Weekly progress shares the metadata row, never wraps down */}
        <div className="shrink-0 flex items-center" aria-label={`${completedCount} of ${targetDays} sessions this week`}>
          <div className="relative w-8 h-8 sm:w-9 sm:h-9">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r={RING_R} fill="none" strokeWidth="3.5" style={{ stroke: 'var(--dx-card-2)' }} />
              <circle
                cx="18" cy="18" r={RING_R} fill="none"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - progressPct / 100)}
                style={{ stroke: 'var(--dx-accent)', transition: 'stroke-dashoffset 0.7s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] sm:text-[9px] font-bold tabular">{completedCount}/{targetDays}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
