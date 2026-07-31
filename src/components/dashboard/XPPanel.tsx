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
      className="xp-panel-card relative overflow-hidden p-4 mb-3 rounded-[16px] bg-white border border-[#ececec] shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_8px_16px_-4px_rgba(0,0,0,0.06)] text-[#17191c]"
    >
      <div className="relative flex items-center gap-3">
        {/* Level badge — compact */}
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#17191c] flex items-center justify-center font-sans font-bold text-lg text-white">
            {level}
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#fbe1d1] text-[#5d2a1a] border-2 border-white flex items-center justify-center shadow-xs">
            <span className="text-[8px]">⚡</span>
          </div>
        </div>

        {/* Progress + stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-sans font-semibold text-sm text-[#17191c] leading-tight truncate">{title}</h4>
            <span className="font-sans text-[10px] font-medium text-[#979799] uppercase tracking-wider shrink-0 ml-2">LV {level} → {level + 1}</span>
          </div>

          {/* XP bar */}
          <div className="h-1.5 bg-[#f2f2f3] rounded-full overflow-hidden mb-2">
            <motion.div
              className="h-full bg-[#17191c] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
            />
          </div>

          {/* Streak + badges + View All */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-2.5 py-0.5 rounded-full bg-[#fbe1d1] text-[#5d2a1a] font-sans text-[10px] font-medium flex items-center gap-1">
              <Flame size={11} className="text-[#5d2a1a]" />
              <span className="font-semibold">{streak}</span>
              <span className="opacity-80">streak</span>
            </div>

            {recentBadges.length > 0 && (
              <div className="flex items-center gap-1 bg-[#f2f2f3] px-2 py-0.5 rounded-full text-[10px] font-sans text-[#777b86]">
                {recentBadges.map((badge, i) => (
                  <span key={i} className="text-xs" title={badge}>{badge}</span>
                ))}
              </div>
            )}

            <Link
              to="/achievements"
              className="ml-auto flex items-center gap-0.5 text-[11px] font-sans font-semibold text-[#17191c] hover:underline transition-all"
            >
              View All <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
