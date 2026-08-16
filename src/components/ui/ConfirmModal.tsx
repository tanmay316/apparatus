import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, Info, LogOut, CheckCircle2, X } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

export function ConfirmModal() {
  const confirmModal = useUIStore(s => s.confirmModal);
  const closeConfirm = useUIStore(s => s.closeConfirm);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmModal?.isOpen) {
        if (e.key === 'Escape') {
          closeConfirm(false);
        } else if (e.key === 'Enter') {
          closeConfirm(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal, closeConfirm]);

  if (typeof document === 'undefined') return null;

  const options = confirmModal?.options;
  const isDanger = !options?.type || options?.type === 'danger';
  const isWarning = options?.type === 'warning';

  const getIcon = () => {
    if (options?.icon === 'logout') {
      return <LogOut size={24} className="text-red-400" />;
    }
    if (options?.icon === 'info' || options?.type === 'info') {
      return <Info size={24} className="text-blue-400" />;
    }
    if (options?.icon === 'check') {
      return <CheckCircle2 size={24} className="text-emerald-400" />;
    }
    if (isWarning || options?.icon === 'alert') {
      return <AlertTriangle size={24} className="text-amber-400" />;
    }
    return <Trash2 size={24} className="text-red-400" />;
  };

  const getIconBg = () => {
    if (options?.icon === 'info' || options?.type === 'info') {
      return 'bg-blue-500/15 border-blue-500/30';
    }
    if (options?.icon === 'check') {
      return 'bg-emerald-500/15 border-emerald-500/30';
    }
    if (isWarning || options?.icon === 'alert') {
      return 'bg-amber-500/15 border-amber-500/30';
    }
    return 'bg-red-500/15 border-red-500/30';
  };

  return createPortal(
    <AnimatePresence>
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => closeConfirm(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 bg-ink border border-line/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 overflow-hidden"
          >
            {/* Close X */}
            <button
              onClick={() => closeConfirm(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Glowing Icon Badge */}
            <div className="flex justify-center">
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-lg ${getIconBg()}`}>
                {getIcon()}
              </div>
            </div>

            {/* Title & Message */}
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold font-display text-bone tracking-tight">
                {options?.title || (isDanger ? 'Confirm Action' : 'Notice')}
              </h3>
              <p className="text-xs sm:text-sm text-bone-dim leading-relaxed whitespace-pre-wrap">
                {options?.message}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-line/20 text-xs font-mono font-bold text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors"
              >
                {options?.cancelText || 'Cancel'}
              </button>

              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-md active:scale-95 ${
                  isDanger
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                    : isWarning
                    ? 'bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20'
                    : 'bg-sienna hover:bg-sienna/90 text-bg shadow-sienna/20'
                }`}
              >
                {options?.confirmText || (isDanger ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
