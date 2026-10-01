import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Menu, Search, Settings, Store } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useUnreadAdminAlerts } from '@/services/admin-alerts';
import { ROOT_PATHS, getRouteTitle } from './nav-config';

const iconBtn = 'w-10 h-10 rounded-full text-bone-dim hover:text-bone hover:bg-bone/5 active:bg-bone/10 flex items-center justify-center transition-colors shrink-0';

export function Topbar() {
  const { user, profile } = useAuthStore();
  const { toggleSidebar, theme } = useUIStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Zero for non-admins: the alert store is only filled for admin accounts.
  const adminUnread = useUnreadAdminAlerts();

  const isRoot = ROOT_PATHS.includes(pathname) || (!!profile && pathname === `/profile/${profile.username}`);
  const title = getRouteTitle(pathname);

  const goBack = () => {
    // React Router records the history index; idx 0 means we arrived here directly (deep link / reload).
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(false), [pathname]);
  // Sticky sub-headers (e.g. Community tabs) read this to slide up with the bar.
  useEffect(() => {
    document.documentElement.style.setProperty('--topbar-visible', hidden ? '0' : '1');
  }, [hidden]);
  useEffect(() => () => { document.documentElement.style.removeProperty('--topbar-visible'); }, []);
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY;
        if (y < 64) setHidden(false);
        else if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
        // Small jitters don't move the reference point, so slow scrolls still register.
        if (Math.abs(delta) > 6 || y < 64) lastY = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-line/70 bg-ink/85 backdrop-blur-xl transition-transform duration-300 ease-out will-change-transform ${hidden ? '-translate-y-full' : 'translate-y-0'}`}
      style={{ paddingTop: Capacitor.getPlatform() === 'android' ? '0px' : 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="h-14 px-2 sm:px-4 lg:px-6 flex items-center gap-1 sm:gap-2">
        {/* Left: menu/back (mobile) — the sidebar is docked on desktop */}
        {isRoot ? (
          <button onClick={toggleSidebar} className={`${iconBtn} lg:hidden relative`} aria-label={adminUnread ? `Open menu, ${adminUnread} admin alerts` : 'Open menu'}>
            <Menu size={20} />
            {adminUnread > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-danger border-2 border-ink" />}
          </button>
        ) : (
          <button onClick={goBack} className={iconBtn} aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
        )}

        <div className="flex-1 min-w-0 flex items-center">
          {isRoot ? (
            <Link to="/" className="flex items-center gap-2 lg:hidden px-1" aria-label="Home">
              <img src="/logo.png" alt="Apparatus" className="h-6 w-auto brand-logo-img" />
            </Link>
          ) : (
            <h1 className="text-[16px] font-semibold text-bone truncate px-1 lg:hidden">{title}</h1>
          )}

          {/* Desktop search field */}
          <button
            onClick={() => navigate('/search')}
            className="hidden lg:flex items-center gap-2.5 h-10 w-full max-w-md px-3.5 rounded-xl border border-line bg-bone/[0.03] hover:border-bone/30 text-left transition-colors"
          >
            <Search size={15} className="text-bone-dim shrink-0" />
            <span className="text-sm text-bone-dim/70 flex-1">Search athletes, clans, plans…</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-bone-dim/60 border border-line rounded">Ctrl K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button onClick={() => navigate('/search')} className={`${iconBtn} lg:hidden`} aria-label="Search">
            <Search size={19} />
          </button>
          <Link
            to="/marketplace"
            className={`${iconBtn} ${pathname.startsWith('/marketplace') ? '!text-bone bg-bone/5' : ''}`}
            aria-label="Marketplace"
            title="Marketplace"
          >
            <Store size={19} />
          </Link>
          {profile && (
            <>
              <NotificationBell />
              <Link to="/settings" className={`${iconBtn} hidden lg:flex`} aria-label="Settings" title="Settings">
                <Settings size={18} />
              </Link>
              <Link to={`/profile/${profile.username}`} className="ml-1 shrink-0" aria-label="Your profile">
                <img
                  src={profile.photoURL || user?.photoURL || getAvatarUrl(profile.displayName, theme)}
                  alt=""
                  className="w-9 h-9 rounded-full border border-line object-cover hover:border-bone/40 transition-colors"
                  referrerPolicy="no-referrer"
                  onError={e => { (e.target as HTMLImageElement).src = getAvatarUrl(profile.displayName, theme); }}
                />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
