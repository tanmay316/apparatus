import { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dumbbell, Calendar, TrendingUp, Target, Ruler, Trophy, Compass,
  Users, Settings, ShieldCheck, Wind, Utensils, Map, BookOpen,
  X, LogOut, Bell,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: React.ReactNode;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: <Dumbbell size={18} />, section: 'TRAIN' },
  { id: 'plans', path: '/plans', label: 'My Plans', icon: <BookOpen size={18} />, section: 'TRAIN' },
  { id: 'calendar', path: '/calendar', label: 'Calendar', icon: <Calendar size={18} />, section: 'TRAIN' },
  { id: 'progress', path: '/progress', label: 'Progress', icon: <TrendingUp size={18} />, section: 'TRAIN' },
  { id: 'skills', path: '/skills', label: 'Skill Tracker', icon: <Target size={18} />, section: 'TRAIN' },
  { id: 'measurements', path: '/measurements', label: 'Body Log', icon: <Ruler size={18} />, section: 'TRAIN' },
  { id: 'achievements', path: '/achievements', label: 'Trophy Room', icon: <Trophy size={18} />, section: 'TRAIN' },
  { id: 'explore', path: '/explore', label: 'Explore', icon: <Compass size={18} />, section: 'SOCIAL' },
  { id: 'feed', path: '/feed', label: 'Activity Feed', icon: <Users size={18} />, section: 'SOCIAL' },
  { id: 'warmup', path: '/guide/warmup', label: 'Warm-up + Breath', icon: <Wind size={18} />, section: 'GUIDE' },
  { id: 'nutrition', path: '/guide/nutrition', label: 'Nutrition', icon: <Utensils size={18} />, section: 'GUIDE' },
  { id: 'roadmap', path: '/guide/roadmap', label: 'Skill Roadmap', icon: <Map size={18} />, section: 'GUIDE' },
  { id: 'settings', path: '/settings', label: 'Settings', icon: <Settings size={18} />, section: '' },
];

export function Sidebar() {
  const { profile, signOut } = useAuthStore();
  const { sidebarOpen, closeSidebar } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();

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

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
    closeSidebar();
  };

  let lastSection = '';

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-[290]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <motion.div
        className="fixed top-0 left-0 h-screen w-[250px] max-w-[82vw] bg-ink-2 border-r border-line z-[300] flex flex-col shadow-2xl"
        initial={false}
        animate={{ x: sidebarOpen ? 0 : '-105%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-line">
          <div className="flex items-baseline gap-2.5">
            <div className="w-2.5 h-2.5 bg-teal rounded-sm rotate-45 flex-none" />
            <span className="font-display font-semibold text-[15px] tracking-wider">APPARATUS</span>
          </div>
          <button
            onClick={closeSidebar}
            className="w-7 h-7 rounded-full border border-line text-bone-dim hover:border-danger hover:text-danger flex items-center justify-center transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* User info */}
        {profile && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
            <img
              src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}&background=4F9E8D&color=14151A&bold=true`}
              alt={profile.displayName}
              className="w-8 h-8 rounded-full border border-teal flex-shrink-0 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{profile.displayName}</div>
              <div className="text-[10px] text-bone-dim truncate">@{profile.username}</div>
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const showSection = item.section && item.section !== lastSection;
            if (showSection) lastSection = item.section;

            const isActive = location.pathname === item.path;

            return (
              <div key={item.id}>
                {showSection && (
                  <div className="font-mono text-[10px] tracking-widest text-bone-dim px-3.5 pt-3 pb-1.5">
                    {item.section}
                  </div>
                )}
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md font-mono text-[13px] transition-all duration-150 w-full ${
                    isActive
                      ? 'bg-teal text-ink font-bold'
                      : 'text-bone-dim hover:bg-ink-3 hover:text-bone'
                  }`}
                >
                  <span className="flex-none w-5 flex items-center justify-center">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}

          {/* Admin link */}
          {profile?.isAdmin && (
            <>
              <div className="font-mono text-[10px] tracking-widest text-bone-dim px-3.5 pt-3 pb-1.5">
                ADMIN
              </div>
              <Link
                to="/admin"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-md font-mono text-[13px] transition-all duration-150 w-full ${
                  location.pathname === '/admin'
                    ? 'bg-teal text-ink font-bold'
                    : 'text-bone-dim hover:bg-ink-3 hover:text-bone'
                }`}
              >
                <ShieldCheck size={18} />
                <span>Admin Panel</span>
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-line px-3 py-3 flex items-center justify-between">
          <span className="text-[11px] text-bone-dim font-mono">Multi-sport fitness</span>
          <button
            onClick={handleSignOut}
            className="text-bone-dim hover:text-danger transition-colors p-1"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </motion.div>
    </>
  );
}
