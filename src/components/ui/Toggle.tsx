import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: checked ? 'var(--dx-accent, #5d2a1a)' : 'var(--dx-border-strong, rgba(23,25,28,0.16))' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

interface ToggleProps extends SwitchProps {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
}

/** Settings row: label and description on the left, switch on the right. */
export function Toggle({ checked, onChange, label, description, icon, disabled }: ToggleProps) {
  return (
    <div className={`flex items-center gap-3 py-3.5 ${disabled ? 'opacity-50' : ''}`}>
      {icon && <span className="dx-badge-icon !w-9 !h-9 !rounded-xl">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium" style={{ color: 'var(--dx-text)' }}>{label}</div>
        {description && <div className="text-[12.5px] dx-muted leading-snug mt-0.5">{description}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}
