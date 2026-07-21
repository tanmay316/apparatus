import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, X, Calendar, Ticket, CheckCircle2, AlertCircle, Sparkles, Megaphone, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { getUserNotifications, markNotificationAsRead } from '@/services/notifications';
import type { AppNotificationItem, AppNotificationType } from '@/types';

export function NotificationDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['userNotifications', user?.uid],
    queryFn: () => getUserNotifications(user!.uid),
    enabled: !!user && isOpen,
    refetchInterval: 10000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userNotifications', user?.uid] });
    }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: AppNotificationType) => {
    switch (type) {
      case 'event_reminder': return <Calendar size={18} className="text-amber" />;
      case 'ticket_confirmed': return <Ticket size={18} className="text-emerald-400" />;
      case 'registration_approved': return <CheckCircle2 size={18} className="text-emerald-400" />;
      case 'event_cancelled': return <AlertCircle size={18} className="text-rose-400" />;
      case 'community_announcement': return <Megaphone size={18} className="text-sienna" />;
      default: return <Sparkles size={18} className="text-amber" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/60 backdrop-blur-xs">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="relative w-full max-w-sm bg-ink border-l border-line h-full flex flex-col shadow-2xl z-10">
            
            <div className="p-4 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-sienna" />
                <h2 className="font-display text-lg text-bone">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="bg-sienna text-bone text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-ink-2 text-bone-dim transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading ? (
                <div className="py-12 text-center text-xs font-mono text-bone-dim">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="py-16 text-center text-bone-dim space-y-2">
                  <Bell size={36} className="mx-auto opacity-30" />
                  <p className="text-xs font-mono">You're all caught up!</p>
                </div>
              ) : (
                notifications.map((n: AppNotificationItem) => (
                  <div 
                    key={n.id} 
                    onClick={() => n.id && !n.read && markReadMutation.mutate(n.id)}
                    className={`p-3.5 rounded-xl border transition-colors cursor-pointer flex items-start gap-3 ${
                      n.read ? 'bg-ink-2/40 border-line/20 opacity-70' : 'bg-ink-2 border-sienna/40 shadow-sm'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-ink-3 shrink-0">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-bone truncate">{n.title}</h4>
                      <p className="text-xs text-bone-dim mt-0.5 line-clamp-2">{n.body}</p>
                      <span className="text-[9px] font-mono text-bone-dim/60 mt-1 block">
                        {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </span>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-sienna shrink-0 mt-1" />
                    )}
                  </div>
                ))
              )}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
