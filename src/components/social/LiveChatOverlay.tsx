import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useCardioStore } from '@/stores/cardio-store';
import { sendLiveMessage } from '@/services/social';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';

export function LiveChatOverlay() {
  const { user, profile } = useAuthStore();
  const { theme } = useUIStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  
  const workoutStore = useWorkoutStore();
  const cardioStore = useCardioStore();

  const isActive = workoutStore.isActive || cardioStore.isTracking;
  const startedAtMs = workoutStore.isActive ? workoutStore.startedAt : (cardioStore.isTracking ? cardioStore.startedAt : 0);

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

  useEffect(() => {
    if (!user || !isActive || !startedAtMs) {
      setMessages([]);
      return;
    }
    
    const sessionStart = Timestamp.fromMillis(startedAtMs);

    // Listen for NEW messages arriving in this active session
    const q = query(
      collection(db, 'activeSessions', user.uid, 'chat'),
      where('createdAt', '>=', sessionStart),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = { id: change.doc.id, ...change.doc.data() } as any;
          // Don't show our own messages in the overlay
          if (data.senderUid !== user.uid) {
            setMessages(prev => [...prev, data]);
            import('@/utils/notifications').then(({ showNotification }) => {
              showNotification(Math.floor(Math.random() * 100000), `Message from ${data.senderName}`, data.text).catch(() => {});
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  const removeMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !user || !profile || !replyingTo) return;
    
    const txt = replyText;
    setReplyText('');
    setReplyingTo(null);
    removeMessage(replyingTo.id);
    
    try {
      await sendLiveMessage(
        user.uid, // the active session belongs to the user
        user.uid,
        profile.displayName || 'Athlete',
        profile.photoURL || '',
        `@${replyingTo.senderName}: ${txt}`
      );
    } catch(e) {
      console.error(e);
    }
  };

  if (!user) return null;

  return (
    <>
      <div className="fixed top-24 right-4 z-40 flex flex-col gap-3 max-w-[280px] pointer-events-none" style={themeStyles}>
        <AnimatePresence>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, x: 50 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ right: 0.5, left: 0 }}
              onDragEnd={(e, info) => {
                if (info.offset.x > 100) removeMessage(msg.id);
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setReplyingTo(msg)}
              className="bg-[var(--card)] border border-[var(--border)] shadow-xl rounded-2xl p-3 flex items-start gap-3 pointer-events-auto cursor-pointer"
            >
              <img 
                src={msg.senderPhoto || getAvatarUrl(msg.senderName, theme)} 
                alt={msg.senderName}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-amber mb-0.5 truncate">{msg.senderName}</div>
                <div className="text-sm text-[var(--text)] line-clamp-2">{msg.text}</div>
                <div className="text-[10px] text-[var(--muted)] mt-1 flex items-center gap-1 opacity-70">
                  <MessageCircle size={10} /> Tap to reply • Swipe right to dismiss
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {replyingTo && createPortal(
        <div style={themeStyles} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setReplyingTo(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="w-full max-w-sm bg-[var(--bg)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-2xl relative"
          >
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="font-display text-lg text-[var(--text)]">Reply to {replyingTo.senderName}</h3>
              <button onClick={() => setReplyingTo(null)} className="p-2 -mr-2 text-[var(--muted)] hover:text-[var(--text)]">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 bg-[var(--card)]">
              <div className="flex gap-3 mb-4 opacity-70">
                 <div className="w-1 h-full bg-[var(--border)] rounded-full" />
                 <p className="text-sm italic text-[var(--text)]">{replyingTo.text}</p>
              </div>
              
              <form onSubmit={handleSendReply} className="flex flex-col gap-3">
                <textarea 
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  className="input-field w-full min-h-[80px] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--muted)]"
                  autoFocus
                />
                <button 
                  type="submit" 
                  disabled={!replyText.trim()} 
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                >
                  <Send size={16} /> Send Reply
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
