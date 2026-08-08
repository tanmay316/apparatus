import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Users, MapPin, Search, Plus, Target, CalendarDays } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClan, getClanMembers, joinClan, leaveClan, updateClanMemberRole, disbandClan, transferLeadership } from '@/services/community';
import { ClanMembership, ClanV2 } from '@/types';
import { useUIStore } from '@/stores/ui-store';

export function ClanDetailSheet({ clanId, onClose }: { clanId: string; onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'about' | 'members' | 'challenges' | 'events'>('about');

  const { data: clan, isLoading: loadingClan } = useQuery({
    queryKey: ['clan', clanId],
    queryFn: () => getClan(clanId)
  });

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['clanMembers', clanId],
    queryFn: () => getClanMembers(clanId)
  });

  const myMembership = members.find(m => m.userId === user?.uid);
  const isLeader = myMembership?.role === 'leader';
  const isCoLeader = myMembership?.role === 'co_leader';
  const isMember = !!myMembership;

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await joinClan(user.uid, user.displayName || 'Unknown', user.photoURL || '', clanId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanMembers', clanId] });
      queryClient.invalidateQueries({ queryKey: ['clan', clanId] });
      showToast('Joined clan!');
    }
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (isLeader && members.length > 1) throw new Error('You must transfer leadership before leaving.');
      await leaveClan(user.uid, clanId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanMembers', clanId] });
      queryClient.invalidateQueries({ queryKey: ['clan', clanId] });
      showToast('Left clan');
      onClose();
    },
    onError: (err: any) => showToast(err.message, 'error')
  });

  const handleRoleChange = async (memberId: string, newRole: 'leader' | 'co_leader' | 'member', memberName: string) => {
    if (!isLeader) return;
    try {
      if (newRole === 'leader') {
        await transferLeadership(clanId, user!.uid, memberId, memberName);
        showToast(`Transferred leadership to ${memberName}`);
      } else {
        await updateClanMemberRole(clanId, memberId, newRole);
        showToast(`Updated role for ${memberName}`);
      }
      queryClient.invalidateQueries({ queryKey: ['clanMembers', clanId] });
      queryClient.invalidateQueries({ queryKey: ['clan', clanId] });
    } catch (err: any) {
      showToast(err.message || 'Failed to update role', 'error');
    }
  };

  if (!clan) return null;

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
        {/* Cover Image */}
        <div className="relative h-48 sm:h-64 bg-ink-3 shrink-0">
          {clan.coverUrl ? (
            <img src={clan.coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-bone-dim"><Shield size={48} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-ink/50 backdrop-blur-md rounded-full text-bone hover:bg-ink-2 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Clan Header Info */}
        <div className="px-6 relative -mt-16 shrink-0">
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
                <span>• {clan.visibility}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 mt-4">
            {isMember ? (
              <button 
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="btn-secondary px-6 py-2"
              >
                {leaveMutation.isPending ? 'Leaving...' : 'Leave Clan'}
              </button>
            ) : (
              <button 
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="btn-primary px-8 py-2 text-lg"
              >
                {joinMutation.isPending ? 'Joining...' : 'Join Clan'}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 mt-6 border-b border-line shrink-0 flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['about', 'members', 'challenges', 'events'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-4 relative font-display text-lg tracking-wide capitalize whitespace-nowrap transition-colors ${
                activeTab === tab ? 'text-bone' : 'text-bone-dim hover:text-bone'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div layoutId="clan_detail_tab" className="absolute bottom-0 left-0 right-0 h-1 bg-sienna rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-mono text-xs uppercase text-bone-dim mb-2">Description</h3>
                <p className="text-bone whitespace-pre-wrap">{clan.description}</p>
              </div>
              
              {clan.tags && clan.tags.length > 0 && (
                <div>
                  <h3 className="font-mono text-xs uppercase text-bone-dim mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {clan.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-ink-2 rounded-full text-xs font-mono text-bone">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg text-bone">Members ({members.length})</h3>
              </div>
              
              <div className="space-y-2">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between bg-ink-2 rounded-2xl p-4">
                    <div className="flex items-center gap-4">
                      {member.userPhoto ? (
                        <img src={member.userPhoto} alt={member.userName} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-ink-3 flex items-center justify-center text-bone font-bold">
                          {member.userName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="text-bone font-bold">{member.userName} {member.userId === user?.uid && '(You)'}</div>
                        <div className="text-xs font-mono text-bone-dim flex items-center gap-2">
                          {member.role === 'leader' && <span className="text-amber-400">👑 Leader</span>}
                          {member.role === 'co_leader' && <span className="text-emerald-400">⚔️ Co-Leader</span>}
                          {member.role === 'member' && <span>Member</span>}
                        </div>
                      </div>
                    </div>
                    
                    {isLeader && member.userId !== user?.uid && (
                      <select 
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.userId, e.target.value as any, member.userName)}
                        className="bg-ink-3 border border-line rounded px-2 py-1 text-xs text-bone font-mono"
                      >
                        <option value="member">Member</option>
                        <option value="co_leader">Co-Leader</option>
                        <option value="leader">Transfer Leadership</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'challenges' && (
            <div className="text-center py-12 text-bone-dim">
              <Target size={48} className="mx-auto mb-4 opacity-50" />
              <p>Challenges integration coming soon.</p>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="text-center py-12 text-bone-dim">
              <CalendarDays size={48} className="mx-auto mb-4 opacity-50" />
              <p>Events integration coming soon.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
