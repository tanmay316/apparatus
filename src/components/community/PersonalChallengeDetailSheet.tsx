import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Target, Users, TrendingUp, Trophy, Sparkles,
  Crown, Award, Medal, Calendar, Plus, Clock,
  Eye, EyeOff, ChevronDown, ChevronUp, Shield,
  Activity, Dumbbell, Zap, Share2, Flame
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  joinChallenge, leaveChallenge, getChallengeLeaderboard,
  getChallengeParticipants, isUserJoinedChallenge, getUserClans,
  isUserClanMember, addChallengeProgressLog, getChallengeProgressLogs,
  updateChallengeParticipantPrivacy
} from '@/services/community';
import { ChallengeV2, ChallengeParticipant, ChallengeProgressLog } from '@/types';
import { useUIStore } from '@/stores/ui-store';
import { useNavigate } from 'react-router-dom';
import { formatChallengeGoal } from './UpcomingReminderWidget';

function useCountdown(endMs: number, startMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (now < startMs) {
    const diff = startMs - now;
    return {
      status: 'upcoming' as const,
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      totalMs: diff,
      progressPct: 0,
    };
  }

  if (now >= endMs) {
    return { status: 'ended' as const, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, progressPct: 100 };
  }

  const diff = endMs - now;
  const total = endMs - startMs;
  const elapsed = now - startMs;
  return {
    status: 'active' as const,
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    totalMs: diff,
    progressPct: total > 0 ? Math.min(100, (elapsed / total) * 100) : 0,
  };
}

