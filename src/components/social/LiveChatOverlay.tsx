import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useCardioStore } from '@/stores/cardio-store';
import { sendLiveMessage } from '@/services/social';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle, Flame } from 'lucide-react';
import { showNotification } from '@/utils/notifications';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';

export function LiveChatOverlay() {
  const { user, profile } = useAuthStore();
  const { theme } = useUIStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  
  const isWorkoutActive = useWorkoutStore(s => s.isActive);
  const isCardioTracking = useCardioStore(s => s.isTracking);
  const isActive = isWorkoutActive || isCardioTracking;

  const themeStyles = theme === 'dark' ? {
    '--bg': '#090605',
    '--card': '#1f110d',
    '--border': '#4e2b20',
    '--text': '#fff3eb',
    '--muted': '#d1b2a1',
    '--teal': '#d7b29d',
    '--amber': '#d9a441',
  } as React.CSSProperties : {
    '--bg': '#f7f8fb',
    '--card': '#ffffff',
    '--border': '#e5e7eb',
    '--text': '#111827',
    '--muted': '#6b7280',
    '--teal': '#2f7a6d',
    '--amber': '#c98a1f',
  } as React.CSSProperties;

  // Real-time listener for incoming cheers/messages during active training session
  useEffect(() => {
    if (!user || !isActive) {
      setMessages([]);
      return;
    }

    const chatColl = collection(db, 'activeSessions', user.uid, 'chat');
    const q = query(chatColl, orderBy('createdAt', 'asc'));

    let isInitial = true;

    const handleSnap = (snap: any) => {
      if (isInitial) {
        isInitial = false;
        // On initial mount/start, populate only the last 2 unread cheers from others
        const initialList = snap.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((d: any) => d.senderUid !== user.uid);
        if (initialList.length > 0) {
          setMessages(initialList.slice(-2));
        }
        return;
      }

      snap.docChanges().forEach((change: any) => {
        if (change.type === 'added') {
          const data = { id: change.doc.id, ...change.doc.data() } as any;
          if (data.senderUid !== user.uid) {
            setMessages(prev => {
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data];
            });

            // Trigger sound / system push notification
            showNotification(
              Math.floor(Math.random() * 100000), 
              `🔥 Cheer from ${data.senderName}`, 
              data.text
            ).catch(() => {});
          }
        }
      });
    };

    const unsubscribe = onSnapshot(q, handleSnap, (err) => {
      console.warn('[LiveChatOverlay] snapshot error, falling back to unordered:', err);
      onSnapshot(chatColl, handleSnap);
    });

    return () => unsubscribe();
  }, [user?.uid, isActive]);

  // Auto-dismiss messages after 9 seconds so the athlete is not distracted
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      setMessages(prev => prev.slice(1));
    }, 9000);
    return () => clearTimeout(timer);
  }, [messages]);

  const removeMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !user || !profile || !replyingTo) return;
    
    const txt = replyText.trim();
    const target = replyingTo;
    setReplyText('');
    setReplyingTo(null);
    removeMessage(target.id);
    
    try {
      await sendLiveMessage(
        user.uid, // the active session belongs to the user
        user.uid,
        profile.displayName || 'Athlete',
        profile.photoURL || '',
        `@${target.senderName}: ${txt}`
      );
    } catch(e) {
      console.error('Failed to send live reply:', e);
    }
  };

  if (!user || !isActive) return null;

  return (
    <>
      <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-3 max-w-[290px] pointer-events-none" style={themeStyles}>
        <AnimatePresence>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, x: 60 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ right: 0.5, left: 0 }}
              onDragEnd={(_e, info) => {
                if (info.offset.x > 80 || info.offset.x < -80) removeMessage(msg.id);
              }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setReplyingTo(msg)}
              className="bg-[var(--card)]/95 backdrop-blur-md border border-[var(--border)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] rounded-2xl p-3.5 flex items-start gap-3 pointer-events-auto cursor-pointer relative overflow-hidden group"
            >
              {/* Glowing accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sienna to-amber-500" />
              
              <div className="relative shrink-0">
                <img 
                  src={msg.senderPhoto || getAvatarUrl(msg.senderName, theme)} 
                  alt={msg.senderName}
                  className="w-10 h-10 rounded-full object-cover border border-[var(--border)]"
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-sienna flex items-center justify-center text-[9px] text-white">
                  <Flame size={10} />
                </div>
              </div>

              <div className="flex-1 min-w-0 pr-4">
                <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-0.5 truncate">{msg.senderName}</div>
                <div className="text-sm font-medium text-[var(--text)] line-clamp-2 leading-snug">{msg.text}</div>
                <div className="text-[10px] text-[var(--muted)] mt-1.5 flex items-center gap-1 opacity-80">
                  <MessageCircle size={10} className="text-sienna" /> Tap to reply • Swipe to dismiss
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMessage(msg.id);
                }}
                className="absolute top-2.5 right-2.5 p-1 rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Reply Modal */}
      {replyingTo && createPortal(
        <div style={themeStyles} className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setReplyingTo(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="w-full max-w-sm bg-[var(--bg)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-2xl relative"
          >
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sienna animate-pulse" />
                <h3 className="font-display font-semibold text-base text-[var(--text)]">Reply to {replyingTo.senderName}</h3>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-2 -mr-2 text-[var(--muted)] hover:text-[var(--text)]">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 bg-[var(--card)]">
              <div className="flex gap-2.5 mb-4 p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                 <div className="w-1 bg-sienna rounded-full shrink-0" />
                 <p className="text-xs text-[var(--text)] italic line-clamp-2">"{replyingTo.text}"</p>
              </div>
              
              <form onSubmit={handleSendReply} className="flex flex-col gap-3">
                <textarea 
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type quick reply (e.g. Thanks! 💪)..."
                  className="input-field w-full min-h-[75px] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--muted)] text-sm rounded-xl p-3 border border-[var(--border)] resize-none focus:outline-none focus:border-sienna"
                  autoFocus
                />
                <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                  {['Thanks! 💪', 'Crushing it! 🔥', 'Appreciate it! 🙌', 'Almost done! ⚡'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReplyText(preset)}
                      className="shrink-0 px-2.5 py-1 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[11px] hover:border-sienna text-[var(--text)] transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <button 
                  type="submit" 
                  disabled={!replyText.trim()} 
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 rounded-xl bg-sienna text-white font-medium text-sm disabled:opacity-50"
                >
                  <Send size={15} /> Send Reply
                </button>
              </form>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </>
  );
}
