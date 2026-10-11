import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { ReminderManager } from './ReminderManager';
import FloatingAIBot from '../nutrition/FloatingAIBot';
import { LiveChatOverlay } from '../social/LiveChatOverlay';
import { AdminAlertsSync } from '../admin/AdminBell';
import { BOTTOM_TAB_PATHS } from './nav-config';
import { useAuthStore } from '@/stores/auth-store';
import { useIsDesktop } from '@/hooks/useMediaQuery';

export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const isDesktop = useIsDesktop();
  const navigationType = useNavigationType();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('redirect_modal') === 'followers' && profile?.username) {
      window.history.replaceState({}, '', window.location.pathname);
      navigate(`/profile/${profile.username}?modal=followers`);
    }
  }, [profile, navigate]);

  useEffect(() => { if (navigationType !== 'POP') window.scrollTo(0, 0); }, [pathname, navigationType]);

  const hasBottomNav = BOTTOM_TAB_PATHS.includes(pathname);
  // Chat owns the whole viewport; search and cardio draw their own header / full-screen overlays.
  const isChat = pathname.includes('/chat');
  const ownHeader = pathname.startsWith('/search');
  const isCardio = pathname.startsWith('/cardio');
  const contentOffset = isDesktop && !isChat ? { paddingLeft: SIDEBAR_WIDTH } : undefined;

  return (
    <div className={`app-shell ${isChat ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh] overflow-x-clip'} bg-ink-3 text-bone relative selection:bg-bone selection:text-ink transition-colors duration-300`}>
      <div className="ambient-glow-1 fixed top-[-20%] left-[-10%] w-[80vw] h-[80vw] max-w-[650px] max-h-[650px] rounded-full bg-[radial-gradient(circle_at_center,_#dbeafe80_0%,_#e0e7ff40_40%,_transparent_70%)] pointer-events-none -z-10 opacity-50 md:opacity-70" />
      <div className="ambient-glow-2 fixed top-[-10%] right-[-10%] w-[80vw] h-[80vw] max-w-[700px] max-h-[700px] rounded-full bg-[radial-gradient(circle_at_center,_#fde8dc80_0%,_#fbe1d140_45%,_transparent_70%)] pointer-events-none -z-10 opacity-50 md:opacity-75" />

      {/* Keeps content from scrolling under the phone's status icons while the topbar is hidden. */}
      {!isChat && <div aria-hidden className="fixed inset-x-0 top-0 z-40 bg-ink pointer-events-none" style={{ height: 'var(--sat)' }} />}
      {!isChat && <Sidebar />}
      <ReminderManager />
      <AdminAlertsSync />
      {/* On cardio the bot only appears when opened from an "Ask AI" button. */}
      {!isChat && <FloatingAIBot />}
      {!isChat && !isCardio && <LiveChatOverlay />}
      {!isChat && <BottomNav />}

      <div style={contentOffset} className={isChat ? 'h-full' : undefined}>
        {!isChat && !ownHeader && <Topbar />}
        <main
          className={isChat
            ? 'h-full w-full overflow-y-auto overscroll-contain'
            : `max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-4 ${hasBottomNav ? 'pb-28 lg:pb-10' : 'pb-10'} relative`}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
