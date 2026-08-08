import { useQuery } from '@tanstack/react-query';
import { getPublicChallenges, getPublicEvents } from '@/services/community';
import { Target, CalendarDays, Users, Flame } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChallengeDetailSheet } from './ChallengeDetailSheet';

export function EventsChallengesTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming'>('all');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['publicChallenges'],
    queryFn: () => getPublicChallenges(10)
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['publicEvents'],
    queryFn: () => getPublicEvents(10)
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {['all', 'active', 'upcoming'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-full text-sm font-mono capitalize transition-colors whitespace-nowrap ${
              filter === f ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Featured Section */}
      <div className="relative overflow-hidden rounded-[32px] bg-ink-2 border border-line p-6 sm:p-8">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Target size={120} />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-sienna/20 text-sienna px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider mb-4">
            <Flame size={14} /> Active Challenge
          </div>
          <h2 className="font-display text-3xl text-bone mb-2">100km Run Club</h2>
          <p className="text-bone-dim max-w-md mb-6">Join 1,204 athletes in completing 100km this month. Push your limits and climb the leaderboard.</p>
          
          <div className="w-full bg-ink-3 h-2 rounded-full mb-2 overflow-hidden">
            <div className="h-full bg-sienna rounded-full w-[45%]" />
          </div>
          <div className="flex justify-between text-xs font-mono text-bone-dim mb-6">
            <span>45km completed</span>
            <span>55km remaining</span>
          </div>

          <button className="btn-primary px-6 py-2">Join Challenge</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Challenges List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <Target size={20} className="text-emerald-500" />
              Challenges
            </h3>
          </div>
          
          {loadingChallenges ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center">Loading challenges...</div>
          ) : challenges.length === 0 ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center bg-ink-2 rounded-[24px] border border-dashed border-line">No challenges found.</div>
          ) : (
            <div className="space-y-4">
              {challenges.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => setSelectedChallengeId(c.id!)}
                  className="card p-4 flex gap-4 items-center group cursor-pointer hover:border-emerald-500/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <Target size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-display text-lg text-bone truncate">{c.title}</h4>
                    <div className="flex items-center gap-3 text-xs font-mono text-bone-dim mt-1">
                      <span className="flex items-center gap-1"><Users size={12} /> {c.participantCount}</span>
                      <span className="uppercase text-emerald-500">{c.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Events List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <CalendarDays size={20} className="text-blue-500" />
              Events
            </h3>
          </div>
          
          {loadingEvents ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center bg-ink-2 rounded-[24px] border border-dashed border-line">No events found.</div>
          ) : (
            <div className="space-y-4">
              {events.map(e => (
                <div key={e.id} className="card p-4 flex gap-4 items-center group cursor-pointer hover:border-blue-500/50 transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] uppercase font-mono leading-none">{new Date(e.startTime.toMillis()).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-lg font-bold font-display leading-none">{new Date(e.startTime.toMillis()).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-display text-lg text-bone truncate">{e.title}</h4>
                    <div className="flex items-center gap-3 text-xs font-mono text-bone-dim mt-1">
                      <span className="truncate">{e.location?.name || 'Virtual'}</span>
                      <span className="uppercase text-blue-500">{e.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <AnimatePresence>
        {selectedChallengeId && (
          <ChallengeDetailSheet 
            challengeId={selectedChallengeId} 
            onClose={() => setSelectedChallengeId(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
