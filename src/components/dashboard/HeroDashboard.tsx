import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

interface HeroDashboardProps {
  displayName: string;
  streak: number;
  xp: number;
  completedCount: number;
  targetDays: number;
  quote: string;
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

export function HeroDashboard({ displayName, streak, xp, completedCount, targetDays, quote }: HeroDashboardProps) {
  const progressPct = targetDays ? Math.min(Math.round((completedCount / targetDays) * 100), 100) : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeDash = (progressPct / 100) * circumference;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative overflow-hidden mb-10 p-6 sm:p-8 md:p-10 rounded-[24px] bg-white border border-[#ececec] shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_20px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.05)] text-[#17191c]"
    >
      <div className="relative flex flex-col items-center md:flex-row md:items-center md:justify-between gap-6 md:gap-8">
        {/* Left Editorial Copy */}
        <div className="flex flex-col items-center md:items-start gap-4 max-w-2xl w-full">
          {/* Badge row — wraps on mobile */}
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <span className="text-[13px] font-sans font-normal text-[#979799] uppercase tracking-wider whitespace-nowrap">{today}</span>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#fbe1d1] text-[#5d2a1a] text-xs font-sans font-medium whitespace-nowrap">
                🔥 {streak} day streak
              </span>
            )}
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#f2f2f3] text-[#17191c] text-xs font-sans font-normal whitespace-nowrap">
              LV {getLevel(xp)} · {getLevelTitle(xp)}
            </span>
          </div>

          <h1 className="font-serif font-normal text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#17191c] tracking-[-0.96px] leading-[1.25] text-center md:text-left">
            {getGreeting()}, <span className="italic">{displayName.split(' ')[0]}</span>
          </h1>

          <p className="text-[15px] sm:text-[17px] font-sans font-normal text-[#777b86] leading-[1.4] max-w-xl text-center md:text-left">
            "{quote}"
          </p>
        </div>

        {/* Circular Gestural Progress Ring — centered on mobile */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 shrink-0 p-3 rounded-full bg-[#f2f2f3] flex items-center justify-center mx-auto md:mx-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#e0e0e2" strokeWidth="6" />
            <circle
              cx="60" cy="60" r="50" fill="none"
              stroke="#5d2a1a" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - strokeDash}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-serif font-normal text-2xl sm:text-3xl text-[#17191c] leading-none">{completedCount}</span>
            <span className="text-[10px] sm:text-[11px] font-sans text-[#777b86] tracking-wider mt-1">/ {targetDays} DAYS</span>
            <span className="text-[11px] sm:text-xs font-sans font-medium text-[#5d2a1a] mt-0.5">{progressPct}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
