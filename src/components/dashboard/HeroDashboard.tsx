import { motion } from 'framer-motion';

interface HeroDashboardProps {
  displayName: string;
  streak: number;
  xp: number;
  completedCount: number;
  targetDays: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getLevel(xp: number): number {
  return Math.min(10, Math.floor(xp / 500) + 1);
}

function getLevelTitle(xp: number): string {
  if (xp < 100) return 'Ground Zero';
  if (xp < 500) return 'Bar Novice';
  if (xp < 1400) return 'Skill Seeker';
  return 'Apparatus Master';
}

export function HeroDashboard({ displayName, streak, xp, completedCount, targetDays }: HeroDashboardProps) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const progressPct = targetDays ? Math.min(Math.round((completedCount / targetDays) * 100), 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mb-3"
    >
      {/* Greeting row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 w-full">
          <h1 className="font-sans font-semibold text-xl text-bone leading-tight truncate">
            {getGreeting()},{' '}
            <span className="font-serif italic tracking-wide text-2xl text-premium-animated pr-1">
              {displayName.split(' ')[0]}
            </span>
          </h1>
          <p className="text-[12px] font-sans text-bone-dim mt-0.5">{today}</p>
        </div>
      </div>

      {/* Chips row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fbe1d1] text-[#5d2a1a] text-[11px] font-sans font-medium">
            🔥 {streak} day streak
          </span>
        )}
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-ink-2 text-bone-dim text-[11px] font-sans font-medium border border-line">
          LV {getLevel(xp)} · {getLevelTitle(xp)}
        </span>

        {/* Weekly ring — tiny */}
        <div className="relative w-8 h-8 shrink-0 ml-1">
          <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-line" />
            <circle
              cx="22" cy="22" r="18" fill="none"
              stroke="currentColor" strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 18}
              strokeDashoffset={(2 * Math.PI * 18) * (1 - progressPct / 100)}
              className="text-sienna transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[8px] font-sans font-bold text-bone">{completedCount}/{targetDays}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

