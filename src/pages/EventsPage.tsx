import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, MapPin, Users, Plus, X, Search, Filter } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getPublishedEvents, createEvent, getVerifiedCommunities, getUserEventRegistrations, getEventsByIds, getUserSubmittedEvents, getPendingEventsForCommunityLeader, updateEventStatus } from '@/services/events';
import type { AppEvent, EventCategory, EventType, GenderRestriction, SkillLevel } from '@/types';
import { Timestamp } from 'firebase/firestore';

const CATEGORIES: EventCategory[] = ['Gym', 'Calisthenics', 'Yoga', 'Running', 'Meetup', 'Workshop', 'Competition', 'Other'];

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop');
  const [category, setCategory] = useState<EventCategory>('Meetup');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [mapLink, setMapLink] = useState('');
  const [capacity, setCapacity] = useState('50');
  const [isPaid, setIsPaid] = useState(false);
  const [eventType, setEventType] = useState<EventType>('Meetup');
  const [genderRestriction, setGenderRestriction] = useState<GenderRestriction>('Any');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('All Levels');
  const [requiredItemsStr, setRequiredItemsStr] = useState('');
  
  const { data: communities = [] } = useQuery({ queryKey: ['communities'], queryFn: getVerifiedCommunities });
  const [selectedCommunity, setSelectedCommunity] = useState<string>('none');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not logged in');
      
      const startDateTime = new Date(`${date}T${time}`);
      const endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours later
      
      const community = communities.find(c => c.id === selectedCommunity);
      
      await createEvent({
        title,
        description,
        banner,
        category,
        eventType,
        genderRestriction,
        skillLevel,
        organizerId: profile.uid,
        organizerName: profile.displayName || profile.username,
        communityId: selectedCommunity === 'none' ? null : selectedCommunity,
        communityName: community?.name || null,
        dateTime: { start: Timestamp.fromDate(startDateTime), end: Timestamp.fromDate(endDateTime) },
        location: { venueName: venue, address: venue, mapLink },
        capacity: parseInt(capacity) || 50,
        pricing: { type: isPaid ? 'paid' : 'free', basePrice: isPaid ? 10 : 0, currency: 'USD' },
        details: { 
          ageRestriction: 'none', 
          language: 'English', 
          dressCode: 'Athletic wear', 
          prerequisites: [],
          requiredItems: requiredItemsStr.split(',').map(s => s.trim()).filter(Boolean),
          faq: []
        }
      });
    },
    onSuccess: () => {
      showToast('Event request submitted for approval.', 'info');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Could not create event', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time || !venue) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-2xl w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 sm:mb-6 border-b border-line pb-4 shrink-0">
          <div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Host an Event</h2>
            <p className="text-xs sm:text-sm text-bone-dim mt-0.5 sm:mt-1">Fill out the details to organize a workout or meetup.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Event Title</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sunday Morning Run" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as EventCategory)} className="input-field w-full">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What will happen at this event?" className="input-field w-full min-h-[100px] py-3" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Event Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value as EventType)} className="input-field w-full">
                {['Competition', 'Meetup', 'Workshop', 'Chill', 'Class', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Gender</label>
              <select value={genderRestriction} onChange={e => setGenderRestriction(e.target.value as GenderRestriction)} className="input-field w-full">
                {['Any', 'Male Only', 'Female Only'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Skill Level</label>
              <select value={skillLevel} onChange={e => setSkillLevel(e.target.value as SkillLevel)} className="input-field w-full">
                {['All Levels', 'Beginner', 'Intermediate', 'Advanced'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Time</label>
              <input type="time" required value={time} onChange={e => setTime(e.target.value)} className="input-field w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Venue Name / Location</label>
              <input required value={venue} onChange={e => setVenue(e.target.value)} placeholder="e.g. Central Park" className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Google Maps Link</label>
              <input value={mapLink} onChange={e => setMapLink(e.target.value)} placeholder="https://maps.google.com/..." className="input-field w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Capacity (Max users)</label>
              <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Ticket Type</label>
              <select value={isPaid ? 'paid' : 'free'} onChange={e => setIsPaid(e.target.value === 'paid')} className="input-field w-full">
                <option value="free">Free Event</option>
                <option value="paid">Paid Event (Simulated)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Community Link</label>
              <select value={selectedCommunity} onChange={e => setSelectedCommunity(e.target.value)} className="input-field w-full">
                <option value="none">Standalone Event</option>
                {communities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Required Items (Comma Separated)</label>
            <input value={requiredItemsStr} onChange={e => setRequiredItemsStr(e.target.value)} placeholder="e.g. Water bottle, Towel, Yoga Mat" className="input-field w-full" />
          </div>

          <div className="pt-6 border-t border-line/30 flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary px-6 py-2">{createMutation.isPending ? 'Submitting...' : 'Submit Event'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export function EventsPage() {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'attending' | 'my_submissions' | 'leader_approvals'>('upcoming');
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'free' | 'paid' | 'today' | 'tomorrow' | 'weekend' | 'online'>('all');
  
  const { data: upcomingEvents = [], isLoading: loadingUpcoming } = useQuery({
    queryKey: ['events'],
    queryFn: getPublishedEvents
  });

  const { data: myRegistrations = [] } = useQuery({
    queryKey: ['myEventRegistrations', user?.uid],
    queryFn: () => getUserEventRegistrations(user!.uid),
    enabled: !!user,
  });

  const { data: attendingEvents = [], isLoading: loadingAttending } = useQuery({
    queryKey: ['myEvents', myRegistrations],
    queryFn: async () => {
      if (!myRegistrations.length) return [];
      const activeRegs = myRegistrations.filter(r => r.status === 'registered' || r.status === 'waitlist');
      const eventIds = activeRegs.map(r => r.eventId);
      return getEventsByIds(eventIds);
    },
    enabled: !!myRegistrations.length,
  });

  const { data: submittedEvents = [], isLoading: loadingSubmitted } = useQuery({
    queryKey: ['userSubmittedEvents', user?.uid],
    queryFn: () => getUserSubmittedEvents(user!.uid),
    enabled: !!user && tab === 'my_submissions',
  });

  const { data: leaderPendingEvents = [], isLoading: loadingLeader } = useQuery({
    queryKey: ['leaderPendingEvents', user?.uid],
    queryFn: () => getPendingEventsForCommunityLeader(user!.uid),
    enabled: !!user,
  });

  const approveEventLeaderMutation = useMutation({
    mutationFn: (id: string) => updateEventStatus(id, 'published'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderPendingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      showToast('Event approved and published!');
    },
    onError: (err: any) => showToast(err?.message || 'Could not approve event', 'error')
  });

  const rejectEventLeaderMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => updateEventStatus(id, 'rejected', reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderPendingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['userSubmittedEvents'] });
      showToast('Event rejected');
    },
    onError: (err: any) => showToast(err?.message || 'Could not reject event', 'error')
  });

  const events = tab === 'upcoming' 
    ? upcomingEvents 
    : tab === 'attending' 
    ? attendingEvents 
    : tab === 'my_submissions' 
    ? submittedEvents 
    : leaderPendingEvents;

  const isLoading = tab === 'upcoming' 
    ? loadingUpcoming 
    : tab === 'attending' 
    ? loadingAttending 
    : tab === 'my_submissions' 
    ? loadingSubmitted 
    : loadingLeader;

  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((e: AppEvent) => 
        e.title.toLowerCase().includes(q) || 
        e.location.venueName.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }
    
    if (filterMode === 'free') filtered = filtered.filter((e: AppEvent) => e.pricing.type === 'free');
    if (filterMode === 'paid') filtered = filtered.filter((e: AppEvent) => e.pricing.type === 'paid');
    if (filterMode === 'online') filtered = filtered.filter((e: AppEvent) => e.location.isOnline);
    if (filterMode === 'today') {
      const today = new Date().toDateString();
      filtered = filtered.filter((e: AppEvent) => e.dateTime?.start?.toDate && e.dateTime.start.toDate().toDateString() === today);
    }
    if (filterMode === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toDateString();
      filtered = filtered.filter((e: AppEvent) => e.dateTime?.start?.toDate && e.dateTime.start.toDate().toDateString() === tomorrowStr);
    }
    if (filterMode === 'weekend') {
      filtered = filtered.filter((e: AppEvent) => {
        if (!e.dateTime?.start?.toDate) return false;
        const day = e.dateTime.start.toDate().getDay();
        return day === 0 || day === 6; // Sunday or Saturday
      });
    }
    return filtered;
  }, [events, search, filterMode]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1200px] mx-auto w-full space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-line">
        <div>
          <div className="font-mono text-sienna text-xs tracking-widest mb-2 uppercase">Experience</div>
          <h1 className="font-display text-4xl text-bone">Events Feed</h1>
          <p className="text-bone-dim mt-2 max-w-xl">Join community workouts, competitions, and local meetups near you.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 self-start md:self-auto shrink-0">
          <Plus size={16} /> Host Event
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-1 max-w-2xl mb-2">
        <button
          onClick={() => setTab('upcoming')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'upcoming' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setTab('attending')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'attending' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          Attending
        </button>
        {user && (
          <button
            onClick={() => setTab('my_submissions')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'my_submissions' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
          >
            My Submissions
          </button>
        )}
        {user && (leaderPendingEvents.length > 0 || tab === 'leader_approvals') && (
          <button
            onClick={() => setTab('leader_approvals')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'leader_approvals' ? 'bg-sienna text-bone font-bold shadow-sm border border-sienna/40' : 'bg-ink-2 text-amber hover:bg-ink-3'}`}
          >
            Leader Approvals ({leaderPendingEvents.length})
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, location..." className="input-field w-full pl-9" />
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setFilterMode('all')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'all' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>All</button>
          <button onClick={() => setFilterMode('today')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'today' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>Today</button>
          <button onClick={() => setFilterMode('tomorrow')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'tomorrow' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>Tomorrow</button>
          <button onClick={() => setFilterMode('weekend')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'weekend' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>Weekend</button>
          <button onClick={() => setFilterMode('free')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'free' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>Free</button>
          <button onClick={() => setFilterMode('paid')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'paid' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>Paid</button>
          <button onClick={() => setFilterMode('online')} className={`px-4 py-2 rounded-full text-sm font-mono border transition-colors shrink-0 ${filterMode === 'online' ? 'bg-ink text-bone font-bold border-line/20 shadow-sm' : 'border-transparent text-bone-dim hover:bg-ink-2 hover:text-bone'}`}>Online</button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-bone-dim font-mono text-sm">Loading events...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-[32px] bg-ink-2">
          <CalendarIcon size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
          <h3 className="font-display text-xl mb-2 text-bone">
            {tab === 'my_submissions' ? 'No Submissions Yet' : tab === 'leader_approvals' ? 'No Pending Approvals' : 'No Events Found'}
          </h3>
          <p className="text-sm text-bone-dim max-w-sm mx-auto">
            {tab === 'my_submissions' ? 'You have not submitted any event hosting requests.' : tab === 'leader_approvals' ? 'There are no pending events for your community.' : "We couldn't find any events matching your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event: AppEvent) => {
            const status = event.status || 'pending';
            return (
              <div key={event.id} className="card overflow-hidden group hover:border-sienna/50 transition-colors flex flex-col justify-between">
                <div>
                  <div className="h-40 bg-ink-3 relative overflow-hidden shrink-0">
                    {event.banner && <img src={event.banner} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
                    <div className="absolute top-3 right-3 flex gap-2">
                      {tab === 'my_submissions' && (
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold backdrop-blur-sm ${
                          status === 'published' ? 'bg-emerald-500/90 text-white' :
                          status === 'rejected' ? 'bg-rose-500/90 text-white' :
                          'bg-amber-500/90 text-ink'
                        }`}>
                          {status === 'published' ? '✓ Published' : status === 'rejected' ? '✕ Rejected' : '⏳ Pending'}
                        </span>
                      )}
                      <span className={`text-[10px] font-mono uppercase px-2 py-1 rounded backdrop-blur-sm shadow-sm ${event.pricing.type === 'free' ? 'bg-amber/90 text-ink font-bold' : 'bg-ink/80 text-bone'}`}>
                        {event.pricing.type === 'free' ? 'FREE' : 'PAID'}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-4 flex gap-2">
                      <span className="text-[10px] font-mono uppercase bg-sienna text-bone px-2 py-1 rounded backdrop-blur-sm shadow">{event.category}</span>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="mb-2">
                      <div className="text-xs font-mono text-sienna mb-1">
                        {event.dateTime?.start?.toDate ? event.dateTime.start.toDate().toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date TBD'}
                      </div>
                      <h3 className="font-display text-xl text-bone line-clamp-1">{event.title}</h3>
                    </div>
                    <p className="text-sm text-bone-dim line-clamp-2 mb-3">{event.description}</p>

                    {status === 'rejected' && event.rejectionReason && (
                      <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg text-xs text-rose-300 mb-3">
                        <span className="font-bold">Reason:</span> {event.rejectionReason}
                      </div>
                    )}
                    
                    <div className="space-y-2 text-xs font-mono text-bone-dim border-t border-line/30 pt-4">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-amber shrink-0" />
                        <span className="truncate">{event.location.venueName}</span>
                      </div>
                      <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-sienna shrink-0" />
                          <span>{event.stats?.registeredCount || 0} / {event.capacity} Going</span>
                        </div>
                        {event.communityName && <span className="text-[10px] border border-line/50 rounded px-1.5 py-0.5 truncate max-w-[120px]">{event.communityName}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0 flex items-center justify-between gap-2">
                  {tab === 'leader_approvals' ? (
                    <div className="flex gap-2 w-full pt-3 border-t border-line/30">
                      <button 
                        onClick={() => event.id && approveEventLeaderMutation.mutate(event.id)}
                        disabled={approveEventLeaderMutation.isPending}
                        className="btn-primary py-1.5 text-xs flex-1"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => {
                          if (!event.id) return;
                          const r = prompt('Reason for rejection (optional):');
                          if (r !== null) rejectEventLeaderMutation.mutate({ id: event.id, reason: r || undefined });
                        }}
                        disabled={rejectEventLeaderMutation.isPending}
                        className="btn-secondary py-1.5 text-xs border-danger text-danger hover:bg-danger/10 flex-1"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <Link to={`/events/${event.id}`} className="w-full text-center btn-secondary py-2 text-xs">
                      View Event Details
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
