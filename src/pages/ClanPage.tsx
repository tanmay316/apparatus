import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Shield, Users, MapPin, Search, Plus, Target, CalendarDays, MessageSquare, Heart, CornerDownRight, Trophy, Sparkles, Bookmark, Share2, Megaphone, MessageCircle, UserPlus, Clock, Lock } from 'lucide-react';
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
import { ClanDiscussionTab } from '@/components/community/ClanDiscussionTab';
import { RequestJoinClanModal } from '@/components/community/RequestJoinClanModal';
import { ClanJoinRequestsModal } from '@/components/community/ClanJoinRequestsModal';

const nmBtn = "bg-ink shadow-sm border border-line/20 hover:border-line/40 transition-colors";
const nmInset = "bg-ink-2 shadow-inner border border-line/10";

function timeAgo(date: any): string {
  if (!date) return 'Just now';
  const millis = typeof date?.toMillis === 'function' 
    ? date.toMillis() 
    : (date?.seconds ? date.seconds * 1000 : (date instanceof Date ? date.getTime() : 0));
  
  if (!millis) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ClanPage() {
  const { id: clanId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'chat' | 'posts' | 'about' | 'members' | 'challenges' | 'events'>('chat');
  
  const [createChallengeOpen, setCreateChallengeOpen] = useState(false);
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

  const cancelRequestMutation = useMutation({
    mutationFn: async (reqId: string) => {
      const ok = await confirm({
        title: 'Cancel Request',
        message: 'Cancel your request to join this clan?',
        confirmText: 'Cancel Request',
        type: 'danger',
        icon: 'trash',
      });
      if (!ok) return;
      await cancelClanJoinRequest(reqId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userClanJoinRequest', clanId, user?.uid] });
      showToast('Join request cancelled', 'info');
    }
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
    }
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (isLeader && members.length > 1) throw new Error('You must transfer leadership before leaving.');
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
    }
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
    }
  });

  const handleRoleChange = async (memberId: string, newRole: 'leader' | 'co_leader' | 'member', memberName: string) => {
    if (!isLeader) return;
    try {
      if (newRole === 'leader') {
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
    return <div className="min-h-screen bg-ink flex items-center justify-center text-bone font-mono">Loading clan...</div>;
  }
  if (!clan) {
    return <div className="min-h-screen bg-ink flex items-center justify-center text-bone font-mono">Clan not found</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-ink pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-ink/80 backdrop-blur-md border-b border-line px-4 h-14 flex items-center justify-between">
        <button onClick={() => navigate('/community')} className="p-2 -ml-2 rounded-full hover:bg-ink-2 text-bone transition-colors">
          <ChevronLeft size={24} />
        </button>
        <span className="font-display tracking-widest text-bone uppercase line-clamp-1 max-w-[200px]">{clan.name}</span>
        
        <div className="flex items-center gap-1 -mr-2">
          {/* Discussion Shortcut Button */}
          <button
            onClick={() => setActiveTab('chat')}
            className={`p-2 rounded-full hover:bg-ink-2 transition-colors ${
              activeTab === 'chat' ? 'text-sienna bg-sienna/10' : 'text-bone-dim hover:text-bone'
            }`}
            title="Clan Discussion"
          >
            <MessageCircle size={20} />
          </button>

          {/* Membership Requests Button for Leadership */}
          {canManage && pendingRequests.length > 0 && (
            <button
              onClick={() => setJoinRequestsOpen(true)}
              className="relative p-2 rounded-full hover:bg-ink-2 text-amber-400 transition-colors"
              title="Membership Requests"
            >
              <UserPlus size={20} />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-ink animate-pulse" />
            </button>
          )}

          {/* Announcement Icon Button */}
          <button
            onClick={() => setAnnouncementsOpen(true)}
            className="relative p-2 rounded-full hover:bg-ink-2 text-bone-dim hover:text-amber-400 transition-colors"
            title="Clan Announcements"
          >
            <Megaphone size={20} />
            {announcements.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-ink animate-pulse" />
            )}
          </button>

          {/* Edit Clan Settings for Leader */}
          {isLeader && (
            <button
              onClick={() => setEditClanOpen(true)}
              className="p-2 rounded-full hover:bg-ink-2 text-bone-dim hover:text-bone transition-colors"
              title="Clan Settings"
            >
              <Shield size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Cover Image */}
      <div className="relative h-48 sm:h-64 bg-ink-3 shrink-0">
        {clan.coverUrl ? (
          <img src={clan.coverUrl} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-bone-dim"><Shield size={48} /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-bg/50 to-transparent" />
      </div>

      {/* Clan Info */}
      <div className="px-6 relative -mt-16 shrink-0 max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-4">
          <div>
            <div className="inline-flex text-[10px] font-mono uppercase bg-sienna/20 text-sienna px-2 py-1 rounded backdrop-blur-sm mb-2 border border-sienna/30">
              {clan.category}
            </div>
            <h1 className="font-display text-4xl text-bone mb-1">{clan.name}</h1>
            <div className="flex items-center gap-4 text-xs font-mono text-bone-dim">
              <span className="flex items-center gap-1.5"><Users size={14} className="text-sienna" /> {clan.memberCount} Members</span>
              {clan.location?.city && (
                <span className="flex items-center gap-1.5"><MapPin size={14} className="text-sienna" /> {clan.location.city}</span>
              )}
              <span className="flex items-center gap-1">
                • {clan.visibility === 'private' ? 'Private Clan' : 'Public Clan'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 mt-4">
          {isMember ? (
            <button 
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
              className={`px-6 py-2 rounded-xl text-sm font-bold text-bone ${nmBtn}`}
            >
              {leaveMutation.isPending ? 'Leaving...' : 'Leave Clan'}
            </button>
          ) : clan.visibility === 'private' ? (
            userJoinRequest ? (
              <button 
                onClick={() => userJoinRequest.id && cancelRequestMutation.mutate(userJoinRequest.id)}
                disabled={cancelRequestMutation.isPending}
                className="px-6 py-2 rounded-xl text-sm font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 flex items-center gap-2 hover:bg-amber-400/20 transition-all active:scale-95"
                title="Click to cancel join request"
              >
                <Clock size={15} />
                <span>{cancelRequestMutation.isPending ? 'Cancelling...' : 'Request Pending'}</span>
              </button>
            ) : (
              <button 
                onClick={() => setRequestJoinOpen(true)}
                className="px-7 py-2 rounded-xl text-sm font-bold bg-sienna text-bg shadow-[0_0_15px_rgba(205,111,72,0.3)] hover:shadow-[0_0_25px_rgba(205,111,72,0.5)] flex items-center gap-2 transition-all active:scale-95"
              >
                <Lock size={15} />
                <span>Request to Join</span>
              </button>
            )
          ) : (
            <button 
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              className="px-8 py-2 rounded-xl text-sm font-bold bg-sienna text-bg shadow-[0_0_15px_rgba(205,111,72,0.3)] hover:shadow-[0_0_25px_rgba(205,111,72,0.5)] transition-all active:scale-95"
            >
              {joinMutation.isPending ? 'Joining...' : 'Join Clan'}
            </button>
          )}

          {/* Pending Membership Requests for Leaders */}
          {canManage && pendingRequests.length > 0 && (
            <button
              onClick={() => setJoinRequestsOpen(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 flex items-center gap-2 transition-all active:scale-95"
            >
              <UserPlus size={15} />
              <span>Requests</span>
              <span className="text-[10px] font-mono font-bold bg-amber-400 text-bg px-1.5 py-0.2 rounded-full">
                {pendingRequests.length}
              </span>
            </button>
          )}

          {/* Announcements Button */}
          <button
            onClick={() => setAnnouncementsOpen(true)}
            className={`px-4 py-2 rounded-xl text-sm font-bold text-bone flex items-center gap-2 ${nmBtn}`}
          >
            <Megaphone size={15} className="text-amber-400" />
            <span>Announcements</span>
            {announcements.length > 0 && (
              <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-400/30">
                {announcements.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-6">
        {/* Tabs */}
        <div className="px-6 border-b border-line shrink-0 flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'chat', label: 'Discussion' },
            { id: 'posts', label: 'Posts' },
            { id: 'about', label: 'About' },
            { id: 'members', label: 'Members' },
            { id: 'challenges', label: 'Challenges' },
            { id: 'events', label: 'Events' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-4 relative font-display text-lg tracking-wide whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id ? 'text-bone' : 'text-bone-dim hover:text-bone'
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === 'chat' && isMember && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
              {activeTab === tab.id && (
                <motion.div layoutId="clan_detail_tab" className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="p-6">
          {activeTab === 'chat' && (
            <div className="animate-in fade-in duration-300">
              <ClanDiscussionTab
                clanId={clanId!}
                clanName={clan.name}
                isMember={isMember}
                userRole={myMembership?.role}
                onJoinClan={() => joinMutation.mutate()}
              />
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* Pinned Announcement Banner */}
              {pinnedAnnouncement && (
                <ClanAnnouncementBanner
                  announcement={pinnedAnnouncement}
                  onClick={() => setAnnouncementsOpen(true)}
                />
              )}

              {isMember ? (
                <div className="space-y-4">
                  {posts.map(p => (
                    <ClanPostItem key={p.id} post={p} onClick={() => setSelectedPost(p)} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-bone-dim text-sm bg-ink-2 rounded-2xl border border-line border-dashed">
                  Join the clan to view and write posts!
                </div>
              )}
              
              {isMember && posts.length === 0 && (
                <div className="text-center py-12 text-bone-dim bg-ink-2/30 rounded-3xl border border-line/20">
                  <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                  <p>No posts yet. Be the first to start a conversation!</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div>
                <h3 className="font-mono text-xs uppercase text-bone-dim mb-2">Description</h3>
                <p className="text-bone whitespace-pre-wrap">{clan.description}</p>
              </div>
              
              {clan.tags && clan.tags.length > 0 && (
                <div>
                  <h3 className="font-mono text-xs uppercase text-bone-dim mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {clan.tags.map(tag => (
                      <span key={tag} className={`px-3 py-1 rounded-full text-xs font-mono text-bone ${nmBtn}`}>#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {(isLeader || isCoLeader) && (
                <div className="mt-8 space-y-3 pt-6 border-t border-line">
                  <h3 className="font-bold text-bone mb-4">Admin Actions</h3>
                  <button
                    onClick={() => setEditClanOpen(true)}
                    className="w-full py-3 rounded-xl border border-sienna text-sienna font-bold text-sm hover:bg-sienna/10 transition-colors"
                  >
                    Edit Clan
                  </button>
                  {isLeader && (
                    <button
                      onClick={() => deleteClanMutation.mutate()}
                      className="w-full py-3 rounded-xl border border-red-500 text-red-500 font-bold text-sm hover:bg-red-500/10 transition-colors"
                    >
                      Delete Clan
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg text-bone">Members ({members.length})</h3>
              </div>
              
              <div className="space-y-3">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-4 rounded-2xl bg-ink-2/60 border border-line/30 hover:border-line/60 transition-colors">
                    <div 
                      onClick={() => {
                        if (member.userId === user?.uid) navigate('/profile');
                        else navigate(`/profile/${member.userId}`);
                      }}
                      className="flex items-center gap-3.5 cursor-pointer hover:opacity-80 transition-opacity min-w-0 flex-1"
                    >
                      {member.userPhoto ? (
                        <img 
                          src={member.userPhoto} 
                          alt={member.userName} 
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-line/30" 
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold shrink-0">
                          {member.userName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-bone font-bold text-sm hover:underline truncate max-w-[130px] sm:max-w-[220px]">{member.userName} {member.userId === user?.uid && '(You)'}</div>
                        <div className="text-xs font-mono text-bone-dim flex items-center gap-2 truncate">
                          {member.role === 'leader' && <span className="text-amber-400 font-bold">👑 Leader</span>}
                          {member.role === 'co_leader' && <span className="text-emerald-400 font-bold">⚔️ Co-Leader</span>}
                          {member.role === 'member' && <span>Member</span>}
                        </div>
                      </div>
                    </div>
                    
                    {isLeader && member.userId !== user?.uid && (
                      <div className="shrink-0">
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.userId, e.target.value as any, member.userName)}
                          className="bg-ink-3 hover:bg-ink-2 text-bone border border-line rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:ring-1 focus:ring-sienna outline-none transition-colors cursor-pointer appearance-none pr-7"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23d9a441' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 8px center'
                          }}
                        >
                          <option value="member" className="bg-ink text-bone">Member</option>
                          <option value="co_leader" className="bg-ink text-bone">Co-Leader</option>
                          <option value="leader" className="bg-ink text-amber-400">Transfer Leadership</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'challenges' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {(isLeader || isCoLeader) && (
                <div className="flex justify-end mb-4">
                  <button 
                    onClick={() => setCreateChallengeOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sienna text-bg text-sm font-bold shadow-[0_0_10px_rgba(205,111,72,0.2)] hover:shadow-[0_0_20px_rgba(205,111,72,0.4)] transition-all"
                  >
                    <Plus size={16} /> Create Challenge
                  </button>
                </div>
              )}
              
              {challenges.length === 0 ? (
                <div className="text-center py-12 text-bone-dim bg-ink-2/30 rounded-3xl border border-line/20">
                  <Target size={48} className="mx-auto mb-4 opacity-30" />
                  <p>No active challenges in this clan.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {challenges.map(c => {
                    const now = Date.now();
                    const s = c.startDate?.toMillis ? c.startDate.toMillis() : 0;
                    const e = c.endDate?.toMillis ? c.endDate.toMillis() : 0;
                    let cdText = 'Active';
                    let cdClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
                    if (now < s) {
                      const diff = s - now;
                      const d = Math.floor(diff / 86400000);
                      const h = Math.floor((diff / 3600000) % 24);
                      cdText = d > 0 ? `Starts in ${d}d` : `Starts in ${h}h`;
                      cdClass = 'badge-countdown-upcoming';
                    } else if (e && now <= e) {
                      const diff = e - now;
                      const d = Math.floor(diff / 86400000);
                      const h = Math.floor((diff / 3600000) % 24);
                      cdText = d > 0 ? `Ends in ${d}d` : `Ends in ${h}h`;
                      cdClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
                    } else if (e && now > e) {
                      cdText = 'Concluded';
                      cdClass = 'bg-red-500/10 text-red-500 border border-red-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest shadow-sm';
                    }

                    return (
                      <div 
                        key={c.id} 
                        onClick={() => setSelectedChallengeId(c.id!)}
                        className={`p-5 rounded-3xl ${nmBtn} flex flex-col justify-between cursor-pointer hover:border-emerald-500/50 transition-all group`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-bone text-lg pr-4 group-hover:text-emerald-400 transition-colors">{c.title}</h4>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono px-2 py-0.5 border rounded-full uppercase ${cdClass}`}>
                                {cdText}
                              </span>
                              {(isLeader || isCoLeader || user?.uid === c.createdBy) && (
                                <div className="flex items-center gap-1" onClick={ev => ev.stopPropagation()}>
                                  <button onClick={() => setEditingChallenge(c)} className="p-1 hover:text-bone text-bone-dim transition-colors"><span className="text-xs font-mono">Edit</span></button>
                                  <button onClick={() => deleteChallengeMutation.mutate(c.id!)} className="p-1 hover:text-red-500 text-bone-dim transition-colors"><span className="text-xs font-mono">Del</span></button>
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-bone-dim mb-3 line-clamp-2">{c.description}</p>
                          
                          {c.topWinner && (
                            <div className="mt-1 p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/50 flex items-center justify-between gap-2 shadow-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                                  🥇
                                </div>
                                <div className="min-w-0 truncate">
                                  <span className="text-[10px] font-mono uppercase text-amber-900 dark:text-amber-400 font-black mr-1">Champion:</span>
                                  <span className="text-xs font-bold text-foreground truncate">{c.topWinner.userName}</span>
                                </div>
                              </div>
                              {c.topWinner.customResult && (
                                <span className="text-[10px] font-mono text-foreground font-bold shrink-0">{c.topWinner.customResult}</span>
                              )}
                            </div>
                          )}

                          {c.prize && (
                            <div className="badge-prize inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold truncate">
                              <Trophy size={11} className="shrink-0" />
                              <span className="truncate">{c.prize}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-xs font-mono text-sienna pt-3 border-t border-line/20">
                          <span>{c.participantCount} Participants</span>
                          {formatChallengeGoal(c.target, c.unit, c.metric) && (
                            <span>Goal: {formatChallengeGoal(c.target, c.unit, c.metric)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {(isLeader || isCoLeader) && (
                <div className="flex justify-end mb-4">
                  <button 
                    onClick={() => setCreateEventOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sienna text-bg text-sm font-bold shadow-[0_0_10px_rgba(205,111,72,0.2)] hover:shadow-[0_0_20px_rgba(205,111,72,0.4)] transition-all"
                  >
                    <Plus size={16} /> Create Event
                  </button>
                </div>
              )}
              
              {events.length === 0 ? (
                <div className="text-center py-12 text-bone-dim bg-ink-2/30 rounded-3xl border border-line/20">
                  <CalendarDays size={48} className="mx-auto mb-4 opacity-30" />
                  <p>No upcoming events in this clan.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {events.map(e => {
                    const now = Date.now();
                    const s = e.startTime?.toMillis ? e.startTime.toMillis() : 0;
                    const end = e.endTime?.toMillis ? e.endTime.toMillis() : 0;
                    let cdText = 'Upcoming';
                    let cdClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
                    if (now < s) {
                      const diff = s - now;
                      const d = Math.floor(diff / 86400000);
                      const h = Math.floor((diff / 3600000) % 24);
                      cdText = d > 0 ? `Starts in ${d}d` : `Starts in ${h}h`;
                      cdClass = 'badge-countdown-upcoming';
                    } else if (end && now <= end) {
                      const diff = end - now;
                      const d = Math.floor(diff / 86400000);
                      const h = Math.floor((diff / 3600000) % 24);
                      cdText = d > 0 ? `Ends in ${d}d` : `Ends in ${h}h`;
                      cdClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
                    } else if (end && now > end) {
                      cdText = 'Concluded';
                      cdClass = 'bg-red-500/10 text-red-500 border border-red-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest shadow-sm';
                    }

                    return (
                      <div 
                        key={e.id} 
                        onClick={() => setSelectedEventId(e.id!)}
                        className={`p-5 rounded-3xl ${nmBtn} flex flex-col justify-between cursor-pointer hover:border-blue-500/50 transition-all group`}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-xs font-mono text-sienna flex items-center gap-1.5">
                              <span>{typeof e.startTime?.toDate === 'function' ? e.startTime.toDate().toLocaleDateString() : 'TBD'}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold ${cdClass}`}>{cdText}</span>
                            </div>
                            {(isLeader || isCoLeader || user?.uid === e.createdBy) && (
                              <div className="flex items-center gap-1" onClick={ev => ev.stopPropagation()}>
                                <button onClick={() => setEditingEvent(e)} className="p-1 hover:text-bone text-bone-dim transition-colors"><span className="text-xs font-mono">Edit</span></button>
                                <button onClick={() => deleteEventMutation.mutate(e.id!)} className="p-1 hover:text-red-500 text-bone-dim transition-colors"><span className="text-xs font-mono">Del</span></button>
                              </div>
                            )}
                          </div>
                          <h4 className="font-bold text-bone text-lg mb-1 group-hover:text-blue-400 transition-colors">{e.title}</h4>
                          <p className="text-sm text-bone-dim mb-3 line-clamp-2">{e.description}</p>

                          {e.topWinner && (
                            <div className="mt-1 p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/50 flex items-center justify-between gap-2 shadow-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                                  🥇
                                </div>
                                <div className="min-w-0 truncate">
                                  <span className="text-[10px] font-mono uppercase text-amber-900 dark:text-amber-400 font-black mr-1">1st Place:</span>
                                  <span className="text-xs font-bold text-foreground truncate">{e.topWinner.userName}</span>
                                </div>
                              </div>
                              {e.topWinner.customResult && (
                                <span className="text-[10px] font-mono text-foreground font-bold shrink-0">{e.topWinner.customResult}</span>
                              )}
                            </div>
                          )}
                          
                          {e.prize && (
                            <div className="badge-prize inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold truncate">
                              <Trophy size={11} className="shrink-0" />
                              <span className="truncate">{e.prize}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-xs font-mono text-bone pt-3 border-t border-line/20">
                          <span className="flex items-center gap-1"><MapPin size={12}/> {e.location?.name || 'Remote'}</span>
                          <span className="text-sienna">{e.participantCount} Attending</span>
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
      </AnimatePresence>
      <CreatePostSheet clanId={clanId!} isOpen={createPostOpen} onClose={() => setCreatePostOpen(false)} />
      <SinglePostSheet post={selectedPost} isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} />
      <EditClanSheet clan={clan} isOpen={editClanOpen} onClose={() => setEditClanOpen(false)} />
      {editingChallenge && <EditChallengeSheet challenge={editingChallenge} isOpen={!!editingChallenge} onClose={() => setEditingChallenge(null)} />}
      {editingEvent && <EditEventSheet event={editingEvent} isOpen={!!editingEvent} onClose={() => setEditingEvent(null)} />}

      <AnimatePresence>
        {selectedChallengeId && (
          <ChallengeDetailSheet
            challengeId={selectedChallengeId}
            onClose={() => setSelectedChallengeId(null)}
          />
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
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setCreatePostOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-sienna text-bg rounded-full flex items-center justify-center shadow-xl shadow-sienna/20 z-[100] hover:scale-105 transition-transform"
        >
          <Plus size={24} />
        </motion.button>
      )}
    </div>
  );
}
