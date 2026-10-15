import { useQuery } from '@tanstack/react-query';
import { getPublicClans, getUserClans } from '@/services/community';
import { useAuthStore } from '@/stores/auth-store';
import { Shield, Users, MapPin, Crown, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CardSkeleton, EmptyState, FilterChips, MetaItem } from './ui';
import { useClanUnread, useClansBadge } from '@/stores/clan-unread-store';
import { MentionBadge } from './ClanUnreadSync';

/** Chat icon on a clan card: "@" when I was mentioned, green dot for new messages. Tap opens the chat. */
function ClanChatBadge({ clanId }: { clanId: string }) {
  const navigate = useNavigate();
  const { unread, mentioned } = useClanUnread(clanId);
  if (!unread && !mentioned) return null;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); navigate(`/clan/${clanId}/chat`); }}
      aria-label={mentioned ? 'You were mentioned in the clan chat' : 'New clan chat messages'}
      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center"
    >
      <MessageCircle size={17} />
      {mentioned
        ? <MentionBadge className="absolute -top-1 -right-1" />
        : <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />}
    </button>
  );
}

export function ClansTab() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const clansBadge = useClansBadge();
  const [filter, setFilter] = useState<'discover' | 'my_clans'>(() => (clansBadge && user ? 'my_clans' : 'discover'));

  const { data: publicClans = [], isLoading: loadingPublic } = useQuery({
    queryKey: ['publicClans'],
    queryFn: () => getPublicClans(20)
  });

  const { data: userClans = [], isLoading: loadingUser } = useQuery({
    queryKey: ['userClans', user?.uid],
    queryFn: () => getUserClans(user!.uid),
    enabled: !!user
  });

  const clans = filter === 'discover' ? publicClans : userClans;
  const isLoading = filter === 'discover' ? loadingPublic : loadingUser;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Filters */}
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'discover', label: 'Discover' },
          ...(user ? [{ value: 'my_clans' as const, label: 'My clans' }] : []),
        ]}
      />

      {isLoading ? (
        <CardSkeleton />
      ) : clans.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={filter === 'my_clans' ? 'No clans yet' : 'No clans to show'}
          description={filter === 'my_clans'
            ? "You haven't joined any clans yet. Browse Discover to find your crew."
            : 'No clans are open right now. Be the first to start one.'}
          action={filter === 'my_clans' ? (
            <button type="button" onClick={() => setFilter('discover')} className="cx-btn cx-btn-ghost">Browse clans</button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clans.map(clan => (
            <div
              key={clan.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/clan/${clan.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/clan/${clan.id}`); }}
              className="cx-card cx-card-interactive overflow-hidden group flex flex-col cursor-pointer"
            >
              <div className="h-28 bg-ink-3 relative overflow-hidden">
                {clan.coverUrl ? (
                  <img src={clan.coverUrl} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-bone-dim/40"><Shield size={40} /></div>
                )}
                {clan.category && (
                  <span className="cx-status cx-status-on-media absolute top-3 left-3 capitalize">{clan.category}</span>
                )}
                {clan.id && <ClanChatBadge clanId={clan.id} />}
              </div>

              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-bone leading-snug line-clamp-1">{clan.name}</h3>
                  {filter === 'my_clans' && clan.leaderId === user?.uid && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-sienna">
                      <Crown size={12} /> Leader
                    </span>
                  )}
                </div>
                {clan.description && (
                  <p className="mt-1 text-sm text-bone-dim line-clamp-2 leading-relaxed">{clan.description}</p>
                )}

                <div className="mt-auto pt-4 flex items-center gap-4">
                  <MetaItem icon={Users}>{clan.memberCount || 0} {clan.memberCount === 1 ? 'member' : 'members'}</MetaItem>
                  {clan.location?.city && <MetaItem icon={MapPin}>{clan.location.city}</MetaItem>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
