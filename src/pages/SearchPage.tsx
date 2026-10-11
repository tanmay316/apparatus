import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, Clock, Dumbbell, Search, Shield, Trophy, User, Users, X, Zap,
} from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { getAllCommunityEvents, getPublicChallenges, getPublicClans } from '@/services/community';
import { getPublicActivities, searchUsers } from '@/services/social';
import { getPublicPlans, getSamplePlans } from '@/services/plans';
import { COMPACT_LIBRARY } from '@/services/library';
import { getAvatarUrl } from '@/lib/avatar';
import { ProRing } from '@/components/subscription/ProEntry';
import {
  QUICK_LINKS, addRecentSearch, clearRecentSearches, createSearchIndex, getRecentSearches, highlightParts, normalizeQuery, removeRecentSearch, searchQuickLinks,
  type Hit, type QuickLink,
} from '@/lib/search';
import { useUIStore } from '@/stores/ui-store';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import type { Activity, ChallengeV2, ClanV2, Plan, SimpleEvent } from '@/types';
import { BRAND } from '@/lib/brand';

type Exercise = typeof COMPACT_LIBRARY[number];
type TabId = 'top' | 'athletes' | 'clans' | 'events' | 'challenges' | 'posts' | 'plans' | 'exercises';

const TAB_LABELS: Record<TabId, string> = {
  top: 'Top', athletes: 'Athletes', clans: 'Clans', events: 'Events', challenges: 'Challenges', posts: 'Posts', plans: 'Plans', exercises: 'Exercises',
};
const TAB_IDS = Object.keys(TAB_LABELS) as TabId[];
const STALE = 5 * 60 * 1000;

const toMs = (t: any) => (t?.toMillis ? t.toMillis() : typeof t?.seconds === 'number' ? t.seconds * 1000 : 0);

