import React from 'react';
import { Crown, Trophy, Award, Sparkles } from 'lucide-react';

export interface PodiumWinner {
  rank: 1 | 2 | 3;
  name: string;
  score?: string;
  userPhoto?: string;
  userId?: string;
}

interface CelebrationPodiumCardProps {
  title?: string;
  subtitle?: string;
  winners?: PodiumWinner[];
  rawText?: string;
  sourceType?: 'challenge' | 'event';
  clanName?: string;
}

const MEDAL_STYLES = {
  1: {
    label: '1ST • GOLD CHAMPION',
    shortLabel: '1st Champion',
    icon: Crown,
    ringColor: 'ring-amber-400 border-amber-400',
    outerGradient:
      'radial-gradient(circle at 50% 24%, #ffffff 0%, #fffde0 8%, #fef08a 18%, #facc15 32%, #eab308 50%, #ca8a04 68%, #854d0e 86%, #3a1a02 100%)',
    innerRimGradient:
      'radial-gradient(circle at 50% 26%, #ffffff 0%, #fff9c4 16%, #fde047 38%, #ca8a04 68%, #713f12 100%)',
    faceGradient:
      'radial-gradient(circle at 45% 26%, #282115 0%, #17120a 38%, #0a0704 72%, #020101 100%)',
    glowColor: 'rgba(250, 204, 21, 0.45)',
    cardBg: 'bg-gradient-to-r from-amber-500/25 via-yellow-500/10 to-amber-950/45 border-amber-400/45 shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    pillBg: 'bg-amber-500/25 text-amber-200 border-amber-400/50 font-black',
    badgeTextColor: 'text-amber-200',
    scorePill: 'bg-amber-400/20 text-amber-200 border-amber-400/50 shadow-inner',
  },
  2: {
    label: '2ND • SILVER RUNNER-UP',
    shortLabel: '2nd Runner-Up',
    icon: Trophy,
    ringColor: 'ring-slate-300 border-slate-300',
    outerGradient:
      'radial-gradient(circle at 50% 24%, #ffffff 0%, #f8fafc 12%, #f1f5f9 22%, #e2e8f0 36%, #cbd5e1 52%, #94a3b8 70%, #475569 88%, #0f172a 100%)',
    innerRimGradient:
      'radial-gradient(circle at 50% 26%, #ffffff 0%, #f8fafc 20%, #cbd5e1 45%, #64748b 72%, #1e293b 100%)',
    faceGradient:
      'radial-gradient(circle at 45% 26%, #1c2028 0%, #101319 38%, #07090d 72%, #020203 100%)',
    glowColor: 'rgba(226, 232, 240, 0.35)',
    cardBg: 'bg-gradient-to-r from-slate-400/20 via-slate-600/10 to-slate-950/60 border-slate-300/35 shadow-[0_0_15px_rgba(203,213,225,0.12)]',
    pillBg: 'bg-slate-300/25 text-slate-200 border-slate-300/50 font-black',
    badgeTextColor: 'text-slate-200',
    scorePill: 'bg-slate-300/20 text-slate-200 border-slate-300/40 shadow-inner',
  },
  3: {
    label: '3RD • BRONZE MEDAL',
    shortLabel: '3rd Bronze',
    icon: Award,
    ringColor: 'ring-orange-400 border-orange-400',
    outerGradient:
      'radial-gradient(circle at 50% 24%, #ffffff 0%, #ffeedd 8%, #fed7aa 18%, #fb923c 34%, #ea580c 52%, #c2410c 70%, #7c2d12 88%, #2e0b02 100%)',
    innerRimGradient:
      'radial-gradient(circle at 50% 26%, #ffffff 0%, #ffedd5 18%, #f97316 45%, #9a3412 72%, #431407 100%)',
    faceGradient:
      'radial-gradient(circle at 45% 26%, #281912 0%, #170d08 38%, #0a0503 72%, #020101 100%)',
    glowColor: 'rgba(249, 115, 22, 0.40)',
    cardBg: 'bg-gradient-to-r from-amber-700/30 via-orange-600/15 to-stone-950/70 border-orange-500/35 shadow-[0_0_15px_rgba(217,119,6,0.18)]',
    pillBg: 'bg-orange-500/25 text-orange-200 border-orange-500/50 font-black',
    badgeTextColor: 'text-orange-200',
    scorePill: 'bg-orange-600/25 text-orange-200 border-orange-500/40 shadow-inner',
  },
};

/**
 * Parses raw post text into structured PodiumWinner items and cleans glitchy prefixes.
 */
