import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Sparkles, X, ChevronRight, Clock } from 'lucide-react';
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

export function formatChallengeGoal(target?: number, unit?: string, metric?: string): string {
  const trimmedUnit = (unit || '').trim();
  const trimmedMetric = (metric || '').trim();
  
  if (metric === 'other' || !target || target === 1) {
    return trimmedUnit || trimmedMetric || (target ? `${target}` : '');
  }

  if (trimmedUnit.startsWith(`${target} `) || trimmedUnit === `${target}`) {
    return trimmedUnit;
  }

  return `${target} ${trimmedUnit}`.trim();
}

function formatCountdownWithSeconds(startMs: number, currentNow: number) {
  const diff = Math.max(0, startMs - currentNow);
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff / 60000) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function UpcomingReminderWidget() {
  const { user } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Update live seconds timer
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Filter items starting in < 24 hours
  const upcomingItems: UpcomingItem[] = [];

  userChallenges.forEach(c => {
    const s = c.startDate?.toMillis ? c.startDate.toMillis() : 0;
    if (s > now && s - now <= ONE_DAY_MS) {
      const goalStr = formatChallengeGoal(c.target, c.unit, c.metric);
      upcomingItems.push({
        id: c.id!,
        type: 'challenge',
        title: c.title,
        description: c.description,
        startMs: s,
        locationOrMetric: goalStr ? `Goal: ${goalStr}` : '',
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
  const countdownText = formatCountdownWithSeconds(nextItem.startMs, now);

  return (
    <>
      {/* Floating Animated Pill Widget on Bottom-Left - horizontally aligned with AI Chatbot button (bottom-[110px]) */}
      <div className="fixed bottom-[110px] left-4 sm:left-6 z-[210]">
        <motion.button
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setModalOpen(true)}
          className="relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-black font-mono font-bold text-xs shadow-xl shadow-amber-500/25 border border-amber-300/60 backdrop-blur-lg"
        >
          <div className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center shrink-0">
            <Bell size={12} className="text-black" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[9px] uppercase tracking-wider font-black text-black leading-none">Starting in {countdownText}</span>
            <span className="text-xs font-black truncate max-w-[120px] sm:max-w-[160px] leading-tight text-black">{nextItem.title}</span>
          </div>
          {upcomingItems.length > 1 && (
            <span className="w-4 h-4 rounded-full bg-black text-amber-400 text-[10px] flex items-center justify-center font-black shrink-0">
              {upcomingItems.length}
            </span>
          )}
        </motion.button>
      </div>

      {/* Modal Sheet for Upcoming Items (Solid Theme & High-Contrast Cards) */}
      {modalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-ink border border-line rounded-[28px] p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-bone"
            >
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-amber-600 dark:text-amber-400" />
                  <h3 className="font-display text-xl text-bone">Starting Soon ({upcomingItems.length})</h3>
                </div>
                <button 
                  onClick={() => setModalOpen(false)} 
                  className="p-1.5 bg-ink-2 hover:bg-ink-3 text-bone-dim hover:text-bone rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-bone-dim font-mono">
                These are your enrolled events and challenges starting within the next 24 hours.
              </p>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {upcomingItems.map((item) => {
                  const itemCountdown = formatCountdownWithSeconds(item.startMs, now);

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setModalOpen(false); // Close the Starting Soon popup so detail sheet appears in front!
                        if (item.type === 'challenge') {
                          setSelectedChallengeId(item.id);
                        } else {
                          setSelectedEventId(item.id);
                        }
                      }}
                      className="p-4 rounded-2xl bg-ink-2 hover:bg-ink-3 border border-line/40 hover:border-sienna/50 cursor-pointer transition-all flex flex-col gap-2.5 group text-bone"
                    >
                      <div className="flex items-center justify-between">
                        <span className="badge-countdown-upcoming inline-flex items-center gap-1.5 text-xs font-mono uppercase px-2.5 py-1 rounded-full font-black shadow-sm">
                          <Sparkles size={11} className="shrink-0" /> Starts in {itemCountdown}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-bone-dim font-bold">
                          {item.type}
                        </span>
                      </div>

                      <h4 className="font-bold text-bone text-base group-hover:text-sienna transition-colors line-clamp-1">
                        {item.title}
                      </h4>

                      <div className="flex items-center justify-between text-xs font-mono text-bone-dim pt-2 border-t border-line/20">
                        <span>{item.locationOrMetric}</span>
                        <span className="flex items-center gap-1 text-sienna dark:text-amber-400 font-bold group-hover:translate-x-1 transition-transform">
                          Details <ChevronRight size={13} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
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
