import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Flame, Trophy, ChevronRight } from 'lucide-react';

interface XPPanelProps {
  xp: number;
  streak: number;
  badges: string[];
}

const LEVELS = [
  { min: 0, title: 'Ground Zero' },
  { min: 100, title: 'Bar Novice' },
  { min: 500, title: 'Skill Seeker' },
  { min: 1400, title: 'Apparatus Master' },
  { min: 3000, title: 'Iron Will' },
  { min: 5000, title: 'Peak Form' },
];

function getLevelInfo(xp: number) {
  const level = Math.min(10, Math.floor(xp / 500) + 1);
  const currentLevelXp = (level - 1) * 500;
  const nextLevelXp = level * 500;
  const progress = Math.min(100, ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100);
  const title = [...LEVELS].reverse().find(l => xp >= l.min)?.title || 'Ground Zero';
  return { level, title, progress, nextLevelXp, currentLevelXp };
}

export function XPPanel({ xp, streak, badges }: XPPanelProps) {
  const { level, title, progress, nextLevelXp } = getLevelInfo(xp);
  const recentBadges = badges.slice(-3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative overflow-hidden p-8 mb-8 rounded-[24px] bg-white border border-[#ececec] shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_20px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.05)] text-[#17191c]"
    >
      <div className="relative flex flex-col sm:flex-row items-center gap-6">
        {/* Level badge */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-[#17191c] flex items-center justify-center font-serif font-normal text-2xl text-white">
              {level}
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#fbe1d1] text-[#5d2a1a] border-2 border-white flex items-center justify-center shadow-xs">
              <span className="text-[10px]">⚡</span>
            </div>
          </div>
          <div>
            <h4 className="font-serif font-normal text-xl text-[#17191c] leading-tight">{title}</h4>
            <div className="font-sans text-xs text-[#777b86] mt-0.5">{xp} / {nextLevelXp} XP</div>
          </div>
        </div>

        {/* Progress + stats */}
        <div className="flex-1 min-w-0 w-full">
          {/* XP bar */}
          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-sans text-xs font-normal text-[#979799] uppercase tracking-wider">LEVEL {level} → {level + 1}</span>
              <span className="font-sans text-xs font-medium text-[#17191c]">{Math.round(progress)}%</span>
            </div>
            {/* Minimal Progress Bar */}
            <div className="h-2 bg-[#f2f2f3] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#17191c] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
              />
            </div>
          </div>

          {/* Streak + recent badges */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Streak flames */}
            <div className="px-3.5 py-1 rounded-full bg-[#fbe1d1] text-[#5d2a1a] font-sans text-xs font-medium flex items-center gap-1.5">
              <Flame size={14} className="text-[#5d2a1a]" />
              <span className="font-sans text-xs font-semibold">{streak}</span>
              <span className="font-sans text-[11px] opacity-80">day streak</span>
            </div>

            {/* Recent achievements */}
            {recentBadges.length > 0 && (
              <div className="flex items-center gap-1.5 bg-[#f2f2f3] px-3 py-1 rounded-full text-xs font-sans text-[#777b86]">
                {recentBadges.map((badge, i) => (
                  <span key={i} className="text-sm" title={badge}>{badge}</span>
                ))}
              </div>
            )}

            <Link
              to="/achievements"
              className="ml-auto flex items-center gap-1 text-xs font-sans font-medium text-[#17191c] hover:underline transition-all"
            >
              All Achievements <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