export function parsePodiumWinners(text?: string): PodiumWinner[] {
  if (!text) return [];
  const lines = text.split('\n');
  const winners: PodiumWinner[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Matches: 🥇 1st: Sunil Jangid • 2.5 rounds, 1st: Sunil, 1. Sunil - 20kg, 🥇 1st Place: Sunil
    const rankMatch = trimmed.match(/(?:🥇|🥈|🥉|🎖️)?\s*([1-3])(?:st|nd|rd)?(?:\s*Place)?\s*[:.-]\s*(.+)/i);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1], 10) as 1 | 2 | 3;
      const rest = rankMatch[2].trim();

      // Split name and score if separated by • or - or (score)
      let name = rest;
      let score = '';

      if (rest.includes('•')) {
        const parts = rest.split('•');
        name = parts[0].trim();
        score = parts.slice(1).join('•').trim();
      } else if (rest.includes(' - ')) {
        const parts = rest.split(' - ');
        name = parts[0].trim();
        score = parts.slice(1).join(' - ').trim();
      } else {
        const parenMatch = rest.match(/^(.+?)\s*\((.+?)\)$/);
        if (parenMatch) {
          name = parenMatch[1].trim();
          score = parenMatch[2].trim();
        }
      }

      // Clean up glitchy "0 " prefix in score e.g. "0 2 Rounds" -> "2 Rounds", preserving "0.5"
      if (score.startsWith('0 ') && score.length > 2 && !score.startsWith('0.')) {
        score = score.slice(2).trim();
      }

      winners.push({ rank, name, score: score || undefined });
    }
  }

  return winners;
}

/**
 * 3D High-Gloss Metallic Medal Medallion Component with responsive scaling
 */
