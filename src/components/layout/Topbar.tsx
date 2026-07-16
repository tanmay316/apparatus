import { Link, useNavigate } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/services/social';

export function Topbar() {
  const { profile } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationsOpen]);
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', profile?.uid],
    queryFn: () => getNotifications(profile!.uid),
    enabled: !!profile,
  });
  const readMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', profile?.uid] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(profile!.uid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', profile?.uid] }),
  });

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const handleNotificationClick = async (notification: any) => {
    if (notification.id && !notification.read) await readMutation.mutateAsync(notification.id);
    setNotificationsOpen(false);
    if (notification.type === 'follow' || notification.type === 'unfollow') {
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
    <header className="sticky top-0 z-50 bg-ink/92 backdrop-blur-md border-b border-line">
      {/* Accent banner */}
      <div className="bg-amber text-ink font-display font-extrabold text-center text-[15px] tracking-[0.25em] py-1.5 uppercase">
        One Life
      </div>

      {/* Main topbar */}
      <div className="max-w-[960px] mx-auto px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="w-9 h-9 rounded-md border border-line text-bone hover:border-teal hover:text-teal flex items-center justify-center transition-colors flex-none"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <Link to="/" className="flex items-baseline gap-2.5 group">
            <div className="w-2.5 h-2.5 bg-teal rounded-sm rotate-45 flex-none group-hover:scale-110 transition-transform" />
            <div>
              <div className="font-display font-semibold text-xl tracking-wider">APPARATUS</div>
              <div className="text-[11px] text-bone-dim font-mono tracking-wider">FITNESS PLATFORM</div>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-bone-dim hidden sm:block">{today}</span>

          {profile && (
            <>
              <div className="relative" ref={containerRef}>
                <button
                  onClick={handleToggleNotifications}
                  className="relative text-bone-dim hover:text-bone transition-colors p-1"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && !notificationsOpen && (
                    <span className="absolute -top-1 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber border border-ink text-[9px] font-bold font-mono text-ink flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                 {notificationsOpen && <div className="fixed md:absolute right-4 md:right-0 top-16 md:top-10 w-[calc(100vw-2rem)] md:w-80 card shadow-2xl z-[70] p-3">
                  <div className="flex items-center justify-between px-2 pb-2 border-b border-line/50"><span className="font-display text-sm">Notifications</span><span className="font-mono text-[10px] text-bone-dim">{notifications.filter(item => !item.read).length} unread</span></div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-line/40">{notifications.length === 0 ? <p className="text-xs text-bone-dim text-center py-6">You are all caught up.</p> : notifications.map(notification => <button key={notification.id} onClick={() => handleNotificationClick(notification)} className={`w-full text-left px-2 py-3 hover:bg-ink-3 transition-colors ${!notification.read ? 'bg-teal/5' : ''}`}><div className="text-xs text-bone">{notification.message}</div><div className="font-mono text-[10px] text-bone-dim mt-1">{notification.createdAt?.toDate ? notification.createdAt.toDate().toLocaleDateString() : 'Recently'} · Click to open</div></button>)}</div>
                </div>}
              </div>

              <Link to={`/profile/${profile.username}`}>
                <img
                  src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}&background=4F9E8D&color=14151A&bold=true`}
                  alt={profile.displayName}
                  className="w-8 h-8 rounded-full border border-line hover:border-teal transition-colors object-cover"
                  referrerPolicy="no-referrer"
                />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
