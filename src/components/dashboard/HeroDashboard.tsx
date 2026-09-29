import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronRight, Flame, Shield } from 'lucide-react';

interface HeroDashboardProps {
  displayName: string;
  streak: number;
  /** Athlete rank label, e.g. "Developing II · Strength". */
  rankLabel: string;
  rankScore: number;
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

export function HeroDashboard({ displayName, streak, rankLabel, rankScore, completedCount, targetDays }: HeroDashboardProps) {
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

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {streak > 0 && (
          <span className="dx-chip">
            <Flame size={12} className="text-orange-500" />
            <span className="tabular font-semibold">{streak}</span> day streak
          </span>
        )}
        <Link to="/ranks" className="dx-chip hover:opacity-85 transition-opacity" aria-label={`Athlete rank ${rankLabel}, score ${rankScore}`}>
          <Shield size={12} className="dx-accent" />
          <span className="font-semibold">{rankLabel}</span>
          <span className="tabular dx-muted">{rankScore}</span>
          <ChevronRight size={12} className="dx-muted" />
        </Link>

        {/* Weekly progress now shares the metadata row, leaving the name full width. */}
        <div className="shrink-0 flex items-center gap-1.5" aria-label={`${completedCount} of ${targetDays} sessions this week`}>
          <div className="relative w-9 h-9">
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
              <span className="text-[9px] font-bold tabular">{completedCount}/{targetDays}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
