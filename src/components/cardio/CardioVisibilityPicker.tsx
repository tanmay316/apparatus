import { Globe2, Lock, Users } from 'lucide-react';

export type CardioVisibility = 'public' | 'followers' | 'private';

const STORAGE_KEY = 'apparatus_cardio_visibility';

const OPTIONS: { value: CardioVisibility; label: string; icon: typeof Globe2 }[] = [
  { value: 'followers', label: 'Followers', icon: Users },
  { value: 'public', label: 'Public', icon: Globe2 },
  { value: 'private', label: 'Only me', icon: Lock },
];

export function loadCardioVisibility(): CardioVisibility {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'public' || saved === 'private' || saved === 'followers' ? saved : 'followers';
}

export function storeCardioVisibility(v: CardioVisibility) {
  localStorage.setItem(STORAGE_KEY, v);
}

interface Props {
  value: CardioVisibility;
  onChange: (v: CardioVisibility) => void;
  disabled?: boolean;
  className?: string;
}

/** Who can see a cardio session - same three levels as strength workouts. */
export function CardioVisibilityPicker({ value, onChange, disabled, className = '' }: Props) {
  return (
    <div
      className={`grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--dx-card-2,var(--card-2))] ${disabled ? 'opacity-60' : ''} ${className}`}
      role="radiogroup"
      aria-label="Who can see this session"
    >
      {OPTIONS.map(({ value: v, label, icon: Icon }) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(v)}
            className={`h-9 rounded-xl flex items-center justify-center gap-1.5 text-[12.5px] font-semibold transition-colors ${
              on ? 'bg-[var(--dx-card,var(--card))] text-[var(--text)] shadow-sm' : 'text-[var(--muted)]'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        );
      })}
    </div>
  );
}
