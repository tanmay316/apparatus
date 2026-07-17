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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] mb-6"
      style={{ background: 'linear-gradient(135deg, rgba(79,158,141,0.10) 0%, rgba(9,11,18,0.98) 45%, rgba(210,154,54,0.05) 100%)' }}
    >
      {/* Animated particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-8 left-[15%] w-1.5 h-1.5 rounded-full bg-teal/30 animate-float" />
        <div className="absolute top-20 right-[25%] w-1 h-1 rounded-full bg-amber/30 animate-float-delay" />
        <div className="absolute bottom-12 left-[40%] w-2 h-2 rounded-full bg-teal/20 animate-float-slow" />
        <div className="absolute top-16 right-[10%] w-1 h-1 rounded-full bg-teal/25 animate-float" />
        <div className="absolute bottom-8 right-[35%] w-1.5 h-1.5 rounded-full bg-amber/20 animate-float-delay" />
        {/* Soft glows */}
        <div className="absolute -top-20 -left-20 w-60 h-60 rounded-full bg-teal/[0.06] blur-3xl animate-glow-pulse" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-amber/[0.04] blur-3xl animate-glow-pulse" />
      </div>

      <div className="relative px-4 sm:px-8 py-6 sm:py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left — Greeting & Level Info & Inline Plans Button */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2 max-w-lg">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            <span className="font-mono text-[11px] text-bone-dim tracking-wider">{today}</span>
            {streak > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber/10 border border-amber/20 text-[11px] font-mono font-bold text-amber">
                🔥 {streak}
              </span>
            )}
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal/10 border border-teal/20 text-[11px] font-mono font-bold text-teal">
              LV {getLevel(xp)}
            </span>
            {/* Inline + Plans pill button */}
            <Link
              to="/plans"
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal/15 border border-teal/30 text-[11px] font-mono font-bold text-teal hover:bg-teal/25 transition-all"
              title="My Plans & Create Plan"
            >
              <Plus size={12} /> Plans
            </Link>
          </div>

          <h1 className="font-display text-2xl sm:text-4xl text-bone">
            {getGreeting()}, {displayName.split(' ')[0]}
          </h1>

          <p className="text-xs sm:text-sm text-bone-dim/70 italic leading-relaxed">
            "{quote}"
          </p>

          <div className="text-[10px] font-mono text-bone-dim/60 tracking-wider mt-1">
            {getLevelTitle(xp)} · {xp} XP
          </div>
        </div>

        {/* Right — Progress Ring */}
        <div className="relative w-32 h-32 sm:w-36 sm:h-36 shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {/* Background ring */}
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
            {/* Progress ring */}
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke="url(#progressGradient)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - strokeDash}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4F9E8D" />
                <stop offset="100%" stopColor="#5FB09E" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl sm:text-3xl text-bone">{completedCount}</span>
            <span className="text-[9px] sm:text-[10px] font-mono text-bone-dim tracking-wider">/ {targetDays} DAYS</span>
            <span className="text-[10px] font-mono text-teal mt-0.5">{progressPct}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
