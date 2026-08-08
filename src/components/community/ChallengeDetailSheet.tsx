import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Users, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { joinChallenge, leaveChallenge, getChallengeLeaderboard } from '@/services/community';
import { ChallengeV2 } from '@/types';
import { useUIStore } from '@/stores/ui-store';

export function ChallengeDetailSheet({ challengeId, onClose }: { challengeId: string; onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

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

  const myParticipant = leaderboard.find(p => p.userId === user?.uid);
  const isJoined = !!myParticipant;

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await joinChallenge(challengeId, user.uid, user.displayName || 'Unknown', user.photoURL || '');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      showToast('Joined challenge!');
    }
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await leaveChallenge(challengeId, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      showToast('Left challenge');
      onClose();
    }
  });

  if (!challenge) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-bg border-t border-line rounded-t-[32px] overflow-hidden h-[95dvh] flex flex-col"
      >
        <div className="relative h-48 sm:h-64 bg-ink-3 shrink-0">
          {challenge.coverUrl ? (
            <img src={challenge.coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-bone-dim"><Target size={48} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-ink/50 backdrop-blur-md rounded-full text-bone hover:bg-ink-2 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 relative -mt-16 shrink-0 pb-6 border-b border-line">
          <div className="inline-flex text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded backdrop-blur-sm mb-2 border border-emerald-500/30">
            {challenge.status}
          </div>
          <h1 className="font-display text-4xl text-bone mb-1">{challenge.title}</h1>
          <p className="text-bone-dim text-sm mb-4">{challenge.description}</p>
          
          <div className="flex items-center gap-4 text-xs font-mono text-bone-dim mb-4">
            <span className="flex items-center gap-1.5"><Users size={14} className="text-emerald-500" /> {challenge.participantCount} Athletes</span>
            <span className="flex items-center gap-1.5"><TrendingUp size={14} className="text-emerald-500" /> Goal: {challenge.target} {challenge.unit}</span>
          </div>

          <div className="flex gap-3">
            {isJoined ? (
              <button onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending} className="btn-secondary px-6 py-2">
                {leaveMutation.isPending ? 'Leaving...' : 'Leave Challenge'}
              </button>
            ) : (
              <button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending} className="btn-primary px-8 py-2 text-lg">
                {joinMutation.isPending ? 'Joining...' : 'Join Challenge'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-ink">
          {isJoined && myParticipant && (
            <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
              <h3 className="font-mono text-xs uppercase text-emerald-500 mb-2 font-bold">Your Progress</h3>
              <div className="flex justify-between items-end mb-2">
                <span className="font-display text-2xl text-bone">{myParticipant.progress} <span className="text-base text-bone-dim">{challenge.unit}</span></span>
                <span className="font-mono text-xs text-bone-dim">Rank #{myParticipant.rank}</span>
              </div>
              <div className="w-full bg-ink-3 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (myParticipant.progress / challenge.target) * 100)}%` }} />
              </div>
            </div>
          )}

          <h3 className="font-display text-lg text-bone mb-4">Leaderboard</h3>
          
          <div className="space-y-2">
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-bone-dim font-mono text-sm">No one has joined yet. Be the first!</div>
            ) : (
              leaderboard.map(p => (
                <div key={p.id} className={`flex items-center gap-4 p-3 rounded-2xl ${p.userId === user?.uid ? 'bg-ink-2 border border-line' : 'bg-transparent'}`}>
                  <div className="w-8 text-center font-mono text-sm font-bold text-bone-dim">
                    {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                  </div>
                  {p.userPhoto ? (
                    <img src={p.userPhoto} alt={p.userName} className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-ink-3 flex items-center justify-center text-bone font-bold">
                      {p.userName.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-bone font-bold truncate">{p.userName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg text-bone">{p.progress}</div>
                    <div className="text-[10px] font-mono text-bone-dim uppercase">{challenge.unit}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
