import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { getFollowing, type ActiveSession } from '@/services/social';
import { getAvatarUrl } from '@/lib/avatar';
import { useUIStore } from '@/stores/ui-store';
import { LiveSessionModal } from './LiveSessionModal';
import { Bike, Dumbbell, Footprints, Zap } from 'lucide-react';

const STALE_AFTER_MS = 5 * 60_000;

function isSessionPaused(s?: ActiveSession) {
  return s?.status === 'paused' || s?.status === 'auto_paused';
}

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
          .map(d => d.data({ serverTimestamps: 'estimate' }) as ActiveSession)
          .filter(s => {
            if (!s.updatedAt) return false;
            const updateTime = s.updatedAt.toMillis ? s.updatedAt.toMillis() : (s.updatedAt.seconds * 1000) || now;
            // Heartbeats are 10-15s; allow for Android throttling a locked phone's WebView.
            return now - updateTime < STALE_AFTER_MS;
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
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          <h3 className="font-sans text-xs font-semibold text-[var(--muted)] tracking-wider uppercase">Live Training</h3>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-3 pt-1 px-1 -mx-1 snap-x snap-mandatory touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {groupedSessions.map((session) => {
            const allPaused = [session.workout, session.cardio].filter(Boolean).every(isSessionPaused);
            const CardioIcon = session.cardio?.activityType === 'cycle' ? Bike : session.cardio?.activityType === 'walk' ? Footprints : Zap;
            const cardioShort = session.cardio?.activityType === 'cycle' ? 'Ride' : session.cardio?.activityType === 'walk' ? 'Walk' : 'Run';
            const label = allPaused
              ? 'Paused'
              : [session.workout && 'Lift', session.cardio && cardioShort].filter(Boolean).join(' · ');
            const badges = [
              session.workout && { key: 'workout', Icon: Dumbbell, paused: isSessionPaused(session.workout) },
              session.cardio && { key: 'cardio', Icon: CardioIcon, paused: isSessionPaused(session.cardio) },
            ].filter(Boolean) as { key: string; Icon: typeof Dumbbell; paused: boolean }[];
            return (
              <motion.button
                key={session.uid}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedUid(session.uid)}
                className="flex flex-col items-center gap-1.5 shrink-0 snap-start w-[68px]"
                aria-label={`${session.displayName} is ${allPaused ? 'paused' : 'training live'}: ${label}`}
              >
                <div className="relative w-[60px] h-[60px]">
                  <div
                    className={`absolute inset-[3px] rounded-full p-[2px] ${allPaused ? 'live-avatar-paused' : 'live-avatar-active'}`}
                    style={{ background: 'var(--bg)' }}
                  >
                    <img
                      src={session.photoURL || getAvatarUrl(session.displayName, theme)}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1.5 flex -space-x-1.5">
                    {badges.map(({ key, Icon, paused }) => (
                      <span
                        key={key}
                        className={`w-[21px] h-[21px] rounded-full border-2 border-[var(--bg)] flex items-center justify-center text-white ${paused ? 'bg-amber-500' : 'bg-emerald-700'}`}
                      >
                        <Icon size={10} strokeWidth={2.6} />
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[11px] font-medium text-[var(--text)] truncate max-w-full leading-tight">
                  {session.displayName.split(' ')[0]}
                </span>
                <span className={`text-[9.5px] font-semibold uppercase tracking-wide leading-none truncate max-w-full ${allPaused ? 'text-amber-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {label}
                </span>
              </motion.button>
            );
          })}
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
