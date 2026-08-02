import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Zap, MessageCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

export interface FeatureItem {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

interface FeatureAnnouncementModalProps {
  featureId: string;
  title: string;
  subtitle?: string;
  items: FeatureItem[];
}

export function FeatureAnnouncementModal({ featureId, title, subtitle, items }: FeatureAnnouncementModalProps) {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    // Add a slight delay to ensure smooth rendering after dashboard loads
    const timer = setTimeout(() => {
      const storageKey = `feature-seen-${user.uid}-${featureId}`;
      if (!localStorage.getItem(storageKey)) {
        setIsOpen(true);
      }
      setMounted(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [user, featureId]);

  const handleClose = () => {
    if (!user) return;
    const storageKey = `feature-seen-${user.uid}-${featureId}`;
    localStorage.setItem(storageKey, 'true');
    setIsOpen(false);
  };

  if (!mounted || !isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-ink-3/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-ink-1 border border-line rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-sienna/20 to-ink-1 pt-10 pb-8 px-6 text-center border-b border-line/50">
              <button 
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-bone-dim hover:text-bone transition-colors z-20"
              >
                <X size={18} />
              </button>
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-14 h-14 bg-sienna/20 border border-sienna/30 rounded-full flex items-center justify-center mb-4 shadow-lg">
                  <Sparkles size={26} className="text-sienna" />
                </div>
                <h2 className="text-2xl font-display font-bold text-bone mb-1">{title}</h2>
                {subtitle && <p className="text-sm text-sienna font-medium">{subtitle}</p>}
              </div>
              
              {/* Background Glows */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-sienna/20 blur-[50px] rounded-full mix-blend-screen" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/10 blur-[40px] rounded-full mix-blend-screen" />
            </div>
            
            {/* Content */}
            <div className="p-7 space-y-7 bg-ink-1 relative z-10">
              <div className="space-y-6">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="shrink-0 mt-0.5 p-2 bg-ink-2 border border-line/50 rounded-xl text-bone">
                      {item.icon || <Sparkles size={18} />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-bone text-base mb-1">{item.title}</h3>
                      <p className="text-sm text-bone-dim leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={handleClose}
                className="w-full btn-primary py-3.5 rounded-xl font-medium text-base shadow-lg shadow-sienna/20 transform transition-transform active:scale-[0.98]"
              >
                Got it, let's go!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
