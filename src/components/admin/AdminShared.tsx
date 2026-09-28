import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, RefreshCw, X, type LucideIcon } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import { isAdminUser } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

/** Mirrors isAdmin() in firestore.rules so the console never shows actions the rules will reject. */
export function useIsAdmin() {
  const user = useAuthStore(s => s.user);
  return isAdminUser(user);
}

export function toMillis(value: unknown): number | null {
  if (!value) return null;
  const v = value as Timestamp & { seconds?: number };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const parsed = new Date(value as string).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatWhen(value: unknown, fallback = '—') {
  const ms = toMillis(value);
  if (!ms) return fallback;
  const diff = Date.now() - ms;
  if (diff >= 0 && diff < 60_000) return 'just now';
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const fmtCount = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

export function Metric({ label, value, detail, icon: Icon, tone = 'text-sienna', onClick }: {
  label: string; value: number | null; detail?: string; icon: LucideIcon; tone?: string; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`card p-4 text-left ${onClick ? 'hover:border-sienna/40 cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="font-mono text-[10px] text-bone-dim tracking-wider">{label}</div>
        <Icon size={17} className={tone} />
      </div>
      <div className="font-display text-3xl mt-3">{fmtCount(value)}</div>
      {detail && <div className="text-[11px] text-bone-dim mt-1">{detail}</div>}
    </Tag>
  );
}

export function SectionHeader({ title, description, actions, icon: Icon }: {
  title: string; description?: string; actions?: ReactNode; icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <h2 className="font-display text-xl flex items-center gap-2">{Icon && <Icon size={18} className="text-sienna" />}{title}</h2>
        {description && <p className="text-xs text-bone-dim mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="btn-secondary py-2" title="Refresh">
      <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-sm text-bone-dim border border-dashed border-line/50 rounded-xl">{children}</div>;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="py-12 text-center text-sm text-bone-dim animate-pulse">{label}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = (error as Error)?.message || 'Something went wrong';
  return (
    <div className="py-8 text-center text-sm text-danger border border-danger/30 rounded-xl bg-danger/5 space-y-3">
      <div>{message}</div>
      {onRetry && <button onClick={onRetry} className="btn-secondary py-2">Try again</button>}
    </div>
  );
}

export function CopyId({ value, label }: { value: string; label?: string }) {
  const showToast = useUIStore(s => s.showToast);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(value).then(() => showToast('Copied'), () => showToast('Copy failed', 'error'))}
      className="inline-flex items-center gap-1 font-mono text-[10px] text-bone-dim hover:text-sienna max-w-full"
      title="Copy"
    >
      <span className="truncate">{label ?? value}</span><Copy size={10} className="shrink-0" />
    </button>
  );
}

export function FilterPills<T extends string>({ value, options, onChange }: {
  value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`shrink-0 px-3 py-1.5 rounded-full font-mono text-[11px] transition-colors ${value === o.id ? 'bg-sienna text-white' : 'bg-ink-2 text-bone-dim hover:text-bone'}`}
        >
          {o.label}{o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export interface ReasonDialogConfig {
  title: string;
  message?: string;
  placeholder?: string;
  confirmText?: string;
  required?: boolean;
  danger?: boolean;
  choices?: { label: string; value: string }[];
  choiceLabel?: string;
  initialChoice?: string;
  maxLength?: number;
}

/** Text (and optional choice) prompt; replaces window.prompt, which is unreliable in the native WebView. */
export function ReasonDialog({ config, onSubmit, onClose }: {
  config: ReasonDialogConfig | null;
  onSubmit: (text: string, choice?: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | undefined>();

  useEffect(() => {
    if (config) { setText(''); setChoice(config.initialChoice ?? config.choices?.[0]?.value); }
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config, onClose]);

  if (!config) return null;
  const canSubmit = !config.required || text.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <form
        onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit(text.trim(), choice); }}
        className="relative z-10 bg-ink border border-line/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg">{config.title}</h3>
            {config.message && <p className="text-xs text-bone-dim mt-1">{config.message}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-bone-dim hover:text-bone"><X size={18} /></button>
        </div>
        {config.choices && (
          <div>
            <label className="label">{config.choiceLabel || 'Option'}</label>
            <div className="flex flex-wrap gap-1.5">
              {config.choices.map(c => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setChoice(c.value)}
                  className={`px-3 py-1.5 rounded-full font-mono text-[11px] ${choice === c.value ? 'bg-sienna text-white' : 'bg-ink-2 text-bone-dim'}`}
                >{c.label}</button>
              ))}
            </div>
          </div>
        )}
        <textarea
          autoFocus
          value={text}
          maxLength={config.maxLength ?? 500}
          onChange={e => setText(e.target.value)}
          placeholder={config.placeholder}
          rows={3}
          className="input-field resize-none"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary py-2">Cancel</button>
          <button type="submit" disabled={!canSubmit} className={config.danger ? 'btn-danger py-2' : 'btn-primary py-2'}>
            {config.confirmText || 'Confirm'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Promise-style wrapper around ReasonDialog. */
export function useReasonDialog() {
  const [state, setState] = useState<{ config: ReasonDialogConfig; resolve: (v: { text: string; choice?: string } | null) => void } | null>(null);
  const ask = (config: ReasonDialogConfig) => new Promise<{ text: string; choice?: string } | null>(resolve => setState({ config, resolve }));
  const close = () => { state?.resolve(null); setState(null); };
  const dialog = (
    <ReasonDialog
      config={state?.config ?? null}
      onClose={close}
      onSubmit={(text, choice) => { state?.resolve({ text, choice }); setState(null); }}
    />
  );
  return { ask, dialog };
}
