import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { Search, Shield, Calendar, Trophy, ArrowLeft, ExternalLink } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { getPublicClans, getPublicChallenges } from '@/services/community';
import { getPublishedEvents } from '@/services/events';
import { getPublicActivities, searchUsers } from '@/services/social';
import { getSamplePlans } from '@/services/plans';
import { COMPACT_LIBRARY } from '@/services/library';
import { getAvatarUrl } from '@/lib/avatar';
import { useUIStore } from '@/stores/ui-store';

const TABS = [
  { id: 'top', label: 'Top' },
  { id: 'athletes', label: 'Athletes' },
  { id: 'clans', label: 'Clans' },
  { id: 'events', label: 'Events' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'posts', label: 'Posts' },
  { id: 'plans', label: 'Plans' },
  { id: 'exercises', label: 'Exercises' },
] as const;

type TabId = typeof TABS[number]['id'];

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useUIStore();
  
  const initialQuery = new URLSearchParams(location.search).get('q') || '';
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<TabId>('top');
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      // Update URL silently
      if (searchQuery.trim()) {
        window.history.replaceState({}, '', `/search?q=${encodeURIComponent(searchQuery.trim())}`);
      } else {
        window.history.replaceState({}, '', `/search`);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // ─── Queries ──────────────────────────────────────────────
  const { data: athletes = [], isLoading: loadingAthletes } = useQuery({
    queryKey: ['searchUsers', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  const { data: plansData = [] } = useQuery({
    queryKey: ['samplePlansSearch'],
    queryFn: getSamplePlans,
    staleTime: 5 * 60 * 1000,
  });

  const { data: clansData = [], isLoading: loadingClans } = useQuery({
    queryKey: ['publicClansSearch'],
    queryFn: () => getPublicClans(100),
    staleTime: 60000,
  });

  const { data: eventsData = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['publishedEventsSearch'],
    queryFn: getPublishedEvents,
    staleTime: 60000,
  });

  const { data: challengesData = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['publicChallengesSearch'],
    queryFn: () => getPublicChallenges(100),
    staleTime: 60000,
  });

  const { data: postsData = [], isLoading: loadingPosts } = useQuery({
    queryKey: ['publicActivitiesSearch'],
    queryFn: () => getPublicActivities(100),
    staleTime: 60000,
  });

  // ─── Fuse Configs ─────────────────────────────────────────
  const fuseOptions = {
    includeScore: true,
    threshold: 0.4, // Fuzzy threshold
  };

  const fusePlans = useMemo(() => new Fuse(plansData, { ...fuseOptions, keys: ['title', 'description', 'tags'] }), [plansData]);
  const fuseExercises = useMemo(() => new Fuse(COMPACT_LIBRARY, { ...fuseOptions, keys: ['name', 'muscleGroup', 'equipment', 'tags'] }), []);
  const fuseClans = useMemo(() => new Fuse(clansData, { ...fuseOptions, keys: ['name', 'description', 'tags'] }), [clansData]);
  const fuseEvents = useMemo(() => new Fuse(eventsData, { ...fuseOptions, keys: ['title', 'description', 'category', 'location.venueName'] }), [eventsData]);
  const fuseChallenges = useMemo(() => new Fuse(challengesData, { ...fuseOptions, keys: ['title', 'description', 'metric'] }), [challengesData]);
  const fusePosts = useMemo(() => new Fuse(postsData, { ...fuseOptions, keys: ['summary', 'userName'] }), [postsData]);

  // ─── Filtered Results ─────────────────────────────────────
  const getResults = (fuse: Fuse<any>, data: any[]) => {
    if (!debouncedQuery) return data.slice(0, 20); // Show recent 20 if no query
    return fuse.search(debouncedQuery).map(r => r.item).slice(0, 50);
  };

  const filteredPlans = getResults(fusePlans, plansData);
  const filteredExercises = getResults(fuseExercises, COMPACT_LIBRARY);
  const filteredClans = getResults(fuseClans, clansData);
  const filteredEvents = getResults(fuseEvents, eventsData);
  const filteredChallenges = getResults(fuseChallenges, challengesData);
  const filteredPosts = getResults(fusePosts, postsData);

  // ─── Render Helpers ───────────────────────────────────────
  
  const renderAthlete = (athlete: any) => (
    <Link
      key={athlete.uid}
      to={`/profile/${athlete.username || athlete.uid}`}
      className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors"
    >
      <img
        src={athlete.photoURL || getAvatarUrl(athlete.displayName, theme)}
        alt={athlete.displayName}
        className="w-12 h-12 rounded-full object-cover border border-line"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-bone truncate">{athlete.displayName}</div>
        <div className="text-xs font-mono text-bone-dim truncate">@{athlete.username || 'athlete'}</div>
      </div>
    </Link>
  );

  const renderClan = (clan: any) => (
    <Link
      key={clan.id}
      to={`/clans/${clan.id}`}
      className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-sienna/20 border border-sienna/30 flex items-center justify-center shrink-0 overflow-hidden">
        {clan.banner ? <img src={clan.banner} alt={clan.name} className="w-full h-full object-cover" /> : <Shield size={20} className="text-sienna" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-bone truncate">{clan.name}</div>
        <div className="text-xs font-mono text-bone-dim truncate">{clan.memberCount} members · {clan.visibility}</div>
      </div>
    </Link>
  );

  const renderEvent = (event: any) => (
    <Link
      key={event.id}
      to={`/events/${event.id}`}
      className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-bone/5 border border-line flex flex-col items-center justify-center shrink-0">
        <span className="text-[10px] font-mono text-sienna uppercase font-bold leading-none">{event.dateTime?.start?.toDate ? event.dateTime.start.toDate().toLocaleString('default', { month: 'short' }) : 'TBA'}</span>
        <span className="text-lg font-display text-bone leading-none mt-1">{event.dateTime?.start?.toDate ? event.dateTime.start.toDate().getDate() : '-'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-bone truncate">{event.title}</div>
        <div className="text-xs font-mono text-bone-dim truncate">{event.location?.venueName || 'Virtual'}</div>
      </div>
    </Link>
  );

  const renderChallenge = (challenge: any) => (
    <Link
      key={challenge.id}
      to={`/challenges/${challenge.id}`}
      className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
        <Trophy size={20} className="text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-bone truncate">{challenge.title}</div>
        <div className="text-xs font-mono text-bone-dim truncate">Target: {challenge.target} {challenge.metric}</div>
      </div>
    </Link>
  );

  const renderPost = (post: any) => (
    <Link
      key={post.id}
      to={`/profile/${post.username || post.userId}`}
      className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors block"
    >
      <div className="flex items-center gap-2 mb-2">
        <img src={post.userPhoto || getAvatarUrl(post.userName, theme)} alt={post.userName} className="w-6 h-6 rounded-full" />
        <span className="text-xs font-medium text-bone">{post.userName}</span>
      </div>
      <div className="text-sm text-bone-dim">{post.summary}</div>
    </Link>
  );

  const renderPlan = (plan: any) => (
    <Link
      key={plan.id}
      to={`/plans/${plan.id}`}
      className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors group"
    >
      <div>
        <div className="text-sm text-bone font-medium">{plan.title}</div>
        <div className="text-[11px] font-mono text-bone-dim mt-0.5">{plan.daysPerWeek} days/week · {plan.estimatedDuration || 'Custom'}</div>
      </div>
      <span className="text-[10px] font-mono text-bone bg-bone/10 px-2.5 py-1 rounded-full group-hover:bg-bone group-hover:text-ink transition-colors">View</span>
    </Link>
  );

  const renderExercise = (ex: any, idx: number) => (
    <button
      key={idx}
      onClick={() => {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.youtubeSearch || (ex.name + ' form tutorial'))}`;
        if (Capacitor.isNativePlatform()) { Browser.open({ url, presentationStyle: 'popover' }); } else { window.open(url, '_blank'); }
      }}
      className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-colors group w-full text-left"
    >
      <div>
        <div className="text-sm text-bone font-medium">{ex.name}</div>
        <div className="text-[11px] font-mono text-bone-dim mt-0.5">{ex.muscleGroup} · {ex.equipment}</div>
      </div>
      <ExternalLink size={14} className="text-bone-dim/50" />
    </button>
  );

  const isLoading = loadingAthletes || loadingClans || loadingEvents || loadingChallenges || loadingPosts;

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-ink/90 backdrop-blur-xl border-b border-line pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center text-bone hover:bg-white/10 shrink-0 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 flex items-center gap-2 h-10 px-4 rounded-full border border-bone/20 bg-ink-2">
            <Search size={16} className="text-bone-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              autoComplete="off"
              autoCorrect="off"
              className="search-input-override bg-transparent border-none outline-none w-full text-bone text-sm placeholder:text-bone-dim"
              autoFocus
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden px-4 pb-0 flex items-center gap-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 font-medium text-sm whitespace-nowrap transition-colors relative ${
                activeTab === tab.id ? 'text-bone' : 'text-bone-dim hover:text-bone/80'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="searchTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-sienna"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-24 overflow-y-auto">
        {isLoading && debouncedQuery && (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {activeTab === 'top' && (
                <div className="space-y-8">
                  {athletes.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Athletes</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{athletes.slice(0, 3).map(renderAthlete)}</div>
                    </section>
                  )}
                  {filteredClans.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Clans</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredClans.slice(0, 3).map(renderClan)}</div>
                    </section>
                  )}
                  {filteredEvents.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Events</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredEvents.slice(0, 3).map(renderEvent)}</div>
                    </section>
                  )}
                  {filteredChallenges.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Challenges</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredChallenges.slice(0, 3).map(renderChallenge)}</div>
                    </section>
                  )}
                  {filteredPosts.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Posts</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredPosts.slice(0, 3).map(renderPost)}</div>
                    </section>
                  )}
                  {filteredPlans.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Plans</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredPlans.slice(0, 3).map(renderPlan)}</div>
                    </section>
                  )}
                  {filteredExercises.length > 0 && (
                    <section>
                      <h3 className="font-display text-xs text-bone-dim uppercase tracking-wider mb-3">Exercises</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{filteredExercises.slice(0, 3).map((e, i) => renderExercise(e, i))}</div>
                    </section>
                  )}
                  {(!athletes.length && !filteredClans.length && !filteredEvents.length && !filteredChallenges.length && !filteredPosts.length && !filteredPlans.length && !filteredExercises.length) && (
                    <div className="text-center py-20 text-bone-dim font-mono text-sm">No results found for "{debouncedQuery}".</div>
                  )}
                </div>
              )}

              {activeTab === 'athletes' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {athletes.length > 0 ? athletes.map(renderAthlete) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No athletes found.</div>}
                </div>
              )}

              {activeTab === 'clans' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredClans.length > 0 ? filteredClans.map(renderClan) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No clans found.</div>}
                </div>
              )}

              {activeTab === 'events' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredEvents.length > 0 ? filteredEvents.map(renderEvent) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No events found.</div>}
                </div>
              )}

              {activeTab === 'challenges' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredChallenges.length > 0 ? filteredChallenges.map(renderChallenge) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No challenges found.</div>}
                </div>
              )}

              {activeTab === 'posts' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPosts.length > 0 ? filteredPosts.map(renderPost) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No posts found.</div>}
                </div>
              )}

              {activeTab === 'plans' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPlans.length > 0 ? filteredPlans.map(renderPlan) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No plans found.</div>}
                </div>
              )}

              {activeTab === 'exercises' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredExercises.length > 0 ? filteredExercises.map((e, i) => renderExercise(e, i)) : <div className="col-span-full text-center py-10 text-bone-dim text-sm">No exercises found.</div>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
