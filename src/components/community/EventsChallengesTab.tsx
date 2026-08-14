import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPublicChallenges, getPublicEvents, deleteChallenge, deleteSimpleEvent } from '@/services/community';
import { Target, CalendarDays, Users, Flame, Edit3, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChallengeDetailSheet } from './ChallengeDetailSheet';
import { EditChallengeSheet } from './EditChallengeSheet';
import { EditEventSheet } from './EditEventSheet';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { ChallengeV2, SimpleEvent } from '@/types';

export function EventsChallengesTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming'>('all');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);
  const [editingEvent, setEditingEvent] = useState<SimpleEvent | null>(null);

  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const deleteChallengeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (confirm('Are you sure you want to delete this challenge?')) {
        await deleteChallenge(id);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
        queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
        showToast('Challenge deleted');
      }
    }
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      if (confirm('Are you sure you want to delete this event?')) {
        await deleteSimpleEvent(id);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
        queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
        showToast('Event deleted');
      }
    }
  });

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
      {challenges.length > 0 && (
        <div 
          onClick={() => setSelectedChallengeId(challenges[0].id!)}
          className="relative overflow-hidden rounded-[32px] bg-ink-2 border border-line p-6 sm:p-8 cursor-pointer hover:border-sienna/50 transition-colors"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Target size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="inline-flex items-center gap-2 bg-sienna/20 text-sienna px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider">
                <Flame size={14} /> Featured Challenge
              </div>
              {(isAdmin || user?.uid === challenges[0].createdBy) && (
                <div className="flex items-center gap-2 z-20" onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={() => setEditingChallenge(challenges[0])}
                    className="p-1.5 rounded-lg bg-ink/60 hover:bg-ink text-bone-dim hover:text-bone transition-colors"
                    title="Edit Challenge"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button 
                    onClick={() => deleteChallengeMutation.mutate(challenges[0].id!)}
                    className="p-1.5 rounded-lg bg-ink/60 hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                    title="Delete Challenge"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
            <h2 className="font-display text-3xl text-bone mb-2">{challenges[0].title}</h2>
            <p className="text-bone-dim max-w-md mb-6">{challenges[0].description || `Join ${challenges[0].participantCount || 0} athletes in completing this challenge. Push your limits and climb the leaderboard.`}</p>
            
            <button className="btn-primary px-6 py-2">View Challenge</button>
          </div>
        </div>
      )}

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
                  {(isAdmin || user?.uid === c.createdBy) && (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => setEditingChallenge(c)}
                        className="p-2 rounded-lg hover:bg-ink-3 text-bone-dim hover:text-bone transition-colors"
                        title="Edit Challenge"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        onClick={() => deleteChallengeMutation.mutate(c.id!)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                        title="Delete Challenge"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
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
                  {(isAdmin || user?.uid === e.createdBy) && (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => setEditingEvent(e)}
                        className="p-2 rounded-lg hover:bg-ink-3 text-bone-dim hover:text-bone transition-colors"
                        title="Edit Event"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        onClick={() => deleteEventMutation.mutate(e.id!)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                        title="Delete Event"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
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

      {editingChallenge && (
        <EditChallengeSheet 
          challenge={editingChallenge} 
          isOpen={!!editingChallenge} 
          onClose={() => setEditingChallenge(null)} 
        />
      )}

      {editingEvent && (
        <EditEventSheet 
          event={editingEvent} 
          isOpen={!!editingEvent} 
          onClose={() => setEditingEvent(null)} 
        />
      )}
    </div>
  );
}
