import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Shield, Users, MapPin, Plus, Target, CalendarDays, MessageSquare, Trophy, Sparkles, Megaphone, MessageCircle, UserPlus, Clock, Lock, Globe, Crown, Pencil, Trash2, TrendingUp, LogOut, Loader2 } from 'lucide-react';
import { CardAction, ChampionRow, DateTile, EmptyState, MetaItem, StatusPill, getScheduleStatus, toMillis, formatWhen } from '@/components/community/ui';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getClan, joinClan, leaveClan, getClanMembers, updateClanMemberRole, transferLeadership,
  getClanPosts, createClanPost, toggleLikeClanPost, getPostComments, createPostComment,
  getClanChallenges, getClanEvents, deleteChallenge, deleteSimpleEvent, deleteClan,
  getClanAnnouncements, getUserClanJoinRequest, getClanJoinRequests, cancelClanJoinRequest
} from '@/services/community';
import { ClanMembership, ClanV2, CommunityPost, ChallengeV2, SimpleEvent, CommunityAnnouncement, ClanJoinRequest } from '@/types';
import { useUIStore } from '@/stores/ui-store';
import { LiveUserName } from '@/components/ui/LiveUser';
import { CreateChallengeSheet } from '@/components/community/CreateChallengeSheet';
import { CreateEventSheet } from '@/components/community/CreateEventSheet';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';
import { SinglePostSheet } from '@/components/community/SinglePostSheet';
import { CreatePostSheet } from '@/components/community/CreatePostSheet';
import { formatChallengeGoal } from '@/components/community/UpcomingReminderWidget';
import { EditClanSheet } from '@/components/community/EditClanSheet';
import { EditChallengeSheet } from '@/components/community/EditChallengeSheet';
import { EditEventSheet } from '@/components/community/EditEventSheet';
import { ClanPostItem } from '@/components/community/ClanPostItem';
import { ClanAnnouncementsModal } from '@/components/community/ClanAnnouncementsModal';
import { ClanAnnouncementBanner } from '@/components/community/ClanAnnouncementBanner';
import { RequestJoinClanModal } from '@/components/community/RequestJoinClanModal';
import { ClanJoinRequestsModal } from '@/components/community/ClanJoinRequestsModal';
import { PersonalChallengeDetailSheet } from '@/components/community/PersonalChallengeDetailSheet';
import { CreatePersonalChallengeSheet } from '@/components/community/CreatePersonalChallengeSheet';

type ClanTab = 'posts' | 'challenges' | 'events' | 'members' | 'about';

const ROLE_LABEL: Record<string, string> = { leader: 'Leader', co_leader: 'Co-Leader', member: 'Member' };

