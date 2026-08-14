import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { ReminderManager } from './ReminderManager';
import FloatingAIBot from '../nutrition/FloatingAIBot';
import { LiveChatOverlay } from '../social/LiveChatOverlay';
import { Video, Bot } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { useEffect } from 'react';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('redirect_modal') === 'followers' && profile?.username) {
      window.history.replaceState({}, '', window.location.pathname); // clear query string
      navigate(`/profile/${profile.username}?modal=followers`);
    }
  }, [profile, navigate]);

  return (
    <div className="app-shell min-h-screen bg-ink-3 text-bone relative selection:bg-bone selection:text-ink transition-colors duration-300 overflow-x-hidden">
      {/* Performant Ambient Mesh Gradient Mixture (using radial-gradient to avoid GPU-killing CSS blurs on mobile) */}
      <div className="ambient-glow-1 fixed top-[-20%] left-[-10%] w-[80vw] h-[80vw] max-w-[650px] max-h-[650px] rounded-full bg-[radial-gradient(circle_at_center,_#dbeafe80_0%,_#e0e7ff40_40%,_transparent_70%)] pointer-events-none -z-10 opacity-50 md:opacity-70 will-change-transform" />
      <div className="ambient-glow-2 fixed top-[-10%] right-[-10%] w-[80vw] h-[80vw] max-w-[700px] max-h-[700px] rounded-full bg-[radial-gradient(circle_at_center,_#fde8dc80_0%,_#fbe1d140_45%,_transparent_70%)] pointer-events-none -z-10 opacity-50 md:opacity-75 will-change-transform" />
      <div className="ambient-glow-3 fixed bottom-[-20%] left-[20%] w-[90vw] h-[90vw] max-w-[600px] max-h-[600px] rounded-full bg-[radial-gradient(circle_at_center,_#f3e8ff80_0%,_#e0e7ff30_50%,_transparent_70%)] pointer-events-none -z-10 opacity-40 md:opacity-60 will-change-transform" />

      <Sidebar />
      {!location.pathname.startsWith('/cardio') && <Topbar />}
      <ReminderManager />
      <FloatingAIBot />
      <LiveChatOverlay />
      {!location.pathname.startsWith('/cardio') && <BottomNav />}

      <main className={location.pathname.startsWith('/cardio') ? "h-full w-full" : "max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-28 relative"}>
        <Outlet />
      </main>
    </div>
  );
}
