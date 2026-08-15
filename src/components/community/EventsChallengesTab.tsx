import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllCommunityChallenges, getAllCommunityEvents, deleteChallenge, deleteSimpleEvent } from '@/services/community';
import { Target, CalendarDays, Users, Flame, Edit3, Trash2, Trophy, Sparkles, Shield, MapPin } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChallengeDetailSheet } from './ChallengeDetailSheet';
import { EventDetailSheet } from './EventDetailSheet';
import { EditChallengeSheet } from './EditChallengeSheet';
import { EditEventSheet } from './EditEventSheet';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { ChallengeV2, SimpleEvent } from '@/types';

function getCountdownLabel(startMs: number, endMs: number) {
  const now = Date.now();
  if (now < startMs) {
    const diff = startMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return {
      type: 'upcoming' as const,
      text: days > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${hours}h ${mins}m`,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    };
  } else if (endMs && now <= endMs) {
    const diff = endMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return {
      type: 'ongoing' as const,
      text: days > 0 ? `Ends in ${days}d ${hours}h` : `Ends in ${hours}h ${mins}m`,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    };
  }
  return {
    type: 'ended' as const,
    text: 'Concluded',
    color: 'badge-prize px-2.5 py-0.5 rounded-full font-black shadow-sm'
  };
}

export function EventsChallengesTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'concluded'>('all');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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
        queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
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
        queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
        queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
        queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
        showToast('Event deleted');
      }
    }
  });

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['allCommunityChallenges'],
    queryFn: () => getAllCommunityChallenges(30)
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['allCommunityEvents'],
    queryFn: () => getAllCommunityEvents(30)
  });

  const filteredChallenges = challenges.filter(c => {
    const now = Date.now();
    const startMs = c.startDate?.toMillis ? c.startDate.toMillis() : 0;
    const endMs = c.endDate?.toMillis ? c.endDate.toMillis() : 0;
    if (filter === 'upcoming') return now < startMs;
    if (filter === 'active') return now >= startMs && (endMs ? now <= endMs : true);
    if (filter === 'concluded') return endMs ? now > endMs : false;
    return true;
  });

  const filteredEvents = events.filter(e => {
    const now = Date.now();
    const startMs = e.startTime?.toMillis ? e.startTime.toMillis() : 0;
    const endMs = e.endTime?.toMillis ? e.endTime.toMillis() : 0;
    if (filter === 'upcoming') return now < startMs;
    if (filter === 'active') return now >= startMs && (endMs ? now <= endMs : true);
    if (filter === 'concluded') return endMs ? now > endMs : false;
    return true;
  });

  // Featured challenge must never be a concluded challenge, and hidden in concluded tab
  const featured = filter === 'concluded' ? null : challenges.find(c => {
    const endMs = c.endDate?.toMillis ? c.endDate.toMillis() : 0;
    return !endMs || Date.now() <= endMs;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['all', 'active', 'upcoming', 'concluded'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-mono capitalize transition-colors whitespace-nowrap ${
              filter === f ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3'
            }`}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Featured Section */}
      {featured && (
        <div 
          onClick={() => setSelectedChallengeId(featured.id!)}
          className="relative overflow-hidden rounded-[32px] bg-ink-2 border border-line p-6 sm:p-8 cursor-pointer hover:border-sienna/50 transition-all shadow-xl group"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <Target size={140} />
          </div>
          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-sienna/20 text-sienna px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border border-sienna/30">
                  <Flame size={14} /> Featured Challenge
                </span>
                {featured.visibility === 'clan_only' && (
                  <span className="inline-flex items-center gap-1 bg-ink text-sienna px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border border-sienna/30">
                    <Shield size={11} /> {featured.clanName || 'Clan Only'}
                  </span>
                )}
              </div>

              {(isAdmin || user?.uid === featured.createdBy) && (
                <div className="flex items-center gap-2 z-20" onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={() => setEditingChallenge(featured)}
                    className="p-1.5 rounded-lg bg-ink/60 hover:bg-ink text-bone-dim hover:text-bone transition-colors"
                    title="Edit Challenge"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button 
                    onClick={() => deleteChallengeMutation.mutate(featured.id!)}
                    className="p-1.5 rounded-lg bg-ink/60 hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                    title="Delete Challenge"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            <h2 className="font-display text-3xl sm:text-4xl text-bone mb-2">{featured.title}</h2>
            <p className="text-bone-dim max-w-xl mb-4 line-clamp-2 text-sm leading-relaxed">
              {featured.description || `Join ${featured.participantCount || 0} athletes in completing this challenge. Push your limits and climb the leaderboard.`}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono mb-6">
              {(() => {
                const s = featured.startDate?.toMillis ? featured.startDate.toMillis() : 0;
                const e = featured.endDate?.toMillis ? featured.endDate.toMillis() : 0;
                const cd = getCountdownLabel(s, e);
                return (
                  <span className={`px-3 py-1 rounded-full font-bold border flex items-center gap-1.5 ${cd.color}`}>
                    <Sparkles size={12} /> {cd.text}
                  </span>
                );
              })()}

              <span className="text-bone-dim flex items-center gap-1">
                <Users size={13} className="text-emerald-400" /> {featured.participantCount} Participants
              </span>

              {featured.prize && (
                <span className="badge-prize font-bold flex items-center gap-1.5 px-3 py-1 rounded-full">
                  <Trophy size={13} className="shrink-0" /> {featured.prize}
                </span>
              )}
            </div>
            
            <button className="btn-primary px-7 py-2.5 font-bold shadow-[0_0_20px_rgba(205,111,72,0.3)]">
              View Challenge & Details
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Challenges List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <Target size={20} className="text-emerald-500" />
              Challenges ({filteredChallenges.length})
            </h3>
          </div>
          
          {loadingChallenges ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center">Loading challenges...</div>
          ) : filteredChallenges.length === 0 ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center bg-ink-2 rounded-[24px] border border-dashed border-line">No challenges found.</div>
          ) : (
            <div className="space-y-3">
              {filteredChallenges.map(c => {
                const s = c.startDate?.toMillis ? c.startDate.toMillis() : 0;
                const e = c.endDate?.toMillis ? c.endDate.toMillis() : 0;
                const cd = getCountdownLabel(s, e);

                return (
                  <div 
                    key={c.id} 
                    onClick={() => setSelectedChallengeId(c.id!)}
                    className="card p-4 flex flex-col gap-2 group cursor-pointer hover:border-emerald-500/50 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <Target size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 min-w-0">
                          <h4 className="font-display text-lg text-bone truncate">{c.title}</h4>
                          {c.visibility === 'clan_only' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase bg-sienna/20 text-sienna px-1.5 py-0.5 rounded border border-sienna/30 shrink-0">
                              <Shield size={9} /> Clan
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-bone-dim line-clamp-1 mb-1.5">{c.description}</p>
                        
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-bone-dim">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cd.color}`}>
                            {cd.text}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users size={11} /> {c.participantCount}
                          </span>
                          <span>• Goal: {c.target} {c.unit}</span>
                        </div>
                      </div>

                      {(isAdmin || user?.uid === c.createdBy) && (
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={() => setEditingChallenge(c)}
                            className="p-1.5 rounded-lg hover:bg-ink-3 text-bone-dim hover:text-bone transition-colors"
                            title="Edit Challenge"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={() => deleteChallengeMutation.mutate(c.id!)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                            title="Delete Challenge"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {c.topWinner && (
                      <div className="mt-1 p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/50 flex items-center justify-between gap-2 shadow-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                            🥇
                          </div>
                          <div className="min-w-0 truncate">
                            <span className="text-[10px] font-mono uppercase text-amber-900 dark:text-amber-400 font-black mr-1">Champion:</span>
                            <span className="text-xs font-bold text-foreground truncate">{c.topWinner.userName}</span>
                          </div>
                        </div>
                        {c.topWinner.customResult && (
                          <span className="text-[10px] font-mono text-foreground font-bold shrink-0">{c.topWinner.customResult}</span>
                        )}
                      </div>
                    )}

                    {c.prize && (
                      <div className="badge-prize inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold truncate">
                        <Trophy size={11} className="shrink-0" />
                        <span className="truncate">{c.prize}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Events List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <CalendarDays size={20} className="text-blue-500" />
              Events ({filteredEvents.length})
            </h3>
          </div>
          
          {loadingEvents ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center">Loading events...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-bone-dim text-sm font-mono py-8 text-center bg-ink-2 rounded-[24px] border border-dashed border-line">No events found.</div>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map(e => {
                const s = e.startTime?.toMillis ? e.startTime.toMillis() : 0;
                const end = e.endTime?.toMillis ? e.endTime.toMillis() : 0;
                const cd = getCountdownLabel(s, end);

                return (
                  <div 
                    key={e.id} 
                    onClick={() => setSelectedEventId(e.id!)}
                    className="card p-4 flex flex-col gap-2 group cursor-pointer hover:border-blue-500/50 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] uppercase font-mono leading-none">{new Date(s).toLocaleString('default', { month: 'short' })}</span>
                        <span className="text-lg font-bold font-display leading-none">{new Date(s).getDate()}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 min-w-0">
                          <h4 className="font-display text-lg text-bone truncate">{e.title}</h4>
                          {e.visibility === 'clan_only' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase bg-sienna/20 text-sienna px-1.5 py-0.5 rounded border border-sienna/30 shrink-0">
                              <Shield size={9} /> Clan
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-bone-dim line-clamp-1 mb-1.5">{e.description}</p>
                        
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-bone-dim">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${cd.color}`}>
                            {cd.text}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin size={11} className="text-rose-400" /> {e.location?.name || 'Virtual'}
                          </span>
                        </div>
                      </div>

                      {(isAdmin || user?.uid === e.createdBy) && (
                        <div className="flex items-center gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
                          <button 
                            onClick={() => setEditingEvent(e)}
                            className="p-1.5 rounded-lg hover:bg-ink-3 text-bone-dim hover:text-bone transition-colors"
                            title="Edit Event"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={() => deleteEventMutation.mutate(e.id!)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                            title="Delete Event"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {e.topWinner && (
                      <div className="mt-1 p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/50 flex items-center justify-between gap-2 shadow-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                            🥇
                          </div>
                          <div className="min-w-0 truncate">
                            <span className="text-[10px] font-mono uppercase text-amber-900 dark:text-amber-400 font-black mr-1">1st Place:</span>
                            <span className="text-xs font-bold text-foreground truncate">{e.topWinner.userName}</span>
                          </div>
                        </div>
                        {e.topWinner.customResult && (
                          <span className="text-[10px] font-mono text-amber-800 dark:text-amber-300 font-bold shrink-0">{e.topWinner.customResult}</span>
                        )}
                      </div>
                    )}

                    {e.prize && (
                      <div className="badge-prize inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold truncate">
                        <Trophy size={11} className="shrink-0" />
                        <span className="truncate">{e.prize}</span>
                      </div>
                    )}
                  </div>
                );
              })}
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

      <AnimatePresence>
        {selectedEventId && (
          <EventDetailSheet
            eventId={selectedEventId}
            onClose={() => setSelectedEventId(null)}
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
