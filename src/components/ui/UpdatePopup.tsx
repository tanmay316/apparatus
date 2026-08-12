import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';

interface UpdateData {
  latestUpdateId: string;
  title: string;
  content: string;
}

export function UpdatePopup() {
  const { user } = useAuthStore();
  const [updateData, setUpdateData] = useState<UpdateData | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkUpdates = async () => {
      try {
        const docRef = doc(db, 'admin_settings', 'updates');
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
          const data = snap.data() as UpdateData;
          if (!data.latestUpdateId) return;

          const lastSeenId = localStorage.getItem('lastSeenUpdateId');
          if (lastSeenId !== data.latestUpdateId) {
            setUpdateData(data);
            setShow(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch update popup data:', error);
      }
    };

    // Small delay to let the app load first
    const timer = setTimeout(() => {
      checkUpdates();
    }, 2000);

    return () => clearTimeout(timer);
  }, [user]);

  const handleClose = () => {
    if (updateData?.latestUpdateId) {
      localStorage.setItem('lastSeenUpdateId', updateData.latestUpdateId);
    }
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && updateData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-3/90"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            // Solid background without glassmorphism!
            className="w-full max-w-md bg-paper border border-line rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-bone-dim hover:text-bone transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6 text-sienna border-b border-line pb-4">
              <div className="p-2 bg-sienna/10 rounded-full">
                <Bell className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-bone">{updateData.title}</h2>
            </div>

            <div className="prose prose-invert prose-p:text-bone-dim prose-strong:text-bone max-w-none mb-8 whitespace-pre-wrap">
              {updateData.content}
            </div>

            <button
              onClick={handleClose}
              className="w-full btn-primary py-3.5 rounded-xl font-medium shadow-lg"
            >
              Got it!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
