import { motion } from 'framer-motion';
import { Trophy, Award, Crown, Sparkles, Shield, Share2 } from 'lucide-react';
import type { EarnedCommunityBadge } from '@/types';

interface CommunityBadgeCardProps {
  badge: EarnedCommunityBadge;
  compact?: boolean;
  onShare?: (badge: EarnedCommunityBadge) => void;
}

export function CommunityBadgeCard({ badge, compact = false, onShare }: CommunityBadgeCardProps) {
  const isGold = badge.rank === 1;
  const isSilver = badge.rank === 2;
  const isBronze = badge.rank === 3;

  const styleConfig = isGold
    ? {
        border: 'border-amber-400/50',
        bg: 'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-amber-950/30',
        glow: 'shadow-[0_0_24px_rgba(245,158,11,0.25)]',
        badgeBg: 'bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600 text-black',
        textAccent: 'text-amber-900 dark:text-amber-300 font-black',
        pillBg: 'bg-amber-500/25 text-amber-950 dark:text-amber-100 border-2 border-amber-500/60 font-black',
        label: '1st • Champion',
        icon: Crown,
      }
    : isSilver
    ? {
        border: 'border-slate-300/50',
        bg: 'bg-gradient-to-br from-slate-300/20 via-slate-400/10 to-slate-900/30',
        glow: 'shadow-[0_0_20px_rgba(203,213,225,0.2)]',
        badgeBg: 'bg-gradient-to-br from-white via-slate-200 to-slate-400 text-black',
        textAccent: 'text-slate-900 dark:text-slate-200 font-black',
        pillBg: 'bg-slate-300/30 text-slate-950 dark:text-slate-100 border-2 border-slate-400/60 font-black',
        label: '2nd • Runner-Up',
        icon: Trophy,
      }
    : {
        border: 'border-orange-400/40',
        bg: 'bg-gradient-to-br from-orange-600/20 via-amber-700/10 to-stone-950/30',
        glow: 'shadow-[0_0_20px_rgba(217,119,6,0.2)]',
        badgeBg: 'bg-gradient-to-br from-amber-500 via-orange-600 to-stone-700 text-white',
        textAccent: 'text-orange-950 dark:text-orange-300 font-black',
        pillBg: 'bg-orange-600/25 text-orange-950 dark:text-orange-100 border-2 border-orange-500/60 font-black',
        label: '3rd • Bronze Medal',
        icon: Award,
      };

  const Icon = styleConfig.icon;

  const formattedDate = typeof badge.awardedAt === 'string' 
    ? new Date(badge.awardedAt).toLocaleDateString()
    : badge.awardedAt?.toDate?.() 
      ? badge.awardedAt.toDate().toLocaleDateString()
      : 'Recently';

  if (compact) {
    return (
      <div
        className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${styleConfig.border} ${styleConfig.bg} ${styleConfig.glow} backdrop-blur-md transition-all hover:scale-105`}
      >
        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${styleConfig.badgeBg} shadow-sm`}>
          {badge.rank}
        </span>
        <span className={`text-[11px] font-mono font-bold tracking-tight ${styleConfig.textAccent} truncate max-w-[120px]`}>
          {badge.title}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative overflow-hidden rounded-3xl border ${styleConfig.border} ${styleConfig.bg} ${styleConfig.glow} p-5 backdrop-blur-xl flex flex-col justify-between`}
    >
      {/* Decorative background light refraction */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-28 h-28 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Medallion */}
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${styleConfig.badgeBg} relative overflow-hidden shrink-0`}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            <Icon size={22} className="relative z-10 drop-shadow" />
          </div>
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-mono font-black uppercase tracking-wider mb-1 ${styleConfig.pillBg}`}>
              <Sparkles size={10} />
              {styleConfig.label}
            </div>
            <h4 className="font-display text-lg text-foreground font-bold leading-tight">
              {badge.title}
            </h4>
          </div>
        </div>

        {onShare && (
          <button
            onClick={() => onShare(badge)}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-foreground hover:text-amber-500 transition-all border border-border shrink-0 shadow-sm active:scale-95"
            title="Share Medal"
          >
            <Share2 size={16} />
          </button>
        )}
      </div>

      <p className="text-xs text-foreground/85 font-mono mb-4 line-clamp-2 leading-relaxed font-semibold">
        {badge.description}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1 text-foreground font-semibold truncate max-w-[180px]">
          {badge.clanName ? (
            <>
              <Shield size={11} className="text-amber-500 shrink-0" /> {badge.clanName}
            </>
          ) : badge.clanId ? (
            <>
              <Shield size={11} className="text-amber-500 shrink-0" /> Clan Challenge
            </>
          ) : (
            <>Global Challenge</>
          )}
        </span>
        <span className="shrink-0">{formattedDate}</span>
      </div>
    </motion.div>
  );
}

/**
 * Mini Badge Pill for Leaderboard rows
 */
export function LeaderboardBadgeChip({ rank }: { rank: 1 | 2 | 3 }) {
  if (rank === 1) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] font-mono shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse">
        <Crown size={11} /> 1st Gold
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-slate-100 to-slate-300 text-slate-900 font-black text-[10px] font-mono shadow-[0_0_10px_rgba(203,213,225,0.4)]">
        <Trophy size={11} /> 2nd Silver
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-600 to-orange-500 text-white font-black text-[10px] font-mono shadow-[0_0_10px_rgba(217,119,6,0.4)]">
      <Award size={11} /> 3rd Bronze
    </div>
  );
}
