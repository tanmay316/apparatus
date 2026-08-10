import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Sparkles, DownloadCloud } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export function OTAUpdater() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Checking for updates...');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Listen for download events from Capgo
    const downloadListener = CapacitorUpdater.addListener('download', (info: any) => {
      setIsUpdating(true);
      setStatus('Downloading new update...');
      setProgress(Math.round(info.percent));
    });

    const installListener = CapacitorUpdater.addListener('noNeedUpdate', () => {
      setIsUpdating(false);
    });

    const updateAvailableListener = CapacitorUpdater.addListener('updateAvailable', () => {
      setIsUpdating(true);
      setStatus('Update found! Preparing to download...');
      setProgress(0);
    });

    const updateFailedListener = CapacitorUpdater.addListener('updateFailed', () => {
      setIsUpdating(false);
    });

    return () => {
      downloadListener.then(l => l.remove());
      installListener.then(l => l.remove());
      updateAvailableListener.then(l => l.remove());
      updateFailedListener.then(l => l.remove());
    };
  }, []);

  return (
    <AnimatePresence>
      {isUpdating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-ink text-bone p-6"
        >
          {/* Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sienna/20 rounded-full blur-[100px] pointer-events-none" />

          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="relative z-10 flex flex-col items-center w-full max-w-sm"
          >
            <div className="w-20 h-20 bg-ink-2 rounded-full border border-line flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(217,164,65,0.2)]">
              <DownloadCloud size={32} className="text-amber animate-pulse" />
            </div>

            <h2 className="font-display text-2xl mb-2 text-center">Update in Progress</h2>
            <p className="text-bone-dim text-sm font-mono mb-10 text-center flex items-center gap-2">
              <Sparkles size={14} className="text-sienna" />
              {status}
            </p>

            {/* Progress Bar Container */}
            <div className="w-full h-3 bg-ink-3 rounded-full overflow-hidden border border-line/50 p-0.5">
              <motion.div
                className="h-full bg-gradient-to-r from-sienna to-amber rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
              />
            </div>

            <div className="w-full flex justify-between mt-3 font-mono text-[10px] text-bone-dim tracking-wider uppercase">
              <span>Downloading</span>
              <span>{progress}%</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
