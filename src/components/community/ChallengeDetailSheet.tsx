import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Users, TrendingUp, Edit3, Trash2, Trophy, Sparkles, Shield, Crown, Award, Check, UserCheck, ChevronRight, SlidersHorizontal, Plus, ArrowUpDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  joinChallenge, leaveChallenge, getChallengeLeaderboard, deleteChallenge, 
  updateChallengeParticipantScore, awardChallengeTop3Badges, getUserClans, 
  isUserJoinedChallenge, getChallengeParticipants, updateLeaderboardRanks 
} from '@/services/community';
import { ChallengeV2, ChallengeParticipant } from '@/types';
import { useUIStore } from '@/stores/ui-store';
import { EditChallengeSheet } from './EditChallengeSheet';
import { LeaderboardBadgeChip } from './CommunityBadgeCard';
import { useNavigate } from 'react-router-dom';

export function ChallengeDetailSheet({ challengeId, onClose }: { challengeId: string; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);
  const [editingScoreParticipant, setEditingScoreParticipant] = useState<ChallengeParticipant | null>(null);
  const [newScoreVal, setNewScoreVal] = useState<string>('');

  // Modals & States
  const [showAthletesModal, setShowAthletesModal] = useState(false);
  const [showRankModal, setShowRankModal] = useState(false);
  const [isJoinedState, setIsJoinedState] = useState<boolean | null>(null);
  const [statusPopup, setStatusPopup] = useState<{ isOpen: boolean; type: 'joined' | 'left' } | null>(null);

  // Form state for updating leaderboard ranks
  const [rankEdits, setRankEdits] = useState<{ [userId: string]: { rank: number; progress: number; badgeAwarded?: 1 | 2 | 3 } }>({});

  useEffect(() => {
    document.body.classList.add('community-create-open');
    return () => document.body.classList.remove('community-create-open');
  }, []);

  const { data: challenge, isLoading: loadingChallenge } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'challenges_v2', challengeId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as ChallengeV2;
    }
  });

  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useQuery({
    queryKey: ['challengeLeaderboard', challengeId],
    queryFn: () => getChallengeLeaderboard(challengeId)
  });

  const { data: isJoinedDirect } = useQuery({
    queryKey: ['isJoinedChallenge', challengeId, user?.uid],
    queryFn: () => (user ? isUserJoinedChallenge(challengeId, user.uid) : false),
    enabled: !!user
  });

  const { data: userClans = [] } = useQuery({
    queryKey: ['userClans', user?.uid],
    queryFn: () => (user ? getUserClans(user.uid) : []),
    enabled: !!user
  });

  const myParticipant = leaderboard.find(p => p.userId === user?.uid);
  const isJoined = isJoinedState !== null ? isJoinedState : (isJoinedDirect ?? !!myParticipant);
  const isClanMember = !challenge?.clanId || userClans.some(c => c.id === challenge.clanId) || isAdmin;
  const isCreatorOrAdmin = isAdmin || user?.uid === challenge?.createdBy;

  // Initialize rank edits when rank modal opens
  const openRankManager = () => {
    const initial: { [userId: string]: { rank: number; progress: number; badgeAwarded?: 1 | 2 | 3 } } = {};
    leaderboard.forEach((p, idx) => {
      initial[p.userId] = {
        rank: p.rank || (idx + 1),
        progress: p.progress || 0,
        badgeAwarded: p.badgeAwarded
      };
    });
    setRankEdits(initial);
    setShowRankModal(true);
  };

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (!isClanMember) throw new Error('You must be a member of this clan to participate');
      await joinChallenge(challengeId, user.uid, user.displayName || 'Unknown', user.photoURL || '');
    },
    onSuccess: () => {
      setIsJoinedState(true);
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['isJoinedChallenge', challengeId, user?.uid] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
      setStatusPopup({ isOpen: true, type: 'joined' });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to join challenge', 'error')
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await leaveChallenge(challengeId, user.uid);
    },
    onSuccess: () => {
      setIsJoinedState(false);
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['isJoinedChallenge', challengeId, user?.uid] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
      setStatusPopup({ isOpen: true, type: 'left' });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to leave challenge', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (confirm('Are you sure you want to delete this challenge?')) {
        await deleteChallenge(challengeId);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
        queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
        queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
        showToast('Challenge deleted');
        onClose();
      }
    }
  });

  const updateScoreMutation = useMutation({
    mutationFn: async () => {
      if (!editingScoreParticipant) return;
      const parsed = parseFloat(newScoreVal);
      if (isNaN(parsed) || parsed < 0) throw new Error('Enter a valid progress score');
      await updateChallengeParticipantScore(challengeId, editingScoreParticipant.userId, parsed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      showToast('Leaderboard score updated!', 'success');
      setEditingScoreParticipant(null);
      setNewScoreVal('');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update score', 'error')
  });

  const saveRanksMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(rankEdits).map(([userId, data]) => ({
        userId,
        rank: data.rank,
        progress: data.progress,
        badgeAwarded: data.badgeAwarded
      }));
      await updateLeaderboardRanks(challengeId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      showToast('Leaderboard ranks & scores saved!', 'success');
      setShowRankModal(false);
    },
    onError: (err: any) => showToast(err?.message || 'Failed to save ranks', 'error')
  });

  const awardBadgesMutation = useMutation({
    mutationFn: async () => {
      if (confirm('Award Top 3 Badges to current leaderboard leaders?')) {
        return await awardChallengeTop3Badges(challengeId);
      }
    },
    onSuccess: (res) => {
      if (res) {
        queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
        queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
        showToast('Top 3 Badges awarded to champions!', 'success');
      }
    },
    onError: (err: any) => showToast(err?.message || 'Failed to award badges', 'error')
  });

  if (!challenge) return null;

  const now = Date.now();
  const startTimeMs = challenge.startDate?.toMillis ? challenge.startDate.toMillis() : 0;
  const endTimeMs = challenge.endDate?.toMillis ? challenge.endDate.toMillis() : 0;

  let countdownLabel = '';
  let countdownType: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';

  if (now < startTimeMs) {
    countdownType = 'upcoming';
    const diff = startTimeMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    countdownLabel = days > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${hours}h ${mins}m`;
  } else if (endTimeMs && now <= endTimeMs) {
    countdownType = 'ongoing';
    const diff = endTimeMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    countdownLabel = days > 0 ? `Ends in ${days}d ${hours}h` : `Ends in ${hours}h ${mins}m`;
  } else {
    countdownType = 'ended';
    countdownLabel = 'Challenge Concluded';
  }

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-bg border-t border-line rounded-t-[32px] overflow-hidden h-[95dvh] flex flex-col shadow-2xl"
      >
        <div className="relative h-48 sm:h-64 bg-ink-3 shrink-0">
          {challenge.coverUrl ? (
            <img src={challenge.coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-emerald-400/40 bg-emerald-950/20"><Target size={64} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-ink/60 backdrop-blur-md rounded-full text-bone hover:bg-ink-2 transition-colors z-20">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 relative -mt-16 shrink-0 pb-6 border-b border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-md backdrop-blur-sm border border-emerald-500/30 font-bold">
                {challenge.metric} Challenge
              </span>
              {challenge.visibility === 'clan_only' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase bg-sienna/20 text-sienna px-2.5 py-1 rounded-md backdrop-blur-sm border border-sienna/30 font-bold">
                  <Shield size={11} /> Clan Only
                </span>
              )}
              {challenge.badgesAwarded && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase bg-amber-400/20 text-amber-300 px-2 py-1 rounded-md border border-amber-400/30 font-bold">
                  <Award size={11} /> Badges Awarded
                </span>
              )}
            </div>

            {isCreatorOrAdmin && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setEditingChallenge(challenge)} 
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-2 text-bone text-xs font-mono hover:bg-ink-3 border border-line/40 transition-colors"
                >
                  <Edit3 size={13} /> Edit
                </button>
                <button 
                  onClick={() => deleteMutation.mutate()} 
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-mono hover:bg-red-500/30 border border-red-500/30 transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>

          <h1 className="font-display text-3xl sm:text-4xl text-bone mb-2">{challenge.title}</h1>
          <p className="text-bone-dim text-sm mb-4 leading-relaxed max-w-3xl whitespace-pre-wrap">{challenge.description}</p>
          
          {/* Timing & Interactive Athletes Pill */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono mb-4">
            <span
              className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                countdownType === 'ongoing'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : countdownType === 'upcoming'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-ink-3 text-bone-dim'
              }`}
            >
              <Sparkles size={13} /> {countdownLabel}
            </span>
            
            {/* Clickable Athletes Pill */}
            <button
              onClick={() => setShowAthletesModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-2 hover:bg-ink-3 border border-line text-bone font-bold transition-all group"
            >
              <Users size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" /> 
              <span>{challenge.participantCount} Athletes</span>
              <ChevronRight size={12} className="text-bone-dim group-hover:translate-x-0.5 transition-transform" />
            </button>

            <span className="flex items-center gap-1.5 text-bone-dim">
              <TrendingUp size={14} className="text-emerald-500" /> Goal: {challenge.target} {challenge.unit}
            </span>
          </div>

          {/* Prize / Reward Banner */}
          {challenge.prize && (
            <div className="p-3.5 mb-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-950/20 border border-amber-400/40 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                <Trophy size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold tracking-wider">Prizes & Rewards</div>
                <div className="text-sm font-bold text-bone truncate">{challenge.prize}</div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isClanMember ? (
              <button
                onClick={() => {
                  onClose();
                  if (challenge.clanId) navigate(`/clan/${challenge.clanId}`);
                }}
                className="btn-primary px-6 py-2.5 font-bold flex items-center gap-2"
              >
                <Shield size={16} /> Join Clan to Participate
              </button>
            ) : isJoined ? (
              <button 
                onClick={() => leaveMutation.mutate()} 
                disabled={leaveMutation.isPending} 
                className="btn-secondary px-6 py-2.5 font-bold text-red-400 border-red-500/30 hover:bg-red-500/10"
              >
                {leaveMutation.isPending ? 'Leaving...' : 'Leave Challenge'}
              </button>
            ) : (
              <button 
                onClick={() => joinMutation.mutate()} 
                disabled={joinMutation.isPending} 
                className="btn-primary px-8 py-2.5 text-base font-bold shadow-[0_0_20px_rgba(205,111,72,0.3)]"
              >
                {joinMutation.isPending ? 'Joining...' : 'Join Challenge'}
              </button>
            )}

            {/* Creator / Leader / Admin Controls */}
            {isCreatorOrAdmin && (
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <button
                  onClick={openRankManager}
                  className="px-4 py-2 rounded-xl bg-ink-2 hover:bg-ink-3 text-bone border border-line text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                >
                  <SlidersHorizontal size={14} className="text-emerald-400" /> Update Leaderboard
                </button>

                {leaderboard.length > 0 && !challenge.badgesAwarded && (
                  <button
                    onClick={() => awardBadgesMutation.mutate()}
                    disabled={awardBadgesMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Crown size={14} /> Award Badges
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-ink space-y-6">
          {isJoined && myParticipant && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono text-xs uppercase text-emerald-400 font-bold">Your Progress</h3>
                {myParticipant.badgeAwarded && (
                  <LeaderboardBadgeChip rank={myParticipant.badgeAwarded as 1 | 2 | 3} />
                )}
              </div>
              <div className="flex justify-between items-end mb-2">
                <span className="font-display text-2xl text-bone">{myParticipant.progress} <span className="text-base text-bone-dim">{challenge.unit}</span></span>
                <span className="font-mono text-xs text-bone-dim">Rank #{myParticipant.rank}</span>
              </div>
              <div className="w-full bg-ink-3 h-2.5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (myParticipant.progress / challenge.target) * 100)}%` }} />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xl text-bone flex items-center gap-2">
                <Trophy size={18} className="text-amber-400" /> Leaderboard Rankings
              </h3>
              <button
                onClick={() => setShowAthletesModal(true)}
                className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
              >
                View all {challenge.participantCount} athletes <ChevronRight size={12} />
              </button>
            </div>
            
            <div className="space-y-2">
              {loadingLeaderboard ? (
                <div className="text-center py-8 text-bone-dim font-mono text-sm">Loading leaderboard...</div>
              ) : leaderboard.length === 0 ? (
                <div className="p-8 text-center bg-ink-2/40 border border-dashed border-line rounded-3xl text-bone-dim text-sm font-mono leading-relaxed">
                  🏆 Leaderboard rankings will update as athletes log progress or when the challenge concludes.
                </div>
              ) : (
                leaderboard.map((p, idx) => {
                  const isTop3 = idx < 3;
                  const rankBadge = p.badgeAwarded || (isTop3 ? (idx + 1 as 1 | 2 | 3) : undefined);
                  return (
                    <div 
                      key={p.id || p.userId} 
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-colors ${
                        p.userId === user?.uid 
                          ? 'bg-ink-2 border-emerald-500/40 shadow-sm' 
                          : 'bg-ink-2/40 border-line/20'
                      }`}
                    >
                      <div className="w-8 text-center font-mono text-sm font-bold text-bone-dim shrink-0">
                        {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                      </div>

                      {p.userPhoto ? (
                        <img src={p.userPhoto} alt={p.userName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-ink-3 flex items-center justify-center text-bone font-bold shrink-0">
                          {p.userName?.charAt(0) || '?'}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-bone text-sm truncate">{p.userName}</span>
                          {p.userId === user?.uid && (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">You</span>
                          )}
                          {rankBadge && (
                            <LeaderboardBadgeChip rank={rankBadge} />
                          )}
                        </div>
                        <div className="text-xs font-mono text-bone-dim">
                          {p.progress} / {challenge.target} {challenge.unit}
                        </div>
                      </div>

                      {/* Admin / Creator quick score edit */}
                      {isCreatorOrAdmin && (
                        <button
                          onClick={() => {
                            setEditingScoreParticipant(p);
                            setNewScoreVal(p.progress.toString());
                          }}
                          className="p-1.5 rounded-lg bg-ink-3 hover:bg-ink-2 text-bone-dim hover:text-bone text-xs font-mono transition-colors"
                          title="Edit score"
                        >
                          <Edit3 size={13} />
                        </button>
                      )}

                      <div className="text-right shrink-0 font-mono text-sm font-bold text-bone">
                        {Math.round((p.progress / challenge.target) * 100)}%
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal: Single Score Quick Edit */}
        {editingScoreParticipant && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-bg border border-line rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-bone">Update Athlete Score</h3>
                <button onClick={() => setEditingScoreParticipant(null)} className="p-1 text-bone-dim hover:text-bone"><X size={16} /></button>
              </div>

              <div className="text-xs text-bone-dim font-mono">
                Updating score for <span className="text-bone font-bold">{editingScoreParticipant.userName}</span>
              </div>

              <div>
                <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Progress ({challenge.unit})</label>
                <input
                  type="number"
                  step="any"
                  value={newScoreVal}
                  onChange={e => setNewScoreVal(e.target.value)}
                  className="input-field w-full text-bone font-mono text-lg"
                  placeholder="0"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingScoreParticipant(null)}
                  className="btn-secondary flex-1 py-2.5 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => updateScoreMutation.mutate()}
                  disabled={updateScoreMutation.isPending}
                  className="btn-primary flex-1 py-2.5 text-xs font-mono font-bold"
                >
                  {updateScoreMutation.isPending ? 'Saving...' : 'Save Score'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Full Leaderboard & Rank Manager */}
        {showRankModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-bg border border-line rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-emerald-400" />
                  <h3 className="font-display text-xl text-bone">Leaderboard & Rank Manager</h3>
                </div>
                <button onClick={() => setShowRankModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <p className="text-xs text-bone-dim font-mono">
                Set exact ranks, progress scores, or badge assignments for participants.
              </p>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {leaderboard.map((p) => {
                  const curr = rankEdits[p.userId] || { rank: p.rank || 1, progress: p.progress || 0, badgeAwarded: p.badgeAwarded };
                  return (
                    <div key={p.userId} className="p-3.5 rounded-2xl bg-ink-2/60 border border-line/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-bone">{p.userName}</span>
                          {curr.badgeAwarded && <LeaderboardBadgeChip rank={curr.badgeAwarded} />}
                        </div>
                        <span className="text-[10px] font-mono text-bone-dim">ID: {p.userId.slice(0, 6)}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono text-bone-dim uppercase">Rank #</label>
                          <input
                            type="number"
                            min="1"
                            value={curr.rank}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 1;
                              setRankEdits(prev => ({
                                ...prev,
                                [p.userId]: { ...prev[p.userId], rank: v }
                              }));
                            }}
                            className="input-field w-full text-xs font-mono text-bone py-1.5"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-bone-dim uppercase">Score ({challenge.unit})</label>
                          <input
                            type="number"
                            step="any"
                            value={curr.progress}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setRankEdits(prev => ({
                                ...prev,
                                [p.userId]: { ...prev[p.userId], progress: v }
                              }));
                            }}
                            className="input-field w-full text-xs font-mono text-bone py-1.5"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-bone-dim uppercase">Badge</label>
                          <select
                            value={curr.badgeAwarded || ''}
                            onChange={(e) => {
                              const v = e.target.value ? (parseInt(e.target.value) as 1 | 2 | 3) : undefined;
                              setRankEdits(prev => ({
                                ...prev,
                                [p.userId]: { ...prev[p.userId], badgeAwarded: v }
                              }));
                            }}
                            className="input-field w-full text-xs font-mono text-bone py-1.5 bg-ink-3"
                          >
                            <option value="">None</option>
                            <option value="1">🥇 Gold</option>
                            <option value="2">🥈 Silver</option>
                            <option value="3">🥉 Bronze</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2 border-t border-line/20">
                <button
                  type="button"
                  onClick={() => setShowRankModal(false)}
                  className="btn-secondary flex-1 py-3 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveRanksMutation.mutate()}
                  disabled={saveRanksMutation.isPending}
                  className="btn-primary flex-1 py-3 text-xs font-mono font-bold"
                >
                  {saveRanksMutation.isPending ? 'Saving...' : 'Save All Ranks'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: All Joined Athletes */}
        {showAthletesModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-bg border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-emerald-400" />
                  <h3 className="font-display text-xl text-bone">Enrolled Athletes ({leaderboard.length})</h3>
                </div>
                <button onClick={() => setShowAthletesModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {leaderboard.length === 0 ? (
                  <div className="text-center py-8 text-bone-dim font-mono text-sm">No athletes enrolled yet.</div>
                ) : (
                  leaderboard.map((p, idx) => (
                    <div key={p.userId || idx} className="flex items-center justify-between p-3 rounded-2xl bg-ink-2/60 border border-line/20">
                      <div className="flex items-center gap-3">
                        {p.userPhoto ? (
                          <img src={p.userPhoto} alt={p.userName} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-ink-3 flex items-center justify-center font-bold text-bone">
                            {p.userName?.charAt(0) || '?'}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-sm text-bone flex items-center gap-1.5">
                            {p.userName}
                            {p.userId === user?.uid && <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">You</span>}
                          </div>
                          <div className="text-xs font-mono text-bone-dim">Rank #{p.rank} • {p.progress} {challenge.unit}</div>
                        </div>
                      </div>
                      {p.badgeAwarded && <LeaderboardBadgeChip rank={p.badgeAwarded} />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Joined / Left Celebration Popup Feedback */}
        {statusPopup && statusPopup.isOpen && (
          <div className="fixed inset-0 z-[800] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-bg border border-emerald-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                {statusPopup.type === 'joined' ? <Check size={28} /> : <UserCheck size={28} />}
              </div>

              <div>
                <h3 className="font-display text-2xl text-bone">
                  {statusPopup.type === 'joined' ? "You're In! 🎉" : "Left Challenge"}
                </h3>
                <p className="text-xs text-bone-dim mt-1 font-mono">
                  {statusPopup.type === 'joined' 
                    ? `You are now competing in "${challenge.title}". Log workouts and track your progress!` 
                    : `You have successfully left "${challenge.title}".`}
                </p>
              </div>

              <button
                onClick={() => setStatusPopup(null)}
                className="btn-primary w-full py-3 font-mono font-bold text-sm"
              >
                Awesome
              </button>
            </motion.div>
          </div>
        )}

        {/* Edit Challenge Modal */}
        {editingChallenge && (
          <EditChallengeSheet
            challenge={editingChallenge}
            isOpen={!!editingChallenge}
            onClose={() => setEditingChallenge(null)}
          />
        )}
      </motion.div>
    </div>,
    document.body
  );
}
