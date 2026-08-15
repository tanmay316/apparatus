import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllCommunityChallenges, deleteChallenge } from '@/services/community';
import { Target, Users, Flame, Edit3, Trash2, Trophy, Sparkles, Shield, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChallengeDetailSheet } from './ChallengeDetailSheet';
import { EditChallengeSheet } from './EditChallengeSheet';
import { formatChallengeGoal } from './UpcomingReminderWidget';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { ChallengeV2 } from '@/types';

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
      color: 'badge-countdown-upcoming'
    };
  } else if (endMs && now <= endMs) {
    const diff = endMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return {
      type: 'ongoing' as const,
      text: days > 0 ? `Ends in ${days}d ${hours}h` : `Ends in ${hours}h ${mins}m`,
      color: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    };
  }
  return {
    type: 'ended' as const,
    text: 'Concluded',
    color: 'text-amber-950 dark:text-amber-100 bg-amber-500/25 border-2 border-amber-500/60 font-black shadow-sm'
  };
}

export function ChallengesTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'concluded'>('all');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);

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

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['allCommunityChallenges'],
    queryFn: () => getAllCommunityChallenges(50)
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

  // Featured challenge must never be a concluded challenge, and hidden in concluded tab
  const featured = filter === 'concluded' ? null : filteredChallenges.find(c => {
    const endMs = c.endDate?.toMillis ? c.endDate.toMillis() : 0;
    return !endMs || Date.now() <= endMs;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(['all', 'active', 'upcoming', 'concluded'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors whitespace-nowrap ${
              filter === f ? 'bg-ink text-bone font-bold shadow-sm border border-line/40' : 'bg-ink-2 text-bone-dim hover:bg-ink-3'
            }`}
          >
            {f === 'all' ? 'All Challenges' : f}
          </button>
        ))}
      </div>

      {/* Featured Challenge Banner (if available) */}
      {featured && (
        <div 
          onClick={() => setSelectedChallengeId(featured.id!)}
          className="relative overflow-hidden rounded-[32px] bg-ink-2 border border-line p-6 sm:p-8 cursor-pointer hover:border-emerald-500/50 transition-all shadow-xl group"
        >
          {featured.coverUrl && (
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity">
              <img src={featured.coverUrl} alt={featured.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
            </div>
          )}

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border border-emerald-500/30">
                  <Flame size={14} /> Featured Challenge
                </span>
                {featured.visibility === 'clan_only' && (
                  <span className="inline-flex items-center gap-1 bg-ink text-sienna px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border border-sienna/30">
                    <Shield size={11} /> Clan Only
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
            <p className="text-bone-dim max-w-2xl mb-4 line-clamp-2 text-sm leading-relaxed">
              {featured.description || 'Push your limits and climb the leaderboard in this community challenge.'}
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

              <span className="text-bone-dim flex items-center gap-1.5">
                <Users size={13} className="text-emerald-400" /> {featured.participantCount || 0} Participants
              </span>

              {formatChallengeGoal(featured.target, featured.unit, featured.metric) && (
                <span className="text-bone-dim flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-emerald-400" /> Goal: {formatChallengeGoal(featured.target, featured.unit, featured.metric)}
                </span>
              )}

              {featured.prize && (
                <span className="badge-prize font-bold flex items-center gap-1.5 px-3 py-1 rounded-full">
                  <Trophy size={13} className="shrink-0" /> {featured.prize}
                </span>
              )}
            </div>
            
            <button className="btn-primary px-7 py-2.5 font-bold shadow-[0_0_20px_rgba(205,111,72,0.3)]">
              Join & View Leaderboard
            </button>
          </div>
        </div>
      )}

      {/* Grid of Challenges */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-bone flex items-center gap-2">
            <Target size={20} className="text-emerald-500" />
            Fitness Challenges ({filteredChallenges.length})
          </h3>
        </div>

        {loadingChallenges ? (
          <div className="text-bone-dim text-sm font-mono py-12 text-center">Loading challenges...</div>
        ) : filteredChallenges.length === 0 ? (
          <div className="text-bone-dim text-sm font-mono py-12 text-center bg-ink-2 rounded-[28px] border border-dashed border-line">
            No challenges found in this category.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChallenges.map(c => {
              const s = c.startDate?.toMillis ? c.startDate.toMillis() : 0;
              const e = c.endDate?.toMillis ? c.endDate.toMillis() : 0;
              const cd = getCountdownLabel(s, e);
              const goalText = formatChallengeGoal(c.target, c.unit, c.metric);

              return (
                <div 
                  key={c.id} 
                  onClick={() => setSelectedChallengeId(c.id!)}
                  className="card p-5 flex flex-col justify-between group cursor-pointer hover:border-emerald-500/50 transition-all space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20">
                          <Target size={24} />
                        </div>
                        <div>
                          <h4 className="font-display text-lg text-bone group-hover:text-emerald-400 transition-colors line-clamp-1">{c.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-bone-dim uppercase">{c.metric}</span>
                            {c.visibility === 'clan_only' && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase bg-sienna/20 text-sienna px-1.5 py-0.5 rounded border border-sienna/30">
                                <Shield size={9} /> Clan
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(isAdmin || user?.uid === c.createdBy) && (
                        <div className="flex items-center gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
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

                    <p className="text-xs text-bone-dim line-clamp-2 leading-relaxed">{c.description}</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-line/20">
                    {c.topWinner && (
                      <div className="mt-1 p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 flex items-center justify-between gap-2 shadow-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                            🥇
                          </div>
                          <div className="min-w-0 truncate">
                            <span className="text-[10px] font-mono uppercase text-amber-700 dark:text-amber-500 font-black mr-1">Champion:</span>
                            <span className="text-xs font-bold text-foreground truncate">{c.topWinner.userName}</span>
                          </div>
                        </div>
                        {c.topWinner.customResult && (
                          <span className="text-[10px] font-mono text-foreground font-bold shrink-0">{c.topWinner.customResult}</span>
                        )}
                      </div>
                    )}

                    {c.prize && (
                      <div className="pt-2 border-t border-line/20 flex items-center gap-1.5 text-xs font-mono font-bold text-foreground">
                        <Trophy size={12} className="text-amber-500 shrink-0" />
                        <span className="truncate">{c.prize}</span>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-bone-dim">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cd.color}`}>
                        {cd.text}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={11} className="text-emerald-400" /> {c.participantCount || 0} Athletes
                      </span>
                    </div>

                    {goalText && (
                      <div className="text-[11px] font-mono text-bone-dim">
                        Goal: <span className="font-bold text-bone">{goalText}</span>
                      </div>
                    )}

                    {c.prize && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold text-amber-950 dark:text-amber-200 bg-amber-500/20 border border-amber-400/40">
                        <Trophy size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="truncate">{c.prize}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
    </div>
  );
}
