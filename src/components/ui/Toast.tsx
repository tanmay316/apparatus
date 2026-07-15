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
    success: 'bg-teal text-ink',
    error: 'bg-danger text-bone',
    info: 'bg-amber text-ink',
  };

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className={`fixed bottom-6 left-1/2 z-[400] px-5 py-3 rounded-lg font-mono text-sm font-bold shadow-2xl flex items-center gap-2.5 max-w-[90vw] cursor-pointer ${colors[toast.type]}`}
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
