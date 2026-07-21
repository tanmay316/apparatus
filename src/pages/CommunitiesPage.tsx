import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, ShieldAlert, X, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getVerifiedCommunities, createCommunity, joinCommunity, leaveCommunity, getUserCommunities, getUserSubmittedCommunities } from '@/services/events';
import type { Community } from '@/types';

function CreateCommunityModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [banner, setBanner] = useState('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      await createCommunity({
        name,
        description,
        tags: tagList,
        banner,
        ownerId: user.uid,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubmittedCommunities'] });
      showToast('Community request submitted to Admin for approval.', 'info');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Could not create community', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 sm:mb-6 shrink-0">
          <div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Start a Community</h2>
            <p className="text-xs sm:text-sm text-bone-dim mt-0.5 sm:mt-1">Submit your community for admin verification.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mumbai Calisthenics" className="input-field w-full" />
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this community about?" className="input-field w-full min-h-[100px] py-3" />
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Tags (comma separated)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. workout, gym, yoga" className="input-field w-full" />
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Banner Image URL</label>
            <input value={banner} onChange={e => setBanner(e.target.value)} placeholder="https://..." className="input-field w-full" />
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={createMutation.isPending || !name.trim() || !description.trim()} className="btn-primary px-6 py-2">{createMutation.isPending ? 'Submitting...' : 'Submit Request'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export function CommunitiesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'discover' | 'joined' | 'submitted'>('discover');
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const { data: allCommunities = [], isLoading: loadingAll } = useQuery({
    queryKey: ['communities'],
    queryFn: getVerifiedCommunities
  });

  const { data: userCommunities = [], isLoading: loadingUser } = useQuery({
    queryKey: ['userCommunities', user?.uid],
    queryFn: () => getUserCommunities(user!.uid),
    enabled: !!user,
  });

  const { data: submittedCommunities = [], isLoading: loadingSubmitted } = useQuery({
    queryKey: ['userSubmittedCommunities', user?.uid],
    queryFn: () => getUserSubmittedCommunities(user!.uid),
    enabled: !!user && tab === 'submitted',
  });

  const joinMutation = useMutation({
    mutationFn: (communityId: string) => joinCommunity(user!.uid, communityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities', user?.uid] });
      showToast('Joined community!');
    },
    onError: () => showToast('Failed to join', 'error')
  });

  const leaveMutation = useMutation({
    mutationFn: (communityId: string) => leaveCommunity(user!.uid, communityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities', user?.uid] });
      showToast('Left community');
    },
    onError: () => showToast('Failed to leave', 'error')
  });

  const isLoading = tab === 'discover' ? loadingAll : tab === 'joined' ? loadingUser : loadingSubmitted;
  const communities = tab === 'discover' ? allCommunities : tab === 'joined' ? userCommunities : submittedCommunities;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1200px] mx-auto w-full space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-line">
        <div>
          <div className="font-mono text-sienna text-xs tracking-widest mb-2 uppercase">Connect</div>
          <h1 className="font-display text-4xl text-bone">Communities</h1>
          <p className="text-bone-dim mt-2 max-w-xl">Find your tribe. Join local and global communities to discover events, meetups, and group workouts.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 self-start md:self-auto shrink-0">
          <Plus size={16} /> Start a Community
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-1 max-w-md">
        <button
          onClick={() => setTab('discover')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'discover' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          Discover
        </button>
        <button
          onClick={() => setTab('joined')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'joined' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          My Communities
        </button>
        {user && (
          <button
            onClick={() => setTab('submitted')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'submitted' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
          >
            My Submissions
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-bone-dim font-mono text-sm">Loading communities...</div>
      ) : communities.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-[32px] bg-ink-2">
          <Users size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
          <h3 className="font-display text-xl mb-2 text-bone">
            {tab === 'submitted' ? 'No Submissions Yet' : 'No Communities Yet'}
          </h3>
          <p className="text-sm text-bone-dim max-w-sm mx-auto">
            {tab === 'submitted' ? 'You have not submitted any community requests.' : 'Be the first to start a verified fitness community in your area.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {communities.map((community: Community) => {
            const isJoined = userCommunities.some(c => c.id === community.id);
            const isOwner = user?.uid === community.ownerId;
            const status = community.status || (community.isVerified ? 'approved' : 'pending');

            return (
              <Link to={`/communities/${community.id}`} key={community.id} className="card overflow-hidden group hover:border-sienna/50 transition-colors flex flex-col justify-between cursor-pointer">
                <div>
                  <div className="h-32 bg-ink-3 relative overflow-hidden">
                    {community.banner && <img src={community.banner} alt={community.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
                    <div className="absolute bottom-3 left-4 flex gap-2">
                      {community.tags?.slice(0,2).map(tag => (
                        <span key={tag} className="text-[10px] font-mono uppercase bg-ink/80 text-bone px-2 py-1 rounded backdrop-blur-sm">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-display text-xl text-bone flex items-center gap-2">
                        {community.name}
                        {community.isVerified && <CheckCircle2 size={16} className="text-sienna" />}
                      </h3>
                      {tab === 'submitted' && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold shrink-0 ${
                          status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {status === 'approved' ? '✓ Approved' : status === 'rejected' ? '✕ Rejected' : '⏳ Pending'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-bone-dim line-clamp-2 mb-3">{community.description}</p>
                    
                    {status === 'rejected' && community.rejectionReason && (
                      <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg text-xs text-rose-300 mb-3">
                        <span className="font-bold">Reason:</span> {community.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5 pt-0 border-t border-line/30 flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-2 text-xs font-mono text-bone-dim">
                    <Users size={14} className="text-sienna" /> {community.membersCount} Athletes
                  </div>
                  {isOwner ? (
                    <span className="text-xs px-3 py-1 rounded-full bg-sienna/20 text-sienna border border-sienna/40 font-mono font-bold">
                      Leader
                    </span>
                  ) : user && tab !== 'submitted' ? (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (community.id) {
                          if (isJoined) leaveMutation.mutate(community.id);
                          else joinMutation.mutate(community.id);
                        }
                      }}
                      disabled={joinMutation.isPending || leaveMutation.isPending}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${isJoined ? 'border-line text-bone-dim hover:border-danger hover:text-danger' : 'border-sienna text-sienna hover:bg-sienna hover:text-bone'}`}
                    >
                      {isJoined ? 'Leave' : 'Join'}
                    </button>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
