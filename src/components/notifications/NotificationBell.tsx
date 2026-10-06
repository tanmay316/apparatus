import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlarmClock, BarChart3, Bell, BellOff, CalendarClock, CalendarX, CheckCheck, CheckCircle2, Footprints, Heart,
  MapPin, Megaphone, MessageCircle, MessageSquare, Minus, Newspaper, Settings2, Shield, ShieldAlert, Swords, Ticket, TrendingDown, TrendingUp,
  Trophy, UserMinus, UserPlus, Users, X, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { LiveSenderMessage } from '@/components/ui/LiveUser';
import { openCompare, useCanCompare } from '@/lib/compare-nav';

const WorkoutAnalysisSheet = lazy(() => import('@/components/analysis/AnalysisSheets').then(m => ({ default: m.WorkoutAnalysisSheet })));
const CardioAnalysisSheet = lazy(() => import('@/components/analysis/AnalysisSheets').then(m => ({ default: m.CardioAnalysisSheet })));
import { deleteNotification, getNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/social';
import { deleteAppNotification, markAllAppNotificationsRead, markNotificationAsRead, subscribeToAppNotifications } from '@/services/notifications';
import {
  CATEGORY_LABELS, fromApp, fromSocial, groupByDay, mergeNotifications, relativeTime,
  type UnifiedNotification,
} from '@/lib/notification-center';
import { getNotificationPermissionState, requestNotificationPermission, type NotificationPermissionState } from '@/utils/notifications';
import type { NotificationCategory } from '@/stores/notification-prefs-store';
import type { AppNotificationItem, Notification as SocialNotification } from '@/types';

const TYPE_STYLE: Record<string, { icon: LucideIcon; color: string }> = {
  like: { icon: Heart, color: '#e11d48' },
  comment: { icon: MessageSquare, color: '#0284c7' },
  follow: { icon: UserPlus, color: '#059669' },
  follow_request: { icon: UserPlus, color: '#d97706' },
  unfollow: { icon: UserMinus, color: '#6b7280' },
  activity: { icon: Activity, color: '#0891b2' },
  friend_joined: { icon: Users, color: '#059669' },
  achievement: { icon: Trophy, color: '#ca8a04' },
  reminder: { icon: AlarmClock, color: '#c2410c' },
  clan_message: { icon: MessageCircle, color: '#c2410c' },
  clan_post: { icon: Newspaper, color: '#7c3aed' },
  clan_poll: { icon: BarChart3, color: '#4f46e5' },
  clan_announcement: { icon: Megaphone, color: '#d97706' },
  community_announcement: { icon: Megaphone, color: '#d97706' },
  clan_join_request: { icon: Shield, color: '#d97706' },
  clan_join_accepted: { icon: CheckCircle2, color: '#059669' },
  event_reminder: { icon: CalendarClock, color: '#d97706' },
  nearby_event: { icon: MapPin, color: '#0891b2' },
  registration_approved: { icon: CheckCircle2, color: '#059669' },
  ticket_confirmed: { icon: Ticket, color: '#059669' },
  event_cancelled: { icon: CalendarX, color: '#e11d48' },
  progress_up: { icon: TrendingUp, color: '#059669' },
  progress_down: { icon: TrendingDown, color: '#e11d48' },
  progress_flat: { icon: Minus, color: '#6b7280' },
  steps: { icon: Footprints, color: '#0891b2' },
  admin_alert: { icon: ShieldAlert, color: '#dc2626' },
};
const DEFAULT_STYLE = { icon: Bell, color: '#c2410c' };

const BADGE_TONE = {
  up: { background: 'rgba(5, 150, 105, 0.12)', color: '#059669' },
  down: { background: 'rgba(225, 29, 72, 0.12)', color: '#e11d48' },
  flat: { background: 'rgba(107, 114, 128, 0.14)', color: '#6b7280' },
};

const seenKey = (uid: string) => `apparatus_notifications_seen_${uid}`;

function NotificationIcon({ n }: { n: UnifiedNotification }) {
  const style = TYPE_STYLE[n.icon || n.type] || TYPE_STYLE[n.type] || DEFAULT_STYLE;
  const Icon = style.icon;
  if (n.senderPhoto) {
    return (
      <span className="relative w-9 h-9 shrink-0">
        <img src={n.senderPhoto} alt="" className="w-9 h-9 rounded-full object-cover border border-line" referrerPolicy="no-referrer" />
        <span
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-ink-2"
          style={{ background: style.color, color: '#fff' }}
        >
          <Icon size={8} strokeWidth={3} />
        </span>
      </span>
    );
  }
  return (
    <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${style.color}1f`, color: style.color }}>
      <Icon size={16} />
    </span>
  );
}

export function NotificationBell() {
  const { profile } = useAuthStore();
  const { showToast } = useUIStore();
  const uid = profile?.uid;
  const navigate = useNavigate();
  const canCompare = useCanCompare();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const [appItems, setAppItems] = useState<AppNotificationItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<NotificationPermissionState>('granted');
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [ring, setRing] = useState(false);
  const [analysis, setAnalysis] = useState<UnifiedNotification['analysis'] | null>(null);
  const closeAnalysis = useCallback(() => setAnalysis(null), []);

  // Social notifications are kept fresh by the global listener in App.tsx.
  const { data: socialItems = [] } = useQuery({
    queryKey: ['notifications', uid],
    queryFn: () => getNotifications(uid!),
    enabled: !!uid,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!uid) return;
    setLastSeen(Number(localStorage.getItem(seenKey(uid))) || 0);
    return subscribeToAppNotifications(uid, setAppItems);
  }, [uid]);

  const items = useMemo(() => mergeNotifications(
    socialItems.map(n => fromSocial(n, profile?.username)),
    appItems.map(fromApp),
  ).filter(n => !dismissed.has(n.key)), [socialItems, appItems, dismissed, profile?.username]);

  const unreadCount = items.filter(n => !n.read).length;
  const unseenCount = items.filter(n => !n.read && n.createdMs > lastSeen).length;

  const previousUnseen = useRef(unseenCount);
  useEffect(() => {
    if (unseenCount > previousUnseen.current) {
      setRing(true);
      const t = setTimeout(() => setRing(false), 1200);
      previousUnseen.current = unseenCount;
      return () => clearTimeout(t);
    }
    previousUnseen.current = unseenCount;
  }, [unseenCount]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      clearInterval(tick);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && uid) {
      const seenAt = Date.now();
      setNow(seenAt);
      setLastSeen(seenAt);
      localStorage.setItem(seenKey(uid), String(seenAt));
      getNotificationPermissionState().then(setPermission).catch(() => {});
    }
  };

  const patchRead = (targets: UnifiedNotification[]) => {
    const social = new Set(targets.filter(t => t.source === 'social').map(t => t.id));
    const app = new Set(targets.filter(t => t.source === 'app').map(t => t.id));
    if (social.size) {
      queryClient.setQueryData<SocialNotification[]>(['notifications', uid], prev =>
        (prev || []).map(n => (n.id && social.has(n.id) ? { ...n, read: true } : n)));
    }
    if (app.size) setAppItems(prev => prev.map(n => (n.id && app.has(n.id) ? { ...n, read: true } : n)));
  };

  const markRead = (n: UnifiedNotification) => {
    if (n.read || !n.id) return;
    patchRead([n]);
    (n.source === 'social' ? markNotificationRead(n.id) : markNotificationAsRead(n.id)).catch(() => {});
  };

  const markAllRead = async () => {
    if (!uid || !unreadCount) return;
    patchRead(items.filter(n => !n.read));
    try {
      await Promise.all([markAllNotificationsRead(uid), markAllAppNotificationsRead(uid)]);
    } catch {
      showToast('Could not mark notifications as read', 'error');
    }
  };

  const dismiss = async (n: UnifiedNotification) => {
    if (!n.id) return;
    setDismissed(prev => new Set(prev).add(n.key));
    try {
      if (n.source === 'social') {
        await deleteNotification(n.id);
        queryClient.setQueryData<SocialNotification[]>(['notifications', uid], prev => (prev || []).filter(x => x.id !== n.id));
      } else {
        await deleteAppNotification(n.id);
      }
    } catch {
      setDismissed(prev => { const next = new Set(prev); next.delete(n.key); return next; });
      showToast('Could not remove notification', 'error');
    }
  };

  const openItem = (n: UnifiedNotification) => {
    markRead(n);
    if (n.analysis) {
      setOpen(false);
      setAnalysis(n.analysis);
      return;
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const enableDevice = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? 'granted' : await getNotificationPermissionState());
  };

  const categories = useMemo(
    () => (Object.keys(CATEGORY_LABELS) as NotificationCategory[]).filter(c => items.some(n => n.category === c)),
    [items],
  );
  const visible = items.filter(n => (tab === 'all' || !n.read) && (category === 'all' || n.category === category));
  const groups = groupByDay(visible, now);

  if (!profile) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={toggle}
        className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center transition-all duration-200 ${
          open ? 'border-sienna/60 text-bone bg-bone/[0.05]' : 'border-line text-bone-dim hover:text-bone hover:border-white/10'
        }`}
        aria-label={unseenCount ? `Notifications, ${unseenCount} new` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <motion.span
          animate={ring ? { rotate: [0, -18, 16, -12, 8, -4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.9 }}
          className="flex"
        >
          <Bell size={16} />
        </motion.span>
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-sienna-brown)] text-[9px] font-bold font-mono text-[#fbe1d1] flex items-center justify-center ring-2 ring-ink">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="fixed md:absolute left-3 right-3 md:left-auto md:right-0 top-16 md:top-12 md:w-[340px] max-h-[65vh] md:max-h-[520px] flex flex-col rounded-2xl border border-line shadow-2xl z-[70] bg-ink-2 overflow-hidden origin-top-right"
          >
            {/* Header */}
            <div className="px-3.5 pt-3 pb-2 border-b border-line">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-display text-[15px] text-bone">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-sienna/15 text-sienna font-bold">{unreadCount} unread</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={markAllRead}
                    disabled={!unreadCount}
                    className="h-8 px-2 rounded-lg text-[11px] font-medium text-bone-dim hover:text-bone hover:bg-bone/[0.06] disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck size={14} /> <span className="hidden sm:inline">Mark all read</span>
                  </button>
                  <Link
                    to="/settings#notifications"
                    onClick={() => setOpen(false)}
                    className="w-8 h-8 rounded-lg text-bone-dim hover:text-bone hover:bg-bone/[0.06] flex items-center justify-center transition-colors"
                    title="Notification settings"
                    aria-label="Notification settings"
                  >
                    <Settings2 size={15} />
                  </Link>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-1 p-0.5 rounded-lg bg-bone/[0.04] w-fit">
                {(['all', 'unread'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${tab === t ? 'bg-ink text-bone shadow-sm' : 'text-bone-dim hover:text-bone'}`}
                  >
                    {t === 'all' ? 'All' : `Unread${unreadCount ? ` · ${unreadCount}` : ''}`}
                  </button>
                ))}
              </div>

              {categories.length > 1 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  {(['all', ...categories] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-medium border transition-colors ${
                        category === c ? 'border-sienna/60 bg-sienna/10 text-sienna' : 'border-line text-bone-dim hover:text-bone'
                      }`}
                    >
                      {c === 'all' ? 'Everything' : CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(permission === 'prompt' || permission === 'denied') && (
              <div className="mx-3 mt-3 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center gap-2.5">
                <BellOff size={16} className="text-amber-600 shrink-0" />
                <p className="flex-1 text-[11px] text-bone leading-snug">
                  {permission === 'denied'
                    ? 'Notifications are blocked in system settings.'
                    : 'Get alerts on this device.'}
                </p>
                {permission === 'prompt' && (
                  <button onClick={enableDevice} className="shrink-0 px-2.5 py-1 rounded-lg bg-sienna text-[#fbe1d1] text-[11px] font-bold">
                    Enable
                  </button>
                )}
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto overscroll-contain py-1">
              {visible.length === 0 ? (
                <div className="py-10 px-6 text-center">
                  <span className="mx-auto w-11 h-11 rounded-full bg-bone/[0.05] flex items-center justify-center text-bone-dim">
                    {tab === 'unread' ? <CheckCheck size={18} /> : <Bell size={18} />}
                  </span>
                  <p className="mt-3 text-[13px] text-bone font-medium">{tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
                </div>
              ) : (
                groups.map(group => (
                  <section key={group.label}>
                    <div className="sticky top-0 z-[1] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-bone-dim bg-ink-2">
                      {group.label}
                    </div>
                    <ul>
                      {group.items.map(n => (
                        <li key={n.key} className="group relative">
                          <button
                            onClick={() => openItem(n)}
                            className={`w-full text-left pl-3.5 pr-9 py-2 flex items-start gap-2.5 transition-colors hover:bg-bone/[0.05] ${!n.read ? 'bg-sienna/[0.06]' : ''}`}
                          >
                            <NotificationIcon n={n} />
                            <span className="flex-1 min-w-0">
                              {n.title && <span className={`block text-[12px] leading-snug ${n.read ? 'text-bone' : 'text-bone font-semibold'}`}>{n.title}</span>}
                              {n.source === 'social' ? (
                                <LiveSenderMessage
                                  senderId={n.senderId}
                                  senderName={n.senderName}
                                  message={n.body}
                                  className={`block text-[12px] leading-snug line-clamp-3 ${n.read ? 'text-bone-dim' : 'text-bone'}`}
                                />
                              ) : (
                                <span className="block text-[12px] leading-snug text-bone-dim line-clamp-2">{n.body}</span>
                              )}
                              <span className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-bone-dim">
                                {n.badge && (
                                  <span className="px-1.5 py-px rounded-md font-bold not-italic" style={BADGE_TONE[n.badge.tone]}>{n.badge.text}</span>
                                )}
                                <span>{relativeTime(n.createdMs, now)}</span>
                                <span className="opacity-50">·</span>
                                <span>{CATEGORY_LABELS[n.category]}</span>
                              </span>
                            </span>
                            {!n.read && <span className="absolute right-[18px] bottom-4 w-2 h-2 rounded-full bg-sienna" aria-label="Unread" />}
                          </button>
                          {n.compare && canCompare && (
                            <div className={`pl-[60px] pr-9 pb-2 -mt-1 ${!n.read ? 'bg-sienna/[0.06]' : ''}`}>
                              <button
                                type="button"
                                onClick={() => { markRead(n); setOpen(false); openCompare(navigate, n.compare!.uid, n.compare!.name); }}
                                className="h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 bg-sienna/10 text-sienna hover:bg-sienna/15"
                              >
                                <Swords size={12} /> Compare with {n.compare.name.split(' ')[0]}
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => dismiss(n)}
                            className="absolute right-2 top-2 w-7 h-7 rounded-full flex items-center justify-center text-bone-dim hover:text-bone hover:bg-bone/[0.08] opacity-60 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            aria-label="Remove notification"
                            title="Remove"
                          >
                            <X size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {analysis && uid && (
        <Suspense fallback={null}>
          {analysis.kind === 'workout'
            ? <WorkoutAnalysisSheet uid={uid} workoutId={analysis.id} onClose={closeAnalysis} />
            : <CardioAnalysisSheet uid={uid} activityId={analysis.id} onClose={closeAnalysis} />}
        </Suspense>
      )}
    </div>
  );
}