function ProgressRing({ progress, target, size = 100, strokeWidth = 8 }: { progress: number; target: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? Math.min(1, progress / target) : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-ink-3" />
        <motion.circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke="url(#progressGradient)" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#cd6f48" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg text-bone leading-none">{Math.round(pct * 100)}%</span>
        <span className="text-[9px] text-bone-dim font-mono mt-0.5">{progress.toFixed(1)}/{target}</span>
      </div>
    </div>
  );
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <motion.div
        key={value}
        initial={{ y: -5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-11 h-11 rounded-xl bg-ink-2 border border-line/30 flex items-center justify-center"
      >
        <span className="font-mono text-lg font-bold text-bone">{String(value).padStart(2, '0')}</span>
      </motion.div>
      <span className="text-[9px] text-bone-dim font-mono mt-1 uppercase">{label}</span>
    </div>
  );
}

function timeAgo(date: any): string {
  if (!date) return 'Just now';
  const millis = typeof date?.toMillis === 'function' ? date.toMillis() : (date?.seconds ? date.seconds * 1000 : 0);
  if (!millis) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const CATEGORY_ICONS: Record<string, typeof Activity> = {
  cardio: Activity,
  gym: Dumbbell,
  calisthenics: Zap,
  mixed: Target,
};

export function PersonalChallengeDetailSheet({ challengeId, onClose }: { challengeId: string; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<'overview' | 'leaderboard' | 'feed'>('overview');
  const [showLogModal, setShowLogModal] = useState(false);
  const [logValue, setLogValue] = useState('');
  const [logNote, setLogNote] = useState('');
  const [isJoinedState, setIsJoinedState] = useState<boolean | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);

  useEffect(() => {
    document.body.classList.add('community-create-open');
    return () => document.body.classList.remove('community-create-open');
  }, []);

  // Fetch challenge
  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'challenges_v2', challengeId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as ChallengeV2;
    }
  });

  // Fetch participants
  const { data: participants = [] } = useQuery({
    queryKey: ['challengeParticipants', challengeId],
    queryFn: () => getChallengeParticipants(challengeId),
    staleTime: 0, refetchOnMount: 'always',
  });

  // Fetch leaderboard
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['challengeLeaderboard', challengeId],
    queryFn: () => getChallengeLeaderboard(challengeId),
    staleTime: 0, refetchOnMount: 'always',
  });

  // Progress logs
  const { data: progressLogs = [] } = useQuery({
    queryKey: ['challengeProgressLogs', challengeId],
    queryFn: () => getChallengeProgressLogs(challengeId),
    staleTime: 0, refetchOnMount: 'always',
  });

  // Is user joined
  const { data: isJoinedDirect } = useQuery({
    queryKey: ['isJoinedChallenge', challengeId, user?.uid],
    queryFn: () => (user ? isUserJoinedChallenge(challengeId, user.uid) : false),
    enabled: !!user
  });

  const { data: userClans = [] } = useQuery({
    queryKey: ['userClans', user?.uid],
    queryFn: () => (user ? getUserClans(user.uid) : []),
    enabled: !!user,
  });

  const myParticipant = participants.find(p => p.userId === user?.uid);
  const isJoined = isJoinedState !== null ? isJoinedState : (isJoinedDirect ?? !!myParticipant);
  const isCreator = user?.uid === challenge?.createdBy;
  const myProgress = myParticipant?.progress || 0;

  const startMs = challenge?.startDate?.toMillis ? challenge.startDate.toMillis() : 0;
  const endMs = challenge?.endDate?.toMillis ? challenge.endDate.toMillis() : 0;
  const countdown = useCountdown(endMs, startMs);

  // Check clan membership for clan_only challenges
  const isClanOnly = challenge?.visibility === 'clan_only';
  const challengeClanIds = challenge?.clanIds || (challenge?.clanId ? [challenge.clanId] : []);
  const userClanIds = userClans.map(c => c.id!);
  const isClanMember = !isClanOnly || challengeClanIds.some(cid => userClanIds.includes(cid)) || isAdmin;

  // Sorted leaderboard
  const sortedParticipants = useMemo(() => {
    return [...participants]
      .filter(p => p.progressPrivacy !== 'private' || p.userId === user?.uid)
      .sort((a, b) => (b.progress || 0) - (a.progress || 0));
  }, [participants, user?.uid]);

  // Join / Leave mutations
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (!isClanMember) throw new Error('You must be a member of this clan to join');
      await joinChallenge(challengeId, user.uid, user.displayName || 'Unknown', user.photoURL || '');
    },
    onSuccess: () => {
      setIsJoinedState(true);
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['isJoinedChallenge', challengeId, user?.uid] });
      showToast('Joined challenge! 🎯', 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to join', 'error')
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const ok = await confirm({ title: 'Leave Challenge', message: 'Are you sure you want to leave?', confirmText: 'Leave', type: 'danger' });
      if (!ok) throw new Error('Cancelled');
      await leaveChallenge(challengeId, user.uid);
    },
    onSuccess: () => {
      setIsJoinedState(false);
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['isJoinedChallenge', challengeId, user?.uid] });
      showToast('Left challenge');
    },
    onError: () => {}
  });

  // Log progress mutation
  const logProgressMutation = useMutation({
    mutationFn: async () => {
      if (!user || !challenge) throw new Error('Invalid');
      const val = parseFloat(logValue);
      if (isNaN(val) || val <= 0) throw new Error('Enter a valid number');
      const payload: any = {
        challengeId,
        userId: user.uid,
        userName: user.displayName || 'Unknown',
        userPhoto: user.photoURL || '',
        value: val,
        unit: challenge.unit,
        source: 'manual',
      };
      if (logNote.trim()) payload.note = logNote.trim();
      await addChallengeProgressLog(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challengeProgressLogs', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challengeLeaderboard', challengeId] });
      setShowLogModal(false);
      setLogValue('');
      setLogNote('');
      showToast('Progress logged! 💪', 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to log', 'error')
  });

  // Privacy toggle
  const privacyMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const newPrivacy = myParticipant?.progressPrivacy === 'private' ? 'public' : 'private';
      await updateChallengeParticipantPrivacy(challengeId, user.uid, newPrivacy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challengeParticipants', challengeId] });
      showToast('Privacy updated');
    }
  });

  const CategoryIcon = CATEGORY_ICONS[challenge?.category || ''] || Target;

  if (isLoading || !challenge) {
    return createPortal(
      <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80">
        <div className="w-8 h-8 border-[3px] border-bone/20 border-t-bone/80 rounded-full animate-spin" />
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-ink border-t border-line rounded-t-[28px] overflow-hidden max-h-[96dvh] flex flex-col shadow-2xl text-bone"
      >
        {/* Cover Hero */}
        <div className="relative h-36 shrink-0 overflow-hidden">
          <img src={challenge.coverUrl || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000&auto=format&fit=crop'} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
          
          {/* Close button */}
          <button onClick={onClose} className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-sm hover:bg-black/70 rounded-full text-bone transition-colors z-10">
            <X size={18} />
          </button>

          {/* Category badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-xs text-bone font-mono z-10">
            <CategoryIcon size={12} />
            {challenge.category || 'Challenge'}
            {challenge.challengeType === 'personal' && (
              <span className="ml-1 px-1.5 py-0.5 bg-sienna/30 text-sienna rounded text-[9px] font-bold uppercase">Personal</span>
            )}
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-3 left-4 right-4 z-10">
            <h2 className="font-display text-xl text-bone leading-tight line-clamp-2">{challenge.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <img src={challenge.creatorPhoto || '/default-avatar.png'} className="w-5 h-5 rounded-full object-cover border border-line/40" alt="" />
              <span className="text-[11px] text-bone-dim">{challenge.creatorName}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-line px-4 shrink-0">
          {(['overview', 'leaderboard', 'feed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSection(tab)}
              className={`py-3 px-4 text-xs font-mono uppercase tracking-wider relative transition-colors border-b-2 ${
                activeSection === tab ? 'text-bone font-bold border-sienna' : 'text-bone-dim border-transparent hover:text-bone'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'leaderboard' ? 'Leaderboard' : 'Activity'}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* ═══ OVERVIEW TAB ═══ */}
          {activeSection === 'overview' && (
            <>
              {/* Countdown Timer */}
              <div className="rounded-2xl bg-ink-2 border border-line/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className={countdown.status === 'active' ? 'text-emerald-400' : countdown.status === 'upcoming' ? 'text-blue-400' : 'text-red-400'} />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-bone-dim">
                      {countdown.status === 'active' ? 'Time Remaining' : countdown.status === 'upcoming' ? 'Starts In' : 'Challenge Ended'}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md border ${
                    countdown.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                    countdown.status === 'upcoming' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' :
                    'bg-red-500/15 text-red-400 border-red-500/30'
                  }`}>
                    {countdown.status}
                  </span>
                </div>

                {countdown.status !== 'ended' && (
                  <div className="flex items-center justify-center gap-2">
                    <CountdownBlock value={countdown.days} label="Days" />
                    <span className="text-bone-dim font-mono text-lg mb-4">:</span>
                    <CountdownBlock value={countdown.hours} label="Hrs" />
                    <span className="text-bone-dim font-mono text-lg mb-4">:</span>
                    <CountdownBlock value={countdown.minutes} label="Min" />
                    <span className="text-bone-dim font-mono text-lg mb-4">:</span>
                    <CountdownBlock value={countdown.seconds} label="Sec" />
                  </div>
                )}

                {/* Time progress bar */}
                <div className="mt-3 h-1.5 rounded-full bg-ink-3 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-sienna to-amber-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${countdown.progressPct}%` }}
                    transition={{ duration: 1 }}
                  />
                </div>
              </div>

              {/* Progress Ring + Stats */}
              {isJoined && (
                <div className="flex items-center gap-4 rounded-2xl bg-ink-2 border border-line/30 p-4">
                  <ProgressRing progress={myProgress} target={challenge.target} size={90} strokeWidth={7} />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <div className="text-[10px] text-bone-dim font-mono uppercase">My Progress</div>
                      <div className="font-display text-xl text-bone">{myProgress.toFixed(1)} <span className="text-sm text-bone-dim">{challenge.unit}</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] text-bone-dim font-mono uppercase">Goal</div>
                      <div className="text-sm font-mono text-bone">{formatChallengeGoal(challenge.target, challenge.unit, challenge.metric)}</div>
                    </div>
                    {myParticipant?.rank && myParticipant.rank > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <Trophy size={12} className="text-amber-400" />
                        <span className="text-bone-dim font-mono">Rank #{myParticipant.rank}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="rounded-2xl bg-ink-2 border border-line/30 p-4">
                <h3 className="text-xs font-mono text-bone-dim uppercase tracking-wider mb-2">About</h3>
                <p className="text-sm text-bone leading-relaxed whitespace-pre-wrap">{challenge.description}</p>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {challenge.autoTrack && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono rounded-md border border-emerald-500/20">
                      <Zap size={10} /> Auto-Track
                    </span>
                  )}
                  {challenge.activityFilter && challenge.activityFilter !== 'all' && (
                    <span className="inline-flex px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-mono rounded-md border border-blue-500/20">
                      {challenge.activityFilter}
                    </span>
                  )}
                  {challenge.prize && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-mono rounded-md border border-amber-500/20">
                      <Trophy size={10} /> {challenge.prize}
                    </span>
                  )}
                </div>
              </div>

              {/* Participants Preview */}
              <div className="rounded-2xl bg-ink-2 border border-line/30 p-4">
                <button
                  onClick={() => setShowParticipants(!showParticipants)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-sienna" />
                    <span className="text-xs font-mono text-bone-dim uppercase tracking-wider">
                      {participants.length} Participant{participants.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {showParticipants ? <ChevronUp size={14} className="text-bone-dim" /> : <ChevronDown size={14} className="text-bone-dim" />}
                </button>
                
                {/* Avatar stack */}
                <div className="flex items-center gap-1 mt-2 overflow-hidden">
                  {participants.slice(0, 8).map((p, i) => (
                    <img
                      key={p.userId}
                      src={p.userPhoto || '/default-avatar.png'}
                      className="w-7 h-7 rounded-full border-2 border-ink object-cover"
                      style={{ marginLeft: i > 0 ? '-8px' : 0, zIndex: 8 - i }}
                      alt={p.userName}
                    />
                  ))}
                  {participants.length > 8 && (
                    <span className="text-[10px] text-bone-dim font-mono ml-1">+{participants.length - 8}</span>
                  )}
                </div>

                <AnimatePresence>
                  {showParticipants && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-3 space-y-1.5 overflow-hidden"
                    >
                      {participants.map(p => (
                        <button
                          key={p.userId}
                          onClick={() => { onClose(); navigate(p.userId === user?.uid ? '/profile' : `/profile/${p.userId}`); }}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-ink-3 transition-colors text-left"
                        >
                          <img src={p.userPhoto || '/default-avatar.png'} className="w-7 h-7 rounded-full object-cover" alt="" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-bone truncate">{p.userName}</div>
                            {p.progressPrivacy !== 'private' && (
                              <div className="text-[10px] text-bone-dim font-mono">{(p.progress || 0).toFixed(1)} {challenge.unit}</div>
                            )}
                          </div>
                          {p.userId === challenge.createdBy && (
                            <Crown size={12} className="text-amber-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Clan Info */}
              {(challenge.clanNames?.length || challenge.clanName) && (
                <div className="rounded-2xl bg-ink-2 border border-line/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={14} className="text-blue-400" />
                    <span className="text-xs font-mono text-bone-dim uppercase tracking-wider">Clans</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(challenge.clanNames || [challenge.clanName]).filter(Boolean).map((name, i) => (
                      <span key={i} className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-lg border border-blue-500/20 font-medium">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ LEADERBOARD TAB ═══ */}
          {activeSection === 'leaderboard' && (
            <div className="space-y-2">
              {sortedParticipants.length === 0 ? (
                <div className="text-center py-8 text-bone-dim text-sm">No participants yet</div>
              ) : (
                sortedParticipants.map((p, idx) => {
                  const rank = idx + 1;
                  const pct = challenge.target > 0 ? Math.min(100, ((p.progress || 0) / challenge.target) * 100) : 0;
                  const isMe = p.userId === user?.uid;
                  const isPrivate = p.progressPrivacy === 'private' && !isMe;

                  return (
                    <motion.div
                      key={p.userId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`rounded-xl border p-3 flex items-center gap-3 transition-colors ${
                        isMe ? 'bg-sienna/10 border-sienna/30' : 'bg-ink-2 border-line/20'
                      }`}
                    >
                      {/* Rank */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-sm ${
                        rank === 1 ? 'bg-amber-500/20 text-amber-400' :
                        rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                        rank === 3 ? 'bg-orange-600/20 text-orange-400' :
                        'bg-ink-3 text-bone-dim'
                      }`}>
                        {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
                      </div>

                      {/* User */}
                      <img src={p.userPhoto || '/default-avatar.png'} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs truncate ${isMe ? 'text-sienna font-bold' : 'text-bone'}`}>{p.userName}</span>
                          {isMe && <span className="text-[9px] bg-sienna/20 text-sienna px-1 py-0.5 rounded font-mono">YOU</span>}
                          {p.userId === challenge.createdBy && <Crown size={10} className="text-amber-400" />}
                        </div>
                        
                        {!isPrivate ? (
                          <>
                            <div className="text-[10px] text-bone-dim font-mono">{(p.progress || 0).toFixed(1)} / {challenge.target} {challenge.unit}</div>
                            <div className="mt-1 h-1 rounded-full bg-ink-3 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-sienna to-amber-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.8, delay: idx * 0.05 }}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-1 text-[10px] text-bone-dim font-mono">
                            <EyeOff size={10} /> Private
                          </div>
                        )}
                      </div>

                      <span className="text-xs font-mono text-bone-dim shrink-0">{isPrivate ? '—' : `${Math.round(pct)}%`}</span>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {/* ═══ ACTIVITY FEED TAB ═══ */}
          {activeSection === 'feed' && (
            <div className="space-y-2">
              {progressLogs.length === 0 ? (
                <div className="text-center py-8 text-bone-dim text-sm">No activity yet. Start logging progress!</div>
              ) : (
                progressLogs.map((log, idx) => (
                  <motion.div
                    key={log.id || idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="flex gap-3 py-2.5 border-b border-line/10 last:border-0"
                  >
                    <img src={log.userPhoto || '/default-avatar.png'} className="w-7 h-7 rounded-full object-cover mt-0.5 shrink-0" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-bone">{log.userName}</span>
                        <span className="text-[9px] font-mono text-bone-dim">{timeAgo(log.createdAt)}</span>
                      </div>
                      <div className="text-sm text-bone mt-0.5">
                        <span className="font-mono font-bold text-sienna">+{log.value}</span>
                        <span className="text-bone-dim ml-1">{log.unit}</span>
                      </div>
                      {log.note && (
                        <p className="text-[11px] text-bone-dim mt-0.5 italic">"{log.note}"</p>
                      )}
                    </div>
                    <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono h-fit ${
                      log.source === 'auto_cardio' ? 'bg-emerald-500/10 text-emerald-400' :
                      log.source === 'auto_workout' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-ink-3 text-bone-dim'
                    }`}>
                      {log.source === 'auto_cardio' ? '⚡ Auto' : log.source === 'auto_workout' ? '🏋️ Auto' : '✍️ Manual'}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="shrink-0 border-t border-line px-4 py-3 pb-safe flex items-center gap-2">
          {!isJoined && countdown.status !== 'ended' ? (
            <button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending || !isClanMember}
              className="btn-primary flex-1 py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Target size={16} />
              {!isClanMember ? 'Clan Members Only' : joinMutation.isPending ? 'Joining...' : 'Join Challenge'}
            </button>
          ) : isJoined ? (
            <>
              {/* Log Progress Button */}
              {countdown.status !== 'ended' && (
                <button
                  onClick={() => setShowLogModal(true)}
                  className="btn-primary flex-1 py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Log Progress
                </button>
              )}
              
              {/* Privacy Toggle */}
              <button
                onClick={() => privacyMutation.mutate()}
                className="p-3 rounded-xl bg-ink-2 border border-line/30 hover:border-line/50 transition-colors"
                title={myParticipant?.progressPrivacy === 'private' ? 'Make progress public' : 'Hide progress'}
              >
                {myParticipant?.progressPrivacy === 'private' ? <EyeOff size={16} className="text-bone-dim" /> : <Eye size={16} className="text-bone-dim" />}
              </button>

              {/* Leave */}
              {!isCreator && countdown.status !== 'ended' && (
                <button
                  onClick={() => leaveMutation.mutate()}
                  className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  <X size={16} className="text-red-400" />
                </button>
              )}
            </>
          ) : (
            <div className="flex-1 text-center text-sm text-bone-dim font-mono">Challenge has ended</div>
          )}
        </div>

        {/* Log Progress Modal */}
        <AnimatePresence>
          {showLogModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-20"
            >
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                className="w-full bg-ink border-t border-line rounded-t-2xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg text-bone">Log Progress</h3>
                  <button onClick={() => setShowLogModal(false)} className="p-1.5 bg-ink-2 rounded-full hover:bg-ink-3 transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-bone-dim uppercase mb-1">
                    Value ({challenge.unit}) *
                  </label>
                  <input
                    type="number" step="any" value={logValue} onChange={e => setLogValue(e.target.value)}
                    placeholder={`e.g. 3.5`} className="input-field w-full text-lg font-mono text-bone"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-bone-dim uppercase mb-1">Note (Optional)</label>
                  <input
                    type="text" value={logNote} onChange={e => setLogNote(e.target.value)}
                    placeholder="How did it go?" className="input-field w-full text-sm text-bone"
                  />
                </div>

                <button
                  onClick={() => logProgressMutation.mutate()}
                  disabled={logProgressMutation.isPending}
                  className="btn-primary w-full py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <Flame size={16} />
                  {logProgressMutation.isPending ? 'Logging...' : 'Log Progress'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body
  );
}