export function ClanPage() {
  const { id: clanId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ClanTab>('posts');
  
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
  const [createPersonalChallengeOpen, setCreatePersonalChallengeOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editClanOpen, setEditClanOpen] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);
  const [editingEvent, setEditingEvent] = useState<SimpleEvent | null>(null);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [requestJoinOpen, setRequestJoinOpen] = useState(false);
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(searchParams.get('requests') === 'true');

  const { data: clan, isLoading: loadingClan } = useQuery({
    queryKey: ['clan', clanId],
    queryFn: () => getClan(clanId!),
    enabled: !!clanId
  });

  const { data: members = [] } = useQuery({
    queryKey: ['clanMembers', clanId],
    queryFn: () => getClanMembers(clanId!),
    enabled: !!clanId
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['clanPosts', clanId],
    queryFn: () => getClanPosts(clanId!),
    enabled: !!clanId
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ['clanChallenges', clanId],
    queryFn: () => getClanChallenges(clanId!),
    enabled: !!clanId
  });

  const { data: events = [] } = useQuery({
    queryKey: ['clanEvents', clanId],
    queryFn: () => getClanEvents(clanId!),
    enabled: !!clanId
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['clanAnnouncements', clanId],
    queryFn: () => getClanAnnouncements(clanId!),
    enabled: !!clanId
  });

  const myMembership = members.find(m => m.userId === user?.uid);
  const isLeader = myMembership?.role === 'leader' || isAdmin;
  const isCoLeader = myMembership?.role === 'co_leader';
  const isMember = !!myMembership || isAdmin;
  // Actual membership record (admins can view everything but are not members unless they joined)
  const hasMembership = !!myMembership;
  const canManage = isLeader || isCoLeader || isAdmin;

  const { data: userJoinRequest } = useQuery({
    queryKey: ['userClanJoinRequest', clanId, user?.uid],
    queryFn: () => (clanId && user ? getUserClanJoinRequest(clanId, user.uid) : null),
    enabled: !!clanId && !!user && !isMember
  });

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['clanJoinRequests', clanId],
    queryFn: () => (clanId ? getClanJoinRequests(clanId) : []),
    enabled: !!clanId && canManage
  });

  const pinnedAnnouncement = announcements.find(a => a.isPinned) || announcements[0];

  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  // Real-time unread message subscription
  useEffect(() => {
    if (!clanId || !isMember) {
      setHasUnreadChat(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: () => void = () => {};

    const evaluate = (rawDocs: any[]) => {
      if (rawDocs.length === 0) {
        setHasUnreadChat(false);
        return;
      }

      const getTime = (val: any) => {
        if (!val) return 0;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        if (typeof val === 'string') return new Date(val).getTime();
        if (typeof val === 'number') return val;
        return 0;
      };

      const docs = [...rawDocs];
      docs.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
      const latestMsg = docs[0];

      if (!latestMsg) {
        setHasUnreadChat(false);
        return;
      }

      // If user themselves sent the latest message, it is not unread for them
      if (latestMsg.userId === user?.uid) {
        setHasUnreadChat(false);
        return;
      }

      const msgTime = getTime(latestMsg.createdAt);
      const lastRead = parseInt(localStorage.getItem(`lastReadChat_${clanId}`) || '0', 10);
      
      setHasUnreadChat(msgTime > lastRead);
    };

    // Latest message only (uses the clanId + createdAt DESC index); falls back to an
    // unordered window if the index is unavailable.
    const subscribe = (ordered: boolean) => {
      const q = ordered
        ? query(collection(db, 'clan_messages'), where('clanId', '==', clanId), orderBy('createdAt', 'desc'), limit(1))
        : query(collection(db, 'clan_messages'), where('clanId', '==', clanId), limit(50));

      unsubscribe = onSnapshot(
        q,
        (snap) => evaluate(snap.docs.map(d => d.data({ serverTimestamps: 'estimate' }))),
        (err: any) => {
          if (ordered && err?.code === 'failed-precondition' && !cancelled) {
            subscribe(false);
            return;
          }
          console.warn('Unread chat listener error:', err);
        }
      );
    };

    subscribe(true);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [clanId, isMember, user?.uid]);

  const cancelRequestMutation = useMutation({
    mutationFn: async (reqId: string) => {
      const ok = await confirm({
        title: 'Cancel Request',
        message: 'Cancel your request to join this clan?',
        confirmText: 'Cancel Request',
        type: 'danger',
        icon: 'trash',
      });
      if (!ok) return false;
      await cancelClanJoinRequest(reqId);
      return true;
    },
    onSuccess: (didCancel) => {
      if (!didCancel) return;
      queryClient.invalidateQueries({ queryKey: ['userClanJoinRequest', clanId, user?.uid] });
      showToast('Join request cancelled', 'info');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to cancel request', 'error')
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await joinClan(user.uid, user.displayName || 'Unknown', user.photoURL || '', clanId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanMembers'] });
      queryClient.invalidateQueries({ queryKey: ['clan'] });
      queryClient.invalidateQueries({ queryKey: ['userClans'] });
      queryClient.invalidateQueries({ queryKey: ['isMemberOfClan'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['communityEvents'] });
      showToast('Joined clan!');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to join clan', 'error')
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (myMembership?.role === 'leader' && members.length > 1) throw new Error('You must transfer leadership before leaving.');
      const ok = await confirm({
        title: 'Leave Clan',
        message: 'Are you sure you want to leave this clan?',
        confirmText: 'Leave',
        type: 'warning',
        icon: 'alert',
      });
      if (!ok) return false;
      await leaveClan(user.uid, clanId!);
      return true;
    },
    onSuccess: (didLeave) => {
      if (!didLeave) return;
      queryClient.invalidateQueries({ queryKey: ['clanMembers'] });
      queryClient.invalidateQueries({ queryKey: ['clan'] });
      queryClient.invalidateQueries({ queryKey: ['userClans'] });
      queryClient.invalidateQueries({ queryKey: ['isMemberOfClan'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['communityEvents'] });
      showToast('Left clan');
      navigate('/community');
    },
    onError: (err: any) => showToast(err.message, 'error')
  });

  const deleteClanMutation = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Delete Clan',
        message: 'Are you sure you want to permanently delete this clan and all its data? This cannot be undone.',
        confirmText: 'Delete Clan',
        type: 'danger',
        icon: 'trash',
      });
      if (!ok) return false;
      await deleteClan(clanId!);
      return true;
    },
    onSuccess: (didDelete) => {
      if (!didDelete) return;
      queryClient.invalidateQueries({ queryKey: ['publicClans'] });
      queryClient.invalidateQueries({ queryKey: ['userClans'] });
      showToast('Clan deleted successfully');
      navigate('/community', { replace: true });
    },
    onError: (err: any) => showToast(err.message || 'Failed to delete clan', 'error')
  });

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
        queryClient.invalidateQueries({ queryKey: ['clanChallenges', clanId] });
        showToast('Challenge deleted');
      }
    },
    onError: (err: any) => showToast(err?.message || 'Failed to delete challenge', 'error')
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const ok = await confirm({
        title: 'Delete Event',
        message: 'Are you sure you want to delete this event?',
        confirmText: 'Delete',
        type: 'danger',
        icon: 'trash',
      });
      if (ok) {
        await deleteSimpleEvent(id);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['clanEvents', clanId] });
        showToast('Event deleted');
      }
    },
    onError: (err: any) => showToast(err?.message || 'Failed to delete event', 'error')
  });

  const handleRoleChange = async (memberId: string, newRole: 'leader' | 'co_leader' | 'member', memberName: string) => {
    if (!isLeader) return;
    try {
      if (newRole === 'leader') {
        const ok = await confirm({
          title: 'Transfer Leadership',
          message: `Make ${memberName} the clan leader? The current leader will become a co-leader.`,
          confirmText: 'Transfer',
          type: 'warning',
          icon: 'alert',
        });
        if (!ok) return;
        const currentLeaderId = clan?.leaderId || user?.uid || '';
        await transferLeadership(clanId!, currentLeaderId, memberId, memberName);
        showToast(`Transferred leadership to ${memberName}`);
      } else {
        await updateClanMemberRole(clanId!, memberId, newRole);
        showToast(`Updated role for ${memberName}`);
      }
      queryClient.invalidateQueries({ queryKey: ['clanMembers', clanId] });
      queryClient.invalidateQueries({ queryKey: ['clan', clanId] });
    } catch (err: any) {
      showToast(err.message || 'Failed to update role', 'error');
    }
  };

  if (loadingClan) {
    return (
      <div className="cx pro-scope min-h-[60vh] flex items-center justify-center text-bone-dim">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (!clan) {
    return (
      <div className="cx pro-scope max-w-md mx-auto pt-16">
        <EmptyState
          icon={Shield}
          title="Clan not found"
          description="This clan may have been deleted, or the link is no longer valid."
          action={
            <button type="button" onClick={() => navigate('/community')} className="cx-btn cx-btn-ghost">
              Back to Community
            </button>
          }
        />
      </div>
    );
  }

  const isPublic = !clan.visibility || clan.visibility === 'public';
  const visibilityLabel = clan.visibility === 'closed' ? 'Closed' : clan.visibility === 'private' ? 'Private' : 'Public';
  const openProfile = (uid: string) => navigate(uid === user?.uid ? '/profile' : `/profile/${uid}`);
  const tabs: { id: ClanTab; label: string; count?: number }[] = [
    { id: 'posts', label: 'Posts' },
    { id: 'challenges', label: 'Challenges', count: challenges.length },
    { id: 'events', label: 'Events', count: events.length },
    { id: 'members', label: 'Members', count: members.length },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="cx pro-scope max-w-4xl mx-auto pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <button type="button" onClick={() => navigate('/community')} className="cx-icon-btn" aria-label="Back to Community">
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center gap-2">
          {/* Discussion (dedicated chat page) */}
          <button
            type="button"
            onClick={() => {
              if (clanId) {
                localStorage.setItem(`lastReadChat_${clanId}`, Date.now().toString());
                setHasUnreadChat(false);
              }
              navigate(`/clan/${clanId}/chat`);
            }}
            className="cx-icon-btn"
            title="Clan discussion"
            aria-label={hasUnreadChat ? 'Clan discussion, new messages' : 'Clan discussion'}
          >
            <MessageCircle size={18} />
            {isMember && hasUnreadChat && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-ink-2" />
            )}
          </button>

          {/* Announcements */}
          <button
            type="button"
            onClick={() => setAnnouncementsOpen(true)}
            className="cx-icon-btn"
            title="Announcements"
            aria-label="Announcements"
          >
            <Megaphone size={18} />
            {announcements.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-ink-2" />
            )}
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="cx-card overflow-hidden">
        <div className="relative h-36 sm:h-52 bg-ink-3">
          {clan.coverUrl ? (
            <img src={clan.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-bone-dim/50"><Shield size={40} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          {clan.category && (
            <span className="absolute left-3 top-3 inline-flex items-center h-6 px-2.5 rounded-full bg-black/45 backdrop-blur text-white text-[11px] font-semibold capitalize">
              {clan.category}
            </span>
          )}
        </div>

        <div className="p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-bone leading-tight break-words">{clan.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <MetaItem icon={Users}>{clan.memberCount || 0} {clan.memberCount === 1 ? 'member' : 'members'}</MetaItem>
            {clan.location?.city && <MetaItem icon={MapPin}>{clan.location.city}</MetaItem>}
            <MetaItem icon={isPublic ? Globe : Lock}>{visibilityLabel} clan</MetaItem>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {hasMembership ? (
              <button
                type="button"
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="cx-btn cx-btn-ghost"
              >
                {leaveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                {leaveMutation.isPending ? 'Leaving…' : 'Leave clan'}
              </button>
            ) : (isPublic || isAdmin) ? (
              <button
                type="button"
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="cx-btn bg-sienna min-w-[128px]"
              >
                {joinMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                {joinMutation.isPending ? 'Joining…' : 'Join clan'}
              </button>
            ) : clan.visibility === 'closed' ? (
              <button type="button" disabled className="cx-btn cx-btn-ghost">
                <Lock size={15} /> Not accepting members
              </button>
            ) : userJoinRequest ? (
              <button
                type="button"
                onClick={() => userJoinRequest.id && cancelRequestMutation.mutate(userJoinRequest.id)}
                disabled={cancelRequestMutation.isPending}
                className="cx-btn border border-amber/30 bg-amber/10 text-amber hover:bg-amber/15 !shadow-none"
                title="Cancel join request"
              >
                <Clock size={15} />
                {cancelRequestMutation.isPending ? 'Cancelling…' : 'Request pending'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRequestJoinOpen(true)}
                className="cx-btn bg-sienna"
              >
                <Lock size={15} /> Request to join
              </button>
            )}

            {canManage && pendingRequests.length > 0 && (
              <button
                type="button"
                onClick={() => setJoinRequestsOpen(true)}
                className="cx-btn cx-btn-ghost"
              >
                <UserPlus size={15} />
                Requests
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-semibold leading-5 text-center tabular-nums">
                  {pendingRequests.length}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-5 border-b border-line">
        <div role="tablist" className="flex gap-1 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(tab => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`relative shrink-0 h-11 px-3 text-sm font-medium inline-flex items-center gap-1.5 transition-colors !shadow-none ${
                  selected ? 'text-bone' : 'text-bone-dim hover:text-bone'
                }`}
              >
                {tab.label}
                {!!tab.count && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-ink-3 text-[11px] font-semibold leading-5 text-center tabular-nums text-bone-dim">
                    {tab.count}
                  </span>
                )}
                {selected && (
                  <motion.span
                    layoutId="clan-detail-tab"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sienna"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {/* Tab Content Area */}
        <div className="pt-5">

          {activeTab === 'posts' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {pinnedAnnouncement && (
                <ClanAnnouncementBanner
                  announcement={pinnedAnnouncement}
                  onClick={() => setAnnouncementsOpen(true)}
                />
              )}

              {!isMember ? (
                <EmptyState
                  icon={Lock}
                  compact
                  title="Members only"
                  description="Join this clan to read and write posts."
                />
              ) : posts.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  compact
                  title="No posts yet"
                  description="Be the first to start a conversation with your clan."
                  action={
                    <button type="button" onClick={() => setCreatePostOpen(true)} className="cx-btn bg-sienna">
                      <Plus size={16} /> New post
                    </button>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {posts.map(p => (
                    <ClanPostItem key={p.id} post={p} onClick={() => setSelectedPost(p)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <section className="cx-surface p-5">
                <h3 className="text-sm font-semibold text-bone mb-2">About this clan</h3>
                <p className="text-sm leading-relaxed text-bone-dim whitespace-pre-wrap break-words">
                  {clan.description || 'No description provided.'}
                </p>

                <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-line">
                  <div>
                    <dt className="text-xs text-bone-dim">Members</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-bone tabular-nums">{clan.memberCount || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-bone-dim">Visibility</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-bone">{visibilityLabel}</dd>
                  </div>
                  {clan.category && (
                    <div>
                      <dt className="text-xs text-bone-dim">Category</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-bone capitalize">{clan.category}</dd>
                    </div>
                  )}
                  {clan.location?.city && (
                    <div>
                      <dt className="text-xs text-bone-dim">City</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-bone">{clan.location.city}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {clan.tags && clan.tags.length > 0 && (
                <section className="cx-surface p-5">
                  <h3 className="text-sm font-semibold text-bone mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {clan.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center h-7 px-3 rounded-full border border-line bg-ink-2 text-xs font-medium text-bone-dim">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {(isLeader || isCoLeader) && (
                <section className="cx-surface p-5">
                  <h3 className="text-sm font-semibold text-bone">Manage clan</h3>
                  <p className="mt-1 text-xs text-bone-dim">Only leaders and co-leaders can see these options.</p>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <button type="button" onClick={() => setEditClanOpen(true)} className="cx-btn cx-btn-ghost sm:flex-1">
                      <Pencil size={15} /> Edit clan
                    </button>
                    {isLeader && (
                      <button
                        type="button"
                        onClick={() => deleteClanMutation.mutate()}
                        disabled={deleteClanMutation.isPending}
                        className="cx-btn cx-btn-danger sm:flex-1"
                      >
                        <Trash2 size={15} /> {deleteClanMutation.isPending ? 'Deleting…' : 'Delete clan'}
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="animate-in fade-in duration-300">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold text-bone">Members</h3>
                <span className="text-xs text-bone-dim tabular-nums">{members.length} total</span>
              </div>

              {members.length === 0 ? (
                <EmptyState icon={Users} compact title="No members yet" />
              ) : (
                <ul className="cx-surface overflow-hidden divide-y divide-line">
                  {members.map(member => {
                    const name = member.userName || 'Athlete';
                    const isSelf = member.userId === user?.uid;
                    // The current leader can't be demoted directly; leadership moves by promoting someone else.
                    const canEditRole = isLeader && !isSelf && member.role !== 'leader';
                    return (
                      <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openProfile(member.userId)}
                          className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden bg-ink-3 border border-line flex items-center justify-center text-sm font-semibold text-bone !shadow-none"
                          aria-label={`View ${name}'s profile`}
                        >
                          <span aria-hidden>{name.charAt(0).toUpperCase()}</span>
                          {member.userPhoto && (
                            <img
                              src={member.userPhoto}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openProfile(member.userId)}
                            className="block max-w-full truncate text-left text-sm font-medium text-bone hover:underline !shadow-none"
                          >
                            <LiveUserName userId={member.userId} fallbackName={name} />
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-bone-dim">You</span>}
                          </button>
                          {!canEditRole && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-bone-dim">
                              {member.role === 'leader' && <Crown size={12} className="text-amber-500" />}
                              {member.role === 'co_leader' && <Shield size={12} className="text-sienna" />}
                              <span className={member.role === 'member' ? '' : 'font-medium text-bone'}>{ROLE_LABEL[member.role] || 'Member'}</span>
                            </div>
                          )}
                        </div>

                        {canEditRole && (
                          <select
                            id={`member-role-select-${member.userId}`}
                            name={`memberRoleSelect_${member.userId}`}
                            aria-label={`Role for ${name}`}
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.userId, e.target.value as any, name)}
                            className="shrink-0 h-8 rounded-lg border border-line bg-ink-2 pl-2.5 pr-7 text-xs font-medium text-bone outline-none focus:border-sienna/60 cursor-pointer appearance-none"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 8px center'
                            }}
                          >
                            <option value="member">Member</option>
                            <option value="co_leader">Co-Leader</option>
                            <option value="leader">Make leader…</option>
                          </select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'challenges' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {isMember && (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-bone leading-tight">Challenges</h3>
                    <p className="text-xs text-bone-dim mt-0.5">{challenges.length} {challenges.length === 1 ? 'challenge' : 'challenges'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCreatePersonalChallengeOpen(true)}
                      className="cx-icon-btn"
                      aria-label="Create personal challenge"
                      title="Personal challenge"
                    >
                      <Sparkles size={18} />
                    </button>
                    {(isLeader || isCoLeader) && (
                      <button
                        type="button"
                        onClick={() => setCreateChallengeOpen(true)}
                        className="cx-icon-btn cx-icon-btn-primary"
                        aria-label="Create clan challenge"
                        title="New clan challenge"
                      >
                        <Plus size={20} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {challenges.length === 0 ? (
                <EmptyState
                  icon={Target}
                  compact
                  title="No challenges yet"
                  description="Clan challenges will appear here once they are created."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {challenges.map(c => {
                    const s = toMillis(c.startDate);
                    const e = toMillis(c.endDate);
                    const goalText = formatChallengeGoal(c.target, c.unit, c.metric);
                    const canEdit = isLeader || isCoLeader || user?.uid === c.createdBy;

                    return (
                      <div
                        key={c.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => setSelectedChallengeId(c.id!)}
                        onKeyDown={ev => { if (ev.key === 'Enter') setSelectedChallengeId(c.id!); }}
                        className="cx-card cx-card-interactive p-4 flex flex-col gap-3 cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl bg-ink-2 border border-line text-sienna flex items-center justify-center shrink-0">
                            <Target size={22} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[15px] font-semibold text-bone leading-snug line-clamp-2">{c.title}</h4>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-bone-dim">
                              <span className="capitalize">{c.metric}</span>
                              {c.challengeType === 'personal' && (<><span aria-hidden>·</span><span>Personal</span></>)}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex items-center -mr-1 -mt-1" onClick={ev => ev.stopPropagation()}>
                              <CardAction icon={Pencil} label="Edit challenge" onClick={() => setEditingChallenge(c)} />
                              <CardAction icon={Trash2} label="Delete challenge" danger onClick={() => deleteChallengeMutation.mutate(c.id!)} />
                            </div>
                          )}
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
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {(isLeader || isCoLeader) && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => setCreateEventOpen(true)} className="cx-btn bg-sienna">
                    <Plus size={16} /> New event
                  </button>
                </div>
              )}

              {events.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  compact
                  title="No events yet"
                  description="Clan meetups and events will appear here."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {events.map(e => {
                    const s = toMillis(e.startTime);
                    const end = toMillis(e.endTime);
                    const canEdit = isLeader || isCoLeader || user?.uid === e.createdBy;

                    return (
                      <div
                        key={e.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => setSelectedEventId(e.id!)}
                        onKeyDown={ev => { if (ev.key === 'Enter') setSelectedEventId(e.id!); }}
                        className="cx-card cx-card-interactive p-4 flex flex-col gap-3 cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <DateTile ms={s} />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[15px] font-semibold text-bone leading-snug line-clamp-2">{e.title}</h4>
                            <p className="mt-1 text-xs text-bone-dim">{s ? formatWhen(s) : 'Date to be announced'}</p>
                          </div>
                          {canEdit && (
                            <div className="flex items-center -mr-1 -mt-1" onClick={ev => ev.stopPropagation()}>
                              <CardAction icon={Pencil} label="Edit event" onClick={() => setEditingEvent(e)} />
                              <CardAction icon={Trash2} label="Delete event" danger onClick={() => deleteEventMutation.mutate(e.id!)} />
                            </div>
                          )}
                        </div>

                        {e.description && (
                          <p className="text-sm text-bone-dim line-clamp-2 leading-relaxed">{e.description}</p>
                        )}

                        {e.topWinner && <ChampionRow name={e.topWinner.userName} result={e.topWinner.customResult} />}

                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          <MetaItem icon={MapPin}>{e.location?.name || 'Remote'}</MetaItem>
                          {e.prize && <MetaItem icon={Trophy}>{e.prize}</MetaItem>}
                        </div>

                        <div className="mt-auto pt-3 border-t border-line flex items-center justify-between gap-2">
                          <StatusPill status={getScheduleStatus(s, end)} />
                          <MetaItem icon={Users}>{e.participantCount || 0} attending</MetaItem>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {createChallengeOpen && <CreateChallengeSheet prefilledClanId={clanId} onClose={() => setCreateChallengeOpen(false)} />}
        {createEventOpen && <CreateEventSheet prefilledClanId={clanId} onClose={() => setCreateEventOpen(false)} />}
        {createPersonalChallengeOpen && <CreatePersonalChallengeSheet onClose={() => setCreatePersonalChallengeOpen(false)} />}
      </AnimatePresence>
      <CreatePostSheet clanId={clanId!} isOpen={createPostOpen} onClose={() => setCreatePostOpen(false)} />
      <SinglePostSheet post={selectedPost} isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} />
      <EditClanSheet clan={clan} isOpen={editClanOpen} onClose={() => setEditClanOpen(false)} />
      {editingChallenge && <EditChallengeSheet challenge={editingChallenge} isOpen={!!editingChallenge} onClose={() => setEditingChallenge(null)} />}
      {editingEvent && <EditEventSheet event={editingEvent} isOpen={!!editingEvent} onClose={() => setEditingEvent(null)} />}

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

      <AnimatePresence>
        {selectedEventId && (
          <EventDetailSheet
            eventId={selectedEventId}
            onClose={() => setSelectedEventId(null)}
          />
        )}
      </AnimatePresence>

      {/* Clan Announcements Sheet */}
      <ClanAnnouncementsModal
        clanId={clanId!}
        clanName={clan?.name || 'Clan'}
        canManage={canManage}
        userRole={myMembership?.role}
        isOpen={announcementsOpen}
        onClose={() => setAnnouncementsOpen(false)}
      />

      {/* Private Clan Join Request Sheet (For prospective members) */}
      <RequestJoinClanModal
        clanId={clanId!}
        clanName={clan?.name || 'Clan'}
        isOpen={requestJoinOpen}
        onClose={() => setRequestJoinOpen(false)}
      />

      {/* Clan Join Requests Review Sheet (For Leaders & Co-Leaders) */}
      <ClanJoinRequestsModal
        clanId={clanId!}
        clanName={clan?.name || 'Clan'}
        isOpen={joinRequestsOpen}
        onClose={() => {
          setJoinRequestsOpen(false);
          setSearchParams({});
        }}
      />

      {/* FAB for Create Post */}
      {isMember && activeTab === 'posts' && (
        <motion.button 
          type="button"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setCreatePostOpen(true)}
          aria-label="New post"
          className="fixed right-5 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] w-14 h-14 bg-sienna rounded-2xl flex items-center justify-center shadow-lg z-[100] active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </motion.button>
      )}
    </div>
  );
}
