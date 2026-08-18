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

  // Mark discussion as read when entering the chat page
  useEffect(() => {
    if (clanId) {
      localStorage.setItem(`lastReadChat_${clanId}`, Date.now().toString());
    }
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

  if (loadingClan) {
    return (
      <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center text-bone font-mono gap-3 z-50">
        <Loader2 size={28} className="animate-spin text-sienna" />
        <span>Loading clan discussion...</span>
      </div>
    );
  }

  if (!clan) {
    return (
      <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center text-bone font-mono p-6 text-center z-50">
        <Shield size={40} className="text-sienna mb-3 opacity-60" />
        <h2 className="font-display text-xl mb-1">Clan Not Found</h2>
        <p className="text-xs text-bone-dim mb-4">This clan may have been deleted or does not exist.</p>
        <button onClick={() => navigate('/community')} className="btn-secondary py-2 px-4">
          Return to Community
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-ink flex flex-col overflow-hidden select-none z-30">
      {/* ─── WHATSAPP-STYLE GROUP CHAT HEADER ─── */}
      <header className="h-14 shrink-0 bg-ink-2/95 backdrop-blur-md border-b border-line/30 px-2 sm:px-4 flex items-center justify-between z-30 shadow-sm">
        {/* Left: Back button + Clan Avatar + Name & Subtitle */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={handleBack}
            className="p-1.5 -ml-1 rounded-full hover:bg-ink-3 text-bone transition-colors shrink-0"
            title="Back to Clan"
            aria-label="Back to Clan"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Clan Photo (Opens Clan Info Popup) */}
          <div
            onClick={() => setClanInfoOpen(true)}
            className="w-9 h-9 rounded-full bg-ink-3 border border-line/30 overflow-hidden shrink-0 cursor-pointer hover:opacity-85 active:scale-95 transition-all flex items-center justify-center text-sienna font-bold text-sm shadow-inner"
            title="View Clan Info & Members"
          >
            {clan.coverUrl ? (
              <img src={clan.coverUrl} alt={clan.name} className="w-full h-full object-cover" />
            ) : (
              <Shield size={18} />
            )}
          </div>

          {/* Clan Name & Member Count (Opens Clan Info Popup) */}
          <div
            onClick={() => setClanInfoOpen(true)}
            className="min-w-0 flex-1 cursor-pointer group py-1"
            title="View Clan Info & Members"
          >
            <h1 className="font-bold text-sm text-bone truncate leading-tight group-hover:text-sienna transition-colors">
              {clan.name}
            </h1>
            <p className="text-[11px] font-mono text-bone-dim truncate leading-tight flex items-center gap-1.5 mt-0.5">
              <span>{clan.memberCount || members.length} members</span>
              <span className="opacity-40">•</span>
              <span className="text-sienna/80 group-hover:text-sienna font-medium transition-colors">tap for info</span>
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Announcements Icon */}
          <button
            onClick={() => setAnnouncementsOpen(true)}
            className="relative p-2 rounded-full hover:bg-ink-3 text-bone-dim hover:text-amber-400 transition-colors"
            title="Clan Announcements"
            aria-label="Clan Announcements"
          >
            <Megaphone size={18} />
            {announcements.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-ink animate-pulse" />
            )}
          </button>
        </div>
      </header>

      {/* ─── FULL-SCREEN CHAT CONTAINER ─── */}
      <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-ink">
        <ClanDiscussionTab
          clanId={clanId!}
          clanName={clan.name}
          isMember={isMember}
          userRole={myMembership?.role}
          onJoinClan={() => joinMutation.mutate()}
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
          isOpen={announcementsOpen}
          onClose={() => setAnnouncementsOpen(false)}
        />
      )}
    </div>
  );
}
