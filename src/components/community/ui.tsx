import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Trophy, type LucideIcon } from 'lucide-react';

// ─── Schedule status ──────────────────────────────────────────────

export type ScheduleKind = 'upcoming' | 'live' | 'ended' | 'tba';

export interface ScheduleStatus {
  kind: ScheduleKind;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Anything Firestore-ish (Timestamp, {seconds}, Date, ISO string, ms) → epoch ms (0 if unknown). */
export function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

/**
 * When no end time is set, events are treated as running for 24h after start;
 * open-ended items (challenges) run indefinitely. This keeps labels and the
 * Active / Upcoming / Concluded filters in agreement.
 */
export function effectiveEnd(startMs: number, endMs: number, openEnded = false): number {
  if (endMs) return endMs;
  if (!startMs) return 0;
  return openEnded ? Number.POSITIVE_INFINITY : startMs + DAY_MS;
}

function formatSpan(diff: number): string {
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.max(1, Math.floor((diff / (1000 * 60)) % 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function getScheduleStatus(startMs: number, endMs: number, openEnded = false, now = Date.now()): ScheduleStatus {
  if (!startMs) return { kind: 'tba', label: 'Date TBA' };
  const end = effectiveEnd(startMs, endMs, openEnded);
  if (now < startMs) return { kind: 'upcoming', label: `Starts in ${formatSpan(startMs - now)}` };
  if (now <= end) {
    return { kind: 'live', label: endMs ? `Ends in ${formatSpan(end - now)}` : openEnded ? 'Ongoing' : 'Happening now' };
  }
  return { kind: 'ended', label: 'Ended' };
}

export function isScheduleActive(startMs: number, endMs: number, openEnded = false, now = Date.now()): boolean {
  return !!startMs && now >= startMs && now <= effectiveEnd(startMs, endMs, openEnded);
}

export function isScheduleUpcoming(startMs: number, now = Date.now()): boolean {
  return !!startMs && now < startMs;
}

export function isScheduleEnded(startMs: number, endMs: number, openEnded = false, now = Date.now()): boolean {
  const end = effectiveEnd(startMs, endMs, openEnded);
  return !!end && now > end;
}

export function formatWhen(ms: number): string {
  if (!ms) return 'Date TBA';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatDateRange(startMs: number, endMs: number): string {
  if (!startMs) return 'Dates TBA';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(startMs).toLocaleDateString(undefined, opts);
  if (!endMs) return `From ${start}`;
  return `${start} – ${new Date(endMs).toLocaleDateString(undefined, opts)}`;
}

/** Small icon action rendered over media or inside cards (edit / delete). */
export function CardAction({
  icon: Icon,
  label,
  onClick,
  onMedia = false,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  onMedia?: boolean;
  danger?: boolean;
}) {
  const base = 'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors !shadow-none';
  const tone = onMedia
    ? 'bg-black/45 text-white backdrop-blur hover:bg-black/60 !border-0'
    : danger
      ? 'text-bone-dim hover:text-danger hover:bg-danger/10'
      : 'text-bone-dim hover:text-bone hover:bg-ink-3';
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={`${base} ${tone}`}>
      <Icon size={15} />
    </button>
  );
}

// ─── Primitives ───────────────────────────────────────────────────

export function StatusPill({ status, onMedia = false, className = '' }: { status: ScheduleStatus; onMedia?: boolean; className?: string }) {
  const tone = onMedia
    ? 'cx-status-on-media'
    : status.kind === 'live'
      ? 'cx-status-live'
      : status.kind === 'upcoming'
        ? 'cx-status-upcoming'
        : 'cx-status-ended';
  return (
    <span className={`cx-status ${tone} ${className}`}>
      <span className="cx-status-dot" aria-hidden />
      {status.kind === 'live' && status.label.startsWith('Ends') ? `Live · ${status.label}` : status.label}
    </span>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cx-eyebrow ${className}`}>{children}</div>;
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

/** iOS-style segmented control with an animated thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className = '',
  fullWidth = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div role="tablist" className={`cx-segment ${fullWidth ? 'flex w-full' : ''} ${className}`}>
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={fullWidth ? 'flex-1' : ''}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="cx-segment-thumb"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {opt.label}
              {!!opt.badge && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sienna text-[10px] font-bold leading-[18px] text-center">
                  {opt.badge > 99 ? '99+' : opt.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal filter chips. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
          className="cx-chip"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`cx-surface text-center ${compact ? 'px-6 py-10' : 'px-6 py-14'}`}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink text-bone-dim">
        <Icon size={22} />
      </div>
      <h3 className="text-base font-semibold text-bone">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-bone-dim">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="cx-card overflow-hidden">
          <div className="h-28 animate-pulse bg-ink-3" />
          <div className="space-y-2.5 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-ink-3" />
            <div className="h-3 w-full animate-pulse rounded bg-ink-3" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-ink-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChampionRow({ name, result }: { name: string; result?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Trophy size={14} className="shrink-0 text-amber-600" />
        <span className="text-xs text-bone-dim">Champion</span>
        <span className="truncate text-xs font-semibold text-bone">{name || 'Athlete'}</span>
      </div>
      {result && <span className="shrink-0 text-xs font-semibold tabular-nums text-bone">{result}</span>}
    </div>
  );
}

/** Calendar tile (month + day). Shows a dash when the date is unknown. */
export function DateTile({ ms }: { ms: number }) {
  const d = ms ? new Date(ms) : null;
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-ink-2">
      <span className="text-[10px] font-semibold uppercase leading-none tracking-wider text-sienna">
        {d ? d.toLocaleString('default', { month: 'short' }) : 'TBA'}
      </span>
      <span className="mt-1 text-lg font-semibold leading-none tabular-nums text-bone">{d ? d.getDate() : '–'}</span>
    </div>
  );
}

export function MetaItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-bone-dim">
      <Icon size={13} className="shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
