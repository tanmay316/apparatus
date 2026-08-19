import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { getFollowing, type ActiveSession } from '@/services/social';
import { getAvatarUrl } from '@/lib/avatar';
import { useUIStore } from '@/stores/ui-store';
import { LiveSessionModal } from './LiveSessionModal';
import { Activity, Dumbbell, Zap } from 'lucide-react';

export interface GroupedLiveSession {
  uid: string;
  displayName: string;
  photoURL: string;
  workout?: ActiveSession;
  cardio?: ActiveSession;
}

export function LiveTrainingHub() {
  const { user } = useAuthStore();
  const { theme } = useUIStore();
  const [groupedSessions, setGroupedSessions] = useState<GroupedLiveSession[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

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
        const now = Date.now();
        const sessions = snap.docs
          .map(d => d.data() as ActiveSession)
          .filter(s => {
            if (!s.updatedAt) return false;
            const updateTime = s.updatedAt.toMillis ? s.updatedAt.toMillis() : (s.updatedAt.seconds * 1000) || now;
            return now - updateTime < 120000; // 2 minutes
          });
        // Group by user
        const grouped: Record<string, GroupedLiveSession> = {};
        for (const s of sessions) {
          if (!grouped[s.uid]) {
            let displayName = 'Athlete';
            let photoURL = '';
            try {
              const userDoc = await getDoc(doc(db, 'users', s.uid));
              if (userDoc.exists()) {
                displayName = userDoc.data().displayName || 'Athlete';
                photoURL = userDoc.data().photoURL || '';
              }
            } catch (e) {}
            grouped[s.uid] = { uid: s.uid, displayName, photoURL };
          }
          if (s.sessionType === 'cardio') grouped[s.uid].cardio = s;
          else grouped[s.uid].workout = s; // default to workout
        }
        
        setGroupedSessions(Object.values(grouped));
      });
    }

    init();
    return () => unsubscribe();
  }, [user]);

  if (groupedSessions.length === 0) return null;

  return (
    <>
      <div className="-mt-2 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-sienna animate-pulse" />
          <h3 className="font-sans text-xs font-semibold text-[var(--muted)] tracking-wider uppercase">Live Training</h3>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 -mx-2 snap-x snap-mandatory touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {groupedSessions.map((session) => (
            <motion.button
              key={session.uid}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedUid(session.uid)}
              className="flex flex-col items-center gap-2 shrink-0 snap-start"
            >
              <div className="relative w-[56px] h-[56px]">
                {/* Gradient Border */}
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

                {/* Activity Badges Overlay */}
                <div className="absolute -bottom-1 -right-1 flex gap-0.5">
                  {session.workout && (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-[var(--bg)] flex items-center justify-center text-white shadow-sm">
                      <Dumbbell size={10} />
                    </div>
                  )}
                  {session.cardio && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-[var(--bg)] flex items-center justify-center text-white shadow-sm">
                      <Zap size={10} />
                    </div>
                  )}
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
        {selectedUid && (
          <LiveSessionModal
            isOpen={!!selectedUid}
            onClose={() => setSelectedUid(null)}
            groupedSession={groupedSessions.find(s => s.uid === selectedUid) || null}
          />
        )}
      </AnimatePresence>
    </>
  );
}
