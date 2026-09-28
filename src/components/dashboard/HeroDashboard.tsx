import { motion } from 'framer-motion';
import { Flame, Sparkles } from 'lucide-react';

interface HeroDashboardProps {
  displayName: string;
  streak: number;
  xp: number;
  completedCount: number;
  targetDays: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / 500) + 1;
}

function getLevelTitle(xp: number): string {
  if (xp < 100) return 'Ground Zero';
  if (xp < 500) return 'Bar Novice';
  if (xp < 1400) return 'Skill Seeker';
  return 'Apparatus Master';
}

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

export function HeroDashboard({ displayName, streak, xp, completedCount, targetDays }: HeroDashboardProps) {
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
        <span className="dx-chip">
          <Sparkles size={12} className="dx-accent" />
          Level {getLevel(xp)} · {getLevelTitle(xp)}
        </span>

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
