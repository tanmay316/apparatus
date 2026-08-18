import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Eye, Lock, Clock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQueryClient } from '@tanstack/react-query';
import { voteOnClanPoll } from '@/services/community';
import type { ClanPoll, ClanPollOption } from '@/types';

interface ClanPollCardProps {
  postId: string;
  poll: ClanPoll;
  onPollUpdated?: (updatedPoll: ClanPoll) => void;
  interactive?: boolean;
}

// Background tint colors for non-selected options to match rich design
const OPTION_BAR_COLORS = [
  'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300',
  'bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  'bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
  'bg-rose-500/15 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300',
];

const AVATAR_BG_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-teal-100 text-teal-700 border-teal-200',
];

function formatTimeRemaining(expiresAt?: string | null): { text: string; isExpired: boolean } {
  if (!expiresAt) return { text: 'No expiration', isExpired: false };
  const expDate = new Date(expiresAt).getTime();
  if (isNaN(expDate)) return { text: 'No expiration', isExpired: false };

  const diffMs = expDate - Date.now();
  if (diffMs <= 0) return { text: 'Voting closed', isExpired: true };

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return { text: `${diffDays} day${diffDays > 1 ? 's' : ''} remaining`, isExpired: false };
  }
  if (diffHours > 0) {
    return { text: `${diffHours} hr${diffHours > 1 ? 's' : ''} remaining`, isExpired: false };
  }
  if (diffMin > 0) {
    return { text: `${diffMin} min${diffMin > 1 ? 's' : ''} remaining`, isExpired: false };
  }
  return { text: 'Closing soon', isExpired: false };
}

