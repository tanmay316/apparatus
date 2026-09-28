import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CalendarClock, CheckCheck, Flag, ShieldAlert, Trash2, UsersRound } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { isAdminUser } from '@/lib/firebase';
import { safeInternalPath } from '@/lib/validation';
import { markNotificationAsRead } from '@/services/notifications';
import { deleteAdminAlerts, markAdminAlertsRead, subscribeAdminAlerts, useAdminAlerts } from '@/services/admin-alerts';
import type { AppNotificationItem } from '@/types';
import { formatWhen } from './AdminShared';

const KIND_STYLE = {
  report: { icon: Flag, color: '#dc2626', label: 'Report' },
  community: { icon: UsersRound, color: '#7c3aed', label: 'Community' },
  event: { icon: CalendarClock, color: '#d97706', label: 'Event' },
} as const;

/** Keeps the admin alert store live. Renders nothing and does nothing for non-admins. */
export function AdminAlertsSync() {
  const user = useAuthStore(s => s.user);
  const isAdmin = isAdminUser(user);
  const setAlerts = useAdminAlerts(s => s.setAlerts);
  const uid = user?.uid;

  useEffect(() => {
    if (!isAdmin || !uid) { setAlerts([]); return; }
    return subscribeAdminAlerts(uid, setAlerts);
  }, [isAdmin, uid, setAlerts]);

  return null;
}

export function AdminBell() {
  const navigate = useNavigate();
  const showToast = useUIStore(s => s.showToast);
  const alerts = useAdminAlerts(s => s.alerts);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = alerts.filter(a => !a.read);
  const visible = unreadOnly ? unread : alerts;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const openAlert = (a: AppNotificationItem) => {
    if (!a.read && a.id) markNotificationAsRead(a.id).catch(() => {});
    setOpen(false);
    const link = safeInternalPath(a.link);
    if (link) navigate(link);
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); showToast(ok); } catch { showToast('Could not update alerts', 'error'); }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-10 h-10 rounded-full border border-line flex items-center justify-center text-bone-dim hover:text-bone hover:bg-bone/5"
        aria-label={`Admin alerts${unread.length ? `, ${unread.length} unread` : ''}`}
      >
        <Bell size={18} />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold leading-[18px] text-center">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed md:absolute left-3 right-3 md:left-auto md:right-0 top-20 md:top-12 md:w-[360px] max-h-[70vh] flex flex-col rounded-2xl border border-line shadow-2xl z-[80] bg-ink-2 overflow-hidden origin-top-right"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <ShieldAlert size={15} className="text-danger" /> Admin alerts
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setUnreadOnly(u => !u)}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-semibold ${unreadOnly ? 'bg-sienna text-white' : 'bg-bone/5 text-bone-dim'}`}
                >
                  Unread {unread.length || ''}
                </button>
                <button
                  onClick={() => run(() => markAdminAlertsRead(alerts), 'All alerts marked read')}
                  disabled={!unread.length}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-bone-dim hover:text-bone disabled:opacity-40"
                  title="Mark all read"
                >
                  <CheckCheck size={15} />
                </button>
                <button
                  onClick={() => run(() => deleteAdminAlerts(alerts.filter(a => a.read)), 'Read alerts cleared')}
                  disabled={!alerts.some(a => a.read)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-bone-dim hover:text-danger disabled:opacity-40"
                  title="Clear read alerts"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {visible.length === 0 ? (
                <div className="py-12 px-6 text-center text-sm text-bone-dim">
                  {unreadOnly ? 'No unread alerts.' : 'No alerts yet. New reports and approval requests show up here and on your phone.'}
                </div>
              ) : visible.map(a => {
                const style = KIND_STYLE[a.kind || 'report'] ?? KIND_STYLE.report;
                const Icon = style.icon;
                return (
                  <button key={a.id} onClick={() => openAlert(a)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bone/[0.04] border-b border-line/40 last:border-0">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${style.color}1f`, color: style.color }}>
                      <Icon size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13.5px] truncate ${a.read ? 'text-bone-dim' : 'text-bone font-semibold'}`}>{a.title}</span>
                      <span className="block text-[12px] text-bone-dim line-clamp-2 break-words">{a.body}</span>
                      <span className="block text-[10.5px] text-bone-dim/70 mt-0.5">{style.label} · {formatWhen(a.createdAt, 'just now')}</span>
                    </span>
                    {!a.read && <span className="w-2 h-2 rounded-full bg-danger mt-1.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
