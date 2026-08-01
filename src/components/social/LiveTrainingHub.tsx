import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { getFollowing, type ActiveSession } from '@/services/social';
import { getAvatarUrl } from '@/lib/avatar';
import { useUIStore } from '@/stores/ui-store';
import { LiveSessionModal } from './LiveSessionModal';
import { Activity } from 'lucide-react';

export function LiveTrainingHub() {
  const { user } = useAuthStore();
  const { theme } = useUIStore();
  const [activeSessions, setActiveSessions] = useState<(ActiveSession & { displayName: string, photoURL: string })[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    let unsubscribe: () => void = () => {};

    async function init() {
      // 1. Get following list
      const following = await getFollowing(user!.uid);
      // For demo purposes, if they aren't following anyone, we could show a mock, but user requested real backend.
      // So if following is empty, they won't see anything unless they follow someone working out.
      // However, let's include the user themselves so they can see it working if they are working out!
      const uidsToWatch = [...following, user!.uid].slice(0, 30);
      
      const q = query(
        collection(db, 'activeSessions'),
        where('uid', 'in', uidsToWatch)
      );

      unsubscribe = onSnapshot(q, async (snap) => {
        const sessions = snap.docs.map(d => d.data() as ActiveSession);
        
        // Fetch user details for these sessions
        const sessionsWithUsers = await Promise.all(sessions.map(async (s) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', s.uid));
            if (userDoc.exists()) {
              return {
                ...s,
                displayName: userDoc.data().displayName || 'Athlete',
                photoURL: userDoc.data().photoURL || '',
              };
            }
          } catch (e) {}
          
          return {
            ...s,
            displayName: 'Athlete',
            photoURL: '',
          };
        }));
        
        setActiveSessions(sessionsWithUsers);
      });
    }

    init();
    return () => unsubscribe();
  }, [user]);

  if (activeSessions.length === 0) return null;

  return (
    <>
      <div className="-mt-2 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-sienna animate-pulse" />
          <h3 className="font-sans text-xs font-semibold text-[var(--muted)] tracking-wider uppercase">Live Training</h3>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 -mx-2 snap-x snap-mandatory touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {activeSessions.map((session) => (
            <motion.button
              key={session.uid}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedSession(session)}
              className="flex flex-col items-center gap-2 shrink-0 snap-start"
            >
              <div className="relative w-[56px] h-[56px]">
                <div className="absolute -inset-1 bg-gradient-to-tr from-sienna to-amber rounded-full animate-spin-slow opacity-75 blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-tr from-sienna to-amber rounded-full p-[2px]">
                  <div className="w-full h-full bg-[var(--bg)] rounded-full flex items-center justify-center p-0.5">
                    <img 
                      src={session.photoURL || getAvatarUrl(session.displayName, theme)} 
                      alt={session.displayName} 
                      className="w-full h-full rounded-full object-cover border border-[var(--bg)]"
                    />
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-medium text-[var(--text)] truncate max-w-[64px]">
                {session.displayName.split(' ')[0]}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedSession && (
          <LiveSessionModal
            isOpen={!!selectedSession}
            onClose={() => setSelectedSession(null)}
            session={selectedSession ? activeSessions.find(s => s.uid === selectedSession.uid) || selectedSession : null}
          />
        )}
      </AnimatePresence>
    </>
  );
}
