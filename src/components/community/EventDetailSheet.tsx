import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays, Users, MapPin, Trophy, Sparkles, Edit3, Trash2, Shield, Award, Crown, CheckCircle2, Check, UserCheck, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  joinEvent, leaveEvent, getEventParticipants, deleteSimpleEvent, 
  awardEventTop3Badges, getUserClans, isUserJoinedEvent 
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

  const [editingEvent, setEditingEvent] = useState<SimpleEvent | null>(null);
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [isJoinedState, setIsJoinedState] = useState<boolean | null>(null);
  const [statusPopup, setStatusPopup] = useState<{ isOpen: boolean; type: 'joined' | 'left' } | null>(null);

  const [selectedWinners, setSelectedWinners] = useState<{
    goldUserId: string;
    silverUserId: string;
    bronzeUserId: string;
  }>({ goldUserId: '', silverUserId: '', bronzeUserId: '' });

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
    enabled: !!eventId
  });

  const { data: isJoinedDirect } = useQuery({
    queryKey: ['isJoinedEvent', eventId, user?.uid],
    queryFn: () => (user ? isUserJoinedEvent(eventId, user.uid) : false),
    enabled: !!user
  });

  const { data: userClans = [] } = useQuery({
    queryKey: ['userClans', user?.uid],
    queryFn: () => (user ? getUserClans(user.uid) : []),
    enabled: !!user
  });

  const isJoined = isJoinedState !== null ? isJoinedState : (isJoinedDirect ?? participants.some(p => p.userId === user?.uid));
  const isClanMember = !event?.clanId || userClans.some(c => c.id === event.clanId) || isAdmin;
  const isCreatorOrAdmin = isAdmin || user?.uid === event?.createdBy;

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

  const awardBadgesMutation = useMutation({
    mutationFn: async () => {
      const topWinners: { userId: string; userName: string; rank: 1 | 2 | 3 }[] = [];
      if (selectedWinners.goldUserId) {
        const p = participants.find(x => x.userId === selectedWinners.goldUserId);
        if (p) topWinners.push({ userId: p.userId, userName: p.userName, rank: 1 });
      }
      if (selectedWinners.silverUserId) {
        const p = participants.find(x => x.userId === selectedWinners.silverUserId);
        if (p) topWinners.push({ userId: p.userId, userName: p.userName, rank: 2 });
      }
      if (selectedWinners.bronzeUserId) {
        const p = participants.find(x => x.userId === selectedWinners.bronzeUserId);
        if (p) topWinners.push({ userId: p.userId, userName: p.userName, rank: 3 });
      }

      if (topWinners.length === 0) throw new Error('Please select at least 1 winner');
      await awardEventTop3Badges(eventId, topWinners);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventParticipants', eventId] });
      showToast('Top 3 badges awarded successfully!', 'success');
      setAwardModalOpen(false);
    },
    onError: (err: any) => showToast(err?.message || 'Failed to award badges', 'error')
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
          {event.coverUrl ? (
            <img src={event.coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-blue-400/40 bg-blue-950/20"><CalendarDays size={64} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-ink/60 backdrop-blur-md rounded-full text-bone hover:bg-ink-2 transition-colors z-20">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 relative -mt-16 shrink-0 pb-6 border-b border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex text-[10px] font-mono uppercase bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-md backdrop-blur-sm border border-blue-500/30 font-bold">
                Community Event
              </span>
              {event.visibility === 'clan_only' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase bg-sienna/20 text-sienna px-2.5 py-1 rounded-md backdrop-blur-sm border border-sienna/30 font-bold">
                  <Shield size={11} /> Clan Only
                </span>
              )}
              {event.badgesAwarded && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase bg-amber-400/20 text-amber-300 px-2 py-1 rounded-md border border-amber-400/30 font-bold">
                  <Award size={11} /> Badges Awarded
                </span>
              )}
            </div>

            {isCreatorOrAdmin && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setEditingEvent(event)} 
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

          <h1 className="font-display text-3xl sm:text-4xl text-bone mb-2">{event.title}</h1>
          <p className="text-bone-dim text-sm mb-4 leading-relaxed max-w-3xl whitespace-pre-wrap">{event.description}</p>
          
          {/* Timing & Interactive Attendees Pill */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono mb-4">
            <span
              className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 ${
                countdownType === 'ongoing'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : countdownType === 'upcoming'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-ink-3 text-bone-dim'
              }`}
            >
              <Sparkles size={13} /> {countdownLabel}
            </span>

            {/* Clickable Attendees Pill */}
            <button
              onClick={() => setShowAttendeesModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-ink-2 hover:bg-ink-3 border border-line text-bone font-bold transition-all group"
            >
              <Users size={14} className="text-blue-400 group-hover:scale-110 transition-transform" /> 
              <span>{event.participantCount} Attending</span>
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
            <div className="p-3.5 mb-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-950/20 border border-amber-400/40 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                <Trophy size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold tracking-wider">Prizes & Rewards</div>
                <div className="text-sm font-bold text-bone truncate">{event.prize}</div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isClanMember ? (
              <button
                onClick={() => {
                  onClose();
                  if (event.clanId) navigate(`/clan/${event.clanId}`);
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
                {leaveMutation.isPending ? 'Cancelling...' : 'Leave Event'}
              </button>
            ) : (
              <button 
                onClick={() => joinMutation.mutate()} 
                disabled={joinMutation.isPending} 
                className="btn-primary px-8 py-2.5 text-base font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)]"
              >
                {joinMutation.isPending ? 'RSVPing...' : 'RSVP / Join Event'}
              </button>
            )}

            {isCreatorOrAdmin && participants.length > 0 && !event.badgesAwarded && (
              <button
                onClick={() => setAwardModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ml-auto"
              >
                <Crown size={14} /> Award Top 3 Medals
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-ink space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xl text-bone flex items-center gap-2">
                <Users size={18} className="text-blue-400" /> Attendees ({participants.length})
              </h3>
              <button
                onClick={() => setShowAttendeesModal(true)}
                className="text-xs font-mono text-blue-400 hover:underline flex items-center gap-1"
              >
                View all <ChevronRight size={12} />
              </button>
            </div>
            
            <div className="space-y-2">
              {loadingParticipants ? (
                <div className="text-center py-8 text-bone-dim font-mono text-sm">Loading attendees...</div>
              ) : participants.length === 0 ? (
                <div className="p-8 text-center bg-ink-2/40 border border-dashed border-line rounded-3xl text-bone-dim text-sm font-mono">
                  No attendees yet. Be the first to RSVP!
                </div>
              ) : (
                participants.map((p) => (
                  <div 
                    key={p.userId} 
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-colors ${
                      p.userId === user?.uid 
                        ? 'bg-ink-2 border-blue-500/40 shadow-sm' 
                        : 'bg-ink-2/40 border-line/20'
                    }`}
                  >
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
                          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded border border-blue-500/30">You</span>
                        )}
                        {p.badgeAwarded && (
                          <LeaderboardBadgeChip rank={p.badgeAwarded} />
                        )}
                      </div>
                      <div className="text-xs font-mono text-bone-dim">
                        Joined {p.joinedAt?.toDate ? p.joinedAt.toDate().toLocaleDateString() : 'Recently'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal: All Attendees List */}
        {showAttendeesModal && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-bg border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-line/30 pb-3">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-blue-400" />
                  <h3 className="font-display text-xl text-bone">All Attendees ({participants.length})</h3>
                </div>
                <button onClick={() => setShowAttendeesModal(false)} className="p-1 text-bone-dim hover:text-bone"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {participants.length === 0 ? (
                  <div className="text-center py-8 text-bone-dim font-mono text-sm">No one has RSVP'd yet.</div>
                ) : (
                  participants.map((p) => (
                    <div key={p.userId} className="flex items-center justify-between p-3 rounded-2xl bg-ink-2/60 border border-line/20">
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
                            {p.userId === user?.uid && <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">You</span>}
                          </div>
                          <div className="text-xs font-mono text-bone-dim">Registered attendee</div>
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

        {/* Modal: Award Top 3 Badges */}
        {awardModalOpen && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-bg border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl text-bone flex items-center gap-2">
                  <Crown size={18} className="text-amber-400" /> Award Top 3 Winners
                </h3>
                <button onClick={() => setAwardModalOpen(false)} className="p-1 text-bone-dim hover:text-bone"><X size={16} /></button>
              </div>

              <p className="text-xs text-bone-dim font-mono">
                Select athletes who placed in the top 3 to award shiny Gold, Silver, and Bronze badges to their profiles!
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-amber-300 font-bold mb-1">🥇 1st Place (Gold Badge)</label>
                  <select
                    value={selectedWinners.goldUserId}
                    onChange={e => setSelectedWinners(prev => ({ ...prev, goldUserId: e.target.value }))}
                    className="input-field w-full text-xs font-mono text-bone bg-ink-2"
                  >
                    <option value="">Select athlete...</option>
                    {participants.map(p => (
                      <option key={p.userId} value={p.userId}>{p.userName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 font-bold mb-1">🥈 2nd Place (Silver Badge)</label>
                  <select
                    value={selectedWinners.silverUserId}
                    onChange={e => setSelectedWinners(prev => ({ ...prev, silverUserId: e.target.value }))}
                    className="input-field w-full text-xs font-mono text-bone bg-ink-2"
                  >
                    <option value="">Select athlete...</option>
                    {participants.map(p => (
                      <option key={p.userId} value={p.userId}>{p.userName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-amber-600 font-bold mb-1">🥉 3rd Place (Bronze Badge)</label>
                  <select
                    value={selectedWinners.bronzeUserId}
                    onChange={e => setSelectedWinners(prev => ({ ...prev, bronzeUserId: e.target.value }))}
                    className="input-field w-full text-xs font-mono text-bone bg-ink-2"
                  >
                    <option value="">Select athlete...</option>
                    {participants.map(p => (
                      <option key={p.userId} value={p.userId}>{p.userName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAwardModalOpen(false)}
                  className="btn-secondary flex-1 py-3 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => awardBadgesMutation.mutate()}
                  disabled={awardBadgesMutation.isPending}
                  className="btn-primary flex-1 py-3 text-xs font-mono font-bold"
                >
                  {awardBadgesMutation.isPending ? 'Awarding...' : 'Award Badges'}
                </button>
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
              className="bg-bg border border-blue-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4"
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
