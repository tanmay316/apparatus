import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Shield, Target, CalendarDays } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

import { ClansTab } from '@/components/community/ClansTab';
import { EventsTab } from '@/components/community/EventsTab';
import { ChallengesTab } from '@/components/community/ChallengesTab';
import { CreateClanSheet } from '@/components/community/CreateClanSheet';
import { CreateChallengeSheet } from '@/components/community/CreateChallengeSheet';
import { CreateEventSheet } from '@/components/community/CreateEventSheet';
import { UpcomingReminderWidget } from '@/components/community/UpcomingReminderWidget';

export function CommunityPage() {
  const [activeTab, setActiveTab] = useState<'clans' | 'events' | 'challenges'>('clans');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [createType, setCreateType] = useState<'clan' | 'challenge' | 'event' | null>(null);
  
  const { user } = useAuthStore();
  const isDark = useUIStore(s => s.theme === 'dark');

  useEffect(() => {
    document.body.classList.toggle('community-create-open', showCreateMenu || createType !== null);
    return () => document.body.classList.remove('community-create-open');
  }, [showCreateMenu, createType]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1200px] mx-auto w-full pb-28">
      
      {/* Header with + Create Button on the Right Corner */}
      <div className="px-4 py-6 border-b border-line">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-sienna text-xs tracking-widest uppercase">Connect & Compete</div>
            <h1 className="font-display text-3xl sm:text-4xl text-bone">Community</h1>
          </div>

          {user && (
            <button 
              onClick={() => setShowCreateMenu(true)} 
              className="w-10 h-10 rounded-full bg-sienna/20 hover:bg-sienna/30 text-sienna border border-sienna/40 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0 shadow-sm"
              title="Create Clan, Event or Challenge"
            >
              <Plus size={22} />
            </button>
          )}
        </div>
        <p className="text-bone-dim mt-2 text-xs sm:text-sm max-w-xl">
          Join clans, attend community events, and push your limits in fitness challenges.
        </p>
      </div>

      {/* Primary Tabs (Clans -> Events -> Challenges) */}
      <div className="sticky top-[72px] z-30 bg-bg/80 backdrop-blur-xl border-b border-line px-4 pt-4 pb-0 flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 1. Clans Tab */}
        <button
          onClick={() => setActiveTab('clans')}
          className={`pb-4 relative font-display text-lg tracking-wide whitespace-nowrap transition-colors ${
            activeTab === 'clans' ? 'text-bone font-bold' : 'text-bone-dim hover:text-bone'
          }`}
        >
          Clans
          {activeTab === 'clans' && (
            <motion.div className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
          )}
        </button>

        {/* 2. Events Tab */}
        <button
          onClick={() => setActiveTab('events')}
          className={`pb-4 relative font-display text-lg tracking-wide whitespace-nowrap transition-colors ${
            activeTab === 'events' ? 'text-bone font-bold' : 'text-bone-dim hover:text-bone'
          }`}
        >
          Events
          {activeTab === 'events' && (
            <motion.div className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
          )}
        </button>

        {/* 3. Challenges Tab */}
        <button
          onClick={() => setActiveTab('challenges')}
          className={`pb-4 relative font-display text-lg tracking-wide whitespace-nowrap transition-colors ${
            activeTab === 'challenges' ? 'text-bone font-bold' : 'text-bone-dim hover:text-bone'
          }`}
        >
          Challenges
          {activeTab === 'challenges' && (
            <motion.div className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
          )}
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="px-4 py-6">
        {activeTab === 'clans' && <ClansTab />}
        {activeTab === 'events' && <EventsTab />}
        {activeTab === 'challenges' && <ChallengesTab />}
      </div>

      {/* Create New Modal Sheet */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showCreateMenu && (
            <div className="fixed inset-0 z-[600] flex flex-col justify-end">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowCreateMenu(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className="relative bg-ink border-t border-line rounded-t-[32px] p-6 pb-safe overflow-hidden text-bone"
              >
                <div className="w-12 h-1.5 bg-line rounded-full mx-auto mb-6" />
                
                <h2 className="font-display text-2xl text-bone mb-6">Create New</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button 
                    onClick={() => { setShowCreateMenu(false); setCreateType('clan'); }}
                    className="card p-6 flex flex-col items-center text-center hover:border-sienna/50 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-full bg-sienna/20 text-sienna flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Shield size={28} />
                    </div>
                    <h3 className="font-display text-lg text-bone mb-2">Clan</h3>
                    <p className="text-sm text-bone-dim">Build your community and grow together.</p>
                  </button>

                  <button 
                    onClick={() => { setShowCreateMenu(false); setCreateType('event'); }}
                    className="card p-6 flex flex-col items-center text-center hover:border-blue-500/50 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <CalendarDays size={28} />
                    </div>
                    <h3 className="font-display text-lg text-bone mb-2">Event</h3>
                    <p className="text-sm text-bone-dim">Organize a real-world or virtual meetup.</p>
                  </button>

                  <button 
                    onClick={() => { setShowCreateMenu(false); setCreateType('challenge'); }}
                    className="card p-6 flex flex-col items-center text-center hover:border-emerald-500/50 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Target size={28} />
                    </div>
                    <h3 className="font-display text-lg text-bone mb-2">Challenge</h3>
                    <p className="text-sm text-bone-dim">Create a fitness goal for athletes to hit.</p>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <AnimatePresence>
        {createType === 'clan' && <CreateClanSheet onClose={() => setCreateType(null)} />}
        {createType === 'event' && <CreateEventSheet onClose={() => setCreateType(null)} />}
        {createType === 'challenge' && <CreateChallengeSheet onClose={() => setCreateType(null)} />}
      </AnimatePresence>

      <UpcomingReminderWidget />
    </motion.div>
  );
}
