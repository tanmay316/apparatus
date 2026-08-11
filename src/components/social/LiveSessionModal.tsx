import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Flame, Clock, Play, Footprints } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { sendLiveMessage, type ActiveSession } from '@/services/social';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';

interface Props {
  session: ActiveSession & { displayName: string, photoURL: string };
  isOpen: boolean;
  onClose: () => void;
}

export function LiveSessionModal({ session, isOpen, onClose }: Props) {
  const { user, profile } = useAuthStore();
  const { theme, showToast } = useUIStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [elapsed, setElapsed] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Time elapsed calculator
  useEffect(() => {
    if (!session.startedAt) return;
    
    const updateTime = () => {
      const start = session.startedAt?.seconds ? session.startedAt.toDate() : new Date();
      const diff = Math.floor((new Date().getTime() - start.getTime()) / 1000);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setElapsed(`${m}:${s.toString().padStart(2, '0')}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  // Chat listener
  useEffect(() => {
    if (!session.startedAt) return;
    
    const q = query(
      collection(db, 'activeSessions', session.uid, 'chat'),
      where('createdAt', '>=', session.startedAt),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => unsubscribe();
  }, [session.uid]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !profile) return;
    
    const msg = inputText.trim();
    setInputText('');
    
    try {
      await sendLiveMessage(
        session.uid, 
        user.uid, 
        profile.displayName || 'Athlete', 
        profile.photoURL || '', 
        msg
      );
    } catch (err) {
      showToast('Failed to send message', 'error');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div style={themeStyles} className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="rounded-t-3xl sm:rounded-3xl border border-[var(--border)] bg-[var(--bg)] w-full sm:max-w-[420px] max-h-[90vh] sm:max-h-[80vh] h-[90vh] sm:h-[600px] flex flex-col shadow-2xl overflow-hidden text-[var(--text)] relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-tr from-sienna to-amber rounded-full animate-spin-slow opacity-75 blur-[2px]" />
              <img 
                src={session.photoURL || getAvatarUrl(session.displayName, theme)} 
                alt={session.displayName} 
                className="w-10 h-10 rounded-full object-cover relative z-10 border-2 border-[var(--bg)]"
              />
            </div>
            <div>
              <h2 className="font-sans text-sm font-bold">{session.displayName}</h2>
              <div className="flex items-center gap-1.5 text-sienna text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-sienna animate-pulse" />
                Live Now
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--card)] transition-colors text-[var(--muted)] hover:text-[var(--text)]">
            <X size={18} />
          </button>
        </div>

        {/* Live Stats Bar */}
        <div className="px-5 py-4 bg-[var(--card)] shrink-0 flex flex-col gap-4 border-b border-[var(--border)]">
          <div>
            <div className="text-[10px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">Current Plan</div>
            <div className="font-serif text-lg font-medium leading-tight">{session.dayTitle}</div>
          </div>
          
          <div className={`grid ${session.steps && session.steps > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
            <div className="bg-[var(--bg)] rounded-xl p-3 border border-[var(--border)]">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">
                <Clock size={12} className="text-teal-500" /> Time
              </div>
              <div className="font-mono text-xl font-bold tracking-tight">{elapsed || '0:00'}</div>
            </div>
            <div className="bg-[var(--bg)] rounded-xl p-3 border border-[var(--border)]">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">
                <Flame size={12} className="text-amber-500" /> Cals
              </div>
              <div className="font-mono text-xl font-bold tracking-tight">{session.caloriesBurned || 0}</div>
            </div>
            {session.steps !== undefined && session.steps > 0 && (
              <div className="bg-[var(--bg)] rounded-xl p-3 border border-[var(--border)]">
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)] font-mono uppercase tracking-wider mb-1">
                  <Footprints size={12} className="text-sienna" /> Steps
                </div>
                <div className="font-mono text-xl font-bold tracking-tight">{session.steps.toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm font-medium p-3 rounded-xl bg-sienna/10 text-sienna border border-sienna/20">
            <Play size={16} fill="currentColor" />
            <span className="truncate">Active: {session.currentExercise || 'Warming up...'}</span>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[var(--bg)] custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-full bg-[var(--card)] flex items-center justify-center mb-3">
                <Flame size={24} className="text-sienna/50" />
              </div>
              <p className="text-sm font-medium text-[var(--text)] mb-1">Be the first to cheer!</p>
              <p className="text-xs text-[var(--muted)]">Send a message to hype up {session.displayName.split(' ')[0]}</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <motion.div 
                key={msg.id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.senderUid === user?.uid ? 'flex-row-reverse' : ''}`}
              >
                <img 
                  src={msg.senderPhoto || getAvatarUrl(msg.senderName, theme)} 
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
                <div className={`flex flex-col ${msg.senderUid === user?.uid ? 'items-end' : 'items-start'} max-w-[75%]`}>
                  <span className="text-[10px] text-[var(--muted)] font-mono mb-1">{msg.senderName}</span>
                  <div className={`px-3 py-2 rounded-2xl text-sm ${
                    msg.senderUid === user?.uid 
                      ? 'bg-sienna text-bone rounded-tr-sm' 
                      : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </motion.div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="shrink-0 p-4 bg-[var(--bg)] border-t border-[var(--border)]">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send hype..."
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-sienna focus:ring-1 focus:ring-sienna text-[var(--text)] placeholder-[var(--muted)]"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-sienna text-bone disabled:opacity-50 disabled:bg-[var(--muted)] transition-all hover:scale-105 active:scale-95"
            >
              <Send size={14} className="ml-0.5" />
            </button>
          </form>
          <div className="flex gap-2 mt-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {['Let\'s go! 🔥', 'Crush it! 💪', 'Light weight! 😤', 'Pace yourself 🏃‍♂️'].map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setInputText(preset)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-xs hover:bg-[var(--border)] transition-colors text-[var(--text)]"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
