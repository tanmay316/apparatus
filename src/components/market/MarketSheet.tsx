import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

/** Bottom sheet on phones, dialog on desktop - shared by the marketplace flows. */
export function MarketSheet({ title, subtitle, onClose, children, footer, z = 10030, wide }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  z?: number;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="dx pro-scope dx-overlay" style={{ zIndex: z }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className={`dx-sheet ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header">
          <div className="min-w-0 flex-1">
            <h3 className="text-[19px] font-semibold leading-tight tracking-tight">{title}</h3>
            {subtitle && <div className="mt-1 text-[13px] dx-muted leading-snug">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="dx-sheet-body">{children}</div>
        {footer && <div className="dx-sheet-footer">{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  );
}
