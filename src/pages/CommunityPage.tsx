import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Shield, Target, CalendarDays, Sparkles, X, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

import { ClansTab } from '@/components/community/ClansTab';
import { EventsTab } from '@/components/community/EventsTab';
import { ChallengesTab } from '@/components/community/ChallengesTab';
import { CreateClanSheet } from '@/components/community/CreateClanSheet';
import { CreateChallengeSheet } from '@/components/community/CreateChallengeSheet';
import { CreateEventSheet } from '@/components/community/CreateEventSheet';
import { CreatePersonalChallengeSheet } from '@/components/community/CreatePersonalChallengeSheet';
import { UpcomingReminderWidget } from '@/components/community/UpcomingReminderWidget';
import { Eyebrow, Segmented } from '@/components/community/ui';

const CREATE_OPTIONS = [
  { type: 'clan', icon: Shield, title: 'Clan', description: 'Build a group around a sport, gym or city' },
  { type: 'event', icon: CalendarDays, title: 'Event', description: 'Host a virtual or in-person meetup' },
  { type: 'challenge', icon: Target, title: 'Community challenge', description: 'Set a goal with a public leaderboard' },
  { type: 'personal_challenge', icon: Sparkles, title: 'Personal challenge', description: 'Track a goal just for yourself' },
] as const;

export function CommunityPage() {
  const [activeTab, setActiveTab] = useState<'clans' | 'events' | 'challenges'>('clans');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [createType, setCreateType] = useState<'clan' | 'challenge' | 'event' | 'personal_challenge' | null>(null);
  
  const { user } = useAuthStore();

  useEffect(() => {
    document.body.classList.toggle('community-create-open', showCreateMenu || createType !== null);
    return () => document.body.classList.remove('community-create-open');
  }, [showCreateMenu, createType]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cx pro-scope max-w-[1200px] mx-auto w-full pb-28">

      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Connect & compete</Eyebrow>
            <h1 className="mt-1 font-display text-3xl sm:text-4xl tracking-wide text-bone">Community</h1>
            <p className="mt-1.5 max-w-xl text-sm text-bone-dim">
              Clans, events and challenges from athletes like you.
            </p>
          </div>

          {user && (
            <button
              type="button"
              onClick={() => setShowCreateMenu(true)}
              className="cx-btn bg-sienna shrink-0"
              aria-label="Create clan, event or challenge"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Create</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary tabs */}
      <div className="sticky z-30 px-4 py-3 bg-ink/90 backdrop-blur-xl border-b border-line" style={{ top: 'calc(72px * var(--topbar-visible, 1))', transition: 'top 0.3s ease-out' }}>
        <Segmented
          layoutId="community-primary-tab"
          fullWidth
          className="sm:max-w-md"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'clans', label: 'Clans' },
            { value: 'events', label: 'Events' },
            { value: 'challenges', label: 'Challenges' },
          ]}
        />
      </div>

      {/* Tab Content Body */}
      <div className="px-4 py-5">
        {activeTab === 'clans' && <ClansTab />}
        {activeTab === 'events' && <EventsTab />}
        {activeTab === 'challenges' && <ChallengesTab />}
      </div>

      {/* Create New Modal Sheet */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showCreateMenu && (
            <div className="cx pro-scope fixed inset-0 z-[600] flex flex-col justify-end sm:items-center sm:justify-center">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowCreateMenu(false)}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Create new"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                className="relative w-full sm:max-w-md bg-ink border-t sm:border border-line rounded-t-[28px] sm:rounded-[28px] px-5 pt-3 pb-safe text-bone"
              >
                <div className="w-10 h-1 bg-line-solid rounded-full mx-auto mb-4 sm:hidden" />

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-bone">Create</h2>
                    <p className="text-xs text-bone-dim mt-0.5">What would you like to start?</p>
                  </div>
                  <button type="button" onClick={() => setShowCreateMenu(false)} className="cx-icon-btn w-9 h-9" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>

                <div className="cx-surface overflow-hidden divide-y divide-line mb-5">
                  {CREATE_OPTIONS.map(opt => (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => { setShowCreateMenu(false); setCreateType(opt.type); }}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-ink-3 transition-colors !border-0 !rounded-none"
                    >
                      <span className="w-10 h-10 rounded-xl bg-ink border border-line flex items-center justify-center text-sienna shrink-0">
                        <opt.icon size={19} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-bone">{opt.title}</span>
                        <span className="block text-xs text-bone-dim mt-0.5">{opt.description}</span>
                      </span>
                      <ChevronRight size={18} className="text-bone-dim shrink-0" />
                    </button>
                  ))}
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
        {createType === 'personal_challenge' && <CreatePersonalChallengeSheet onClose={() => setCreateType(null)} />}
      </AnimatePresence>

      <UpcomingReminderWidget />
    </motion.div>
  );
}