export function ClanPollCard({
  postId,
  poll,
  onPollUpdated,
  interactive = true,
}: ClanPollCardProps) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [currentPoll, setCurrentPoll] = useState<ClanPoll>(poll);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);

  useEffect(() => {
    setCurrentPoll(poll);
  }, [poll]);

  const userId = user?.uid;
  const userSelections: string[] = (userId && currentPoll.userVotes?.[userId]) || [];
  const hasUserVoted = userSelections.length > 0;

  const { text: expirationText, isExpired } = currentPoll.hasExpiration
    ? formatTimeRemaining(currentPoll.expiresAt)
    : { text: 'Open Voting', isExpired: false };

  const totalVotes = currentPoll.totalVotes || 0;

  const handleVoteOption = async (e: React.MouseEvent, optionId: string) => {
    e.stopPropagation();

    if (!interactive) return;

    if (!user) {
      showToast('Please log in to vote on this poll', 'info');
      return;
    }

    if (isExpired) {
      showToast('This poll has ended and is no longer accepting votes', 'info');
      return;
    }

    if (isSubmittingVote) return;

    // Optimistic calculation
    const isMultiple = Boolean(currentPoll.isMultipleChoice);
    let nextSelections: string[] = [];

    if (isMultiple) {
      if (userSelections.includes(optionId)) {
        nextSelections = userSelections.filter(id => id !== optionId);
      } else {
        nextSelections = [...userSelections, optionId];
      }
    } else {
      if (userSelections.includes(optionId)) {
        nextSelections = []; // unvote
      } else {
        nextSelections = [optionId];
      }
    }

    const nextUserVotes = { ...(currentPoll.userVotes || {}) };
    if (nextSelections.length === 0) {
      delete nextUserVotes[user.uid];
    } else {
      nextUserVotes[user.uid] = nextSelections;
    }

    const voterInfo = {
      userId: user.uid,
      userName: user.displayName || 'Clan Member',
      userPhoto: user.photoURL || '',
    };

    const nextOptions: ClanPollOption[] = currentPoll.options.map(opt => {
      let voterIds = [...(opt.voterIds || [])];
      let voters = [...(opt.voters || [])];

      const wasVoted = userSelections.includes(opt.id);
      const isNowVoted = nextSelections.includes(opt.id);

      if (wasVoted && !isNowVoted) {
        voterIds = voterIds.filter(id => id !== user.uid);
        voters = voters.filter(v => v.userId !== user.uid);
      } else if (!wasVoted && isNowVoted) {
        if (!voterIds.includes(user.uid)) voterIds.push(user.uid);
        if (!currentPoll.isAnonymous) {
          if (!voters.some(v => v.userId === user.uid)) voters.push(voterInfo);
        }
      }

      return {
        ...opt,
        votesCount: voterIds.length,
        voterIds,
        voters: currentPoll.isAnonymous ? [] : voters,
      };
    });

    const nextTotalVotes = nextOptions.reduce((acc, curr) => acc + curr.votesCount, 0);

    const optimisticPoll: ClanPoll = {
      ...currentPoll,
      options: nextOptions,
      totalVotes: nextTotalVotes,
      votedUserIds: Object.keys(nextUserVotes),
      userVotes: nextUserVotes,
    };

    setCurrentPoll(optimisticPoll);
    onPollUpdated?.(optimisticPoll);

    setIsSubmittingVote(true);
    try {
      const serverUpdated = await voteOnClanPoll(postId, optionId, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });

      setCurrentPoll(serverUpdated);
      onPollUpdated?.(serverUpdated);
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
      queryClient.invalidateQueries({ queryKey: ['singleClanPost', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (err: any) {
      // Revert on error
      setCurrentPoll(poll);
      onPollUpdated?.(poll);
      showToast(err?.message || 'Failed to record vote', 'error');
    } finally {
      setIsSubmittingVote(false);
    }
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="w-full bg-ink-2/80 border border-line/25 rounded-2xl p-4 sm:p-5 shadow-sm text-left relative overflow-hidden my-3"
    >
      {/* Header Question */}
      <div className="mb-4">
        <h3 className="font-display font-bold text-base sm:text-lg text-bone leading-snug tracking-tight">
          {currentPoll.question}
        </h3>
        <div className="flex items-center gap-2 mt-1 text-xs text-bone-dim font-medium">
          <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
          <span>•</span>
          {isExpired ? (
            <span className="text-amber-500 font-semibold flex items-center gap-1">
              <AlertCircle size={12} /> Voting Ended
            </span>
          ) : hasUserVoted ? (
            <span className="text-emerald-500 font-semibold">
              {currentPoll.isMultipleChoice ? 'Multiple choice • You voted' : 'You voted'}
            </span>
          ) : (
            <span>Vote to see live results</span>
          )}
        </div>
      </div>

      {/* Options List */}
      <div className="space-y-2.5">
        {currentPoll.options.map((opt, idx) => {
          const isSelected = userSelections.includes(opt.id);
          const percent = totalVotes > 0 ? Math.round((opt.votesCount / totalVotes) * 100) : 0;
          const colorClass = OPTION_BAR_COLORS[idx % OPTION_BAR_COLORS.length];

          return (
            <div
              key={opt.id}
              onClick={e => handleVoteOption(e, opt.id)}
              className={`relative overflow-hidden rounded-xl p-3 sm:p-3.5 border transition-all select-none ${
                interactive && !isExpired ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
              } ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                  : 'border-line/25 bg-ink hover:border-line/40 hover:bg-ink-3/70'
              }`}
            >
              {/* Animated Progress Fill Bar */}
              <motion.div
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`absolute top-0 bottom-0 left-0 rounded-xl opacity-80 pointer-events-none transition-colors ${
                  isSelected ? 'bg-emerald-500/20' : 'bg-sienna/15'
                }`}
              />

              {/* Foreground Content */}
              <div className="relative z-10 flex items-center justify-between gap-3">
                {/* Left: Checkmark / Text */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-2" />
                  )}
                  <span
                    className={`text-xs sm:text-sm font-semibold truncate ${
                      isSelected
                        ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'text-bone'
                    }`}
                  >
                    {opt.text}
                  </span>
                </div>

                {/* Right: Voters Avatar Cluster + Percentage */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* Voters avatars (if not anonymous) */}
                  {!currentPoll.isAnonymous && opt.voters && opt.voters.length > 0 && (
                    <div className="flex items-center -space-x-2 overflow-hidden py-0.5">
                      {opt.voters.slice(0, 3).map((voter, vIdx) => {
                        const avatarColor = AVATAR_BG_COLORS[vIdx % AVATAR_BG_COLORS.length];
                        return (
                          <div
                            key={voter.userId || vIdx}
                            className={`w-6 h-6 rounded-full border-2 border-ink overflow-hidden flex items-center justify-center text-[10px] font-bold shadow-sm ${avatarColor}`}
                            title={voter.userName}
                          >
                            {voter.userPhoto ? (
                              <img src={voter.userPhoto} alt={voter.userName} className="w-full h-full object-cover" />
                            ) : (
                              voter.userName?.slice(0, 2).toUpperCase() || '?'
                            )}
                          </div>
                        );
                      })}
                      {opt.voters.length > 3 && (
                        <div className="w-6 h-6 rounded-full border-2 border-ink bg-ink-3 text-bone-dim flex items-center justify-center text-[9px] font-bold shadow-sm">
                          +{opt.voters.length - 3}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Percentage number */}
                  <span
                    className={`text-xs sm:text-sm font-bold font-mono min-w-[36px] text-right ${
                      isSelected
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-bone-dim'
                    }`}
                  >
                    {percent}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info Row */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/20 text-xs text-bone-dim font-medium">
        <div className="flex items-center gap-1.5">
          {currentPoll.isAnonymous ? (
            <>
              <Lock size={13} className="text-indigo-500 shrink-0" />
              <span>Anonymous Voting</span>
            </>
          ) : (
            <>
              <Eye size={13} className="text-bone-dim shrink-0" />
              <span>Open Voting</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Clock size={13} className={`shrink-0 ${isExpired ? 'text-red-500' : 'text-bone-dim'}`} />
          <span className={isExpired ? 'text-red-500 font-semibold' : ''}>
            {expirationText}
          </span>
        </div>
      </div>
    </div>
  );
}
