import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Flame, ChevronRight } from 'lucide-react';
import { getBadge } from '@/lib/badges';

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
  const level = Math.floor(Math.max(0, xp) / 500) + 1;
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
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="dx-card p-4 sm:p-5"
      aria-label="Level and achievements"
    >
      <div className="flex items-center gap-3.5">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-[20px] font-bold tabular shrink-0"
          style={{ background: 'var(--dx-ink)', color: 'var(--dx-on-ink)' }}
        >
          {level}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold truncate">{title}</h3>
            <span className="text-[11px] font-medium dx-muted tabular shrink-0">{xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP</span>
          </div>
          <div className="dx-progress dx-progress--ink mt-2">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] dx-muted">Level {level} → {level + 1}</p>
        </div>
      </div>

      <div className="mt-4 pt-3.5 flex items-center gap-2 border-t" style={{ borderColor: 'var(--dx-border)' }}>
        <span className="dx-chip">
          <Flame size={13} className="text-orange-500" />
          <span className="tabular font-semibold">{streak}</span> streak
        </span>
        {recentBadges.length > 0 && (
          <span className="dx-chip" aria-label="Recent achievements">
            {recentBadges.map(id => getBadge(id)).filter(Boolean).map(badge => (
              <span key={badge!.id} title={badge!.name}>{badge!.icon}</span>
            ))}
          </span>
        )}
        <Link to="/achievements" className="dx-link ml-auto">
          Achievements <ChevronRight size={14} />
        </Link>
      </div>
    </motion.section>
  );
}
