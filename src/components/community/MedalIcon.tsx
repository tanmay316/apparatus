import { getMedalConfig } from '@/lib/medal-config';

interface MedalIconProps {
  rank: number;
  size?: number;
  className?: string;
}

/**
 * Compact real medal artwork (outer ring + rim + face + icon) matching the detailed
 * medal shown in MedalShareModal — used anywhere a small "real" badge icon is needed
 * instead of a flat colored box with a generic lucide icon.
 */
export function MedalIcon({ rank, size = 48, className = '' }: MedalIconProps) {
  const config = getMedalConfig(rank);
  const Icon = config.icon;
  const iconSize = Math.round(size * 0.42);

  return (
    <div
      className={`relative rounded-full shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: config.outerGradient,
        boxShadow: `0 0 ${Math.round(size * 0.4)}px ${config.strongGlow}`,
      }}
    >
      <div
        className="absolute rounded-full"
        style={{ inset: Math.max(2, Math.round(size * 0.08)), background: config.innerRimGradient }}
      >
        <div
          className="absolute rounded-full flex items-center justify-center"
          style={{ inset: Math.max(2, Math.round(size * 0.1)), background: config.faceGradient }}
        >
          <Icon size={iconSize} className={`drop-shadow ${config.textColor}`} />
        </div>
      </div>
    </div>
  );
}
