import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

// Add the release notes for your versions here!
const releaseNotes: Record<string, string[]> = {
  '2.0.0': [
    '✨ Brand new App Architecture (Lightning Fast!)',
    '🔒 Massive Security Enhancements for Clans and Events',
    '📱 Official Android App Release Support',
    '🚀 Over-The-Air (OTA) Live Updates Enabled'
  ]
};

export function UpdateNotifier() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Small delay so it doesn't pop up immediately before the UI settles
    const timer = setTimeout(() => {
      const lastSeenVersion = localStorage.getItem('last_seen_version');
      const currentVersion = __APP_VERSION__;

      if (lastSeenVersion !== currentVersion) {
        setShow(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    localStorage.setItem('last_seen_version', __APP_VERSION__);
    setShow(false);
  };

  const currentNotes = releaseNotes[__APP_VERSION__] || [
    'Bug fixes and performance improvements.'
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md bg-paper border border-white/10 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 text-sienna">
              <Sparkles className="w-6 h-6" />
              <h2 className="text-xl font-bold text-white">What's New in {__APP_VERSION__}</h2>
            </div>

            <ul className="space-y-3 mb-6">
              {currentNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2 text-white/80">
                  <span className="text-sienna mt-1">•</span>
                  <span className="leading-relaxed">{note}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleClose}
              className="w-full py-3 bg-sienna text-white rounded-xl font-medium hover:bg-sienna/90 transition-colors"
            >
              Awesome, let's go!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
