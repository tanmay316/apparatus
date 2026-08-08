import { useQuery } from '@tanstack/react-query';
import { getPublicClans, getUserClans } from '@/services/community';
import { useAuthStore } from '@/stores/auth-store';
import { Shield, Users, MapPin } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ClanDetailSheet } from './ClanDetailSheet';

export function ClansTab() {
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<'discover' | 'my_clans'>('discover');
  const [selectedClanId, setSelectedClanId] = useState<string | null>(null);

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
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setFilter('discover')}
          className={`px-4 py-2 rounded-full text-sm font-mono capitalize transition-colors whitespace-nowrap ${
            filter === 'discover' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3'
          }`}
        >
          Discover
        </button>
        {user && (
          <button
            onClick={() => setFilter('my_clans')}
            className={`px-4 py-2 rounded-full text-sm font-mono capitalize transition-colors whitespace-nowrap ${
              filter === 'my_clans' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3'
            }`}
          >
            My Clans
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-bone-dim text-sm font-mono py-20 text-center">Loading clans...</div>
      ) : clans.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-[32px] bg-ink-2">
          <Shield size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
          <h3 className="font-display text-xl mb-2 text-bone">No Clans Found</h3>
          <p className="text-sm text-bone-dim max-w-sm mx-auto">
            {filter === 'my_clans' 
              ? "You haven't joined any clans yet. Check out the Discover tab to find your tribe."
              : "No clans are available to join right now. Be the first to start one!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clans.map(clan => (
            <div 
              key={clan.id} 
              onClick={() => setSelectedClanId(clan.id!)}
              className="card overflow-hidden group hover:border-sienna/50 transition-colors flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="h-32 bg-ink-3 relative overflow-hidden">
                  {clan.coverUrl ? (
                    <img src={clan.coverUrl} alt={clan.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-20"><Shield size={48} /></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex gap-2">
                    <span className="text-[10px] font-mono uppercase bg-ink/80 text-bone px-2 py-1 rounded backdrop-blur-sm">
                      {clan.category}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-xl text-bone mb-2">{clan.name}</h3>
                  <p className="text-sm text-bone-dim line-clamp-2 mb-3">{clan.description}</p>
                </div>
              </div>

              <div className="p-5 pt-0 border-t border-line/30 flex items-center justify-between mt-auto">
                <div className="flex items-center gap-4 text-xs font-mono text-bone-dim">
                  <span className="flex items-center gap-1.5"><Users size={14} className="text-sienna" /> {clan.memberCount}</span>
                  {clan.location?.city && (
                    <span className="flex items-center gap-1.5"><MapPin size={14} className="text-sienna" /> {clan.location.city}</span>
                  )}
                </div>
                {filter === 'my_clans' && clan.leaderId === user?.uid && (
                  <span className="text-[10px] font-mono uppercase bg-sienna/20 text-sienna px-2 py-1 rounded">Leader</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedClanId && (
          <ClanDetailSheet 
            clanId={selectedClanId} 
            onClose={() => setSelectedClanId(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
