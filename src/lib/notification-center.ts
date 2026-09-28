import type { AppNotificationItem, Notification as SocialNotification } from '@/types';
import type { NotificationCategory, NotificationPrefs } from '@/stores/notification-prefs-store';
import { safeInternalPath } from '@/lib/validation';

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  social: 'Social',
  chat: 'Clan chat',
  clans: 'Clans',
  events: 'Events',
  achievements: 'Achievements',
  reminders: 'Reminders',
  admin: 'Admin',
};

export function categoryOf(type: string | undefined): NotificationCategory {
  switch (type) {
    case 'admin_alert':
      return 'admin';
    case 'clan_message':
      return 'chat';
    case 'clan_post':
    case 'clan_poll':
    case 'clan_announcement':
    case 'clan_join_request':
    case 'clan_join_accepted':
    case 'community_announcement':
      return 'clans';
    case 'event_reminder':
    case 'nearby_event':
    case 'registration_approved':
    case 'ticket_confirmed':
    case 'event_cancelled':
      return 'events';
    case 'achievement':
      return 'achievements';
    case 'reminder':
      return 'reminders';
    default:
      return 'social';
  }
}

export interface UnifiedNotification {
  /** Unique across both collections. */
  key: string;
  id: string;
  source: 'social' | 'app';
  type: string;
  category: NotificationCategory;
  title: string | null;
  body: string;
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;
  createdMs: number;
  read: boolean;
  link: string | null;
  /** Overrides the type icon, e.g. progress_up. */
  icon?: string;
  /** Small highlighted value such as a volume change. */
  badge?: { text: string; tone: 'up' | 'down' | 'flat' };
}

export function timestampMs(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

/** Where tapping a social notification should go. */
export function socialLink(n: SocialNotification, username?: string): string | null {
  const link = safeInternalPath(n.extra?.link);
  if (link) return link;
  if (n.type === 'follow_request') return username ? `/profile/${username}?modal=followers` : null;
  if (n.type === 'follow' || n.type === 'unfollow') return `/profile/${n.targetId || n.senderId}`;
  if (n.extra?.clanId) return `/clan/${encodeURIComponent(n.extra.clanId)}${n.type === 'clan_message' ? '/chat' : ''}`;
  if (n.type === 'reminder') return n.targetId ? '/community' : '/plans';
  if (n.targetId) return `/feed?activity=${n.targetId}`;
  return null;
}

export function fromSocial(n: SocialNotification, username?: string): UnifiedNotification {
  const isSystem = !n.senderId || n.senderId === n.receiverId || n.senderName === 'System';
  const extra = n.extra || {};
  let icon: string | undefined;
  let badge: UnifiedNotification['badge'];
  if (extra.kind === 'progress') {
    const tone: 'up' | 'down' | 'flat' = extra.trend === 'up' || extra.trend === 'down' ? extra.trend : 'flat';
    icon = `progress_${tone}`;
    if (typeof extra.volumeChangePercent === 'number') {
      badge = { text: `${extra.volumeChangePercent > 0 ? '+' : ''}${extra.volumeChangePercent}% volume`, tone };
    }
  } else if (extra.kind === 'steps') {
    icon = 'steps';
  }
  return {
    key: `s:${n.id}`,
    id: n.id || '',
    source: 'social',
    type: n.type,
    category: categoryOf(n.type),
    title: null,
    body: n.message || '',
    senderId: isSystem ? undefined : n.senderId,
    senderName: n.senderName,
    senderPhoto: isSystem ? undefined : n.senderPhoto,
    createdMs: timestampMs(n.createdAt),
    read: !!n.read,
    link: socialLink(n, username),
    icon,
    badge,
  };
}

export function fromApp(n: AppNotificationItem): UnifiedNotification {
  return {
    key: `a:${n.id}`,
    id: n.id || '',
    source: 'app',
    type: n.type,
    category: categoryOf(n.type),
    title: n.title || null,
    body: n.body || '',
    createdMs: timestampMs(n.createdAt),
    read: !!n.read,
    link: safeInternalPath(n.link),
  };
}

export function mergeNotifications(social: UnifiedNotification[], app: UnifiedNotification[]): UnifiedNotification[] {
  return [...social, ...app].sort((a, b) => b.createdMs - a.createdMs);
}

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayGroup(createdMs: number, now = Date.now()): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
  const today = startOfDay(now);
  if (!createdMs || createdMs >= today) return 'Today';
  if (createdMs >= today - DAY_MS) return 'Yesterday';
  if (createdMs >= today - 6 * DAY_MS) return 'This week';
  return 'Earlier';
}

export function groupByDay(items: UnifiedNotification[], now = Date.now()) {
  const groups: { label: ReturnType<typeof dayGroup>; items: UnifiedNotification[] }[] = [];
  for (const n of items) {
    const label = dayGroup(n.createdMs, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}

export function relativeTime(ms: number, now = Date.now()): string {
  if (!ms) return 'just now';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function inQuietHours(prefs: Pick<NotificationPrefs, 'quietHours' | 'quietStart' | 'quietEnd'>, date = new Date()): boolean {
  if (!prefs.quietHours) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = minutesOf(prefs.quietStart);
  const end = minutesOf(prefs.quietEnd);
  if (start === end) return false;
  // Windows like 22:00–07:00 wrap past midnight.
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function allowsBanner(prefs: NotificationPrefs, category: NotificationCategory, date = new Date()): boolean {
  return prefs.bannersEnabled && prefs.categories[category] !== false && !inQuietHours(prefs, date);
}
