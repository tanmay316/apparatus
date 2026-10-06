import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllCommunityEvents, deleteSimpleEvent } from '@/services/community';
import { CalendarDays, Users, Edit3, Trash2, Trophy, Shield, MapPin, Clock, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { EventDetailSheet } from './EventDetailSheet';
import { EditEventSheet } from './EditEventSheet';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { SimpleEvent } from '@/types';
import {
  CardAction, CardSkeleton, ChampionRow, DateTile, EmptyState, Eyebrow, FilterChips, MetaItem, StatusPill,
  formatWhen, getScheduleStatus, isScheduleActive, isScheduleEnded, isScheduleUpcoming, toMillis,
} from './ui';

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
    },
    onError: (err: any) => {
      showToast(err?.message || 'Could not delete event', 'error');
    }
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['allCommunityEvents'],
    queryFn: () => getAllCommunityEvents(50)
  });

  const filteredEvents = events.filter(e => {
    const startMs = toMillis(e.startTime);
    const endMs = toMillis(e.endTime);
    if (filter === 'upcoming') return isScheduleUpcoming(startMs);
    if (filter === 'active') return isScheduleActive(startMs, endMs);
    return true;
  });

  // Featured event must never be a concluded one
  const featured = filteredEvents.find(e => !isScheduleEnded(toMillis(e.startTime), toMillis(e.endTime)));
  const canManage = (e: SimpleEvent) => isAdmin || user?.uid === e.createdBy;

  const renderManage = (e: SimpleEvent, onMedia = false) => canManage(e) ? (
    <div className="flex items-center gap-1 shrink-0" onClick={ev => ev.stopPropagation()}>
      <CardAction icon={Edit3} label="Edit event" onMedia={onMedia} onClick={() => setEditingEvent(e)} />
      <CardAction icon={Trash2} label="Delete event" onMedia={onMedia} danger onClick={() => deleteEventMutation.mutate(e.id!)} />
    </div>
  ) : null;

  const open = (id?: string) => id && setSelectedEventId(id);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Happening now' },
          { value: 'upcoming', label: 'Upcoming' },
        ]}
      />

      {/* Featured */}
      {featured && (() => {
        const s = toMillis(featured.startTime);
        const end = toMillis(featured.endTime);
        return (
          <section aria-label="Featured event">
            <Eyebrow className="mb-2">Featured</Eyebrow>
            <div
              role="link"
              tabIndex={0}
              onClick={() => open(featured.id)}
              onKeyDown={ev => { if (ev.key === 'Enter') open(featured.id); }}
              className="cx-card cx-card-interactive overflow-hidden cursor-pointer group"
            >
              <div className="relative h-44 sm:h-56 bg-ink-3">
                {featured.coverUrl ? (
                  <img src={featured.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-bone-dim/30"><CalendarDays size={52} /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                  <StatusPill status={getScheduleStatus(s, end)} onMedia />
                  {featured.visibility === 'clan_only' && (
                    <span className="cx-status cx-status-on-media"><Shield size={11} /> Clan only</span>
                  )}
                </div>
                <div className="absolute top-3 right-3">{renderManage(featured, true)}</div>
                <h2 className="absolute bottom-3 left-4 right-4 text-white text-xl sm:text-2xl font-semibold leading-tight line-clamp-2">
                  {featured.title}
                </h2>
              </div>

              <div className="p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="min-w-0 space-y-2.5">
                  <p className="text-sm text-bone-dim line-clamp-2 leading-relaxed">
                    {featured.description || 'Join fellow athletes for this community event.'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <MetaItem icon={Clock}>{formatWhen(s)}</MetaItem>
                    <MetaItem icon={Users}>{featured.participantCount || 0} attending</MetaItem>
                    {featured.location?.name && <MetaItem icon={MapPin}>{featured.location.name}</MetaItem>}
                    {featured.prize && <MetaItem icon={Trophy}>{featured.prize}</MetaItem>}
                  </div>
                </div>
                <span className="cx-btn bg-sienna shrink-0 self-start sm:self-auto">
                  View event <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Grid of Events */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-semibold text-bone">
            {filter === 'all' ? 'All events' : filter === 'active' ? 'Happening now' : 'Upcoming events'}
          </h3>
          <span className="text-xs text-bone-dim tabular-nums">{filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}</span>
        </div>

        {loadingEvents ? (
          <CardSkeleton />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarDays}
            title="No events here yet"
            description={filter === 'all' ? 'Community events will show up here once they are created.' : 'Nothing matches this filter right now.'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map(e => {
              const s = toMillis(e.startTime);
              const end = toMillis(e.endTime);

              return (
                <div
                  key={e.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => open(e.id)}
                  onKeyDown={ev => { if (ev.key === 'Enter') open(e.id); }}
                  className="cx-card cx-card-interactive p-4 flex flex-col gap-3 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <DateTile ms={s} />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[15px] font-semibold text-bone leading-snug line-clamp-2">{e.title}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-bone-dim">
                        <span className="capitalize">{e.activityType || 'Event'}</span>
                        {e.visibility === 'clan_only' && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1 text-sienna"><Shield size={11} /> Clan only</span>
                          </>
                        )}
                      </div>
                    </div>
                    {renderManage(e)}
                  </div>

                  {e.description && (
                    <p className="text-sm text-bone-dim line-clamp-2 leading-relaxed">{e.description}</p>
                  )}

                  {e.topWinner && <ChampionRow name={e.topWinner.userName} result={e.topWinner.customResult} />}

                  {(e.location?.name || e.prize) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {e.location?.name && <MetaItem icon={MapPin}>{e.location.name}</MetaItem>}
                      {e.prize && <MetaItem icon={Trophy}>{e.prize}</MetaItem>}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-line flex items-center justify-between gap-2">
                    <StatusPill status={getScheduleStatus(s, end)} />
                    <MetaItem icon={Users}>{e.participantCount || 0} attending</MetaItem>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
