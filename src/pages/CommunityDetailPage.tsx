import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, CheckCircle2, Plus, Calendar as CalendarIcon, MapPin, ArrowLeft, Shield, Edit3, 
  Trash2, X, Megaphone, Trophy, Flame, BarChart2, Radio, ThumbsUp, MessageSquare, 
  Share2, Heart, Award, CheckSquare, Vote, Star, Activity
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { 
  getCommunity, getEventsByCommunity, getUserCommunities, joinCommunity, leaveCommunity, 
  getCommunityMembers, updateCommunity, deleteCommunity, getCommunityAnnouncements, 
  createCommunityAnnouncement, getCommunityPolls, createCommunityPoll, voteOnCommunityPoll, 
  getCommunityChallenges, createCommunityChallenge, joinCommunityChallenge,
  getCommunityPosts, createCommunityPost, likeCommunityPost, getCommunityLiveStats
} from '@/services/events';
import type { AppEvent, Community, CommunityAnnouncement, CommunityPoll, CommunityChallenge, CommunityPost } from '@/types';
import { CreateChallengeModal } from '@/components/community/CreateChallengeModal';
import { LeaderAnalyticsModal } from '@/components/community/LeaderAnalyticsModal';

function CreatePostModal({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const createMutation = useMutation({
    mutationFn: () => createCommunityPost({
      communityId,
      authorId: user!.uid,
      authorName: profile?.displayName || profile?.username || 'Athlete',
      authorPhoto: profile?.photoURL || '',
      title: title.trim(),
      text: text.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityPosts', communityId] });
      showToast('Post published to community!');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to publish post', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-sienna text-xs font-mono uppercase tracking-widest mb-1">
              <MessageSquare size={14} /> Community Feed
            </div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Share Post / Progress</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title (e.g. 📸 First Muscle-Up)</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Leg Day Complete" className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Content</label>
            <textarea required value={text} onChange={e => setText(e.target.value)} placeholder="Share your workout, form check, or progress..." className="input-field w-full min-h-[100px] py-3" />
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={createMutation.isPending || !title.trim()} className="btn-primary px-6 py-2">
              {createMutation.isPending ? 'Publishing...' : 'Post Update'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function EditCommunityModal({ community, onClose }: { community: Community; onClose: () => void }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [tags, setTags] = useState(community.tags?.join(', ') || '');
  const [banner, setBanner] = useState(community.banner || '');

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!community.id) return;
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      await updateCommunity(community.id, {
        name,
        description,
        tags: tagList,
        banner,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', community.id] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities'] });
      showToast('Community updated successfully!');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update community', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Edit Community</h2>
            <p className="text-xs sm:text-sm text-bone-dim mt-0.5">Update community details for your members.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} className="input-field w-full min-h-[100px] py-3" />
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Tags (comma separated)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Banner Image URL</label>
            <input value={banner} onChange={e => setBanner(e.target.value)} className="input-field w-full" />
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={updateMutation.isPending || !name.trim()} className="btn-primary px-6 py-2">{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CreateAnnouncementModal({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(true);

  const createMutation = useMutation({
    mutationFn: () => createCommunityAnnouncement({
      communityId,
      title: title.trim(),
      content: content.trim(),
      authorId: user!.uid,
      authorName: profile?.displayName || profile?.username || 'Leader',
      isPinned,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityAnnouncements', communityId] });
      showToast('Announcement posted!');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to post announcement', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-sienna text-xs font-mono uppercase tracking-widest mb-1">
              <Megaphone size={14} /> Official Post
            </div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Group Announcement</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title (e.g. Sunday Pull-up Competition)</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Morning Workout Rescheduled" className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Announcement Content</label>
            <textarea required value={content} onChange={e => setContent(e.target.value)} placeholder="Write details for your members..." className="input-field w-full min-h-[100px] py-3" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="pinCheck" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} className="rounded accent-sienna" />
            <label htmlFor="pinCheck" className="text-xs text-bone font-mono">Pin this announcement at top</label>
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={createMutation.isPending || !title.trim()} className="btn-primary px-6 py-2">
              {createMutation.isPending ? 'Posting...' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CreatePollModal({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [question, setQuestion] = useState('Next week\'s challenge?');
  const [option1, setOption1] = useState('Pull-ups');
  const [option2, setOption2] = useState('Dips');
  const [option3, setOption3] = useState('Squats');

  const createMutation = useMutation({
    mutationFn: () => createCommunityPoll({
      communityId,
      question: question.trim(),
      options: [
        { id: 'opt1', text: option1.trim(), votesCount: 0 },
        { id: 'opt2', text: option2.trim(), votesCount: 0 },
        { id: 'opt3', text: option3.trim(), votesCount: 0 },
      ].filter(o => Boolean(o.text)),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityPolls', communityId] });
      showToast('Poll created!');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create poll', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !option1.trim() || !option2.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-sienna text-xs font-mono uppercase tracking-widest mb-1">
              <Vote size={14} /> Member Voice
            </div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Create Community Poll</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Poll Question</label>
            <input required value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Next event location?" className="input-field w-full" />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-mono text-bone-dim uppercase">Options</label>
            <input required value={option1} onChange={e => setOption1(e.target.value)} placeholder="Option 1" className="input-field w-full" />
            <input required value={option2} onChange={e => setOption2(e.target.value)} placeholder="Option 2" className="input-field w-full" />
            <input value={option3} onChange={e => setOption3(e.target.value)} placeholder="Option 3 (Optional)" className="input-field w-full" />
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={createMutation.isPending || !question.trim()} className="btn-primary px-6 py-2">
              {createMutation.isPending ? 'Publishing...' : 'Publish Poll'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export function CommunityDetailPage() {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'hub' | 'events' | 'members' | 'about'>('hub');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  const [showPostModal, setShowPostModal] = useState(false);

  const { data: community, isLoading: loadingCommunity } = useQuery({
    queryKey: ['community', communityId],
    queryFn: () => getCommunity(communityId!),
    enabled: !!communityId,
  });

  const { data: communityEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['communityEvents', communityId],
    queryFn: () => getEventsByCommunity(communityId!),
    enabled: !!communityId,
  });

  const { data: userCommunities = [] } = useQuery({
    queryKey: ['userCommunities', user?.uid],
    queryFn: () => getUserCommunities(user!.uid),
    enabled: !!user,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['communityMembers', communityId],
    queryFn: () => getCommunityMembers(communityId!),
    enabled: !!communityId,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['communityAnnouncements', communityId],
    queryFn: () => getCommunityAnnouncements(communityId!),
    enabled: !!communityId,
  });

  const { data: polls = [] } = useQuery({
    queryKey: ['communityPolls', communityId],
    queryFn: () => getCommunityPolls(communityId!),
    enabled: !!communityId,
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ['communityChallenges', communityId],
    queryFn: () => getCommunityChallenges(communityId!),
    enabled: !!communityId,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['communityPosts', communityId],
    queryFn: () => getCommunityPosts(communityId!),
    enabled: !!communityId,
  });

  const { data: liveStats } = useQuery({
    queryKey: ['communityLiveStats', communityId],
    queryFn: () => getCommunityLiveStats(communityId!),
    enabled: !!communityId,
  });

  const isOwner = user?.uid === community?.ownerId || profile?.isAdmin;
  const isJoined = isOwner || userCommunities.some(c => c.id === communityId);

  const likePostMutation = useMutation({
    mutationFn: (postId: string) => likeCommunityPost(postId, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityPosts', communityId] });
    }
  });

  const voteMutation = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) => 
      voteOnCommunityPoll(pollId, optionId, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityPolls', communityId] });
      showToast('Vote submitted!');
    },
    onError: () => showToast('Could not record vote', 'error')
  });

  const joinChallengeMutation = useMutation({
    mutationFn: (challengeId: string) => joinCommunityChallenge(challengeId, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityChallenges', communityId] });
      showToast('Joined community challenge!');
    },
    onError: () => showToast('Could not join challenge', 'error')
  });

  const joinMutation = useMutation({
    mutationFn: () => joinCommunity(user!.uid, communityId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities', user?.uid] });
      queryClient.invalidateQueries({ queryKey: ['communityMembers', communityId] });
      showToast('Joined community!');
    },
    onError: () => showToast('Failed to join community', 'error')
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveCommunity(user!.uid, communityId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community', communityId] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities', user?.uid] });
      queryClient.invalidateQueries({ queryKey: ['communityMembers', communityId] });
      showToast('Left community');
    },
    onError: () => showToast('Failed to leave community', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCommunity(communityId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities'] });
      showToast('Community deleted');
      navigate('/communities');
    },
    onError: (err: any) => showToast(err?.message || 'Failed to delete community', 'error')
  });

  if (loadingCommunity) return <div className="py-20 text-center text-bone-dim font-mono">Loading community...</div>;
  if (!community) return <div className="py-20 text-center text-bone-dim font-mono">Community not found.</div>;

  const communityLevel = Math.max(1, Math.floor((community.membersCount || 1) / 3));

  const topAnnouncement = announcements[0];
  const activeChallenge = challenges[0];
  const defaultPoll: CommunityPoll | undefined = polls[0];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1100px] mx-auto w-full space-y-6">
      
      <Link to="/communities" className="inline-flex items-center gap-2 text-sm text-bone-dim hover:text-bone transition-colors mb-1">
        <ArrowLeft size={16} /> Back to Communities
      </Link>

      {/* Hero Header Banner */}
      <div className="relative min-h-[260px] md:h-80 rounded-[32px] overflow-hidden border border-line bg-ink-2">
        {community.banner && <img src={community.banner} alt={community.name} className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-transparent" />

        <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 bg-amber text-ink font-mono text-[10px] font-bold uppercase rounded shadow-sm flex items-center gap-1">
                <Star size={12} /> Level {communityLevel} Community
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 font-mono text-[10px] uppercase rounded border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {community.membersCount} Members Online
              </span>
              {community.tags?.map(tag => (
                <span key={tag} className="px-2.5 py-0.5 bg-ink/80 text-bone text-[10px] font-mono uppercase rounded backdrop-blur-sm border border-line/20">{tag}</span>
              ))}
            </div>
            
            <h1 className="font-display text-3xl md:text-5xl text-bone mb-2 flex items-center gap-3">
              🏋️ {community.name}
              {community.isVerified && <CheckCircle2 size={24} className="text-sienna" />}
            </h1>
            <p className="text-bone-dim text-sm max-w-2xl">{community.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {user && user.uid !== community.ownerId && (
              <button
                onClick={() => isJoined ? leaveMutation.mutate() : joinMutation.mutate()}
                disabled={joinMutation.isPending || leaveMutation.isPending}
                className={`py-3 px-6 rounded-full font-mono text-xs uppercase tracking-wider transition-all shadow-lg ${
                  isJoined 
                    ? 'bg-ink-3 border border-line text-bone-dim hover:border-danger hover:text-danger' 
                    : 'btn-primary'
                }`}
              >
                {isJoined ? 'Leave Community' : 'Join Community'}
              </button>
            )}

            {isOwner && (
              <>
                <button onClick={() => setShowAnalyticsModal(true)} className="btn-secondary py-3 px-4 inline-flex items-center gap-1.5 text-xs font-mono border-sienna/50 text-sienna hover:bg-sienna hover:text-bone">
                  <BarChart2 size={15} /> Dashboard
                </button>
                <button onClick={() => setShowEditModal(true)} className="btn-secondary py-3 px-4 inline-flex items-center gap-1.5 text-xs font-mono">
                  <Edit3 size={15} /> Edit
                </button>
                <button 
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${community.name}?`)) {
                      deleteMutation.mutate();
                    }
                  }} 
                  disabled={deleteMutation.isPending}
                  className="btn-secondary py-3 px-4 inline-flex items-center gap-1.5 text-xs font-mono border-danger/50 text-danger hover:bg-danger/10"
                >
                  <Trash2 size={15} /> Delete
                </button>
              </>
            )}

            <Link to="/events" className="btn-primary py-3 px-5 inline-flex items-center gap-2 text-xs font-mono shadow-xl">
              <Plus size={16} /> Host Event
            </Link>
          </div>
        </div>
      </div>

      {/* Group Announcement Banner */}
      {topAnnouncement ? (
        <div className="card p-5 bg-gradient-to-r from-sienna/20 via-ink-2 to-ink-2 border-sienna/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-sienna text-bone shrink-0">
              <Megaphone size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase bg-sienna/30 text-sienna px-2 py-0.5 rounded font-bold">Announcement</span>
                <span className="text-xs text-bone-dim font-mono">Posted by {topAnnouncement.authorName}</span>
              </div>
              <h3 className="font-display text-lg text-bone mt-1">{topAnnouncement.title}</h3>
              <p className="text-xs text-bone-dim mt-0.5 line-clamp-2">{topAnnouncement.content}</p>
            </div>
          </div>
          {isOwner && (
            <button onClick={() => setShowAnnouncementModal(true)} className="btn-secondary text-xs font-mono shrink-0">
              + Post Announcement
            </button>
          )}
        </div>
      ) : isOwner ? (
        <div className="card p-5 border-dashed border-line/50 flex items-center justify-between gap-4">
          <span className="text-xs text-bone-dim font-mono">No announcements yet. Keep your members updated!</span>
          <button onClick={() => setShowAnnouncementModal(true)} className="btn-secondary text-xs font-mono shrink-0">
            + Post Announcement
          </button>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-4 overflow-x-auto">
        <button
          onClick={() => setTab('hub')}
          className={`px-5 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors ${tab === 'hub' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Community Hub
        </button>
        <button
          onClick={() => setTab('events')}
          className={`px-5 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors ${tab === 'events' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Events ({communityEvents.length})
        </button>
        <button
          onClick={() => setTab('members')}
          className={`px-5 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors ${tab === 'members' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Members ({community.membersCount})
        </button>
        <button
          onClick={() => setTab('about')}
          className={`px-5 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors ${tab === 'about' ? 'bg-sienna text-bone font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          About
        </button>
      </div>

      {/* Content Tabs */}
      {tab === 'hub' && (
        <div className="space-y-6">
          
          {/* Active Challenge & Poll Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Active Challenge Card */}
            {activeChallenge ? (
              <div className="card p-6 flex flex-col justify-between space-y-4 border-amber/40">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-amber flex items-center gap-1 font-bold">
                      <Trophy size={16} /> Active Challenge
                    </span>
                    {isOwner && (
                      <button onClick={() => setShowChallengeModal(true)} className="text-xs font-mono text-sienna hover:underline">
                        + New
                      </button>
                    )}
                  </div>
                  <h3 className="font-display text-2xl text-bone mb-2">{activeChallenge.title}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-bone-dim">Completion Progress</span>
                      <span className="text-amber font-bold">{activeChallenge.completedPercent || 0}% Completed</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-ink-3 overflow-hidden border border-line/30">
                      <div className="h-full bg-gradient-to-r from-amber to-sienna transition-all duration-500" style={{ width: `${activeChallenge.completedPercent || 0}%` }} />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-line/30 flex items-center justify-between">
                  <span className="text-xs font-mono text-bone-dim">{activeChallenge.dailyTarget}</span>
                  <button 
                    onClick={() => activeChallenge.id && joinChallengeMutation.mutate(activeChallenge.id)}
                    disabled={joinChallengeMutation.isPending || activeChallenge.joinedUserIds?.includes(user?.uid || '')}
                    className="btn-primary py-2 px-5 text-xs font-mono inline-flex items-center gap-1"
                  >
                    {activeChallenge.joinedUserIds?.includes(user?.uid || '') ? 'Joined' : 'Join Challenge →'}
                  </button>
                </div>
              </div>
            ) : isOwner ? (
              <div className="card p-6 border-dashed border-line/50 flex flex-col items-center justify-center text-center space-y-3">
                <Trophy size={24} className="text-bone-dim/50" />
                <span className="text-xs text-bone-dim font-mono">No active challenges. Engage your community!</span>
                <button onClick={() => setShowChallengeModal(true)} className="btn-secondary text-xs font-mono">
                  + Create Challenge
                </button>
              </div>
            ) : (
              <div className="card p-6 border border-line/30 flex flex-col items-center justify-center text-center space-y-2">
                <Trophy size={24} className="text-bone-dim/30" />
                <span className="text-xs text-bone-dim font-mono">No active challenges at the moment.</span>
              </div>
            )}

            {/* Interactive Poll Card */}
            {defaultPoll ? (
              <div className="card p-6 flex flex-col justify-between space-y-4 border-line/50">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-sienna flex items-center gap-1 font-bold">
                      <Vote size={16} /> Member Poll
                    </span>
                    {isOwner && (
                      <button onClick={() => setShowPollModal(true)} className="text-xs font-mono text-sienna hover:underline">
                        + New
                      </button>
                    )}
                  </div>
                  <h3 className="font-display text-xl text-bone mb-4">{defaultPoll.question}</h3>
                  
                  <div className="space-y-2">
                    {defaultPoll.options.map(opt => {
                      const hasVoted = defaultPoll.votedUserIds?.includes(user?.uid || '');
                      const totalVotes = defaultPoll.options.reduce((sum, o) => sum + (o.votesCount || 0), 0) || 1;
                      const pct = Math.round(((opt.votesCount || 0) / totalVotes) * 100);

                      return (
                        <button
                          key={opt.id}
                          onClick={() => defaultPoll.id && voteMutation.mutate({ pollId: defaultPoll.id, optionId: opt.id })}
                          disabled={voteMutation.isPending || hasVoted}
                          className={`w-full p-3 rounded-xl border transition-colors text-left relative overflow-hidden flex items-center justify-between text-xs font-mono ${
                            hasVoted ? 'bg-ink-2 border-line/40' : 'bg-ink-2/60 border-line hover:border-sienna'
                          }`}
                        >
                          <div className="absolute inset-0 bg-sienna/10" style={{ width: `${pct}%` }} />
                          <span className="relative z-10 text-bone font-medium">□ {opt.text}</span>
                          <span className="relative z-10 text-bone-dim">{pct}% ({opt.votesCount || 0})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : isOwner ? (
              <div className="card p-6 border-dashed border-line/50 flex flex-col items-center justify-center text-center space-y-3">
                <Vote size={24} className="text-bone-dim/50" />
                <span className="text-xs text-bone-dim font-mono">Want to know what your members think?</span>
                <button onClick={() => setShowPollModal(true)} className="btn-secondary text-xs font-mono">
                  + Create Poll
                </button>
              </div>
            ) : (
              <div className="card p-6 border border-line/30 flex flex-col items-center justify-center text-center space-y-2">
                <Vote size={24} className="text-bone-dim/30" />
                <span className="text-xs text-bone-dim font-mono">No active polls at the moment.</span>
              </div>
            )}

          </div>

          {/* Today's Community Live Stats */}
          <div className="card p-6 space-y-4">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <Activity size={20} className="text-amber" /> Today's Community Activity
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30 text-center">
                <div className="font-display text-3xl text-sienna mb-1">{liveStats?.workoutsToday || 0}</div>
                <div className="text-xs font-mono text-bone-dim uppercase">Workouts Completed</div>
              </div>
              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30 text-center">
                <div className="font-display text-3xl text-amber mb-1">{liveStats?.prsToday || 0}</div>
                <div className="text-xs font-mono text-bone-dim uppercase">PRs Hit Today</div>
              </div>
              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30 text-center">
                <div className="font-display text-3xl text-emerald-400 mb-1">{liveStats?.caloriesBurnedToday ? Math.round(liveStats.caloriesBurnedToday / 1000) + 'K' : '0'}</div>
                <div className="text-xs font-mono text-bone-dim uppercase">Calories Burned</div>
              </div>
              <div className="p-4 rounded-2xl bg-ink-2 border border-line/30 text-center">
                <div className="font-display text-3xl text-purple-400 mb-1">{liveStats?.activeStreaks || 0}</div>
                <div className="text-xs font-mono text-bone-dim uppercase">Active Streaks</div>
              </div>
            </div>
          </div>

          {/* Recent Posts & Interaction */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-bone flex items-center gap-2">
                <MessageSquare size={20} className="text-sienna" /> Recent Community Posts
              </h3>
              {isJoined && (
                <button onClick={() => setShowPostModal(true)} className="btn-secondary text-xs font-mono py-1 px-3">
                  + Share Post
                </button>
              )}
            </div>

            <div className="space-y-4">
              {posts.length > 0 ? posts.map((post: any) => {
                const isLiked = post.likedUserIds?.includes(user?.uid || '');
                return (
                  <div key={post.id} className="p-4 rounded-2xl bg-ink-2 border border-line/30 space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="font-bold text-sienna">@{post.authorName}</span>
                      <span className="text-bone-dim">
                        {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                      </span>
                    </div>
                    <h4 className="font-bold text-bone text-base">{post.title}</h4>
                    <p className="text-xs text-bone-dim">{post.text}</p>
                    
                    <div className="pt-2 border-t border-line/20 flex items-center gap-4 text-xs font-mono text-bone-dim">
                      <button 
                        onClick={() => post.id && likePostMutation.mutate(post.id)}
                        className={`flex items-center gap-1 transition-colors ${isLiked ? 'text-rose-400 font-bold' : 'hover:text-rose-400'}`}
                      >
                        <Heart size={14} className={isLiked ? 'fill-rose-400' : ''} /> {post.likesCount || 0}
                      </button>
                      <button onClick={() => showToast('Opened comments')} className="flex items-center gap-1 hover:text-bone">
                        <MessageSquare size={14} /> {post.commentsCount || 0}
                      </button>
                      <button onClick={() => showToast('Post shared!')} className="flex items-center gap-1 hover:text-amber">
                        <Share2 size={14} /> Share
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-10 border border-dashed border-line/50 rounded-2xl">
                  <MessageSquare size={32} className="mx-auto text-bone-dim mb-2 opacity-50" />
                  <p className="text-xs font-mono text-bone-dim">No posts yet. Be the first to share your progress!</p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {tab === 'events' && (
        <div>
          {loadingEvents ? (
            <div className="py-12 text-center text-bone-dim font-mono text-sm">Loading community events...</div>
          ) : communityEvents.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-line rounded-[24px] bg-ink-2">
              <CalendarIcon size={40} className="mx-auto text-bone-dim mb-3 opacity-50" />
              <h3 className="font-display text-lg mb-1 text-bone">No Upcoming Events</h3>
              <p className="text-xs text-bone-dim max-w-sm mx-auto mb-4">No events scheduled for {community.name} yet.</p>
              <Link to="/events" className="btn-primary py-2 px-5 text-xs inline-flex items-center gap-1.5">
                <Plus size={14} /> Host First Event
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {communityEvents.map((event: AppEvent) => (
                <Link to={`/events/${event.id}`} key={event.id} className="card overflow-hidden group hover:border-sienna/50 transition-colors flex flex-col justify-between">
                  <div>
                    <div className="h-36 bg-ink-3 relative overflow-hidden">
                      {event.banner && <img src={event.banner} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
                      <div className="absolute top-3 right-3">
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded backdrop-blur-sm ${event.pricing.type === 'free' ? 'bg-amber text-ink font-bold' : 'bg-ink/80 text-bone'}`}>
                          {event.pricing.type === 'free' ? 'FREE' : 'PAID'}
                        </span>
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="text-xs font-mono text-sienna mb-1">
                        {event.dateTime?.start?.toDate ? event.dateTime.start.toDate().toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'}
                      </div>
                      <h3 className="font-display text-lg text-bone line-clamp-1 mb-2">{event.title}</h3>
                      <p className="text-xs text-bone-dim line-clamp-2 mb-3">{event.description}</p>
                    </div>
                  </div>
                  <div className="p-5 pt-0 border-t border-line/30 flex items-center justify-between text-xs font-mono text-bone-dim">
                    <span className="flex items-center gap-1.5"><MapPin size={13} className="text-amber" /> {event.location.venueName}</span>
                    <span className="flex items-center gap-1.5"><Users size={13} className="text-sienna" /> {event.stats?.registeredCount || 0}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <section className="card p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-bone flex items-center gap-2">
              <Users size={20} className="text-sienna" /> Community Athletes ({community.membersCount})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {members.length > 0 ? members.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-ink-2 border border-line/30">
                <div className="w-10 h-10 rounded-full bg-sienna/20 text-sienna flex items-center justify-center font-bold text-sm">
                  A
                </div>
                <div>
                  <div className="font-semibold text-sm text-bone">Athlete {i + 1}</div>
                  <div className="text-[10px] font-mono text-bone-dim">Member</div>
                </div>
              </div>
            )) : (
              <div className="text-sm text-bone-dim italic col-span-full">Active athletes participating in group workouts.</div>
            )}
          </div>
        </section>
      )}

      {tab === 'about' && (
        <section className="card p-6 space-y-6">
          <div>
            <h3 className="font-display text-xl text-bone mb-2">About {community.name}</h3>
            <p className="text-sm text-bone-dim whitespace-pre-wrap leading-relaxed">{community.description}</p>
          </div>
          <div className="border-t border-line/30 pt-4 flex flex-wrap gap-6 text-xs font-mono text-bone-dim">
            <div>
              <span className="text-bone opacity-60">Status:</span>{' '}
              <span className="text-sienna uppercase font-bold">{community.isVerified ? 'Verified Community' : 'Pending Verification'}</span>
            </div>
            <div>
              <span className="text-bone opacity-60">Total Members:</span>{' '}
              <span className="text-bone font-bold">{community.membersCount} Athletes</span>
            </div>
          </div>
        </section>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showEditModal && <EditCommunityModal community={community} onClose={() => setShowEditModal(false)} />}
        {showAnnouncementModal && <CreateAnnouncementModal communityId={communityId!} onClose={() => setShowAnnouncementModal(false)} />}
        {showPollModal && <CreatePollModal communityId={communityId!} onClose={() => setShowPollModal(false)} />}
        {showChallengeModal && <CreateChallengeModal communityId={communityId!} onClose={() => setShowChallengeModal(false)} />}
        {showAnalyticsModal && <LeaderAnalyticsModal community={community} onClose={() => setShowAnalyticsModal(false)} />}
        {showPostModal && <CreatePostModal communityId={communityId!} onClose={() => setShowPostModal(false)} />}
      </AnimatePresence>

    </motion.div>
  );
}
