import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Download, Copy, LayoutTemplate, Search, UserPlus, UserMinus } from 'lucide-react';
import { motion } from 'framer-motion';
import { getSamplePlans, clonePlan } from '@/services/plans';
import { searchUsers, followUser, unfollowUser, isFollowing } from '@/services/social';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';

function AthleteCard({ athlete, myUid }: { athlete: any; myUid: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();
  
  const { data: following = false } = useQuery({
    queryKey: ['isFollowing', myUid, athlete.uid],
    queryFn: () => isFollowing(myUid, athlete.uid),
  });
  
  const followMutation = useMutation({
    mutationFn: () => following ? unfollowUser(myUid, athlete.uid) : followUser(myUid, athlete.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', myUid, athlete.uid] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      showToast(following ? 'Unfollowed' : 'Following!');
    },
  });
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 flex items-center gap-4"
    >
      <Link to={`/profile/${athlete.username}`}>
        <img
          src={athlete.photoURL || `https://ui-avatars.com/api/?name=${athlete.displayName}&background=4F9E8D&color=14151A&bold=true`}
          alt={athlete.displayName}
          className="w-12 h-12 rounded-full border border-teal flex-none object-cover"
          referrerPolicy="no-referrer"
        />
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/profile/${athlete.username}`} className="font-bold text-sm hover:text-teal transition-colors block truncate">
          {athlete.displayName}
        </Link>
        <div className="text-xs text-teal font-mono truncate">@{athlete.username}</div>
        {athlete.experienceLevel && (
          <span className="tag-teal text-[9px] mt-1 inline-block">{athlete.experienceLevel}</span>
        )}
      </div>
      <button
        onClick={() => followMutation.mutate()}
        disabled={followMutation.isPending}
        className={`flex items-center gap-1.5 py-1.5 px-3 rounded text-xs font-mono transition-all ${
          following 
            ? 'btn-secondary hover:text-danger hover:border-danger' 
            : 'btn-primary'
        }`}
      >
        {following ? <><UserMinus size={12} /> Unfollow</> : <><UserPlus size={12} /> Follow</>}
      </button>
    </motion.div>
  );
}

export function ExplorePage() {
  const [tab, setTab] = useState<'plans' | 'users'>('plans');
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['samplePlans'],
    queryFn: getSamplePlans,
  });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['searchUsers', searchQuery],
    queryFn: () => searchUsers(searchQuery),
    enabled: searchQuery.trim().length >= 2,
  });

  const cloneMutation = useMutation({
    mutationFn: (planId: string) => 
      clonePlan(planId, 'samplePlans', user!.uid, user!.displayName || 'User'),
    onSuccess: (newPlanId) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan added to your account');
      navigate(`/plans/${newPlanId}`);
    },
    onError: (error: any) => showToast(error?.message || 'Failed to import plan', 'error'),
  });

  const handleClone = (planId: string) => {
    if (confirm('Import this plan to your account?')) {
      cloneMutation.mutate(planId);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pb-4 border-b border-line gap-4">
        <div>
          <div className="font-mono text-amber text-xs tracking-widest mb-1">DISCOVER</div>
          <h1 className="font-display text-2xl">Explore</h1>
        </div>
        
        <div className="flex bg-ink-2 border border-line rounded-md p-1">
          <button 
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-mono transition-colors ${tab === 'plans' ? 'bg-teal text-ink font-bold' : 'text-bone-dim hover:text-bone'}`}
            onClick={() => setTab('plans')}
          >
            <LayoutTemplate size={14} /> Programs
          </button>
          <button 
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-mono transition-colors ${tab === 'users' ? 'bg-teal text-ink font-bold' : 'text-bone-dim hover:text-bone'}`}
            onClick={() => setTab('users')}
          >
            <Users size={14} /> Athletes
          </button>
        </div>
      </div>

      {tab === 'plans' && (
        <div>
          <p className="text-bone-dim text-sm mb-6 max-w-2xl">
            Import community-proven workout templates directly into your account. You can fully customize these plans once imported.
          </p>
          
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-10 border border-line border-dashed rounded-lg">
              No sample plans available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan, i) => (
                <motion.div 
                  key={plan.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card p-5 flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-display text-lg leading-tight">{plan.title}</h3>
                    <div className="flex items-center gap-1 font-mono text-[10px] text-bone-dim bg-ink-3 px-2 py-1 rounded">
                      <Download size={10} /> {plan.usageCount || 0}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {plan.tags?.map(tag => (
                      <span key={tag} className="tag-teal opacity-80">{tag}</span>
                    ))}
                  </div>
                  
                  <p className="text-sm text-bone-dim mb-6 flex-1">
                    {plan.description}
                  </p>
                  
                  <div className="flex items-center justify-between border-t border-line/50 pt-4 mt-auto">
                    <div className="font-mono text-[11px] text-bone-dim">
                      {plan.daysPerWeek} Days/Week • {plan.estimatedDuration}
                    </div>
                    <button 
                      onClick={() => handleClone(plan.id!)}
                      disabled={cloneMutation.isPending}
                      className="btn-primary py-2 px-3 text-xs flex items-center gap-1.5"
                    >
                      <Copy size={14} /> Import
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="relative mb-6 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
            <input
              type="text"
              className="input-field pl-10 w-full"
              placeholder="Search athletes by name or username..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          
          {searchQuery.trim().length < 2 ? (
            <div className="text-center py-16 border border-dashed border-line rounded-lg">
              <Users size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
              <h3 className="font-display text-lg mb-2">Find Athletes</h3>
              <p className="text-sm text-bone-dim max-w-sm mx-auto">
                Type at least 2 characters to search for athletes by name or username.
              </p>
            </div>
          ) : searchLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-line rounded-lg">
              <h3 className="font-display text-lg mb-2">No Results</h3>
              <p className="text-sm text-bone-dim">No athletes found matching "{searchQuery}".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.filter((u: any) => u.uid !== user?.uid).map((u: any) => (
                <AthleteCard key={u.uid} athlete={u} myUid={user!.uid} />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
