import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, CalendarDays, Users, MapPin, Trophy, Sparkles, Edit3, Trash2, 
  Shield, Award, Crown, CheckCircle2, Check, UserCheck, ChevronRight, 
  SlidersHorizontal, ChevronUp, ChevronDown, Medal 
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { 
  joinEvent, leaveEvent, getEventParticipants, deleteSimpleEvent, 
  awardEventTop3Badges, getUserClans, isUserJoinedEvent, isUserClanMember,
  updateEventLeaderboardRanks
} from '@/services/community';
import { SimpleEvent, EventParticipant } from '@/types';
import { useUIStore } from '@/stores/ui-store';
import { EditEventSheet } from './EditEventSheet';
import { LeaderboardBadgeChip } from './CommunityBadgeCard';
import { useNavigate } from 'react-router-dom';

interface EventDetailSheetProps {
  eventId: string;
  onClose: () => void;
}

export function EventDetailSheet({ eventId, onClose }: EventDetailSheetProps) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [editingEvent, setEditingEvent] = useState<SimpleEvent | null>(null);
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [showRankModal, setShowRankModal] = useState(false);
  const [isJoinedState, setIsJoinedState] = useState<boolean | null>(null);
  const [statusPopup, setStatusPopup] = useState<{ isOpen: boolean; type: 'joined' | 'left' } | null>(null);

  // Form state for ranking attendees
  const [rankEdits, setRankEdits] = useState<{ [userId: string]: { rank: number | string; customResult: string; badgeAwarded?: 1 | 2 | 3 } }>({});

  useEffect(() => {
    document.body.classList.add('community-create-open');
    return () => document.body.classList.remove('community-create-open');
  }, []);

  const { data: event, isLoading: loadingEvent } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'simple_events', eventId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as SimpleEvent;
    }
  });

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ['eventParticipants', eventId],
    queryFn: () => getEventParticipants(eventId),
    enabled: !!eventId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Automatically repair / sync participantCount in Firestore if desynced
  useEffect(() => {
    if (event && participants && event.participantCount !== participants.length) {
      updateDoc(doc(db, 'simple_events', eventId), {
        participantCount: participants.length
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
        queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
        queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
      }).catch(() => {});
    }
  }, [event, participants, eventId, queryClient]);

  const { data: isJoinedDirect } = useQuery({
    queryKey: ['isJoinedEvent', eventId, user?.uid],
    queryFn: () => (user ? isUserJoinedEvent(eventId, user.uid) : false),
    enabled: !!user
  });

  const { data: userClans = [] } = useQuery({
    queryKey: ['userClans', user?.uid],
    queryFn: () => (user ? getUserClans(user.uid) : []),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isClanOnly = event?.visibility === 'clan_only';
  const { data: isClanMemberDirect } = useQuery({
    queryKey: ['isMemberOfClan', event?.clanId, user?.uid],
    queryFn: () => (event?.clanId && user ? isUserClanMember(event.clanId, user.uid) : true),
    enabled: !!(event?.clanId && user && isClanOnly),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isClanMember = !isClanOnly || (isClanMemberDirect ?? userClans.some(c => c.id === event?.clanId)) || isAdmin;
  const isClanLeader = event?.clanId ? userClans.some(c => c.id === event.clanId && (c.leaderId === user?.uid || (c as any).admins?.includes(user?.uid) || (c as any).role === 'leader' || (c as any).role === 'co-leader')) : false;
  const isJoined = isJoinedState !== null ? isJoinedState : (isJoinedDirect ?? participants.some(p => p.userId === user?.uid));
  const isCreatorOrAdmin = isAdmin || user?.uid === event?.createdBy || isClanLeader;

  // Filter ranked participants for the official leaderboard
  const rankedParticipants = participants.filter(p => p.isRanked === true && typeof p.rank === 'number' && p.rank > 0 && p.rank < 9999);
  rankedParticipants.sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // Initialize rank manager
  const openRankManager = () => {
    const initial: { [userId: string]: { rank: number | string; customResult: string; badgeAwarded?: 1 | 2 | 3 } } = {};
    participants.forEach((p, idx) => {
      initial[p.userId] = {
        rank: (p.rank && p.rank > 0 && p.rank < 9999) ? p.rank : (idx + 1),
        customResult: p.customResult || '',
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
      if (!isClanMember) throw new Error('You must be a member of this clan to join.');
      await joinEvent(eventId, user.uid, user.displayName || 'Unknown', user.photoURL || '');
    },
    onSuccess: () => {
      setIsJoinedState(true);
      queryClient.invalidateQueries({ queryKey: ['eventParticipants', eventId] });
      queryClient.invalidateQueries({ queryKey: ['isJoinedEvent', eventId, user?.uid] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
      setStatusPopup({ isOpen: true, type: 'joined' });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to join event', 'error')
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await leaveEvent(eventId, user.uid);
    },
    onSuccess: () => {
      setIsJoinedState(false);
      queryClient.invalidateQueries({ queryKey: ['eventParticipants', eventId] });
      queryClient.invalidateQueries({ queryKey: ['isJoinedEvent', eventId, user?.uid] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
      setStatusPopup({ isOpen: true, type: 'left' });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to leave event', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (confirm('Are you sure you want to delete this event?')) {
        await deleteSimpleEvent(eventId);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
        queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
        queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
        showToast('Event deleted');
        onClose();
      }
    }
  });

  const saveRanksMutation = useMutation({
    mutationFn: async () => {
      const updates = participants.map((p, idx) => {
        const edit = rankEdits[p.userId];
        let rankVal: number;
        if (edit && edit.rank !== '' && edit.rank !== undefined) {
          rankVal = typeof edit.rank === 'number' ? edit.rank : (parseInt(edit.rank as string, 10) || (idx + 1));
        } else {
          rankVal = (p.rank && p.rank > 0 && p.rank < 9999) ? p.rank : (idx + 1);
        }

        let badgeVal: 1 | 2 | 3 | undefined;
        if (edit && edit.badgeAwarded !== undefined) {
          badgeVal = edit.badgeAwarded;
        } else if (rankVal >= 1 && rankVal <= 3) {
          badgeVal = rankVal as 1 | 2 | 3;
        } else {
          badgeVal = undefined;
        }

        return {
          id: p.id,
          userId: p.userId,
          rank: Math.max(1, rankVal),
          customResult: edit?.customResult !== undefined ? edit.customResult : (p.customResult || ''),
          badgeAwarded: badgeVal
        };
      });
      await updateEventLeaderboardRanks(eventId, updates);
    },
    onSuccess: async () => {
      // Small delay to let Firestore consistency settle
      await new Promise(r => setTimeout(r, 500));
      await queryClient.refetchQueries({ queryKey: ['eventParticipants', eventId] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
      queryClient.invalidateQueries({ queryKey: ['freshUserProfile'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['userCelebrationProfile'] });
      queryClient.invalidateQueries({ queryKey: ['userCommunityBadges'] });
      useAuthStore.getState().refreshProfile().catch(() => {});
      showToast('Event rankings and results saved!', 'success');
      setShowRankModal(false);
      setRankEdits({});
    },
    onError: (err: any) => showToast(err?.message || 'Failed to save event ranks', 'error')
  });

  if (!event) return null;

  const now = Date.now();
  const startTimeMs = event.startTime?.toMillis ? event.startTime.toMillis() : 0;
  const endTimeMs = event.endTime?.toMillis ? event.endTime.toMillis() : 0;

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
    countdownLabel = 'Event Concluded';
  }

  const realParticipantCount = participants.length;

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
              <span className="inline-flex text-[10px] font-mono uppercase bg-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded font-bold border border-blue-500/30">
                Community Event
              </span>
              {event.visibility === 'clan_only' && (
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
                    onClick={() => setEditingEvent(event)} 
                    className="p-1.5 rounded-lg bg-ink-3 hover:bg-ink-2 text-bone text-xs transition-colors"
                    title="Edit Event"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate()} 
                    className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs transition-colors"
                    title="Delete Event"
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
              {event.coverUrl && (
                <div className="relative w-full max-h-72 rounded-2xl overflow-hidden border border-line/30 shrink-0 bg-ink-2/80 flex items-center justify-center">
                  <img 
                    src={event.coverUrl} 
                    alt={event.title} 
                    className="w-full max-h-72 object-contain rounded-2xl" 
                  />
                </div>
              )}

              <div>
                <h1 className="font-display text-2xl sm:text-3xl text-bone mb-1.5">{event.title}</h1>
                <p className="text-bone-dim text-xs sm:text-sm leading-relaxed max-w-3xl whitespace-pre-wrap">{event.description}</p>
              </div>

              {/* Timing & Interactive Attendees Pill */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span
                  className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                    countdownType === 'ongoing'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : countdownType === 'upcoming'
                      ? 'badge-countdown-upcoming'
                      : 'bg-ink-3 text-bone-dim'
                  }`}
                >
                  <Sparkles size={13} /> {countdownLabel}
                </span>

                {/* Clickable Attendees Pill with Real Count */}
                <button
                  onClick={() => setShowAttendeesModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-2 hover:bg-ink-3 border border-line text-bone font-bold transition-all group"
                >
                  <Users size={14} className="text-blue-400 group-hover:scale-110 transition-transform" /> 
                  <span>{realParticipantCount} Registered Attendees</span>
                  <ChevronRight size={12} className="text-bone-dim group-hover:translate-x-0.5 transition-transform" />
                </button>

                {event.location?.name && (
                  <span className="flex items-center gap-1.5 text-bone-dim">
                    <MapPin size={14} className="text-blue-400" /> {event.location.name}
                  </span>
                )}
              </div>

              {/* Prize / Reward Banner */}
              {event.prize && (
                <div className="badge-prize p-3 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <Trophy size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono uppercase font-black tracking-wider opacity-80">Prizes & Rewards</div>
                    <div className="text-xs font-bold truncate">{event.prize}</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {!isClanMember ? (
                  <button
                    onClick={() => {
                      onClose();
                      if (event.clanId) navigate(`/clan/${event.clanId}`);
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
                    {leaveMutation.isPending ? 'Cancelling...' : 'Cancel RSVP / Leave'}
                  </button>
                ) : (
                  <button 
                    onClick={() => joinMutation.mutate()} 
                    disabled={joinMutation.isPending} 
                    className="btn-primary px-8 py-2.5 text-sm font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                  >
                    {joinMutation.isPending ? 'RSVPing...' : 'RSVP / Join Event'}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Compact View when Details are Collapsed */}
          {!isDetailsExpanded && (
            <div className="px-6 py-2.5 flex items-center justify-between bg-ink-2/20">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="font-display text-lg text-bone truncate">{event.title}</h2>
                <button
                  onClick={() => setShowAttendeesModal(true)}
                  className="text-xs font-mono text-blue-400 hover:underline flex items-center gap-1 shrink-0"
                >
                  <Users size={12} /> {realParticipantCount} Attendees
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Official Event Leaderboard & Attendees Section */}
        <div className="flex-1 overflow-y-auto p-6 bg-ink space-y-4">
          {/* Concluded Status Notice */}
          {countdownType === 'ended' && (
            <div className="p-3.5 mb-5 rounded-2xl bg-blue-500/10 border-2 border-blue-500/40 flex items-start gap-3 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 size={16} className="text-blue-500 dark:text-blue-400" />
              </div>
              <div className="text-xs font-mono font-bold leading-relaxed text-foreground">
                <span className="font-black uppercase text-blue-600 dark:text-blue-400 mr-1.5">Event Concluded:</span>
                Final attendee placements, results, and podium medals are recorded below.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <Trophy size={18} className="text-amber-400" /> Event Standings & Leaderboard
            </h3>
            <div className="flex items-center gap-2">
              {rankedParticipants.length > 0 && (
                <span className="text-xs font-mono text-bone-dim mr-1">{rankedParticipants.length} Ranked</span>
              )}
              {isCreatorOrAdmin && (
                <button
                  onClick={openRankManager}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  <SlidersHorizontal size={13} /> {countdownType === 'ended' ? 'Update Final Standings' : 'Update Standings'}
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-2.5">
            {loadingParticipants ? (
              <div className="text-center py-12 text-bone-dim font-mono text-sm">Loading event data...</div>
            ) : rankedParticipants.length === 0 ? (
              <div className="p-8 text-center bg-ink-2/40 border border-dashed border-line rounded-3xl space-y-2">
                <Medal size={36} className="mx-auto text-amber-400/40" />
                <div className="font-bold text-bone text-sm">Official Leaderboard Pending</div>
                <p className="text-bone-dim text-xs font-mono max-w-md mx-auto leading-relaxed">
                  Official winners and results will be published by the event organizer. Check the registered attendees list above to see everyone attending!
                </p>
                {isCreatorOrAdmin && (
                  <div className="pt-2">
                    <button
                      onClick={openRankManager}
                      className="btn-primary px-4 py-2 text-xs font-mono font-bold inline-flex items-center gap-1.5"
                    >
                      <SlidersHorizontal size={13} /> Update & Publish Standings
                    </button>
                  </div>
                )}
              </div>
            ) : (
              rankedParticipants.map((p) => {
                const isTop3 = (p.rank || 0) <= 3;
                const rankBadge = p.badgeAwarded || (isTop3 ? (p.rank as 1 | 2 | 3) : undefined);
                return (
                  <div 
                    key={p.userId} 
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-colors ${
                      p.userId === user?.uid 
                        ? 'bg-ink-2 border-blue-500/40 shadow-sm' 
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
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span 
                          onClick={() => handleNavigateProfile(p.userId)}
                          className="font-bold text-bone text-sm break-words cursor-pointer hover:underline leading-snug"
                        >
                          {p.userName}
                        </span>
                        {p.userId === user?.uid && (
                          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded border border-blue-500/30 shrink-0">You</span>
                        )}
                        {rankBadge && (
                          <div className="shrink-0">
                            <LeaderboardBadgeChip rank={rankBadge} />
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-mono text-bone-dim truncate mt-0.5">
                        {p.customResult || 'Official Placement'}
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
                  <SlidersHorizontal size={18} className="text-blue-400" />
                  <h3 className="font-display text-xl text-bone">Event Standings & Rank Manager</h3>
                </div>
                <button onClick={() => setShowRankModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <p className="text-xs text-bone-dim font-mono">
                Assign placements, custom result notes (e.g. "1st in 100m sprint", "Top Finisher"), and podium medals.
              </p>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {participants.length === 0 ? (
                  <div className="text-center py-8 text-bone-dim font-mono text-sm">No attendees registered yet.</div>
                ) : (
                  participants.map((p, idx) => {
                    const fallbackRank = (p.rank && p.rank > 0 && p.rank < 9999) ? p.rank : (idx + 1);
                    const curr = rankEdits[p.userId] || { 
                      rank: fallbackRank, 
                      customResult: p.customResult || '', 
                      badgeAwarded: p.badgeAwarded 
                    };
                    const currentRankVal = curr.rank !== undefined ? curr.rank : fallbackRank;

                    return (
                      <div key={p.userId} className="p-4 rounded-2xl bg-ink-2 border border-line/40 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-wrap">
                            <span className="font-bold text-sm sm:text-base text-bone break-words leading-tight">{p.userName}</span>
                            {curr.badgeAwarded && (
                              <div className="shrink-0 scale-95 origin-left">
                                <LeaderboardBadgeChip rank={curr.badgeAwarded} />
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-bone-dim shrink-0 bg-ink-3 px-2 py-0.5 rounded border border-line/30">
                            ID: {p.userId.slice(0, 6)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="flex gap-2">
                            <div className="w-24 shrink-0">
                              <label htmlFor={`rank-${p.userId}`} className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5">Rank #</label>
                              <input
                                id={`rank-${p.userId}`}
                                name={`rank-${p.userId}`}
                                type="number"
                                min="1"
                                max="999"
                                value={currentRankVal}
                                placeholder={`${idx + 1}`}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const num = raw === '' ? '' : parseInt(raw, 10);
                                  setRankEdits(prev => {
                                    const existing = prev[p.userId] || curr;
                                    let newBadge = existing.badgeAwarded;
                                    if (typeof num === 'number') {
                                      if (num >= 1 && num <= 3) {
                                        newBadge = num as 1 | 2 | 3;
                                      } else if (num > 3) {
                                        newBadge = undefined;
                                      }
                                    }
                                    return {
                                      ...prev,
                                      [p.userId]: {
                                        ...existing,
                                        rank: num,
                                        badgeAwarded: newBadge
                                      }
                                    };
                                  });
                                }}
                                className="input-field w-full text-xs font-mono text-bone py-2 font-bold"
                              />
                            </div>

                            <div className="flex-1 min-w-[140px]">
                              <label htmlFor={`medal-${p.userId}`} className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5">Medal / Badge</label>
                              <select
                                id={`medal-${p.userId}`}
                                name={`medal-${p.userId}`}
                                value={curr.badgeAwarded || ''}
                                onChange={(e) => {
                                  const v = e.target.value ? (parseInt(e.target.value) as 1 | 2 | 3) : undefined;
                                  setRankEdits(prev => {
                                    const existing = prev[p.userId] || curr;
                                    return {
                                      ...prev,
                                      [p.userId]: { 
                                        ...existing, 
                                        badgeAwarded: v,
                                        rank: v !== undefined ? v : existing.rank
                                      }
                                    };
                                  });
                                }}
                                className="input-field w-full text-xs font-mono text-bone py-2 cursor-pointer bg-ink-3"
                              >
                                <option value="">No Medal</option>
                                <option value="1">🥇 1st Gold</option>
                                <option value="2">🥈 2nd Silver</option>
                                <option value="3">🥉 3rd Bronze</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label htmlFor={`custom-result-${p.userId}`} className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5">Result / Note</label>
                            <input
                              id={`custom-result-${p.userId}`}
                              name={`custom-result-${p.userId}`}
                              type="text"
                              value={curr.customResult}
                              placeholder="e.g. 1st Place"
                              onChange={(e) => {
                                const v = e.target.value;
                                setRankEdits(prev => {
                                  const existing = prev[p.userId] || curr;
                                  return {
                                    ...prev,
                                    [p.userId]: { ...existing, customResult: v }
                                  };
                                });
                              }}
                              className="input-field w-full text-xs font-mono text-bone py-2"
                            />
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
                  disabled={saveRanksMutation.isPending || participants.length === 0}
                  className="btn-primary flex-1 py-3 text-xs font-mono font-bold"
                >
                  {saveRanksMutation.isPending ? 'Publishing...' : 'Publish Standings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: All Attendees List (Solid Theme) */}
        {showAttendeesModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-ink border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-bone">
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-blue-400" />
                  <h3 className="font-display text-xl text-bone">Registered Attendees ({realParticipantCount})</h3>
                </div>
                <button onClick={() => setShowAttendeesModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {participants.length === 0 ? (
                  <div className="text-center py-8 text-bone-dim font-mono text-sm">No attendees registered yet.</div>
                ) : (
                  participants.map((p, idx) => (
                    <div key={p.userId || idx} className="flex items-center justify-between p-3 rounded-2xl bg-ink-2 border border-line/20 gap-2 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
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
                        <div className="min-w-0 flex-1">
                          <div 
                            onClick={() => handleNavigateProfile(p.userId)}
                            className="font-bold text-sm text-bone flex items-center gap-1.5 cursor-pointer hover:underline flex-wrap"
                          >
                            <span className="break-words leading-tight">{p.userName}</span>
                            {p.userId === user?.uid && <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded shrink-0">You</span>}
                          </div>
                          <div className="text-xs font-mono text-bone-dim truncate">
                            {p.isRanked ? `Rank #${p.rank} • ${p.customResult || ''}` : 'Registered Attendee'}
                          </div>
                        </div>
                      </div>
                      {p.badgeAwarded && (
                        <div className="shrink-0">
                          <LeaderboardBadgeChip rank={p.badgeAwarded} />
                        </div>
                      )}
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
              className="bg-ink border border-blue-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 text-bone"
            >
              <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto">
                {statusPopup.type === 'joined' ? <Check size={28} /> : <UserCheck size={28} />}
              </div>

              <div>
                <h3 className="font-display text-2xl text-bone">
                  {statusPopup.type === 'joined' ? "RSVP Confirmed! 🎉" : "Left Event"}
                </h3>
                <p className="text-xs text-bone-dim mt-1 font-mono">
                  {statusPopup.type === 'joined' 
                    ? `You are registered for "${event.title}". See you there!` 
                    : `You have successfully cancelled your RSVP for "${event.title}".`}
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

        {/* Edit Event Modal */}
        {editingEvent && (
          <EditEventSheet
            event={editingEvent}
            isOpen={!!editingEvent}
            onClose={() => setEditingEvent(null)}
          />
        )}
      </motion.div>
    </div>,
    document.body
  );
}
