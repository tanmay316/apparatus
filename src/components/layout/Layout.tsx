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

  const mainPages = ["/", "/nutrition", "/progress", "/community", "/plans", "/explore"];
  const hasBottomNav = mainPages.includes(location.pathname);
  const isChatPage = location.pathname.includes('/chat');
  const isCardio = location.pathname.startsWith('/cardio');
  const isFullScreen = isCardio || isChatPage;

  return (
    <div className={`app-shell ${isFullScreen ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen overflow-x-hidden'} bg-ink-3 text-bone relative selection:bg-bone selection:text-ink transition-colors duration-300`}>
      {/* Performant Ambient Mesh Gradient Mixture (using radial-gradient to avoid GPU-killing CSS blurs on mobile) */}
      <div className="ambient-glow-1 fixed top-[-20%] left-[-10%] w-[80vw] h-[80vw] max-w-[650px] max-h-[650px] rounded-full bg-[radial-gradient(circle_at_center,_#dbeafe80_0%,_#e0e7ff40_40%,_transparent_70%)] pointer-events-none -z-10 opacity-50 md:opacity-70 will-change-transform" />
      <div className="ambient-glow-2 fixed top-[-10%] right-[-10%] w-[80vw] h-[80vw] max-w-[700px] max-h-[700px] rounded-full bg-[radial-gradient(circle_at_center,_#fde8dc80_0%,_#fbe1d140_45%,_transparent_70%)] pointer-events-none -z-10 opacity-50 md:opacity-75 will-change-transform" />
      <div className="ambient-glow-3 fixed bottom-[-20%] left-[20%] w-[90vw] h-[90vw] max-w-[600px] max-h-[600px] rounded-full bg-[radial-gradient(circle_at_center,_#f3e8ff80_0%,_#e0e7ff30_50%,_transparent_70%)] pointer-events-none -z-10 opacity-40 md:opacity-60 will-change-transform" />

      {!isFullScreen && <Sidebar />}
      {!isFullScreen && <Topbar />}
      <ReminderManager />
      {!isFullScreen && <FloatingAIBot />}
      {!isFullScreen && <LiveChatOverlay />}
      {!isFullScreen && <BottomNav />}

      <main className={isFullScreen ? "h-full w-full p-0 m-0 overflow-hidden" : `max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-4 ${hasBottomNav ? 'pb-28' : 'pb-4'} relative`}>
        <Outlet />
      </main>
    </div>
  );
}
