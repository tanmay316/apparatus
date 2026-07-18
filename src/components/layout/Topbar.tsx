import { Link, useNavigate } from 'react-router-dom';
import { Menu, Bell, Search, Flame, Dumbbell, BookOpen, User, X, ExternalLink, Settings, LogOut } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { getNotifications, markNotificationRead, markAllNotificationsRead, searchUsers } from '@/services/social';
import { COMPACT_LIBRARY } from '@/services/library';
import { getSamplePlans } from '@/services/plans';

export function Topbar() {
  const { profile, stats, signOut } = useAuthStore();
  const { toggleSidebar, theme } = useUIStore();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
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

  // ─── Semantic Search Logic ───────────────────────────────

  // 1. Local Exercise Library Search
  const matchingExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return COMPACT_LIBRARY.filter(ex =>
      ex.name.toLowerCase().includes(q) ||
      ex.muscleGroup.toLowerCase().includes(q) ||
      ex.equipment.toLowerCase().includes(q) ||
      ex.tags?.some(t => t.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [searchQuery]);

  // 2. Sample Plans Query
  const { data: samplePlans = [] } = useQuery({
    queryKey: ['samplePlansSearch'],
    queryFn: getSamplePlans,
    staleTime: 5 * 60 * 1000,
  });

  const matchingPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return samplePlans.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    ).slice(0, 4);
  }, [searchQuery, samplePlans]);

  // 3. Athlete Search Query
  const { data: matchingAthletes = [] } = useQuery({
    queryKey: ['searchUsers', searchQuery],
    queryFn: () => searchUsers(searchQuery),
    enabled: searchQuery.trim().length >= 2,
    staleTime: 30 * 1000,
  });

  const hasSearchQuery = searchQuery.trim().length >= 1;
  const hasSearchResults = matchingExercises.length > 0 || matchingPlans.length > 0 || matchingAthletes.length > 0;

  // ─── Notifications Query ──────────────────────────────────
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
  const streak = stats?.currentStreak || 0;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/90 backdrop-blur-xl">
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

          <Link to="/" className="flex items-baseline gap-2 group">
            <div className="brand-mark flex-none group-hover:scale-110 transition-transform" />
            <span className="brand-wordmark text-lg leading-none hidden sm:block">APPARATUS</span>
          </Link>
        </div>

        {/* Center — Desktop Semantic Search Bar */}
        <div className="flex-1 max-w-md mx-auto relative hidden md:block" ref={searchRef}>
          <div
            className={`flex items-center gap-2.5 h-9 px-3.5 rounded-xl border transition-all duration-200 ${
              searchFocused
                ? 'border-bone/40 bg-ink-2 shadow-[0_0_16px_rgba(0,0,0,0.08)]'
                : 'border-line bg-white/[0.03]'
            }`}
          >
            <Search size={14} className="text-bone-dim shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exercises, plans, athletes…"
              className="bg-transparent text-xs text-bone placeholder:text-bone-dim/60 outline-none w-full font-mono"
              onFocus={() => setSearchFocused(true)}
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} className="text-bone-dim hover:text-bone">
                <X size={13} />
              </button>
            ) : (
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-bone-dim/50 border border-line rounded">⌘K</kbd>
            )}
          </div>

          {/* Semantic Search Results Dropdown */}
          {searchFocused && hasSearchQuery && (
            <div
              className="absolute left-0 right-0 top-11 rounded-2xl border border-white/[0.08] shadow-2xl z-[80] overflow-hidden max-h-[420px] overflow-y-auto divide-y divide-white/[0.04]"
              style={{ background: 'rgba(17,21,34,0.96)', backdropFilter: 'blur(20px)' }}
            >
              {!hasSearchResults ? (
                <div className="p-4 text-center text-xs text-bone-dim font-mono">
                  No matching exercises, plans, or athletes found.
                </div>
              ) : (
                <>
                  {/* Exercises */}
                  {matchingExercises.length > 0 && (
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-bone tracking-wider uppercase mb-2">
                        <Dumbbell size={12} /> Exercises ({matchingExercises.length})
                      </div>
                      <div className="space-y-1">
                        {matchingExercises.map((ex, idx) => (
                          <a
                            key={idx}
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.youtubeSearch || (ex.name + ' form tutorial'))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setSearchFocused(false)}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.04] transition-colors group"
                          >
                            <div>
                              <div className="text-xs text-bone font-medium group-hover:text-bone transition-colors">{ex.name}</div>
                              <div className="text-[10px] font-mono text-bone-dim">{ex.muscleGroup} · {ex.equipment}</div>
                            </div>
                            <ExternalLink size={12} className="text-bone-dim/50 group-hover:text-bone" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Plans */}
                  {matchingPlans.length > 0 && (
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-bone tracking-wider uppercase mb-2">
                        <BookOpen size={12} /> Training Plans ({matchingPlans.length})
                      </div>
                      <div className="space-y-1">
                        {matchingPlans.map((plan) => (
                          <Link
                            key={plan.id}
                            to={`/plans/${plan.id}`}
                            onClick={() => setSearchFocused(false)}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.04] transition-colors group"
                          >
                            <div>
                              <div className="text-xs text-bone font-medium group-hover:text-bone transition-colors">{plan.title}</div>
                              <div className="text-[10px] font-mono text-bone-dim">{plan.daysPerWeek} days/week · {plan.estimatedDuration || 'Custom'}</div>
                            </div>
                            <span className="text-[10px] font-mono text-bone bg-bone/10 px-2 py-0.5 rounded-full">View</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Athletes */}
                  {matchingAthletes.length > 0 && (
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-bone tracking-wider uppercase mb-2">
                        <User size={12} /> Athletes ({matchingAthletes.length})
                      </div>
                      <div className="space-y-1">
                        {matchingAthletes.map((athlete: any) => (
                          <Link
                            key={athlete.uid}
                            to={`/profile/${athlete.username || athlete.uid}`}
                            onClick={() => setSearchFocused(false)}
                            className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/[0.04] transition-colors group"
                          >
                            <img
                              src={athlete.photoURL || getAvatarUrl(athlete.displayName, theme)}
                              alt={athlete.displayName}
                              className="w-7 h-7 rounded-full object-cover border border-line"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-bone font-medium truncate group-hover:text-bone transition-colors">{athlete.displayName}</div>
                              <div className="text-[10px] font-mono text-bone-dim truncate">@{athlete.username || 'athlete'}</div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right — Search button (mobile), Streak, Notifications, Settings, Sign Out, Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Mobile search toggle button */}
          <button
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-line text-bone-dim hover:text-bone flex items-center justify-center transition-colors"
            aria-label="Search"
          >
            <Search size={16} />
          </button>

          {/* Streak chip */}
          {profile && streak > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-[var(--color-blush-peach)] border border-[var(--color-sienna-brown)]/10">
              <Flame size={14} className="text-[var(--color-sienna-brown)]" />
              <span className="font-sans text-xs font-bold text-[var(--color-sienna-brown)]">{streak}</span>
            </div>
          )}

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
                  <div className="fixed md:absolute right-4 md:right-0 top-16 md:top-12 w-[calc(100vw-2rem)] md:w-80 rounded-2xl border border-line shadow-2xl z-[70] p-3" style={{ background: 'rgba(17,21,34,0.95)', backdropFilter: 'blur(20px)' }}>
                    <div className="flex items-center justify-between px-2 pb-2 border-b border-line">
                      <span className="font-display text-sm">Notifications</span>
                      <span className="font-mono text-[10px] text-bone-dim">{notifications.filter(item => !item.read).length} unread</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.04]">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-bone-dim text-center py-6">You are all caught up.</p>
                      ) : (
                        notifications.map(notification => (
                          <button
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`w-full text-left px-2 py-3 rounded-lg hover:bg-white/[0.03] transition-colors ${!notification.read ? 'bg-bone/5' : ''}`}
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

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-line text-bone-dim hover:text-danger hover:border-danger/40 hover:bg-danger/10 flex items-center justify-center transition-all duration-200"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>

              {/* Avatar */}
              <Link to={`/profile/${profile.username}`}>
                <img
                  src={profile.photoURL || getAvatarUrl(profile.displayName, theme)}
                  alt={profile.displayName}
                  className="w-8 h-8 rounded-full border-2 border-line hover:border-bone/40 transition-all duration-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile Search Overlay Bar */}
      {mobileSearchOpen && (
        <div className="md:hidden border-t border-line p-3 bg-ink-2/95 backdrop-blur-md">
          <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-bone/40 bg-ink">
            <Search size={14} className="text-bone shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exercises, plans, athletes…"
              className="bg-transparent text-xs text-bone outline-none w-full font-mono"
              autoFocus
            />
            <button onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); }} className="text-bone-dim">
              <X size={14} />
            </button>
          </div>

          {hasSearchQuery && (
            <div className="mt-2 rounded-xl border border-white/[0.08] bg-ink-2 p-2 max-h-72 overflow-y-auto space-y-3">
              {matchingExercises.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-bone uppercase mb-1">Exercises</div>
                  {matchingExercises.map((ex, idx) => (
                    <a
                      key={idx}
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.youtubeSearch || (ex.name + ' form tutorial'))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-1.5 text-xs text-bone hover:text-bone font-mono truncate"
                    >
                      {ex.name} ({ex.muscleGroup})
                    </a>
                  ))}
                </div>
              )}
              {matchingPlans.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-bone uppercase mb-1">Plans</div>
                  {matchingPlans.map(plan => (
                    <Link
                      key={plan.id}
                      to={`/plans/${plan.id}`}
                      onClick={() => setMobileSearchOpen(false)}
                      className="block p-1.5 text-xs text-bone hover:text-bone font-mono truncate"
                    >
                      {plan.title}
                    </Link>
                  ))}
                </div>
              )}
              {matchingAthletes.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono text-bone uppercase mb-1">Athletes</div>
                  {matchingAthletes.map((athlete: any) => (
                    <Link
                      key={athlete.uid}
                      to={`/profile/${athlete.username || athlete.uid}`}
                      onClick={() => setMobileSearchOpen(false)}
                      className="block p-1.5 text-xs text-bone hover:text-sienna font-mono truncate"
                    >
                      @{athlete.username || athlete.displayName}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
