import { motion } from 'framer-motion';
import { Trophy, Lock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { BADGES, evaluateBadges } from '@/lib/badges';
import type { BadgeContext } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export function AchievementsPage() {
  const { stats } = useAuthStore();
  
  if (!stats) return null;
  
  // Build badge context from stats
  const context: BadgeContext = {
    totalSessions: stats.totalWorkouts,
    totalVolume: stats.totalVolume,
    bestHold: stats.bestHold || 0,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    prCount: stats.prCount,
    daysCompleted: stats.totalWorkouts,
    uniqueDaysCompleted: stats.totalWorkouts,
    yogaCount: 0,
    measurementsCount: 0,
    weekGoalHit: false,
  };
  
  const earnedIds = new Set(evaluateBadges(context));
  const earnedCount = earnedIds.size;
  const totalCount = BADGES.length;
  const progressPct = (earnedCount / totalCount) * 100;
  
  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="pb-5 border-b border-line mb-6">
        <div className="font-mono text-amber text-xs tracking-widest mb-1">GAMIFICATION</div>
        <h1 className="font-display text-3xl mb-1">Trophy Room</h1>
        <p className="text-bone-dim text-sm max-w-xl">Unlock achievements by training consistently and hitting milestones.</p>
      </motion.div>
      
      {/* Progress summary */}
      <motion.div variants={item} className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber" />
            <span className="font-mono text-sm font-bold">{earnedCount} / {totalCount} Unlocked</span>
          </div>
          <span className="font-mono text-xs text-bone-dim">{Math.round(progressPct)}%</span>
        </div>
        <div className="w-full h-2.5 bg-line rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-amber to-sienna rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
      </motion.div>
      
      {/* Badge Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {BADGES.map((badge, i) => {
          const isEarned = earnedIds.has(badge.id);
          
          return (
            <motion.div
              key={badge.id}
              variants={item}
              className={`relative card p-5 text-center transition-all duration-300 ${
                isEarned 
                  ? 'border-sienna/50 bg-gradient-to-b from-sienna/5 to-transparent shadow-[0_0_20px_rgba(93,42,26,0.1)]'
                  : 'opacity-50 grayscale'
              }`}
            >
              {/* Glow effect for earned badges */}
              {isEarned && (
                <div className="absolute inset-0 rounded-[inherit] animate-pulse opacity-20 bg-gradient-to-b from-sienna/20 to-transparent pointer-events-none" />
              )}
              
              {/* Lock overlay for unearned */}
              {!isEarned && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-line flex items-center justify-center">
                  <Lock size={10} className="text-bone-dim" />
                </div>
              )}
              
              {/* Icon */}
              <div className={`text-4xl mb-3 ${isEarned ? '' : 'filter grayscale'}`}>
                {badge.icon}
              </div>
              
              {/* Name */}
              <div className={`font-display text-sm mb-1 ${isEarned ? 'text-bone' : 'text-bone-dim'}`}>
                {badge.name}
              </div>
              
              {/* Description */}
              <div className="font-mono text-[10px] text-bone-dim leading-snug">
                {badge.desc}
              </div>
              
              {/* Earned indicator */}
              {isEarned && (
                <div className="mt-3 font-mono text-[10px] text-sienna font-bold tracking-wider">
                  ✓ UNLOCKED
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
