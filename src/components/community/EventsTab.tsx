import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllCommunityEvents, deleteSimpleEvent } from '@/services/community';
import { CalendarDays, Users, Edit3, Trash2, Trophy, Sparkles, Shield, MapPin } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { EventDetailSheet } from './EventDetailSheet';
import { EditEventSheet } from './EditEventSheet';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { SimpleEvent } from '@/types';

function getCountdownLabel(startMs: number, endMs: number) {
  const now = Date.now();
  if (now < startMs) {
    const diff = startMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return {
      type: 'upcoming' as const,
      text: days > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${hours}h ${mins}m`,
      color: 'text-blue-500 dark:text-blue-400 bg-blue-500/10 border-blue-500/30'
    };
  } else if (endMs && now <= endMs) {
    const diff = endMs - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return {
      type: 'ongoing' as const,
      text: days > 0 ? `Ends in ${days}d ${hours}h` : `Ends in ${hours}h ${mins}m`,
      color: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    };
  }
  return {
    type: 'ended' as const,
    text: 'Concluded',
    color: 'badge-prize px-2.5 py-0.5 rounded-full font-black shadow-sm'
  };
}

export function EventsTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<SimpleEvent | null>(null);

  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();

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
        queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
        queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
        queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
        showToast('Event deleted');
      }
    }
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['allCommunityEvents'],
    queryFn: () => getAllCommunityEvents(50)
  });

  const filteredEvents = events.filter(e => {
    if (filter === 'all') return true;
    const now = Date.now();
    const startMs = e.startTime?.toMillis ? e.startTime.toMillis() : 0;
    const endMs = e.endTime?.toMillis ? e.endTime.toMillis() : 0;
    if (filter === 'upcoming') return now < startMs;
    if (filter === 'active') return now >= startMs && (endMs ? now <= endMs : true);
    return true;
  });

  const featured = filteredEvents[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {['all', 'active', 'upcoming'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors whitespace-nowrap ${
              filter === f ? 'bg-ink text-bone font-bold shadow-sm border border-line/40' : 'bg-ink-2 text-bone-dim hover:bg-ink-3'
            }`}
          >
            {f === 'all' ? 'All Events' : f}
          </button>
        ))}
      </div>

      {/* Featured Event Banner (if available) */}
      {featured && (
        <div 
          onClick={() => setSelectedEventId(featured.id!)}
          className="relative overflow-hidden rounded-[32px] bg-ink-2 border border-line p-6 sm:p-8 cursor-pointer hover:border-blue-500/50 transition-all shadow-xl group"
        >
          {featured.coverUrl && (
            <div className="absolute inset-0 overflow-hidden">
              <img src={featured.coverUrl} alt={featured.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-2 via-ink-2/80 to-ink-2/30" />
            </div>
          )}

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-blue-500/20 text-blue-500 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border border-blue-500/30">
                  <CalendarDays size={14} /> Featured Event
                </span>
                {featured.visibility === 'clan_only' && (
                  <span className="inline-flex items-center gap-1 bg-ink text-sienna px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border border-sienna/30">
                    <Shield size={11} /> Clan Only
                  </span>
                )}
              </div>

              {(isAdmin || user?.uid === featured.createdBy) && (
                <div className="flex items-center gap-2 z-20" onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={() => setEditingEvent(featured)}
                    className="p-1.5 rounded-lg bg-ink/60 hover:bg-ink text-bone-dim hover:text-bone transition-colors"
                    title="Edit Event"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button 
                    onClick={() => deleteEventMutation.mutate(featured.id!)}
                    className="p-1.5 rounded-lg bg-ink/60 hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                    title="Delete Event"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            <h2 className="font-display text-3xl sm:text-4xl text-bone mb-2">{featured.title}</h2>
            <p className="text-bone-dim max-w-2xl mb-4 line-clamp-2 text-sm leading-relaxed">
              {featured.description || 'Join fellow athletes for this community event.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono mb-6">
              {(() => {
                const s = featured.startTime?.toMillis ? featured.startTime.toMillis() : 0;
                const end = featured.endTime?.toMillis ? featured.endTime.toMillis() : 0;
                const cd = getCountdownLabel(s, end);
                return (
                  <span className={`px-3 py-1 rounded-full font-bold border flex items-center gap-1.5 ${cd.color}`}>
                    <Sparkles size={12} /> {cd.text}
                  </span>
                );
              })()}

              <span className="text-bone-dim flex items-center gap-1.5">
                <Users size={13} className="text-blue-400" /> {featured.participantCount || 0} Attending
              </span>

              {featured.location?.name && (
                <span className="text-bone-dim flex items-center gap-1.5">
                  <MapPin size={13} className="text-rose-400" /> {featured.location.name}
                </span>
              )}

              {featured.prize && (
                <span className="badge-prize font-bold flex items-center gap-1.5 px-3 py-1 rounded-full">
                  <Trophy size={13} className="shrink-0" /> {featured.prize}
                </span>
              )}
            </div>
            
            <button className="btn-primary px-7 py-2.5 font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              RSVP & View Details
            </button>
          </div>
        </div>
      )}

      {/* Grid of Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-bone flex items-center gap-2">
            <CalendarDays size={20} className="text-blue-500" />
            Community Events ({filteredEvents.length})
          </h3>
        </div>

        {loadingEvents ? (
          <div className="text-bone-dim text-sm font-mono py-12 text-center">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-bone-dim text-sm font-mono py-12 text-center bg-ink-2 rounded-[28px] border border-dashed border-line">
            No events found in this category.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map(e => {
              const s = e.startTime?.toMillis ? e.startTime.toMillis() : 0;
              const end = e.endTime?.toMillis ? e.endTime.toMillis() : 0;
              const cd = getCountdownLabel(s, end);

              return (
                <div 
                  key={e.id} 
                  onClick={() => setSelectedEventId(e.id!)}
                  className="card p-5 flex flex-col justify-between group cursor-pointer hover:border-blue-500/50 transition-all space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex flex-col items-center justify-center shrink-0 border border-blue-500/20">
                          <span className="text-[10px] uppercase font-mono font-bold leading-none">{new Date(s).toLocaleString('default', { month: 'short' })}</span>
                          <span className="text-lg font-bold font-display leading-none mt-0.5">{new Date(s).getDate()}</span>
                        </div>
                        <div>
                          <h4 className="font-display text-lg text-bone group-hover:text-blue-400 transition-colors line-clamp-1">{e.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-bone-dim uppercase">{e.activityType || 'Event'}</span>
                            {e.visibility === 'clan_only' && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase bg-sienna/20 text-sienna px-1.5 py-0.5 rounded border border-sienna/30">
                                <Shield size={9} /> Clan
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(isAdmin || user?.uid === e.createdBy) && (
                        <div className="flex items-center gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
                          <button 
                            onClick={() => setEditingEvent(e)}
                            className="p-1.5 rounded-lg hover:bg-ink-3 text-bone-dim hover:text-bone transition-colors"
                            title="Edit Event"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={() => deleteEventMutation.mutate(e.id!)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-bone-dim hover:text-red-400 transition-colors"
                            title="Delete Event"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-bone-dim line-clamp-2 leading-relaxed">{e.description}</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-line/20">
                    {e.topWinner && (
                      <div className="mt-1 p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/50 flex items-center justify-between gap-2 shadow-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm">
                            🥇
                          </div>
                          <div className="min-w-0 truncate">
                            <span className="text-[10px] font-mono uppercase text-amber-900 dark:text-amber-400 font-black mr-1">Champion:</span>
                            <span className="text-xs font-bold text-foreground truncate">{e.topWinner.userName}</span>
                          </div>
                        </div>
                        {e.topWinner.customResult && (
                          <span className="text-[10px] font-mono text-foreground font-bold shrink-0">{e.topWinner.customResult}</span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-bone-dim">
                      <span className={`text-[10px] ${cd.color}`}>
                        {cd.text}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={11} className="text-blue-400" /> {e.participantCount || 0} Attending
                      </span>
                    </div>

                    {e.location?.name && (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-bone-dim truncate">
                        <MapPin size={11} className="text-rose-400 shrink-0" />
                        <span className="truncate">{e.location.name}</span>
                      </div>
                    )}

                    {e.prize && (
                      <div className="badge-prize inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold truncate">
                        <Trophy size={11} className="shrink-0" />
                        <span className="truncate">{e.prize}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedEventId && (
          <EventDetailSheet
            eventId={selectedEventId}
            onClose={() => setSelectedEventId(null)}
          />
        )}
      </AnimatePresence>

      {editingEvent && (
        <EditEventSheet 
          event={editingEvent} 
          isOpen={!!editingEvent} 
          onClose={() => setEditingEvent(null)} 
        />
      )}
    </div>
  );
}
