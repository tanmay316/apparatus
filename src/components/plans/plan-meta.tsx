import { Dumbbell, HeartPulse, Home, PersonStanding, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import type { Plan } from '@/types';

export interface PlanCategory {
  label: string;
  icon: LucideIcon;
  /** Light / dark tint for the icon badge. */
  tint: string;
  tintDark: string;
}

const CATEGORIES: { match: RegExp; category: PlanCategory }[] = [
  { match: /\b(calisthenics|skills?|street workout)\b/, category: { label: 'Calisthenics', icon: PersonStanding, tint: '#b6552f', tintDark: '#ffa37a' } },
  { match: /\b(home|no.?equipment)\b/, category: { label: 'Home', icon: Home, tint: '#2f7a6d', tintDark: '#7fd1c2' } },
  { match: /\b(hyrox|marathon|running|cardio|endurance|conditioning|fat.?loss)\b/, category: { label: 'Conditioning', icon: HeartPulse, tint: '#be3455', tintDark: '#f59aae' } },
  { match: /\b(powerlifting|strength|powerbuilding)\b/, category: { label: 'Strength', icon: Trophy, tint: '#a86b12', tintDark: '#f1c46b' } },
  { match: /\b(posture|mobility|yoga)\b/, category: { label: 'Mobility', icon: Sparkles, tint: '#5b5fc7', tintDark: '#aab0ff' } },
  { match: /\b(gym|hypertrophy|barbell|bodybuilding|split|push pull legs|ppl)\b/, category: { label: 'Gym', icon: Dumbbell, tint: '#3d5a80', tintDark: '#9cc0ea' } },
];

const DEFAULT_CATEGORY: PlanCategory = { label: 'Program', icon: Dumbbell, tint: '#6b5a52', tintDark: '#b4b4bf' };

export function planCategory(plan: Pick<Plan, 'tags' | 'title' | 'description'>): PlanCategory {
  // Tags and title are the strongest signal; only fall back to the description when they say nothing.
  const primary = `${(plan.tags || []).join(' ')} ${plan.title || ''}`.toLowerCase();
  const secondary = (plan.description || '').toLowerCase();
  return CATEGORIES.find(c => c.match.test(primary))?.category
    ?? CATEGORIES.find(c => c.match.test(secondary))?.category
    ?? DEFAULT_CATEGORY;
}

export function PlanBadge({ plan, size = 40 }: { plan: Pick<Plan, 'tags' | 'title' | 'description'>; size?: number }) {
  const cat = planCategory(plan);
  const Icon = cat.icon;
  return (
    <span
      className="dx-badge-icon dx-stat-icon shrink-0"
      style={{ width: size, height: size, borderRadius: size * 0.32, ['--tint' as any]: cat.tint, ['--tint-dark' as any]: cat.tintDark }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.45)} />
    </span>
  );
}

/** Seven-segment strip showing how many training days the plan has per week. */
export function DaysPerWeek({ days, light }: { days: number; light?: boolean }) {
  const n = Math.max(0, Math.min(7, Math.round(days || 0)));
  return (
    <span className="inline-flex items-center gap-1.5" title={`${n} training day${n === 1 ? '' : 's'} per week`}>
      <span className="inline-flex gap-[3px]">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="w-[7px] h-[14px] rounded-[3px]"
            style={{
              background: i < n
                ? (light ? 'rgba(255,255,255,0.92)' : 'var(--dx-accent)')
                : (light ? 'rgba(255,255,255,0.22)' : 'var(--dx-card-2)'),
            }}
          />
        ))}
      </span>
      <span className={`text-[11px] font-semibold tabular ${light ? '' : 'dx-muted'}`}>{n}×/wk</span>
    </span>
  );
}