function MetallicMedal({ rank, size = 'md' }: { rank: 1 | 2 | 3; size?: 'sm' | 'md' | 'lg' }) {
  const config = MEDAL_STYLES[rank] || MEDAL_STYLES[1];
  const Icon = config.icon;

  const sizeClasses =
    size === 'lg'
      ? { box: 'w-11 h-11 sm:w-13 sm:h-13', inset1: 'inset-[2px]', inset2: 'inset-[4.5px]', iconSize: 17, glow: 'inset-[-4px]' }
      : size === 'md'
      ? { box: 'w-8 h-8 sm:w-9 sm:h-9', inset1: 'inset-[1.5px]', inset2: 'inset-[3.5px]', iconSize: 13, glow: 'inset-[-3px]' }
      : { box: 'w-6 h-6 sm:w-7 sm:h-7', inset1: 'inset-[1px]', inset2: 'inset-[2.5px]', iconSize: 11, glow: 'inset-[-2px]' };

  return (
    <div className={`relative ${sizeClasses.box} rounded-full flex items-center justify-center shrink-0`}>
      {/* Outer ambient glow */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: sizeClasses.glow,
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
          filter: 'blur(6px)',
        }}
      />

      {/* Outer Metallic Rim */}
      <div
        className="absolute inset-0 rounded-full flex items-center justify-center shadow-lg"
        style={{
          background: config.outerGradient,
          boxShadow: `0 0 10px ${config.glowColor}, inset 0 2px 4px rgba(255,255,255,0.7), inset 0 -3px 6px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Secondary Inner Metallic Rim */}
        <div
          className={`absolute ${sizeClasses.inset1} rounded-full`}
          style={{
            background: config.innerRimGradient,
            boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.5)',
          }}
        />

        {/* Center Dark Metallic Face */}
        <div
          className={`absolute ${sizeClasses.inset2} rounded-full flex items-center justify-center shadow-inner`}
          style={{
            background: config.faceGradient,
            boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.15), inset 0 -4px 8px rgba(0,0,0,0.85)',
          }}
        >
          <Icon size={sizeClasses.iconSize} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Winner Avatar / Medallion Container
 */
function WinnerBadge({ winner, rank, size = 'md' }: { winner: PodiumWinner; rank: 1 | 2 | 3; size?: 'sm' | 'md' | 'lg' }) {
  if (winner.userPhoto) {
    const config = MEDAL_STYLES[rank] || MEDAL_STYLES[1];
    const Icon = config.icon;
    const boxSize = size === 'lg' ? 'w-11 h-11 sm:w-13 sm:h-13' : 'w-8 h-8 sm:w-9 sm:h-9';
    const badgeSize = size === 'lg' ? 'w-5 h-5 -bottom-1 -right-1' : 'w-4 h-4 -bottom-0.5 -right-0.5';
    const iconSize = size === 'lg' ? 10 : 8;

    return (
      <div className={`relative ${boxSize} shrink-0`}>
        <img
          src={winner.userPhoto}
          alt={winner.name}
          className={`w-full h-full rounded-full object-cover ring-2 ${config.ringColor} shadow-md`}
          referrerPolicy="no-referrer"
        />
        <div className={`absolute ${badgeSize} rounded-full flex items-center justify-center shadow-md bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-black border border-black/40`}>
          <Icon size={iconSize} className="stroke-[2.5]" />
        </div>
      </div>
    );
  }

  return <MetallicMedal rank={rank} size={size} />;
}

export function CelebrationPodiumCard({
  title,
  subtitle,
  winners: explicitWinners,
  rawText,
  sourceType = 'challenge',
  clanName,
}: CelebrationPodiumCardProps) {
  // Parse winners if not provided explicitly
  const winners = explicitWinners && explicitWinners.length > 0
    ? explicitWinners
    : parsePodiumWinners(rawText);

  // Extract clean title (removes "🏆 Challenge Concluded:" or "🏆 Event Concluded:" prefixes)
  const cleanTitle = (title || 'Competition Concluded')
    .replace(/^🏆\s*(Challenge|Event)\s*Concluded:\s*/i, '')
    .replace(/🏆/g, '')
    .trim();

  // If no parsed winners, display nothing
  if (winners.length === 0) {
    return null;
  }

  const champion = winners.find(w => w.rank === 1) || winners[0];
  const otherWinners = winners.filter(w => w.rank !== 1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-b from-[#181207] via-[#0d0904] to-[#040301] p-3.5 sm:p-5 shadow-2xl text-white space-y-3.5 sm:space-y-4 my-1 sm:my-2 w-full">
      {/* Ambient background lighting */}
      <div
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.22) 0%, transparent 70%)',
          filter: 'blur(32px)',
        }}
      />
      <div
        className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(217,119,6,0.15) 0%, transparent 70%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Header Banner */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600 flex items-center justify-center text-black shadow-md shrink-0 font-bold">
            <Trophy size={15} className="sm:w-4 sm:h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-amber-300 font-black">
              <Sparkles size={10} className="text-yellow-300 shrink-0" />
              <span className="truncate">{sourceType === 'event' ? 'Event Podium' : 'Challenge Champions'}</span>
              {clanName && (
                <span className="text-amber-200/70 truncate max-w-[100px] sm:max-w-[130px] font-normal hidden xs:inline">
                  • {clanName}
                </span>
              )}
            </div>
            <h3 className="font-display font-black text-xs sm:text-sm text-amber-100 line-clamp-1 sm:line-clamp-2 leading-snug mt-0.5" title={cleanTitle}>
              {cleanTitle}
            </h3>
          </div>
        </div>

        <div className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-[9px] sm:text-[10px] font-mono font-black text-amber-300 shrink-0 shadow-inner">
          Concluded
        </div>
      </div>

      {/* 1st Place Gold Champion Card */}
      {champion && (
        <div className="relative overflow-hidden rounded-xl border border-amber-400/45 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-950/40 p-3 sm:p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Gold Medal / Winner Avatar */}
            <div className="shrink-0">
              <WinnerBadge winner={champion} rank={1} size="lg" />
            </div>

            {/* Champion Info Details */}
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
              {/* Top Row: Rank Tag on Left, Score Pill on Right */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] sm:text-[10px] font-mono font-black tracking-wider uppercase bg-amber-500/25 text-amber-200 border-amber-400/50 shadow-sm shrink-0 whitespace-nowrap">
                  <Crown size={10} className="text-yellow-300 shrink-0" />
                  <span>1st Champion</span>
                </div>

                {champion.score && (
                  <div className="shrink-0 px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/50 text-amber-200 font-mono font-black text-[11px] sm:text-xs shadow-inner whitespace-nowrap">
                    {champion.score}
                  </div>
                )}
              </div>

              {/* Bottom Row: Winner Name */}
              <h4
                className="font-display font-extrabold text-sm sm:text-base text-white truncate leading-tight tracking-wide drop-shadow-sm"
                title={champion.name}
              >
                {champion.name}
              </h4>
            </div>
          </div>
        </div>
      )}

      {/* 2nd & 3rd Place Cards Grid */}
      {otherWinners.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
          {otherWinners.map(winner => {
            const config = MEDAL_STYLES[winner.rank] || MEDAL_STYLES[2];
            return (
              <div
                key={winner.rank}
                className={`relative overflow-hidden rounded-xl border ${config.cardBg} p-2.5 sm:p-3 shadow-md backdrop-blur-sm`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="shrink-0">
                    <WinnerBadge winner={winner} rank={winner.rank} size="md" />
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    {/* Top Row: Rank Tag on Left, Score Pill on Right */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] sm:text-[9px] font-mono font-bold tracking-wider uppercase shrink-0 whitespace-nowrap ${config.pillBg}`}>
                        <span>{config.shortLabel}</span>
                      </div>

                      {winner.score && (
                        <span className={`px-2 py-0.5 rounded-md border font-mono font-bold text-[10px] sm:text-[11px] shrink-0 whitespace-nowrap ${config.scorePill}`}>
                          {winner.score}
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Winner Name */}
                    <div
                      className="font-display font-bold text-xs sm:text-sm text-white truncate leading-snug"
                      title={winner.name}
                    >
                      {winner.name}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
