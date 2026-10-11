import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Shield, Megaphone, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { 
  getClan, 
  getClanMembers, 
  joinClan, 
  getClanAnnouncements 
} from '@/services/community';
import { ClanDiscussionTab } from '@/components/community/ClanDiscussionTab';
import { ClanAnnouncementsModal } from '@/components/community/ClanAnnouncementsModal';
import { ClanInfoModal } from '@/components/community/ClanInfoModal';

export function ClanChatPage() {
  const { id: clanId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [clanInfoOpen, setClanInfoOpen] = useState(false);

  // Load Clan Details
  const { data: clan, isLoading: loadingClan } = useQuery({
    queryKey: ['clan', clanId],
    queryFn: () => getClan(clanId!),
    enabled: !!clanId
  });

  // Load Clan Members
  const { data: members = [] } = useQuery({
    queryKey: ['clanMembers', clanId],
    queryFn: () => getClanMembers(clanId!),
    enabled: !!clanId
  });

  // Load Announcements for badge
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

  // Mark discussion as read when entering AND leaving the chat page, so messages
  // that arrived while the chat was open don't show up as unread afterwards.
  useEffect(() => {
    if (!clanId) return;
    const markRead = () => localStorage.setItem(`lastReadChat_${clanId}`, Date.now().toString());
    markRead();
    return markRead;
  }, [clanId]);

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await joinClan(user.uid, user.displayName || profile?.displayName || 'Athlete', user.photoURL || profile?.photoURL || '', clanId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanMembers'] });
      queryClient.invalidateQueries({ queryKey: ['clan', clanId] });
      queryClient.invalidateQueries({ queryKey: ['userClans'] });
      queryClient.invalidateQueries({ queryKey: ['isMemberOfClan'] });
      showToast(`Welcome to ${clan?.name || 'the clan'}!`);
    },
    onError: (err: any) => showToast(err.message || 'Failed to join clan', 'error')
  });

  const handleBack = () => {
    navigate(`/clan/${clanId}`);
  };

  // Private / closed / paid clans must go through the clan page (request or checkout).
  const handleJoin = () => {
    const isPublic = !clan?.visibility || clan.visibility === 'public';
    const paid = typeof clan?.joinPrice === 'number' && clan.joinPrice > 0;
    if (isAdmin || (isPublic && !paid)) joinMutation.mutate();
    else navigate(`/clan/${clanId}`);
  };

  const headerTopPadding = 'var(--sat)';

  if (loadingClan) {
    return (
      <div className="cx pro-scope fixed inset-0 bg-ink flex items-center justify-center text-bone-dim z-50">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (!clan) {
    return (
      <div className="cx pro-scope fixed inset-0 bg-ink flex flex-col items-center justify-center p-6 text-center z-50">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-ink-2 text-bone-dim">
          <Shield size={22} />
        </div>
        <h2 className="text-base font-semibold text-bone">Clan not found</h2>
        <p className="mt-1.5 text-sm text-bone-dim mb-5">This clan may have been deleted or does not exist.</p>
        <button type="button" onClick={() => navigate('/community')} className="cx-btn cx-btn-ghost">
          Back to Community
        </button>
      </div>
    );
  }

  return (
    <div className="cx pro-scope fixed inset-0 w-full h-full bg-ink flex flex-col overflow-hidden select-none z-30">
      <header
        className="shrink-0 bg-ink/95 backdrop-blur-xl border-b border-line z-30"
        style={{ paddingTop: headerTopPadding }}
      >
        <div className="h-14 px-2 sm:px-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-bone hover:bg-ink-2 transition-colors shrink-0 !shadow-none"
            aria-label="Back to clan"
          >
            <ChevronLeft size={22} />
          </button>

          <button
            type="button"
            onClick={() => setClanInfoOpen(true)}
            className="min-w-0 flex-1 flex items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-ink-2 transition-colors !shadow-none"
            aria-label="View clan info and members"
          >
            <span className="w-9 h-9 rounded-full bg-ink-3 border border-line overflow-hidden shrink-0 flex items-center justify-center text-bone-dim">
              {clan.coverUrl ? (
                <img src={clan.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Shield size={16} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-bone truncate leading-tight">{clan.name}</span>
              <span className="block text-xs text-bone-dim truncate leading-tight mt-0.5">
                {clan.memberCount || members.length} members · Tap for info
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAnnouncementsOpen(true)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-bone-dim hover:text-bone hover:bg-ink-2 transition-colors shrink-0 !shadow-none"
            aria-label="Announcements"
          >
            <Megaphone size={18} />
            {announcements.length > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-ink" />
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <ClanDiscussionTab
          clanId={clanId!}
          clanName={clan.name}
          isMember={isMember}
          userRole={myMembership?.role}
          onJoinClan={handleJoin}
          joinLabel={!clan.visibility || clan.visibility === 'public' || isAdmin ? 'Join clan' : 'View clan'}
          isJoining={joinMutation.isPending}
          className="h-full"
        />
      </main>

      {/* Clan Info & Members Pop-up Modal */}
      {clanInfoOpen && (
        <ClanInfoModal
          clan={clan}
          members={members}
          isOpen={clanInfoOpen}
          onClose={() => setClanInfoOpen(false)}
          onViewClanPage={() => navigate(`/clan/${clanId}`)}
        />
      )}

      {/* Announcements Modal */}
      {announcementsOpen && (
        <ClanAnnouncementsModal
          clanId={clanId!}
          clanName={clan.name}
          canManage={canManage}
          userRole={myMembership?.role}
          isOpen={announcementsOpen}
          onClose={() => setAnnouncementsOpen(false)}
        />
      )}
    </div>
  );
}
