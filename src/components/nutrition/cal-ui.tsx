import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Beef, Droplet, Flame, Leaf, Wheat, X } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/scroll-lock';

export const MACRO_META = {
  calories: { label: 'Calories', unit: '', icon: Flame, color: 'var(--cal-text)' },
  protein: { label: 'Protein', unit: 'g', icon: Beef, color: 'var(--cal-protein)' },
  carbs: { label: 'Carbs', unit: 'g', icon: Wheat, color: 'var(--cal-carbs)' },
  fat: { label: 'Fats', unit: 'g', icon: Droplet, color: 'var(--cal-fat)' },
  fiber: { label: 'Fiber', unit: 'g', icon: Leaf, color: 'var(--cal-fiber)' },
} as const;
export type MacroKey = keyof typeof MACRO_META;

export function Ring({ size, stroke, pct, color, track = 'var(--cal-card-2)', children }: {
  size: number; stroke: number; pct: number; color: string; track?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>}
    </div>
  );
}

/** iOS-style scroll wheel. */
export function Wheel<T extends string | number>({ items, value, onChange, itemH = 44, visible = 5, width }: {
  items: { value: T; label: string }[]; value: T; onChange: (v: T) => void; itemH?: number; visible?: number; width?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, items.findIndex(i => i.value === value));
  const [active, setActive] = useState(idx);
  const settle = useRef<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / itemH) !== idx) el.scrollTop = idx * itemH;
    setActive(idx);
    // Only re-sync when the value or list changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, items.length, itemH]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / itemH)));
    setActive(i);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (items[i] && items[i].value !== value) onChange(items[i].value);
    }, 90);
  };

  const pad = ((visible - 1) / 2) * itemH;
  return (
    <div style={{ position: 'relative', height: itemH * visible, width }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: pad, height: itemH, borderRadius: 12, background: 'var(--cal-card-2)' }} />
      <div
        ref={ref}
        onScroll={onScroll}
        className="cal-wheel"
        role="listbox"
        style={{ position: 'relative', height: '100%', overflowY: 'auto', paddingTop: pad, paddingBottom: pad, WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)', maskImage: 'linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)' }}
      >
        {items.map((it, i) => (
          <div
            key={String(it.value)}
            role="option"
            aria-selected={i === active}
            onClick={() => ref.current?.scrollTo({ top: i * itemH, behavior: 'smooth' })}
            style={{
              height: itemH, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: i === active ? 19 : 17, fontWeight: i === active ? 700 : 500,
              color: i === active ? 'var(--cal-text)' : 'var(--cal-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
            className="cal-tabular"
          >
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal measuring-tape slider. */
export function Ruler({ min, max, step, value, onChange, majorEvery = 10 }: {
  min: number; max: number; step: number; value: number; onChange: (v: number) => void; majorEvery?: number;
}) {
  const TICK = 10;
  const ref = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const [w, setW] = useState(0);
  const count = Math.round((max - min) / step) + 1;
  const toIndex = (v: number) => Math.max(0, Math.min(count - 1, Math.round((v - min) / step)));

  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.clientWidth);
  }, []);

  // Position once the side padding is known; otherwise scroll-snap re-snaps to the wrong tick.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !w || ready.current) return;
    el.scrollLeft = toIndex(value) * TICK;
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  const onScroll = () => {
    const el = ref.current;
    if (!el || !ready.current) return;
    const v = Math.round((min + Math.round(el.scrollLeft / TICK) * step) * 10) / 10;
    if (v !== value) onChange(Math.min(max, Math.max(min, v)));
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} onScroll={onScroll} className="cal-ruler" style={{ overflowX: 'auto', display: 'flex', alignItems: 'flex-end', height: 86, paddingLeft: Math.max(0, w / 2 - TICK / 2), paddingRight: Math.max(0, w / 2 - TICK / 2) }}>
        {w > 0 && Array.from({ length: count }, (_, i) => {
          const major = i % majorEvery === 0;
          return (
            <div key={i} style={{ width: TICK, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', scrollSnapAlign: 'center' }}>
              {major && <span className="cal-muted cal-tabular" style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, whiteSpace: 'nowrap' }}>{Math.round((min + i * step) * 10) / 10}</span>}
              <span style={{ width: 2, height: major ? 34 : 20, borderRadius: 2, background: major ? 'var(--cal-text)' : 'var(--cal-muted)', opacity: major ? 0.9 : 0.45 }} />
            </div>
          );
        })}
      </div>
      <div aria-hidden style={{ position: 'absolute', left: '50%', bottom: 0, width: 3, height: 50, marginLeft: -1.5, borderRadius: 3, background: 'var(--cal-text)' }} />
    </div>
  );
}

export const useLockBody = useBodyScrollLock;

/** Bottom sheet rendered in a portal above the page chrome. */
export function CalSheet({ title, onClose, children, footer, z = 10020 }: {
  title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; z?: number;
}) {
  useLockBody();
  return createPortal(
    <div className="cal" style={{ position: 'fixed', inset: 0, zIndex: z, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 360 }}
        style={{ position: 'relative', width: '100%', maxWidth: 520, maxHeight: '92dvh', display: 'flex', flexDirection: 'column', background: 'var(--cal-bg)', borderRadius: '28px 28px 0 0', boxShadow: '0 -10px 40px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><span style={{ width: 38, height: 5, borderRadius: 5, background: 'var(--cal-muted)', opacity: 0.35 }} /></div>
        {title !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 6px' }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</div>
            <button type="button" onClick={onClose} className="cal-icon-btn" aria-label="Close"><X size={18} /></button>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '8px 18px 18px', overscrollBehavior: 'contain' }}>{children}</div>
        {footer && <div style={{ padding: '10px 18px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--cal-border)' }}>{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  );
}

export function NumberSheet({ title, value, unit, min = 0, max = 10000, onSave, onClose, z }: {
  title: string; value: number; unit?: string; min?: number; max?: number; onSave: (v: number) => void; onClose: () => void; z?: number;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  const n = Number(text);
  const ok = text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max;
  return (
    <CalSheet
      title={title}
      onClose={onClose}
      z={z}
      footer={<button type="button" className="cal-btn w-full" disabled={!ok} onClick={() => { onSave(Math.round(n)); onClose(); }}>Save</button>}
    >
      <div style={{ position: 'relative' }}>
        <input autoFocus inputMode="numeric" className="cal-input cal-tabular" value={text} onChange={e => setText(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} style={{ fontSize: 28, height: 64, paddingRight: 56 }} />
        {unit && <span className="cal-muted" style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', fontWeight: 600 }}>{unit}</span>}
      </div>
      <p className="cal-muted" style={{ marginTop: 10, fontSize: 13 }}>Between {min} and {max}{unit ? ` ${unit}` : ''}.</p>
    </CalSheet>
  );
}
