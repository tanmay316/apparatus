import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Flame, Calendar, Sparkles, X, Target, MapPin, Trophy, ChevronRight, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { getUserChallenges, getUserEvents } from '@/services/community';
import { ChallengeV2, SimpleEvent } from '@/types';
import { showNotification } from '@/utils/notifications';
import { ChallengeDetailSheet } from './ChallengeDetailSheet';
import { EventDetailSheet } from './EventDetailSheet';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UpcomingItem {
  id: string;
  type: 'challenge' | 'event';
  title: string;
  description: string;
  startMs: number;
  locationOrMetric: string;
  prize?: string;
  raw: ChallengeV2 | SimpleEvent;
}

export function UpcomingReminderWidget() {
  const { user } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: userChallenges = [] } = useQuery({
    queryKey: ['userChallenges', user?.uid],
    queryFn: () => (user ? getUserChallenges(user.uid) : []),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: userEvents = [] } = useQuery({
    queryKey: ['userEvents', user?.uid],
    queryFn: () => (user ? getUserEvents(user.uid) : []),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Filter items starting in < 24 hours
  const upcomingItems: UpcomingItem[] = [];

  userChallenges.forEach(c => {
    const s = c.startDate?.toMillis ? c.startDate.toMillis() : 0;
    if (s > now && s - now <= ONE_DAY_MS) {
      upcomingItems.push({
        id: c.id!,
        type: 'challenge',
        title: c.title,
        description: c.description,
        startMs: s,
        locationOrMetric: `Goal: ${c.target} ${c.unit}`,
        prize: c.prize,
        raw: c
      });
    }
  });

  userEvents.forEach(e => {
    const s = e.startTime?.toMillis ? e.startTime.toMillis() : 0;
    if (s > now && s - now <= ONE_DAY_MS) {
      upcomingItems.push({
        id: e.id!,
        type: 'event',
        title: e.title,
        description: e.description,
        startMs: s,
        locationOrMetric: e.location?.name || 'Meetup',
        prize: e.prize,
        raw: e
      });
    }
  });

  // Sort by earliest start time
  upcomingItems.sort((a, b) => a.startMs - b.startMs);

  // Trigger Local Notification & In-app Bell Notification (once per item)
  useEffect(() => {
    if (!user || upcomingItems.length === 0) return;

    upcomingItems.forEach(async (item) => {
      const storageKey = `apparatus_reminder_sent_${item.id}_${user.uid}`;
      const alreadySent = localStorage.getItem(storageKey);
      if (!alreadySent) {
        localStorage.setItem(storageKey, 'true');
        const diff = item.startMs - Date.now();
        const hoursLeft = Math.max(1, Math.round(diff / 3600000));

        // 1. Mobile Local Notification
        const notifId = Math.floor(Math.random() * 900000) + 100000;
        showNotification(
          notifId,
          `⏰ Starting in ${hoursLeft}h: ${item.title}`,
          `Your joined ${item.type} starts soon. Get ready to participate!`
        );

        // 2. In-App Bell Notification in Firestore
        try {
          await addDoc(collection(db, 'notifications'), {
            receiverId: user.uid,
            senderId: 'system',
            senderName: 'Apparatus Community',
            senderPhoto: '',
            type: 'reminder',
            message: `⏰ "${item.title}" starts in ${hoursLeft} hours! Tap to view details.`,
            targetId: item.id,
            read: false,
            createdAt: serverTimestamp()
          });
        } catch {
          /* ignore error */
        }
      }
    });
  }, [user, upcomingItems]);

  if (upcomingItems.length === 0) return null;

  const nextItem = upcomingItems[0];
  const diff = nextItem.startMs - now;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff / 60000) % 60);
  const timeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <>
      {/* Floating Animated Pill Widget */}
      <div className="fixed bottom-20 right-4 z-[450] sm:bottom-6 sm:right-6">
        <motion.button
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setModalOpen(true)}
          className="relative flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-black font-mono font-bold text-xs shadow-[0_0_25px_rgba(245,158,11,0.5)] border border-amber-300/60 backdrop-blur-lg animate-pulse"
        >
          <div className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center">
            <Bell size={13} className="text-black" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[9px] uppercase tracking-wider font-black text-black/70 leading-none">Starting in {timeText}</span>
            <span className="text-xs font-black truncate max-w-[130px] sm:max-w-[180px] leading-tight text-black">{nextItem.title}</span>
          </div>
          {upcomingItems.length > 1 && (
            <span className="w-4 h-4 rounded-full bg-black text-amber-400 text-[10px] flex items-center justify-center font-black">
              {upcomingItems.length}
            </span>
          )}
        </motion.button>
      </div>

      {/* Modal Sheet for Upcoming Items */}
      {modalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-bg border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-line/20 pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-amber-400" />
                  <h3 className="font-display text-xl text-bone">Starting Soon ({upcomingItems.length})</h3>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-1.5 text-bone-dim hover:text-bone rounded-full">
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-bone-dim">
                These are your enrolled events and challenges starting within the next 24 hours.
              </p>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {upcomingItems.map((item) => {
                  const d = item.startMs - Date.now();
                  const h = Math.floor(d / 3600000);
                  const m = Math.floor((d / 60000) % 60);
                  const inText = h > 0 ? `${h}h ${m}m` : `${m} mins`;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (item.type === 'challenge') {
                          setSelectedChallengeId(item.id);
                        } else {
                          setSelectedEventId(item.id);
                        }
                      }}
                      className="p-4 rounded-2xl bg-ink-2/60 hover:bg-ink-2 border border-line/30 hover:border-amber-400/50 cursor-pointer transition-all flex flex-col gap-2 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold border border-amber-400/30">
                          <Sparkles size={10} /> Starts in {inText}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-bone-dim">
                          {item.type}
                        </span>
                      </div>

                      <h4 className="font-bold text-bone text-base group-hover:text-amber-400 transition-colors">
                        {item.title}
                      </h4>

                      <div className="flex items-center justify-between text-xs font-mono text-bone-dim pt-2 border-t border-line/10">
                        <span>{item.locationOrMetric}</span>
                        <span className="flex items-center gap-1 text-amber-400 font-bold group-hover:translate-x-1 transition-transform">
                          Details <ChevronRight size={13} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}

      <AnimatePresence>
        {selectedChallengeId && (
          <ChallengeDetailSheet
            challengeId={selectedChallengeId}
            onClose={() => setSelectedChallengeId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEventId && (
          <EventDetailSheet
            eventId={selectedEventId}
            onClose={() => setSelectedEventId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