function Highlight({ text, query }: { text: string; query: string }) {
  return <>{highlightParts(text, query).map((p, i) => (p.match ? <mark key={i} className="bg-transparent text-sienna font-semibold">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

function Row({ to, onClick, leading, title, subtitle, trailing, query }: {
  to?: string; onClick?: () => void; leading: ReactNode; title: string; subtitle?: string; trailing?: ReactNode; query: string;
}) {
  const body = (
    <>
      <span className="shrink-0">{leading}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-medium text-bone truncate"><Highlight text={title} query={query} /></span>
        {subtitle && <span className="block text-[12px] text-bone-dim truncate mt-0.5">{subtitle}</span>}
      </span>
      {trailing ?? <ChevronRight size={16} className="text-bone-dim/50 shrink-0" />}
    </>
  );
  const cls = 'flex items-center gap-3 w-full min-h-[64px] px-3 py-2.5 rounded-2xl text-left hover:bg-bone/[0.05] active:bg-bone/[0.08] transition-colors';
  return to ? <Link to={to} onClick={onClick} className={cls}>{body}</Link> : <button onClick={onClick} className={cls}>{body}</button>;
}

const iconTile = (icon: ReactNode, tint: string) => <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint}`}>{icon}</span>;

function Section({ title, count, onSeeAll, children }: { title: string; count?: number; onSeeAll?: () => void; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between px-3 mb-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-bone-dim">{title}</h3>
        {onSeeAll && count != null && count > 0 && (
          <button onClick={onSeeAll} className="text-[12px] font-semibold text-sienna">See all {count}</button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-2">{children}</div>
    </section>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-1 px-3">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 rounded-2xl bg-bone/[0.05] animate-pulse" />)}</div>;
}

export function SearchPage() {
  const navigate = useNavigate();
  const theme = useUIStore(s => s.theme);
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') || '');
  const [query, setQuery] = useState(input.trim());
  const rawTab = params.get('tab') as TabId | null;
  const tab: TabId = rawTab && TAB_IDS.includes(rawTab) ? rawTab : 'top';
  const [recent, setRecent] = useState(getRecentSearches);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openChallengeId, setOpenChallengeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 220);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (tab !== 'top') next.set('tab', tab);
    setParams(next, { replace: true });
  }, [query, tab, setParams]);

  const setTab = (t: TabId) => {
    const next = new URLSearchParams(params);
    if (t === 'top') next.delete('tab'); else next.set('tab', t);
    setParams(next, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const hasQuery = normalizeQuery(query).length >= 2;

  // ─── Data ────────────────────────────────────────────────
  const athletesQ = useQuery({ queryKey: ['searchUsers', normalizeQuery(query)], queryFn: () => searchUsers(query), enabled: hasQuery, staleTime: 30_000 });
  const clansQ = useQuery({ queryKey: ['search', 'clans'], queryFn: () => getPublicClans(200), staleTime: STALE });
  const eventsQ = useQuery({ queryKey: ['search', 'events'], queryFn: () => getAllCommunityEvents(150), staleTime: STALE });
  const challengesQ = useQuery({ queryKey: ['search', 'challenges'], queryFn: () => getPublicChallenges(150), staleTime: STALE });
  const postsQ = useQuery({ queryKey: ['search', 'posts'], queryFn: () => getPublicActivities(150), staleTime: STALE, enabled: hasQuery });
  const samplePlansQ = useQuery({ queryKey: ['samplePlans'], queryFn: getSamplePlans, staleTime: STALE });
  const publicPlansQ = useQuery({ queryKey: ['search', 'publicPlans'], queryFn: () => getPublicPlans(150), staleTime: STALE, enabled: hasQuery });

  const clans = clansQ.data || [];
  const events = useMemo(
    () => (eventsQ.data || []).filter(e => e.visibility === 'public' && e.status !== 'cancelled' && e.status !== 'removed'),
    [eventsQ.data],
  );
  const challenges = challengesQ.data || [];
  const plans = useMemo(() => {
    const byId = new Map<string, Plan>();
    [...(samplePlansQ.data || []), ...(publicPlansQ.data || [])].forEach(p => { if (p.id) byId.set(p.id, p); });
    return [...byId.values()];
  }, [samplePlansQ.data, publicPlansQ.data]);

  // ─── Indexes ─────────────────────────────────────────────
  const searchClans = useMemo(() => createSearchIndex<ClanV2>(clans, [{ name: 'name', weight: 3 }, { name: 'tags', weight: 1.5 }, { name: 'category', weight: 1 }, { name: 'description', weight: 0.5 }], c => c.name), [clans]);
  const searchEvents = useMemo(() => createSearchIndex<SimpleEvent>(events, [{ name: 'title', weight: 3 }, { name: 'activityType', weight: 1 }, { name: 'clanName', weight: 1 }, { name: 'location.name', weight: 1 }, { name: 'description', weight: 0.5 }], e => e.title), [events]);
  const searchChallenges = useMemo(() => createSearchIndex<ChallengeV2>(challenges, [{ name: 'title', weight: 3 }, { name: 'category', weight: 1 }, { name: 'metric', weight: 1 }, { name: 'clanName', weight: 1 }, { name: 'description', weight: 0.5 }], c => c.title), [challenges]);
  const searchPosts = useMemo(() => createSearchIndex<Activity>(postsQ.data || [], [{ name: 'summary', weight: 2 }, { name: 'userName', weight: 1 }], p => p.summary), [postsQ.data]);
  const searchPlans = useMemo(() => createSearchIndex<Plan>(plans, [{ name: 'title', weight: 3 }, { name: 'tags', weight: 1.5 }, { name: 'ownerName', weight: 0.5 }, { name: 'description', weight: 0.5 }], p => p.title), [plans]);
  const searchExercises = useMemo(() => createSearchIndex<Exercise>(COMPACT_LIBRARY, [{ name: 'name', weight: 3 }, { name: 'muscleGroup', weight: 1.5 }, { name: 'secondaryMuscles', weight: 0.7 }, { name: 'equipment', weight: 1 }, { name: 'tags', weight: 1 }], e => e.name), []);

  const results = useMemo(() => {
    if (!hasQuery) return null;
    const athletes: Hit<any>[] = (athletesQ.data || []).map((u, i) => ({ item: u, score: 0.05 + i * 0.01 }));
    return {
      athletes,
      clans: searchClans(query),
      events: searchEvents(query),
      challenges: searchChallenges(query),
      posts: searchPosts(query),
      plans: searchPlans(query),
      exercises: searchExercises(query),
      pages: searchQuickLinks(query, 3),
    };
  }, [hasQuery, query, athletesQ.data, searchClans, searchEvents, searchChallenges, searchPosts, searchPlans, searchExercises]);

  const counts: Partial<Record<TabId, number>> = results
    ? { athletes: results.athletes.length, clans: results.clans.length, events: results.events.length, challenges: results.challenges.length, posts: results.posts.length, plans: results.plans.length, exercises: results.exercises.length }
    : {};

  const remember = () => { if (hasQuery) setRecent(addRecentSearch(query)); };

  // ─── Renderers ───────────────────────────────────────────
  const renderAthlete = (u: any) => (
    <Row
      key={u.uid}
      to={`/profile/${u.username || u.uid}`}
      onClick={remember}
      query={query}
      leading={<ProRing pro={!!u.proBadge} crown={11}><img src={u.photoURL || getAvatarUrl(u.displayName, theme)} alt="" className="w-11 h-11 rounded-full object-cover" referrerPolicy="no-referrer" /></ProRing>}
      title={u.displayName || 'Athlete'}
      subtitle={`@${u.username || 'athlete'}${u.athleteRank?.label ? ` · ${u.athleteRank.label}` : ''}`}
    />
  );
  const renderClan = (c: ClanV2) => (
    <Row
      key={c.id}
      to={`/clan/${c.id}`}
      onClick={remember}
      query={query}
      leading={c.avatarUrl
        ? <img src={c.avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
        : iconTile(<Shield size={19} />, 'bg-sienna/10 text-sienna')}
      title={c.name}
      subtitle={[`${c.memberCount ?? 0} members`, c.category, c.visibility !== 'public' ? c.visibility : null].filter(Boolean).join(' · ')}
    />
  );
  const renderEvent = (e: SimpleEvent) => {
    const ms = toMs(e.startTime);
    const d = ms ? new Date(ms) : null;
    return (
      <Row
        key={e.id}
        onClick={() => { remember(); setOpenEventId(e.id!); }}
        query={query}
        leading={
          <span className="w-11 h-11 rounded-xl bg-bone/[0.06] flex flex-col items-center justify-center">
            <span className="text-[9.5px] font-bold uppercase text-sienna leading-none">{d ? d.toLocaleDateString([], { month: 'short' }) : 'TBA'}</span>
            <span className="text-[16px] font-bold text-bone leading-none mt-0.5">{d ? d.getDate() : '–'}</span>
          </span>
        }
        title={e.title}
        subtitle={[e.activityType, e.location?.name, e.clanName, `${e.participantCount ?? 0} going`].filter(Boolean).join(' · ')}
      />
    );
  };
  const renderChallenge = (c: ChallengeV2) => (
    <Row
      key={c.id}
      onClick={() => { remember(); setOpenChallengeId(c.id!); }}
      query={query}
      leading={iconTile(<Trophy size={19} />, 'bg-amber-500/10 text-amber-500')}
      title={c.title}
      subtitle={[`${c.target} ${c.unit || c.metric}`, `${c.participantCount ?? 0} joined`, c.status].filter(Boolean).join(' · ')}
    />
  );
  const renderPost = (p: Activity) => (
    <Row
      key={p.id}
      to={`/post/${p.id}`}
      onClick={remember}
      query={query}
      leading={<img src={p.userPhoto || getAvatarUrl(p.userName, theme)} alt="" className="w-11 h-11 rounded-full object-cover" referrerPolicy="no-referrer" />}
      title={p.summary}
      subtitle={p.userName}
    />
  );
  const renderPlan = (p: Plan) => (
    <Row
      key={p.id}
      to={`/plans/${p.id}`}
      onClick={remember}
      query={query}
      leading={iconTile(<BookOpen size={19} />, 'bg-indigo-500/10 text-indigo-500')}
      title={p.title}
      subtitle={[`${p.daysPerWeek ?? '?'} days/week`, p.estimatedDuration, p.type === 'sample' ? `${BRAND.name} plan` : p.ownerName].filter(Boolean).join(' · ')}
    />
  );
  const renderExercise = (e: Exercise) => (
    <Row
      key={e.name}
      onClick={() => {
        remember();
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(e.youtubeSearch || `${e.name} form tutorial`)}`;
        if (Capacitor.isNativePlatform()) Browser.open({ url, presentationStyle: 'popover' });
        else window.open(url, '_blank', 'noopener,noreferrer');
      }}
      query={query}
      leading={iconTile(<Dumbbell size={19} />, 'bg-orange-500/10 text-orange-500')}
      title={e.name}
      subtitle={[e.muscleGroup, e.equipment, e.difficulty].filter(Boolean).join(' · ')}
      trailing={<ArrowUpRight size={15} className="text-bone-dim/60 shrink-0" />}
    />
  );
  const renderPage = (l: QuickLink) => (
    <Row key={l.path} to={l.path} onClick={remember} query={query} leading={iconTile(<Zap size={18} />, 'bg-emerald-500/10 text-emerald-500')} title={l.label} subtitle="Go to page" />
  );

  const sectionDefs: { id: Exclude<TabId, 'top'>; title: string; hits: Hit<any>[]; render: (item: any) => ReactNode; loading: boolean; preview: number }[] = results ? [
    { id: 'athletes', title: 'Athletes', hits: results.athletes, render: renderAthlete, loading: athletesQ.isFetching && !athletesQ.data, preview: 4 },
    { id: 'clans', title: 'Clans', hits: results.clans, render: renderClan, loading: clansQ.isLoading, preview: 3 },
    { id: 'events', title: 'Events', hits: results.events, render: renderEvent, loading: eventsQ.isLoading, preview: 3 },
    { id: 'challenges', title: 'Challenges', hits: results.challenges, render: renderChallenge, loading: challengesQ.isLoading, preview: 3 },
    { id: 'plans', title: 'Plans', hits: results.plans, render: renderPlan, loading: samplePlansQ.isLoading, preview: 3 },
    { id: 'exercises', title: 'Exercises', hits: results.exercises, render: renderExercise, loading: false, preview: 3 },
    { id: 'posts', title: 'Posts', hits: results.posts, render: renderPost, loading: postsQ.isLoading, preview: 3 },
  ] : [];

  const anyLoading = sectionDefs.some(s => s.loading);
  const topSections = [...sectionDefs].filter(s => s.hits.length > 0).sort((a, b) => a.hits[0].score - b.hits[0].score);
  const totalHits = sectionDefs.reduce((n, s) => n + s.hits.length, 0) + (results?.pages.length || 0);

  // ─── Idle suggestions ────────────────────────────────────
  const popularClans = useMemo(() => [...clans].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0)).slice(0, 4), [clans]);
  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events.filter(e => toMs(e.endTime || e.startTime) >= now).sort((a, b) => toMs(a.startTime) - toMs(b.startTime)).slice(0, 3);
  }, [events]);

  const clearInput = () => { setInput(''); setQuery(''); inputRef.current?.focus(); };
  const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'));

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 min-h-[100dvh]">
      <header className="sticky top-0 z-50 bg-ink/90 backdrop-blur-xl border-b border-line/70" style={{ paddingTop: 'var(--sat)' }}>
        <div className="max-w-3xl mx-auto px-2 sm:px-4 h-14 flex items-center gap-1.5">
          <button onClick={goBack} className="w-10 h-10 rounded-full flex items-center justify-center text-bone hover:bg-bone/5 shrink-0" aria-label="Go back">
            <ArrowLeft size={20} />
          </button>
          <form
            role="search"
            className="flex-1 flex items-center gap-2 h-11 px-3.5 rounded-2xl bg-bone/[0.06] border border-transparent focus-within:border-sienna/40"
            onSubmit={e => { e.preventDefault(); setQuery(input.trim()); if (input.trim().length >= 2) setRecent(addRecentSearch(input)); inputRef.current?.blur(); }}
          >
            <Search size={17} className="text-bone-dim shrink-0" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { if (input) clearInput(); else goBack(); } }}
              placeholder="Athletes, clans, plans, exercises…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="search-input-override flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] text-bone placeholder:text-bone-dim/70 [&::-webkit-search-cancel-button]:hidden"
              aria-label="Search"
            />
            {input && (
              <button type="button" onClick={clearInput} className="w-7 h-7 rounded-full flex items-center justify-center text-bone-dim hover:text-bone bg-bone/10 shrink-0" aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </form>
        </div>

        {hasQuery && (
          <div className="max-w-3xl mx-auto flex gap-1.5 overflow-x-auto px-3 sm:px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
            {TAB_IDS.map(id => {
              const n = counts[id];
              if (id !== 'top' && id !== tab && n === 0) return null;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors ${tab === id ? 'bg-bone text-ink' : 'bg-bone/[0.06] text-bone-dim hover:text-bone'}`}
                >
                  {TAB_LABELS[id]}{n != null && n > 0 && <span className="ml-1 opacity-60">{n > 49 ? '50+' : n}</span>}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-1 sm:px-2 pt-3 pb-24 space-y-5 sm:space-y-6">
        {!hasQuery ? (
          <>
            {input.trim().length === 1 && <p className="px-3 text-sm text-bone-dim">Keep typing — at least 2 characters.</p>}

            {recent.length > 0 && (
              <section>
                <div className="flex items-center justify-between px-3 mb-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-bone-dim">Recent</h3>
                  <button onClick={() => { clearRecentSearches(); setRecent([]); }} className="text-[12px] font-semibold text-bone-dim hover:text-bone">Clear</button>
                </div>
                <div className="px-1">
                  {recent.map(r => (
                    <div key={r} className="flex items-center gap-1">
                      <button onClick={() => { setInput(r); setQuery(r); }} className="flex-1 min-w-0 flex items-center gap-3 h-11 px-2 rounded-xl hover:bg-bone/[0.05] text-left">
                        <Clock size={16} className="text-bone-dim shrink-0" />
                        <span className="text-[14.5px] text-bone truncate">{r}</span>
                      </button>
                      <button onClick={() => setRecent(removeRecentSearch(r))} className="w-9 h-9 rounded-full flex items-center justify-center text-bone-dim hover:text-bone" aria-label={`Remove ${r}`}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-bone-dim px-3 mb-2">Jump to</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-2">
                {QUICK_LINKS.slice(0, 6).map(l => (
                  <Link key={l.path} to={l.path} className="flex items-center gap-2 h-12 px-3 rounded-2xl bg-bone/[0.04] border border-line/50 text-[13.5px] font-medium text-bone hover:border-sienna/30">
                    <Zap size={14} className="text-sienna shrink-0" /> <span className="truncate">{l.label}</span>
                  </Link>
                ))}
              </div>
            </section>

            {clansQ.isLoading ? <Skeleton /> : popularClans.length > 0 && (
              <Section title="Popular clans"><>{popularClans.map(renderClan)}</></Section>
            )}
            {upcomingEvents.length > 0 && <Section title="Upcoming events"><>{upcomingEvents.map(renderEvent)}</></Section>}
            {(samplePlansQ.data || []).length > 0 && <Section title="Featured plans"><>{(samplePlansQ.data || []).slice(0, 4).map(renderPlan)}</></Section>}
          </>
        ) : tab === 'top' ? (
          <>
            {results!.pages.length > 0 && <Section title="Go to"><>{results!.pages.map(h => renderPage(h.item))}</></Section>}
            {topSections.map(s => (
              <Section key={s.id} title={s.title} count={s.hits.length} onSeeAll={s.hits.length > s.preview ? () => setTab(s.id) : undefined}>
                <>{s.hits.slice(0, s.preview).map(h => s.render(h.item))}</>
              </Section>
            ))}
            {anyLoading && <Skeleton rows={2} />}
            {!anyLoading && totalHits === 0 && <NoResults query={query} />}
          </>
        ) : (
          (() => {
            const s = sectionDefs.find(d => d.id === tab)!;
            if (s.loading) return <Skeleton rows={5} />;
            if (!s.hits.length) return <NoResults query={query} scope={TAB_LABELS[tab].toLowerCase()} />;
            return <Section title={`${s.hits.length} ${TAB_LABELS[tab].toLowerCase()}`}><>{s.hits.map(h => s.render(h.item))}</></Section>;
          })()
        )}
      </div>

      <AnimatePresence>
        {openEventId && <EventDetailSheet eventId={openEventId} onClose={() => setOpenEventId(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {openChallengeId && <ChallengeDetailSheet challengeId={openChallengeId} onClose={() => setOpenChallengeId(null)} />}
      </AnimatePresence>
    </div>
  );
}

function NoResults({ query, scope }: { query: string; scope?: string }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-bone/[0.05] flex items-center justify-center mx-auto mb-3 text-bone-dim">
        {scope === 'athletes' ? <User size={22} /> : scope === 'clans' ? <Users size={22} /> : scope === 'events' ? <CalendarDays size={22} /> : <Search size={22} />}
      </div>
      <div className="text-[15px] font-semibold text-bone">No {scope || 'results'} for “{query}”</div>
      <p className="text-sm text-bone-dim mt-1">Check the spelling or try a shorter, more general term.</p>
    </div>
  );
}
