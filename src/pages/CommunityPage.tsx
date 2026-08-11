import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Swords, Shield, Target, CalendarDays, Zap, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

import { EventsChallengesTab } from '@/components/community/EventsChallengesTab';
import { ClansTab } from '@/components/community/ClansTab';
import { CreateClanSheet } from '@/components/community/CreateClanSheet';
import { CreateChallengeSheet } from '@/components/community/CreateChallengeSheet';
import { CreateEventSheet } from '@/components/community/CreateEventSheet';
// import { CreateMenu } from '@/components/community/CreateMenu';

export function CommunityPage() {
  const [activeTab, setActiveTab] = useState<'events' | 'clans'>('events');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [createType, setCreateType] = useState<'clan' | 'challenge' | 'event' | null>(null);
  
  const { user } = useAuthStore();
  const isDark = useUIStore(s => s.theme === 'dark');

  useEffect(() => {
    document.body.classList.toggle('community-create-open', showCreateMenu || createType !== null);
    return () => document.body.classList.remove('community-create-open');
  }, [showCreateMenu, createType]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1200px] mx-auto w-full pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 py-6 border-b border-line">
        <div>
          <div className="font-mono text-sienna text-xs tracking-widest mb-2 uppercase">Connect & Compete</div>
          <h1 className="font-display text-4xl text-bone">Community</h1>
          <p className="text-bone-dim mt-2 max-w-xl">Join clans, participate in challenges, and attend local events to level up your fitness journey.</p>
        </div>
        
        <div className="flex items-center gap-3 self-start md:self-auto shrink-0">
          <button className="w-12 h-12 flex items-center justify-center rounded-full bg-ink-2 text-bone hover:bg-ink-3 transition-colors border border-line">
            <Search size={20} />
          </button>
          {user && (
            <button onClick={() => setShowCreateMenu(true)} className="btn-primary h-12 px-6 rounded-full inline-flex items-center gap-2">
              <Plus size={20} /> Create
            </button>
          )}
        </div>
      </div>

      {/* Primary Tabs */}
      <div className="sticky top-[72px] z-30 bg-bg/80 backdrop-blur-xl border-b border-line px-4 pt-4 pb-0 flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setActiveTab('events')}
          className={`pb-4 relative font-display text-lg tracking-wide whitespace-nowrap transition-colors ${
            activeTab === 'events' ? 'text-bone' : 'text-bone-dim hover:text-bone'
          }`}
        >
          Events & Challenges
          {activeTab === 'events' && (
            <motion.div className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('clans')}
          className={`pb-4 relative font-display text-lg tracking-wide whitespace-nowrap transition-colors ${
            activeTab === 'clans' ? 'text-bone' : 'text-bone-dim hover:text-bone'
          }`}
        >
          Clans
          {activeTab === 'clans' && (
            <motion.div className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
          )}
        </button>
      </div>

      <div className="px-4 py-6">
        {activeTab === 'events' ? (
          <EventsChallengesTab />
        ) : (
          <ClansTab />
        )}
      </div>

      <AnimatePresence>
        {showCreateMenu && (
          <div className="fixed inset-0 z-[300] flex flex-col justify-end">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCreateMenu(false)}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="relative bg-ink border-t border-line rounded-t-[32px] p-6 pb-safe overflow-hidden"
            >
              <div className="w-12 h-1.5 bg-line rounded-full mx-auto mb-8" />
              
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
                  onClick={() => { setShowCreateMenu(false); setCreateType('challenge'); }}
                  className="card p-6 flex flex-col items-center text-center hover:border-emerald-500/50 transition-colors group"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Target size={28} />
                  </div>
                  <h3 className="font-display text-lg text-bone mb-2">Challenge</h3>
                  <p className="text-sm text-bone-dim">Create a fitness goal for everyone to hit.</p>
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
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createType === 'clan' && <CreateClanSheet onClose={() => setCreateType(null)} />}
        {createType === 'challenge' && <CreateChallengeSheet onClose={() => setCreateType(null)} />}
        {createType === 'event' && <CreateEventSheet onClose={() => setCreateType(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}
