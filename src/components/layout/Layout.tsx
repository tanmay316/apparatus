import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ReminderManager } from './ReminderManager';

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-ink">
      <Sidebar />
      <Topbar />
      <ReminderManager />

      <main className="max-w-[1440px] mx-auto px-5 sm:px-6 lg:px-8 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
