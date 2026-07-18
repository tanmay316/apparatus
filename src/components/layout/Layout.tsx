import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ReminderManager } from './ReminderManager';

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-ink-3 text-bone relative selection:bg-bone selection:text-ink transition-colors duration-300 overflow-x-hidden">
      {/* Soft Ambient Mesh Gradient Mixture (Matching Reference Image 1) */}
      <div className="ambient-glow-1 fixed top-[-100px] left-[-100px] w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#dbeafe] via-[#e0e7ff] to-transparent blur-[120px] pointer-events-none -z-10 opacity-70" />
      <div className="ambient-glow-2 fixed top-[-50px] right-[-100px] w-[700px] h-[700px] rounded-full bg-gradient-to-br from-[#fde8dc] via-[#fbe1d1] to-transparent blur-[140px] pointer-events-none -z-10 opacity-75" />
      <div className="ambient-glow-3 fixed bottom-[-100px] left-[20%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#f3e8ff] via-[#e0e7ff] to-transparent blur-[130px] pointer-events-none -z-10 opacity-60" />

      <Sidebar />
      <Topbar />
      <ReminderManager />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 relative z-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
