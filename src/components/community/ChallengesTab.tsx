import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllCommunityChallenges, deleteChallenge } from '@/services/community';
import { Target, Users, Edit3, Trash2, Trophy, Shield, TrendingUp, CalendarDays, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChallengeDetailSheet } from './ChallengeDetailSheet';
import { PersonalChallengeDetailSheet } from './PersonalChallengeDetailSheet';
import { EditChallengeSheet } from './EditChallengeSheet';
import { formatChallengeGoal } from './UpcomingReminderWidget';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { ChallengeV2 } from '@/types';
import { CreateChallengeSheet } from './CreateChallengeSheet';
import { CreatePersonalChallengeSheet } from './CreatePersonalChallengeSheet';
import {
  CardAction, CardSkeleton, ChampionRow, EmptyState, Eyebrow, FilterChips, MetaItem, StatusPill,
  formatDateRange, getScheduleStatus, isScheduleActive, isScheduleEnded, isScheduleUpcoming, toMillis,
} from './ui';

export function ChallengesTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'concluded' | 'personal'>('all');
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
  const [createPersonalChallengeOpen, setCreatePersonalChallengeOpen] = useState(false);

  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();

  const deleteChallengeMutation = useMutation({
    mutationFn: async (id: string) => {
      const ok = await confirm({
        title: 'Delete Challenge',
        message: 'Are you sure you want to delete this challenge?',
        confirmText: 'Delete',
        type: 'danger',
        icon: 'trash',
      });
      if (ok) {
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
    },
    onError: (err: any) => {
      showToast(err?.message || 'Could not delete challenge', 'error');
    }
  });

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['allCommunityChallenges'],
    queryFn: () => getAllCommunityChallenges(50)
  });

  const filteredChallenges = challenges.filter(c => {
    const startMs = toMillis(c.startDate);
    const endMs = toMillis(c.endDate);
    if (filter === 'upcoming') return isScheduleUpcoming(startMs);
    if (filter === 'active') return isScheduleActive(startMs, endMs, true);
    if (filter === 'concluded') return isScheduleEnded(startMs, endMs, true);
    if (filter === 'personal') return c.challengeType === 'personal';
    return true;
  });

  // Featured challenge must never be a concluded challenge, and hidden in concluded tab
  const featured = filter === 'concluded' ? null : filteredChallenges.find(c =>
    !isScheduleEnded(toMillis(c.startDate), toMillis(c.endDate), true)
  );

  const canManage = (c: ChallengeV2) => isAdmin || user?.uid === c.createdBy;
  const renderManage = (c: ChallengeV2, onMedia = false) => canManage(c) ? (
    <div className="flex items-center gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
      <CardAction icon={Edit3} label="Edit challenge" onMedia={onMedia} onClick={() => setEditingChallenge(c)} />
      <CardAction icon={Trash2} label="Delete challenge" onMedia={onMedia} danger onClick={() => deleteChallengeMutation.mutate(c.id!)} />
    </div>
  ) : null;

  const open = (id?: string) => id && setSelectedChallengeId(id);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'concluded', label: 'Concluded' },
          { value: 'personal', label: 'Personal' },
        ]}
      />

      {/* Featured */}
      {featured && (() => {
        const s = toMillis(featured.startDate);
        const e = toMillis(featured.endDate);
        const goal = formatChallengeGoal(featured.target, featured.unit, featured.metric);
        return (
          <section aria-label="Featured challenge">
            <Eyebrow className="mb-2">Featured</Eyebrow>
            <div
              role="link"
              tabIndex={0}
              onClick={() => open(featured.id)}
              onKeyDown={ev => { if (ev.key === 'Enter') open(featured.id); }}
              className="cx-card cx-card-interactive overflow-hidden cursor-pointer group"
            >
              <div className="relative h-44 sm:h-56 bg-ink-3">
                <img
                  src={featured.coverUrl || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000&auto=format&fit=crop'}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                  <StatusPill status={getScheduleStatus(s, e, true)} onMedia />
                  {featured.visibility === 'clan_only' && (
                    <span className="cx-status cx-status-on-media"><Shield size={11} /> Clan only</span>
                  )}
                </div>
                <div className="absolute top-3 right-3">{renderManage(featured, true)}</div>
                <h2 className="absolute bottom-3 left-4 right-4 text-white text-xl sm:text-2xl font-semibold leading-tight line-clamp-2">
                  {featured.title}
                </h2>
              </div>

              <div className="p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="min-w-0 space-y-2.5">
                  <p className="text-sm text-bone-dim line-clamp-2 leading-relaxed">
                    {featured.description || 'Push your limits and climb the leaderboard in this community challenge.'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {goal && <MetaItem icon={TrendingUp}>Goal: {goal}</MetaItem>}
                    <MetaItem icon={Users}>{featured.participantCount || 0} participants</MetaItem>
                    <MetaItem icon={CalendarDays}>{formatDateRange(s, e)}</MetaItem>
                    {featured.prize && <MetaItem icon={Trophy}>{featured.prize}</MetaItem>}
                  </div>
                </div>
                <span className="cx-btn bg-sienna shrink-0 self-start sm:self-auto">
                  View leaderboard <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Grid of Challenges */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-semibold text-bone">
            {filter === 'all' ? 'All challenges' : filter === 'personal' ? 'Personal challenges' : `${filter[0].toUpperCase()}${filter.slice(1)} challenges`}
          </h3>
          <span className="text-xs text-bone-dim tabular-nums">{filteredChallenges.length} {filteredChallenges.length === 1 ? 'challenge' : 'challenges'}</span>
        </div>

        {loadingChallenges ? (
          <CardSkeleton />
        ) : filteredChallenges.length === 0 ? (
          <EmptyState
            compact
            icon={Target}
            title="No challenges here yet"
            description={filter === 'all' ? 'Community challenges will show up here once they are created.' : 'Nothing matches this filter right now.'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChallenges.map(c => {
              const s = toMillis(c.startDate);
              const e = toMillis(c.endDate);
              const goalText = formatChallengeGoal(c.target, c.unit, c.metric);

              return (
                <div
                  key={c.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => open(c.id)}
                  onKeyDown={ev => { if (ev.key === 'Enter') open(c.id); }}
                  className="cx-card cx-card-interactive p-4 flex flex-col gap-3 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-ink-2 border border-line text-sienna flex items-center justify-center shrink-0">
                      <Target size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[15px] font-semibold text-bone leading-snug line-clamp-2">{c.title}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bone-dim">
                        <span className="capitalize">{c.metric}</span>
                        {c.visibility === 'clan_only' && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1 text-sienna"><Shield size={11} /> Clan only</span>
                          </>
                        )}
                        {c.challengeType === 'personal' && (
                          <>
                            <span aria-hidden>·</span>
                            <span>Personal</span>
                          </>
                        )}
                      </div>
                    </div>
                    {renderManage(c)}
                  </div>

                  {c.description && (
                    <p className="text-sm text-bone-dim line-clamp-2 leading-relaxed">{c.description}</p>
                  )}

                  {c.topWinner && <ChampionRow name={c.topWinner.userName} result={c.topWinner.customResult} />}

                  {(goalText || c.prize) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {goalText && <MetaItem icon={TrendingUp}>Goal: <span className="font-semibold text-bone">{goalText}</span></MetaItem>}
                      {c.prize && <MetaItem icon={Trophy}>{c.prize}</MetaItem>}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-line flex items-center justify-between gap-2">
                    <StatusPill status={getScheduleStatus(s, e, true)} />
                    <MetaItem icon={Users}>{c.participantCount || 0} {c.participantCount === 1 ? 'athlete' : 'athletes'}</MetaItem>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AnimatePresence>
        {selectedChallengeId && (
          (() => {
            const sel = challenges.find(c => c.id === selectedChallengeId);
            if (sel?.challengeType === 'personal') {
              return (
                <PersonalChallengeDetailSheet
                  challengeId={selectedChallengeId}
                  onClose={() => setSelectedChallengeId(null)}
                />
              );
            }
            return (
              <ChallengeDetailSheet 
                challengeId={selectedChallengeId} 
                onClose={() => setSelectedChallengeId(null)} 
              />
            );
          })()
        )}
      </AnimatePresence>

      {editingChallenge && (
        <EditChallengeSheet 
          challenge={editingChallenge} 
          isOpen={!!editingChallenge} 
          onClose={() => setEditingChallenge(null)} 
        />
      )}

      {createChallengeOpen && (
        <CreateChallengeSheet onClose={() => setCreateChallengeOpen(false)} />
      )}
      
      {createPersonalChallengeOpen && (
        <CreatePersonalChallengeSheet onClose={() => setCreatePersonalChallengeOpen(false)} />
      )}
    </div>
  );
}
