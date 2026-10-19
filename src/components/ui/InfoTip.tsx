import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/** Small "i" button; tapping it shows a short explanation in a popover. */
export function InfoTip({ children, label = 'What does this mean?', size = 14, className = '' }: {
  children: ReactNode; label?: string; size?: number; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
    const above = r.bottom + 180 > window.innerHeight && r.top > 180;
    setPos({ top: above ? r.top - 6 : r.bottom + 6, left, width, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        className={`inline-flex items-center justify-center shrink-0 w-6 h-6 -m-1 rounded-full text-bone-dim hover:text-bone align-middle ${className}`}
      >
        <Info size={size} />
      </button>
      {open && pos && createPortal(
        <div
          ref={pop}
          role="tooltip"
          className="fixed z-[10080] rounded-xl border border-line bg-ink-2 text-bone shadow-xl p-3 text-[12.5px] leading-snug normal-case tracking-normal font-normal"
          style={{ top: pos.top, left: pos.left, width: pos.width, transform: pos.above ? 'translateY(-100%)' : undefined }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
