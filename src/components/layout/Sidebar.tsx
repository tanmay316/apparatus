import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { LogOut, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useCardioStore } from '@/stores/cardio-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { getAvatarUrl } from '@/lib/avatar';
import { isAdminUser } from '@/lib/firebase';
import { useUnreadAdminAlerts } from '@/services/admin-alerts';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { NAV_SECTIONS, SETTINGS_ITEM, isNavItemActive, type NavItem } from './nav-config';

export const SIDEBAR_WIDTH = 256;

function NavLink({ item, active, onNavigate, badge }: { item: NavItem; active: boolean; onNavigate?: () => void; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 h-11 px-3 rounded-xl text-[14px] transition-colors ${
        active ? 'bg-sienna/10 text-sienna font-semibold' : 'text-bone-dim hover:bg-bone/5 hover:text-bone'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sienna" />}
      <Icon size={18} strokeWidth={active ? 2.3 : 2} className="shrink-0" />
      <span className="truncate">{item.label}</span>
      {!!badge && (
        <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[10.5px] font-bold leading-5 text-center">{badge > 99 ? '99+' : badge}</span>
      )}
    </Link>
  );
}

const sectionTitle = 'px-3 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-bone-dim/70';

function SidebarContent({ onClose, docked }: { onClose?: () => void; docked?: boolean }) {
  const { user, profile, signOut } = useAuthStore();
  const { theme, setTheme, confirm } = useUIStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const cardioLive = useCardioStore(s => s.isTracking);
  const workoutLive = useWorkoutStore(s => s.isActive);
  const planId = useWorkoutStore(s => s.planId);
  const dayId = useWorkoutStore(s => s.dayId);
  const isAdmin = isAdminUser(user);
  const adminUnread = useUnreadAdminAlerts();

  const go = (path: string) => { onClose?.(); navigate(path); };

  const handleSignOut = async () => {
    if (!await confirm({ title: 'Sign out?', message: 'You can sign back in at any time.', confirmText: 'Sign out', type: 'danger', icon: 'logout' })) return;
    onClose?.();
    await signOut();
  };

  const live = cardioLive
    ? { label: 'Cardio in progress', path: '/cardio' }
    : workoutLive && planId && dayId
      ? { label: 'Workout in progress', path: `/workout/${planId}/day/${dayId}` }
      : null;

  return (
    // Android's WebView already sits below the status bar, so the inset would double the gap.
    <div className="flex flex-col h-full" style={{ paddingTop: Capacitor.getPlatform() === 'android' ? '0px' : 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-between h-12 px-4 shrink-0">
        <Link to="/" onClick={onClose} className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-6 w-auto brand-logo-img" />
          <span className="font-sans tracking-[0.3em] text-[12px] font-light text-bone">ΛPPΛRΛTUS</span>
        </Link>
        {!docked && (
          <button onClick={onClose} className="w-9 h-9 rounded-xl text-bone-dim hover:bg-bone/5 hover:text-bone flex items-center justify-center" aria-label="Close menu">
            <X size={18} />
          </button>
        )}
      </div>

      {profile && (
        <Link
          to={`/profile/${profile.username}`}
          onClick={onClose}
          className="mx-3 mb-3 flex items-center gap-3 p-3 rounded-2xl bg-bone/[0.04] border border-line/60 hover:border-sienna/30 transition-colors shrink-0"
        >
          <img
            src={profile.photoURL || user?.photoURL || getAvatarUrl(profile.displayName, theme)}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
            onError={e => { (e.target as HTMLImageElement).src = getAvatarUrl(profile.displayName, theme); }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-bone truncate">{profile.displayName}</div>
            <div className="text-[11px] text-bone-dim truncate">
              @{profile.username}{profile.athleteRank?.label ? ` · ${profile.athleteRank.label}` : ''}
            </div>
          </div>
        </Link>
      )}

      {live && (
        <button onClick={() => go(live.path)} className="mx-3 mb-3 flex items-center gap-3 h-11 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          {live.label}
        </button>
      )}

      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3" aria-label="Main">
        {NAV_SECTIONS.map(section => (
          <div key={section.title} className="mb-2">
            <div className={sectionTitle}>{section.title}</div>
            <div className="space-y-0.5">
              {section.items.map(item => <NavLink key={item.id} item={item} active={isNavItemActive(item, pathname)} onNavigate={onClose} />)}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div className="mb-2">
            <div className={sectionTitle}>Admin</div>
            <NavLink item={{ id: 'admin', path: '/admin', label: 'Admin console', icon: ShieldCheck }} active={pathname.startsWith('/admin')} onNavigate={onClose} badge={adminUnread} />
          </div>
        )}
      </nav>

      <div className="border-t border-line/60 p-3 space-y-0.5 shrink-0">
        <NavLink item={SETTINGS_ITEM} active={isNavItemActive(SETTINGS_ITEM, pathname)} onNavigate={onClose} />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-[14px] text-bone-dim hover:bg-bone/5 hover:text-bone"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={handleSignOut} className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-[14px] text-bone-dim hover:bg-danger/10 hover:text-danger">
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, closeSidebar } = useUIStore();
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();

  useEffect(() => { closeSidebar(); }, [pathname, isDesktop, closeSidebar]);

  useEffect(() => {
    if (!sidebarOpen || isDesktop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSidebar(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [sidebarOpen, isDesktop, closeSidebar]);

  if (isDesktop) {
    return (
      <aside className="fixed top-0 left-0 z-[60] h-[100dvh] bg-ink-2 border-r border-line" style={{ width: SIDEBAR_WIDTH }}>
        <SidebarContent docked />
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          <motion.div
            key="sidebar-backdrop"
            className="fixed inset-0 bg-black/50 z-[510]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSidebar}
          />
          <motion.aside
            key="sidebar-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed top-0 left-0 z-[520] h-[100dvh] w-[300px] max-w-[86vw] bg-ink-2 border-r border-line shadow-2xl touch-pan-y"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.6, right: 0 }}
            onDragEnd={(_, info) => { if (info.offset.x < -80 || info.velocity.x < -500) closeSidebar(); }}
          >
            <SidebarContent onClose={closeSidebar} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
