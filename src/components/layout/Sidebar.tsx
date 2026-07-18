import { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dumbbell, Calendar, TrendingUp, Target, Ruler, Trophy, Compass,
  Users, ShieldCheck, Wind, Utensils, BookOpen, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ReactNode;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  // Train
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: <Dumbbell size={18} />, section: 'TRAIN' },
  { id: 'plans', path: '/plans', label: 'Plans', icon: <BookOpen size={18} />, section: 'TRAIN' },
  { id: 'calendar', path: '/calendar', label: 'Calendar', icon: <Calendar size={18} />, section: 'TRAIN' },
  { id: 'progress', path: '/progress', label: 'Progress', icon: <TrendingUp size={18} />, section: 'TRAIN' },
  // Performance
  { id: 'skills', path: '/skills', label: 'Skills', icon: <Target size={18} />, section: 'PERFORMANCE' },
  { id: 'measurements', path: '/measurements', label: 'Body Log', icon: <Ruler size={18} />, section: 'PERFORMANCE' },
  { id: 'achievements', path: '/achievements', label: 'Achievements', icon: <Trophy size={18} />, section: 'PERFORMANCE' },
  // Community
  { id: 'explore', path: '/explore', label: 'Explore', icon: <Compass size={18} />, section: 'COMMUNITY' },
  { id: 'feed', path: '/feed', label: 'Activity', icon: <Users size={18} />, section: 'COMMUNITY' },
  // Knowledge
  { id: 'warmup', path: '/guide/warmup', label: 'Warm-up', icon: <Wind size={18} />, section: 'KNOWLEDGE' },
  { id: 'nutrition', path: '/guide/nutrition', label: 'Nutrition', icon: <Utensils size={18} />, section: 'KNOWLEDGE' },
];

export function Sidebar() {
  const { profile } = useAuthStore();
  const { sidebarOpen, closeSidebar, theme } = useUIStore();
  const location = useLocation();

  // Close sidebar on route change
  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeSidebar]);

  let lastSection = '';

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[290]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <motion.div
        className="fixed top-0 left-0 h-screen w-[260px] max-w-[82vw] bg-ink-2 border-r border-line z-[300] flex flex-col"
        style={{ boxShadow: sidebarOpen ? '8px 0 40px rgba(0,0,0,0.5)' : 'none' }}
        initial={false}
        animate={{ x: sidebarOpen ? 0 : '-105%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-baseline gap-2.5">
            <div className="brand-mark flex-none" />
            <span className="brand-wordmark text-[15px]">APPARATUS</span>
          </div>
          <button
            onClick={closeSidebar}
            className="w-7 h-7 rounded-lg border border-line text-bone-dim hover:border-danger/40 hover:text-danger flex items-center justify-center transition-all duration-200"
          >
            <X size={14} />
          </button>
        </div>

        {/* User info */}
        {profile && (
          <Link to={`/profile/${profile.username}`} className="flex items-center gap-3 px-5 py-3.5 border-b border-line hover:bg-white/[0.02] transition-colors" onClick={closeSidebar}>
            <img
              src={profile.photoURL || getAvatarUrl(profile.displayName, theme)}
              alt={profile.displayName}
              className="w-9 h-9 rounded-full border border-line flex-shrink-0 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate text-bone">{profile.displayName}</div>
              <div className="text-[11px] text-bone-dim font-mono truncate">@{profile.username}</div>
            </div>
          </Link>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map((navItem) => {
            const showSection = navItem.section && navItem.section !== lastSection;
            if (showSection) lastSection = navItem.section;

            const isActive = location.pathname === navItem.path;

            return (
              <div key={navItem.id}>
                {showSection && (
                  <div className="font-mono text-[10px] tracking-[0.15em] text-bone-dim/60 px-3 pt-4 pb-1.5 uppercase">
                    {navItem.section}
                  </div>
                )}
                <Link
                  to={navItem.path}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[13px] transition-all duration-200 w-full group ${
                    isActive
                      ? 'bg-bone/10 text-bone font-bold'
                      : 'text-bone-dim hover:bg-white/[0.03] hover:text-bone'
                  }`}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-bone rounded-r-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className={`flex-none w-5 flex items-center justify-center transition-colors ${isActive ? 'text-bone' : 'text-bone-dim group-hover:text-bone'}`}>
                    {navItem.icon}
                  </span>
                  <span>{navItem.label}</span>
                </Link>
              </div>
            );
          })}

          {/* Admin link */}
          {profile?.isAdmin && (
            <>
              <div className="font-mono text-[10px] tracking-[0.15em] text-bone-dim/60 px-3 pt-4 pb-1.5 uppercase">
                ADMIN
              </div>
              <Link
                to="/admin"
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[13px] transition-all duration-200 w-full group ${
                  location.pathname === '/admin'
                    ? 'bg-bone/10 text-bone font-bold'
                    : 'text-bone-dim hover:bg-white/[0.03] hover:text-bone'
                }`}
              >
                {location.pathname === '/admin' && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-bone rounded-r-full"
                  />
                )}
                <ShieldCheck size={18} />
                <span>Admin Panel</span>
              </Link>
            </>
          )}
        </nav>
      </motion.div>
    </>
  );
}
