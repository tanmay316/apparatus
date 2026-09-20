import { Crown, Trophy, Award } from 'lucide-react';

// Shared gold/silver/bronze medal styling — the single source of truth for what a
// "real" rank badge looks like across the app (profile podium list, share card, etc.)
// so every surface renders the same artwork instead of a generic placeholder icon.
export interface MedalConfig {
  title: string;
  rankLabel: string;
  icon: typeof Crown;
  outerGradient: string;
  innerRimGradient: string;
  faceGradient: string;
  rankTextGradient: string;
  glowColor: string;
  strongGlow: string;
  textColor: string;
  accentBg: string;
}

export function getMedalConfig(rank: number): MedalConfig {
  if (rank === 1) {
    return {
      title: 'GOLD CHAMPION',
      rankLabel: '1ST PLACE',
      icon: Crown,
      outerGradient:
        'radial-gradient(circle at 50% 24%, #ffffff 0%, #fffde0 8%, #fef08a 18%, #facc15 32%, #eab308 50%, #ca8a04 68%, #854d0e 86%, #3a1a02 100%)',
      innerRimGradient:
        'radial-gradient(circle at 50% 26%, #ffffff 0%, #fff9c4 16%, #fde047 38%, #ca8a04 68%, #713f12 100%)',
      faceGradient:
        'radial-gradient(circle at 45% 26%, #282115 0%, #17120a 38%, #0a0704 72%, #020101 100%)',
      rankTextGradient:
        'linear-gradient(180deg, #ffffff 0%, #fffbeb 20%, #fde047 45%, #ca8a04 75%, #fef08a 100%)',
      glowColor: 'rgba(250, 204, 21, 0.60)',
      strongGlow: 'rgba(250, 204, 21, 0.32)',
      textColor: 'text-amber-200',
      accentBg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    };
  }

  if (rank === 2) {
    return {
      title: 'SILVER RUNNER-UP',
      rankLabel: '2ND PLACE',
      icon: Trophy,
      outerGradient:
        'radial-gradient(circle at 50% 24%, #ffffff 0%, #f8fafc 12%, #f1f5f9 22%, #e2e8f0 36%, #cbd5e1 52%, #94a3b8 70%, #475569 88%, #0f172a 100%)',
      innerRimGradient:
        'radial-gradient(circle at 50% 26%, #ffffff 0%, #f8fafc 20%, #cbd5e1 45%, #64748b 72%, #1e293b 100%)',
      faceGradient:
        'radial-gradient(circle at 45% 26%, #1c2028 0%, #101319 38%, #07090d 72%, #020203 100%)',
      rankTextGradient:
        'linear-gradient(180deg, #ffffff 0%, #f8fafc 20%, #e2e8f0 45%, #94a3b8 75%, #ffffff 100%)',
      glowColor: 'rgba(226, 232, 240, 0.50)',
      strongGlow: 'rgba(226, 232, 240, 0.24)',
      textColor: 'text-slate-100',
      accentBg: 'bg-slate-300/15 text-slate-200 border-slate-300/40',
    };
  }

  return {
    title: 'BRONZE PODIUM',
    rankLabel: '3RD PLACE',
    icon: Award,
    outerGradient:
      'radial-gradient(circle at 50% 24%, #ffffff 0%, #ffeedd 8%, #fed7aa 18%, #fb923c 34%, #ea580c 52%, #c2410c 70%, #7c2d12 88%, #2e0b02 100%)',
    innerRimGradient:
      'radial-gradient(circle at 50% 26%, #ffffff 0%, #ffedd5 18%, #f97316 45%, #9a3412 72%, #431407 100%)',
    faceGradient:
      'radial-gradient(circle at 45% 26%, #281912 0%, #170d08 38%, #0a0503 72%, #020101 100%)',
    rankTextGradient:
      'linear-gradient(180deg, #ffffff 0%, #ffedd5 20%, #fb923c 45%, #c2410c 75%, #ffedd5 100%)',
    glowColor: 'rgba(249, 115, 22, 0.60)',
    strongGlow: 'rgba(249, 115, 22, 0.32)',
    textColor: 'text-orange-200',
    accentBg: 'bg-orange-600/15 text-orange-300 border-orange-500/40',
  };
}
