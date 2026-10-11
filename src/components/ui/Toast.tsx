import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '@/stores/ui-store';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

export function Toast() {
  const { toast, clearToast } = useUIStore();

  const icons = {
    success: <CheckCircle size={16} />,
    error: <AlertCircle size={16} />,
    info: <Info size={16} />,
  };

  const colors = {
    success: 'bg-sienna text-bone',
    error: 'bg-danger text-bone',
    info: 'bg-amber text-ink',
  };

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className={`fixed left-1/2 z-[10060] px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl flex items-center gap-2.5 w-max max-w-[90vw] cursor-pointer ${colors[toast.type]}`}
          style={{ bottom: 'calc(var(--sab) + 96px)' }}
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={clearToast}
        >
          {icons[toast.type]}
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
