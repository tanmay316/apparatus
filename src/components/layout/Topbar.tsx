import { Link, useNavigate } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Menu, Bell, Search, Flame, Dumbbell, BookOpen, User, X, ExternalLink, Settings, LogOut } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { getNotifications, markNotificationRead, markAllNotificationsRead, searchUsers, subscribeToNotifications } from '@/services/social';
import { showNotification } from '@/utils/notifications';
import { COMPACT_LIBRARY } from '@/services/library';
import { getSamplePlans } from '@/services/plans';

export function Topbar() {
  const { user, profile, stats, signOut } = useAuthStore();
  const { toggleSidebar, theme } = useUIStore();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // ─── Semantic Search Logic (Moved to SearchPage) ───

  // ─── Notifications Listener ─────────────────────────────────
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', profile?.uid],
    queryFn: () => getNotifications(profile!.uid),
    enabled: !!profile,
    staleTime: Infinity, // Handled by listener
  });

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeToNotifications(
      profile.uid,
      (notes) => {
        queryClient.setQueryData(['notifications', profile.uid], notes);
      },
      (newNote) => {
        if (!newNote.read) {
          showNotification(
            Math.floor(Math.random() * 100000),
            'Apparatus',
            newNote.message,
            { type: newNote.type, senderId: newNote.senderId, targetId: newNote.targetId }
          );
        }
      }
    );
    return () => unsub();
  }, [profile?.uid, queryClient]);

  const readMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', profile?.uid] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(profile!.uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', profile?.uid] }),
  });

  const handleNotificationClick = async (notification: any) => {
    if (notification.id && !notification.read) await readMutation.mutateAsync(notification.id);
    setNotificationsOpen(false);
    if (notification.type === 'follow_request') {
      navigate(`/profile/${profile?.username}?modal=followers`);
    } else if (notification.type === 'follow' || notification.type === 'unfollow') {
      navigate(`/profile/${notification.targetId || notification.senderId}`);
    } else if (notification.targetId) {
      navigate(`/feed?activity=${notification.targetId}`);
    }
  };

  const handleToggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen && unreadCount > 0) {
      markAllReadMutation.mutate();
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header 
      className="sticky top-0 z-50 border-b border-line bg-ink/90 backdrop-blur-xl"
      style={{ paddingTop: Capacitor.getPlatform() === 'android' ? '0px' : 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-5 h-14 flex items-center justify-between gap-3">
        {/* Left — Collapse + Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-9 h-9 rounded-xl border border-line text-bone-dim hover:border-bone/40 hover:text-bone flex items-center justify-center transition-all duration-200"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <Link to="/" className="flex items-center gap-2 group">
            <img src="/logo.png" alt="Apparatus" className="h-6 w-auto sm:h-7 brand-logo-img group-hover:scale-105 transition-transform" />
          </Link>
        </div>

        {/* Center — Desktop Search Bar Redirect */}
        <div className="flex-1 max-w-md mx-auto relative hidden md:block">
          <div
            className="flex items-center gap-2.5 h-9 px-3.5 rounded-xl border border-line bg-white/[0.03] hover:border-bone/40 cursor-pointer transition-all duration-200"
            onClick={() => navigate('/search')}
          >
            <Search size={14} className="text-bone-dim shrink-0" />
            <span className="text-xs text-bone-dim/60 flex-1 font-mono">Search app...</span>
            <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-bone-dim/50 border border-line rounded">⌘K</kbd>
          </div>
        </div>

        {/* Right — Actions & Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Mobile search toggle button */}
          <button
            onClick={() => navigate('/search')}
            className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-line text-bone-dim hover:text-bone flex items-center justify-center transition-colors"
            aria-label="Search"
          >
            <Search size={16} />
          </button>

          {profile && (
            <>
              {/* Notifications */}
              <div className="relative" ref={containerRef}>
                <button
                  onClick={handleToggleNotifications}
                  className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-line text-bone-dim hover:text-bone hover:border-white/10 flex items-center justify-center transition-all duration-200"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell size={16} />
                  {unreadCount > 0 && !notificationsOpen && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-sienna-brown)] text-[9px] font-bold font-mono text-[#fbe1d1] flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="fixed md:absolute right-4 md:right-0 top-16 md:top-12 w-[calc(100vw-2rem)] md:w-80 rounded-2xl border border-line shadow-2xl z-[70] p-3 bg-ink-2/95 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-2 pb-2 border-b border-line">
                      <span className="font-display text-sm">Notifications</span>
                      <span className="font-mono text-[10px] text-bone-dim">{notifications.filter(item => !item.read).length} unread</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-line/30">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-bone-dim text-center py-6">You are all caught up.</p>
                      ) : (
                        notifications.map(notification => (
                          <button
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`w-full text-left px-2 py-3 rounded-lg hover:bg-bone/[0.05] transition-colors ${!notification.read ? 'bg-bone/5' : ''}`}
                          >
                            <div className="text-xs text-bone">{notification.message}</div>
                            <div className="font-mono text-[10px] text-bone-dim mt-1">
                              {notification.createdAt?.toDate ? notification.createdAt.toDate().toLocaleDateString() : 'Recently'} · Click to open
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Icon Link */}
              <Link
                to="/settings"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-line text-bone-dim hover:text-bone hover:border-white/10 flex items-center justify-center transition-all duration-200"
                title="Settings"
              >
                <Settings size={16} />
              </Link>

              {/* Avatar */}
              <Link to={`/profile/${profile.username}`}>
                <img
                  src={profile.photoURL || user?.photoURL || getAvatarUrl(profile.displayName, theme)}
                  alt={profile.displayName}
                  className="w-8 h-8 rounded-full border-2 border-line hover:border-bone/40 transition-all duration-200 object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getAvatarUrl(profile.displayName, theme);
                  }}
                />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
