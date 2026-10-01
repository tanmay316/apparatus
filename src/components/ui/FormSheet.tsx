import { useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Check, ImagePlus, Loader2, Trash2, X, type LucideIcon } from 'lucide-react';

/**
 * Create/edit form shell: bottom sheet on phones, centred dialog on desktop, with a sticky
 * header (icon, title, subtitle) and footer (Cancel + primary action).
 */
export function FormSheet({ icon: Icon, title, subtitle, aside, onClose, onSubmit, submitLabel, submitIcon: SubmitIcon, busy, busyLabel, disabled, children, z = 600 }: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  /** Small status shown next to the title (e.g. "Starts in 2 days"). */
  aside?: ReactNode;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  submitIcon?: LucideIcon;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  children: ReactNode;
  z?: number;
}) {
  useEffect(() => {
    document.body.classList.add('community-create-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('community-create-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="dx pro-scope dx-overlay" style={{ zIndex: z }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        noValidate
        onSubmit={onSubmit}
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        className="dx-sheet sm:max-w-xl"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <span className="dx-badge-icon !w-10 !h-10 !rounded-xl"><Icon size={19} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[18px] font-semibold leading-tight tracking-tight truncate">{title}</h2>
              {aside}
            </div>
            {subtitle && <p className="mt-0.5 text-[13px] dx-muted leading-snug">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="dx-sheet-body !py-1">{children}</div>
        <div className="dx-sheet-footer flex gap-2.5">
          <button type="button" onClick={onClose} className="dx-btn-secondary px-5">Cancel</button>
          <button type="submit" disabled={busy || disabled} className="dx-btn flex-1">
            {busy ? <Loader2 size={17} className="animate-spin" /> : SubmitIcon && <SubmitIcon size={17} />}
            {busy ? busyLabel || 'Saving…' : submitLabel}
          </button>
        </div>
      </motion.form>
    </div>,
    document.body,
  );
}

/** A titled group of fields, separated from the next group by a hairline. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="py-5 border-b last:border-b-0" style={{ borderColor: 'var(--dx-border)' }}>
      <div className="mb-3.5">
        <h3 className="text-[14.5px] font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-[12.5px] dx-muted mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Field({ id, label, optional, hint, error, count, max, children }: {
  id?: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | false;
  count?: number;
  max?: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
          {optional && <span className="dx-muted font-normal"> · Optional</span>}
        </label>
        {max !== undefined && <span className="text-[11px] dx-muted tabular-nums">{count ?? 0}/{max}</span>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] flex items-center gap-1 font-medium" style={{ color: '#dc2626' }}>
          <AlertCircle size={12} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] dx-muted leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

export interface Choice<T extends string> { value: T; label: string; description?: string; icon?: LucideIcon }

/** Single-choice cards (radio group) - for short lists such as visibility or category. */
export function ChoiceGroup<T extends string>({ value, onChange, options, columns = 2, label }: {
  value: T;
  onChange: (v: T) => void;
  options: Choice<T>[];
  columns?: 1 | 2 | 3;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {options.map(o => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="relative text-left rounded-xl px-3 py-2.5 transition-colors"
            style={{
              background: on ? 'var(--dx-accent-soft)' : 'var(--dx-card-2)',
              border: `1px solid ${on ? 'var(--dx-accent)' : 'transparent'}`,
            }}
          >
            <span className="flex items-center gap-2">
              {Icon && <Icon size={15} style={{ color: on ? 'var(--dx-accent)' : 'var(--dx-muted)' }} className="shrink-0" />}
              <span className="text-[13px] font-semibold leading-tight truncate">{o.label}</span>
            </span>
            {o.description && <span className="block text-[11.5px] dx-muted leading-snug mt-1">{o.description}</span>}
            {on && (
              <span className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }}>
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact pill choices that wrap - for presets like durations. */
export function ChipGroup<T extends string | number>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className="h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors"
            style={{
              background: on ? 'var(--dx-accent)' : 'var(--dx-card-2)',
              color: on ? 'var(--dx-on-accent)' : 'var(--dx-text)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Cover image with always-visible upload / remove actions (no hover needed on phones). */
export function CoverPicker({ value, onPick, onClear, busy, placeholder = 'Add a cover photo', hint = 'JPG or PNG. Wide images look best.' }: {
  value: string;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  busy?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="relative w-full aspect-[16/7] rounded-2xl overflow-hidden" style={{ background: 'var(--dx-card-2)' }}>
        {value ? (
          <img src={value} alt="Cover preview" className="w-full h-full object-cover" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed" style={{ borderColor: 'var(--dx-border-strong)' }}>
            {busy ? <Loader2 size={22} className="animate-spin dx-muted" /> : <ImagePlus size={22} className="dx-muted" />}
            <span className="text-[13px] font-semibold">{busy ? 'Processing…' : placeholder}</span>
            <span className="text-[11.5px] dx-muted">{hint}</span>
          </button>
        )}
        {value && (
          <div className="absolute bottom-2.5 right-2.5 flex gap-1.5">
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="h-8 px-3 rounded-full text-[12px] font-semibold flex items-center gap-1.5 bg-black/60 text-white backdrop-blur-sm">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Change
            </button>
            <button type="button" onClick={onClear} aria-label="Remove cover" className="h-8 w-8 rounded-full flex items-center justify-center bg-black/60 text-white backdrop-blur-sm">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" onChange={e => { onPick(e); e.target.value = ''; }} className="hidden" aria-label="Upload cover image" />
    </div>
  );
}

/** Small status pill for the sheet header. */
export function StatusPill({ tone, children }: { tone: 'upcoming' | 'active' | 'completed'; children: ReactNode }) {
  const c = tone === 'active' ? 'dx-pill--success' : tone === 'completed' ? 'dx-pill--neutral' : 'dx-pill--accent';
  return <span className={`dx-pill ${c} shrink-0`}>{children}</span>;
}

export const STATUS_LABEL = { upcoming: 'Upcoming', active: 'Live now', completed: 'Ended' } as const;

/** "3 h", "2 days", "5 weeks" — length of a date range for field hints. */
export function spanLabel(startMs: number, endMs: number): string {
  const h = (endMs - startMs) / 3_600_000;
  if (!Number.isFinite(h) || h <= 0) return '';
  if (h < 24) return `${Math.round(h * 10) / 10} h`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'}`;
  const w = Math.round(d / 7);
  return `${w} weeks`;
}
