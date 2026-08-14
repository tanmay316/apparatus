import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Target, Users, TrendingUp, Edit3, Trash2, Trophy, Sparkles, 
  Shield, Crown, Award, Check, UserCheck, ChevronRight, SlidersHorizontal, 
  ChevronUp, ChevronDown, Medal, Calendar
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { 
  joinChallenge, leaveChallenge, getChallengeLeaderboard, deleteChallenge, 
  awardChallengeTop3Badges, getUserClans, 
  isUserJoinedChallenge, getChallengeParticipants, updateLeaderboardRanks,
  isUserClanMember
} from '@/services/community';
import { ChallengeV2, ChallengeParticipant } from '@/types';
import { useUIStore } from '@/stores/ui-store';
import { EditChallengeSheet } from './EditChallengeSheet';
import { LeaderboardBadgeChip } from './CommunityBadgeCard';
import { formatChallengeGoal } from './UpcomingReminderWidget';
import { useNavigate } from 'react-router-dom';

export function ChallengeDetailSheet({ challengeId, onClose }: { challengeId: string; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);
  const [showAthletesModal, setShowAthletesModal] = useState(false);
  const [showRankModal, setShowRankModal] = useState(false);
  const [isJoinedState, setIsJoinedState] = useState<boolean | null>(null);
  const [statusPopup, setStatusPopup] = useState<{ isOpen: boolean; type: 'joined' | 'left' } | null>(null);

  // Form state for updating leaderboard ranks
  const [rankEdits, setRankEdits] = useState<{ [userId: string]: { rank: number; progress?: number; customResult: string; badgeAwarded?: 1 | 2 | 3 } }>({});

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

  // Fetch only officially ranked leaderboard participants
  const { data: leaderboard = [], isLoading: loadingLeaderboard } = useQuery({
    queryKey: ['challengeLeaderboard', challengeId],
    queryFn: () => getChallengeLeaderboard(challengeId)
  });

  // Fetch all enrolled participants
  const { data: allParticipants = [], isLoading: loadingAllParticipants } = useQuery({
    queryKey: ['challengeParticipants', challengeId],
    queryFn: () => getChallengeParticipants(challengeId)
  });

  // Automatically repair / sync participantCount in Firestore if desynced
  useEffect(() => {
    if (challenge && allParticipants && challenge.participantCount !== allParticipants.length) {
      updateDoc(doc(db, 'challenges_v2', challengeId), {
        participantCount: allParticipants.length
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
        queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
        queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
      }).catch(() => {});
    }
  }, [challenge, allParticipants, challengeId, queryClient]);

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

  const isClanOnly = challenge?.visibility === 'clan_only';
  const { data: isClanMemberDirect } = useQuery({
    queryKey: ['isMemberOfClan', challenge?.clanId, user?.uid],
    queryFn: () => (challenge?.clanId && user ? isUserClanMember(challenge.clanId, user.uid) : true),
    enabled: !!(challenge?.clanId && user && isClanOnly)
  });

  const isClanMember = !isClanOnly || (isClanMemberDirect ?? userClans.some(c => c.id === challenge?.clanId)) || isAdmin;
  const myParticipant = allParticipants.find(p => p.userId === user?.uid);
  const isJoined = isJoinedState !== null ? isJoinedState : (isJoinedDirect ?? !!myParticipant);
  const isCreatorOrAdmin = isAdmin || user?.uid === challenge?.createdBy;

  // Initialize rank manager
  const openRankManager = () => {
    const initial: { [userId: string]: { rank: number; progress?: number; customResult: string; badgeAwarded?: 1 | 2 | 3 } } = {};
    allParticipants.forEach((p, idx) => {
      initial[p.userId] = {
        rank: (p.rank && p.rank > 0 && p.rank < 9999) ? p.rank : (idx + 1),
        progress: p.progress || 0,
        customResult: p.customResult || (p.progress ? `${p.progress} ${challenge?.unit || ''}` : ''),
        badgeAwarded: p.badgeAwarded
      };
    });
    setRankEdits(initial);
    setShowRankModal(true);
  };

  const handleNavigateProfile = (userId: string) => {
    onClose();
    if (userId === user?.uid) {
      navigate('/profile');
    } else {
      navigate(`/profile/${userId}`);
    }
  };

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (!isClanMember) throw new Error('You must be a member of this clan to participate');
      await joinChallenge(challengeId, user.uid, user.displayName || 'Unknown', user.photoURL || '');
    },
    onSuccess: () => {
      setIsJoinedState(true);
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
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
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
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

  const saveRanksMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(rankEdits).map(([userId, data]) => ({
        userId,
        rank: data.rank,
        progress: data.progress,
        customResult: data.customResult,
        badgeAwarded: data.badgeAwarded
      }));
      await updateLeaderboardRanks(challengeId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
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
        queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
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

  const realParticipantCount = allParticipants.length;

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-ink border-t border-line rounded-t-[32px] overflow-hidden h-[95dvh] flex flex-col shadow-2xl text-bone"
      >
        {/* Top Header / Collapsible Section */}
        <div className="shrink-0 bg-ink border-b border-line">
          {/* Top Actions Bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-line/30 bg-ink-2/40">
            <div className="flex items-center gap-2">
              <span className="inline-flex text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded font-bold border border-emerald-500/30">
                {challenge.metric}
              </span>
              {challenge.visibility === 'clan_only' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase bg-sienna/20 text-sienna px-2.5 py-0.5 rounded font-bold border border-sienna/30">
                  <Shield size={11} /> Clan Only
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Collapse/Expand Toggle Button */}
              <button 
                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-ink-3 hover:bg-ink-2 text-xs font-mono text-bone transition-colors"
              >
                {isDetailsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{isDetailsExpanded ? 'Hide Details' : 'Show Details'}</span>
              </button>

              {isCreatorOrAdmin && (
                <>
                  <button 
                    onClick={() => setEditingChallenge(challenge)} 
                    className="p-1.5 rounded-lg bg-ink-3 hover:bg-ink-2 text-bone text-xs transition-colors"
                    title="Edit Challenge"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate()} 
                    className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
                    title="Delete Challenge"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}

              <button onClick={onClose} className="p-1.5 bg-ink-3 hover:bg-ink-2 rounded-full text-bone transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Full Expanded Header Details */}
          {isDetailsExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-6 space-y-4 max-h-[48vh] overflow-y-auto"
            >
              {/* Cover Image Banner (Natural Aspect, Uncropped) */}
              {challenge.coverUrl && (
                <div className="relative w-full max-h-72 rounded-2xl overflow-hidden border border-line/30 shrink-0 bg-ink-2/80 flex items-center justify-center">
                  <img 
                    src={challenge.coverUrl} 
                    alt={challenge.title} 
                    className="w-full max-h-72 object-contain rounded-2xl" 
                  />
                </div>
              )}

              <div>
                <h1 className="font-display text-2xl sm:text-3xl text-bone mb-1.5">{challenge.title}</h1>
                <p className="text-bone-dim text-xs sm:text-sm leading-relaxed max-w-3xl whitespace-pre-wrap">{challenge.description}</p>
              </div>

              {/* Timing & Interactive Athletes Pill */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span
                  className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                    countdownType === 'ongoing'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : countdownType === 'upcoming'
                      ? 'badge-countdown-upcoming'
                      : 'bg-ink-3 text-bone-dim'
                  }`}
                >
                  <Sparkles size={13} /> {countdownLabel}
                </span>
                
                {/* Clickable Athletes Pill with Real Count */}
                <button
                  onClick={() => setShowAthletesModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-2 hover:bg-ink-3 border border-line text-bone font-bold transition-all group"
                >
                  <Users size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" /> 
                  <span>{realParticipantCount} Enrolled Athletes</span>
                  <ChevronRight size={12} className="text-bone-dim group-hover:translate-x-0.5 transition-transform" />
                </button>

                {formatChallengeGoal(challenge.target, challenge.unit, challenge.metric) && (
                  <span className="flex items-center gap-1.5 text-bone-dim">
                    <TrendingUp size={14} className="text-emerald-500" /> Goal: {formatChallengeGoal(challenge.target, challenge.unit, challenge.metric)}
                  </span>
                )}
              </div>

              {/* Prize / Reward Banner */}
              {challenge.prize && (
                <div className="badge-prize p-3 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <Trophy size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono uppercase font-black tracking-wider opacity-80">Prizes & Rewards</div>
                    <div className="text-xs font-bold truncate">{challenge.prize}</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {!isClanMember ? (
                  <button
                    onClick={() => {
                      onClose();
                      if (challenge.clanId) navigate(`/clan/${challenge.clanId}`);
                    }}
                    className="btn-primary px-6 py-2.5 font-bold flex items-center gap-2 text-sm"
                  >
                    <Shield size={15} /> Join Clan to Participate
                  </button>
                ) : isJoined ? (
                  <button 
                    onClick={() => leaveMutation.mutate()} 
                    disabled={leaveMutation.isPending} 
                    className="btn-secondary px-6 py-2.5 font-bold text-red-400 border-red-500/30 hover:bg-red-500/10 text-sm"
                  >
                    {leaveMutation.isPending ? 'Leaving...' : 'Leave Challenge'}
                  </button>
                ) : (
                  <button 
                    onClick={() => joinMutation.mutate()} 
                    disabled={joinMutation.isPending} 
                    className="btn-primary px-8 py-2.5 text-sm font-bold shadow-[0_0_20px_rgba(205,111,72,0.3)]"
                  >
                    {joinMutation.isPending ? 'Joining...' : 'Join Challenge'}
                  </button>
                )}

                {/* Creator / Leader / Admin Controls */}
                {isCreatorOrAdmin && (
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <button
                      onClick={openRankManager}
                      className="px-3.5 py-2 rounded-xl bg-ink-2 hover:bg-ink-3 text-bone border border-line text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <SlidersHorizontal size={13} className="text-emerald-400" /> Update Leaderboard & Ranks
                    </button>

                    {leaderboard.length > 0 && !challenge.badgesAwarded && (
                      <button
                        onClick={() => awardBadgesMutation.mutate()}
                        disabled={awardBadgesMutation.isPending}
                        className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Crown size={13} /> Award Badges
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Compact View when Details are Collapsed */}
          {!isDetailsExpanded && (
            <div className="px-6 py-2.5 flex items-center justify-between bg-ink-2/20">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg text-bone truncate max-w-xs">{challenge.title}</h2>
                <button
                  onClick={() => setShowAthletesModal(true)}
                  className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Users size={12} /> {realParticipantCount} Athletes
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isCreatorOrAdmin && (
                  <button
                    onClick={openRankManager}
                    className="px-3 py-1 rounded-lg bg-ink-3 hover:bg-ink-2 text-bone border border-line text-xs font-mono font-bold flex items-center gap-1 transition-colors"
                  >
                    <SlidersHorizontal size={12} className="text-emerald-400" /> Update Leaderboard
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Leaderboard Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-ink space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <Trophy size={18} className="text-amber-400" /> Official Leaderboard
            </h3>
            {leaderboard.length > 0 && (
              <span className="text-xs font-mono text-bone-dim">{leaderboard.length} Ranked</span>
            )}
          </div>
          
          <div className="space-y-2.5">
            {loadingLeaderboard ? (
              <div className="text-center py-12 text-bone-dim font-mono text-sm">Loading official leaderboard...</div>
            ) : leaderboard.length === 0 ? (
              <div className="p-8 text-center bg-ink-2/40 border border-dashed border-line rounded-3xl space-y-2">
                <Medal size={36} className="mx-auto text-amber-400/40" />
                <div className="font-bold text-bone text-sm">Official Leaderboard Pending</div>
                <p className="text-bone-dim text-xs font-mono max-w-md mx-auto leading-relaxed">
                  Rankings and official scores will be updated by the challenge leader after evaluation. Check the enrolled athletes list above to see everyone participating!
                </p>
                {isCreatorOrAdmin && (
                  <div className="pt-2">
                    <button
                      onClick={openRankManager}
                      className="btn-primary px-4 py-2 text-xs font-mono font-bold inline-flex items-center gap-1.5"
                    >
                      <SlidersHorizontal size={13} /> Update & Publish Rankings Now
                    </button>
                  </div>
                )}
              </div>
            ) : (
              leaderboard.map((p) => {
                const isTop3 = (p.rank || 0) <= 3;
                const rankBadge = p.badgeAwarded || (isTop3 ? (p.rank as 1 | 2 | 3) : undefined);
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

                    {/* Clickable Profile Avatar */}
                    <div 
                      onClick={() => handleNavigateProfile(p.userId)}
                      className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-ink-3 border border-line/30 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {p.userPhoto ? (
                        <img 
                          src={p.userPhoto} 
                          alt={p.userName} 
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <span className="font-bold text-bone text-sm">{p.userName?.charAt(0) || '?'}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span 
                          onClick={() => handleNavigateProfile(p.userId)}
                          className="font-bold text-bone text-sm truncate cursor-pointer hover:underline"
                        >
                          {p.userName}
                        </span>
                        {p.userId === user?.uid && (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">You</span>
                        )}
                        {rankBadge && (
                          <LeaderboardBadgeChip rank={rankBadge} />
                        )}
                      </div>
                      <div className="text-xs font-mono text-bone-dim truncate">
                        {p.customResult ? p.customResult : (p.progress ? `${p.progress} ${challenge.unit}` : 'Completed')}
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono text-xs font-bold text-amber-300">
                      Rank #{p.rank}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal: Full Leaderboard & Rank Manager (Solid Theme) */}
        {showRankModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-ink border border-line rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-bone">
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-emerald-400" />
                  <h3 className="font-display text-xl text-bone">Leaderboard & Rank Manager</h3>
                </div>
                <button onClick={() => setShowRankModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <p className="text-xs text-bone-dim font-mono">
                Assign ranks, custom performance results (e.g. "12,450 steps", "45:20 min", "150 reps"), and podium medals.
              </p>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {allParticipants.length === 0 ? (
                  <div className="text-center py-8 text-bone-dim font-mono text-sm">No athletes enrolled yet.</div>
                ) : (
                  allParticipants.map((p) => {
                    const curr = rankEdits[p.userId] || { 
                      rank: (p.rank && p.rank > 0 && p.rank < 9999) ? p.rank : 1, 
                      progress: p.progress || 0, 
                      customResult: p.customResult || '', 
                      badgeAwarded: p.badgeAwarded 
                    };
                    return (
                      <div key={p.userId} className="p-3.5 rounded-2xl bg-ink-2 border border-line/40 space-y-2">
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
                            <label className="block text-[10px] font-mono text-bone-dim uppercase">Custom Result</label>
                            <input
                              type="text"
                              value={curr.customResult}
                              placeholder="e.g. 45:10 min"
                              onChange={(e) => {
                                const v = e.target.value;
                                setRankEdits(prev => ({
                                  ...prev,
                                  [p.userId]: { ...prev[p.userId], customResult: v }
                                }));
                              }}
                              className="input-field w-full text-xs font-mono text-bone py-1.5"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-bone-dim uppercase">Medal / Badge</label>
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
                  })
                )}
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
                  disabled={saveRanksMutation.isPending || allParticipants.length === 0}
                  className="btn-primary flex-1 py-3 text-xs font-mono font-bold"
                >
                  {saveRanksMutation.isPending ? 'Publishing...' : 'Publish Leaderboard'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: All Enrolled Athletes (Solid Theme) */}
        {showAthletesModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-ink border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-bone">
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-emerald-400" />
                  <h3 className="font-display text-xl text-bone">Enrolled Athletes ({realParticipantCount})</h3>
                </div>
                <button onClick={() => setShowAthletesModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {allParticipants.length === 0 ? (
                  <div className="text-center py-8 text-bone-dim font-mono text-sm">No athletes enrolled yet.</div>
                ) : (
                  allParticipants.map((p, idx) => (
                    <div key={p.userId || idx} className="flex items-center justify-between p-3 rounded-2xl bg-ink-2 border border-line/20">
                      <div className="flex items-center gap-3">
                        <div 
                          onClick={() => handleNavigateProfile(p.userId)}
                          className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-ink-3 border border-line/30 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {p.userPhoto ? (
                            <img 
                              src={p.userPhoto} 
                              alt={p.userName} 
                              className="w-full h-full object-cover" 
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          ) : (
                            <span className="font-bold text-bone text-sm">{p.userName?.charAt(0) || '?'}</span>
                          )}
                        </div>
                        <div>
                          <div 
                            onClick={() => handleNavigateProfile(p.userId)}
                            className="font-bold text-sm text-bone flex items-center gap-1.5 cursor-pointer hover:underline"
                          >
                            {p.userName}
                            {p.userId === user?.uid && <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">You</span>}
                          </div>
                          <div className="text-xs font-mono text-bone-dim">
                            {p.isRanked ? `Rank #${p.rank} • ${p.customResult || ''}` : 'Enrolled Member'}
                          </div>
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
              className="bg-ink border border-emerald-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 text-bone"
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
                    ? `You are now competing in "${challenge.title}".` 
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
