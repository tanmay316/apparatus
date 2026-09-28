import type { ReactNode } from 'react';

interface SectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  danger?: boolean;
}

export function SettingsSection({ id, title, description, children, danger }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`}>
      <div className="mb-2.5 px-1">
        <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-tight" style={{ color: danger ? '#dc2626' : 'var(--dx-text)' }}>
          {title}
        </h2>
        {description && <p className="text-[13px] dx-muted mt-0.5">{description}</p>}
      </div>
      <div
        className="dx-card px-4 sm:px-5 dx-list"
        style={danger ? { borderColor: 'rgba(220, 38, 38, 0.25)' } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

interface RowProps {
  label: string;
  description?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
}

/** Label on the left, control on the right; stacks on small screens. */
export function SettingRow({ label, description, children, htmlFor }: RowProps) {
  return (
    <div className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-6">
      <div className="sm:w-[42%] min-w-0">
        <label htmlFor={htmlFor} className="block text-[14px] font-medium" style={{ color: 'var(--dx-text)' }}>{label}</label>
        {description && <div className="text-[12.5px] dx-muted leading-snug mt-0.5">{description}</div>}
      </div>
      {children && <div className="flex-1 min-w-0 flex sm:justify-end">{children}</div>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="dx-segment w-full sm:w-auto" role="tablist" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className="!h-8 !text-[12.5px] sm:!px-4"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
