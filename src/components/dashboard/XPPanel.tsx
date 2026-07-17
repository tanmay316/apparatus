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
      transition={{ delay: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] p-5 mb-6"
      style={{ background: 'rgba(17,21,34,0.7)' }}
    >
      {/* Glow */}
      <div className="absolute -top-16 -left-16 w-32 h-32 rounded-full bg-teal/[0.06] blur-3xl animate-glow-pulse pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row gap-5">
        {/* Level badge */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal to-teal-light flex items-center justify-center font-display font-bold text-2xl text-ink shadow-[0_0_20px_rgba(79,158,141,0.2)]">
              {level}
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber flex items-center justify-center">
              <span className="text-[10px]">⚡</span>
            </div>
          </div>
          <div>
            <h4 className="font-display text-lg text-bone">{title}</h4>
            <div className="font-mono text-[11px] text-bone-dim">{xp} / {nextLevelXp} XP</div>
          </div>
        </div>

        {/* Progress + stats */}
        <div className="flex-1 min-w-0">
          {/* XP bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[10px] text-bone-dim tracking-wider">LEVEL {level} → {level + 1}</span>
              <span className="font-mono text-[10px] text-teal">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-teal to-teal-light rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
              />
            </div>
          </div>

          {/* Streak + recent badges */}
          <div className="flex items-center gap-4">
            {/* Streak flames */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber/10 border border-amber/15">
              <Flame size={14} className="text-amber" />
              <span className="font-mono text-xs font-bold text-amber">{streak}</span>
              <span className="font-mono text-[10px] text-bone-dim">day streak</span>
            </div>

            {/* Recent achievements */}
            {recentBadges.length > 0 && (
              <div className="flex items-center gap-1">
                {recentBadges.map((badge, i) => (
                  <span key={i} className="text-lg" title={badge}>{badge}</span>
                ))}
              </div>
            )}

            <Link
              to="/achievements"
              className="ml-auto flex items-center gap-1 text-[10px] font-mono text-bone-dim hover:text-teal transition-colors"
            >
              All Achievements <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
