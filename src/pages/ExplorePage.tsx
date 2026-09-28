import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight, Clock, Copy, Download, Search, Sparkles, UserCheck, UserPlus, Users, X,
} from 'lucide-react';
import { getSamplePlans, clonePlan } from '@/services/plans';
import { searchUsers, followUser, unfollowUser, isFollowing, hasRequestedFollow, declineFollowRequest } from '@/services/social';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { DaysPerWeek, PlanBadge, planCategory } from '@/components/plans/plan-meta';
import type { Plan } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

type Tab = 'plans' | 'users';

function AthleteRow({ athlete, myUid }: { athlete: any; myUid: string }) {
  const queryClient = useQueryClient();
  const { showToast, theme } = useUIStore();

  const { data: following = false } = useQuery({
    queryKey: ['isFollowing', myUid, athlete.uid],
    queryFn: () => isFollowing(myUid, athlete.uid),
  });
  const { data: requested = false } = useQuery({
    queryKey: ['hasRequestedFollow', myUid, athlete.uid],
    queryFn: () => hasRequestedFollow(myUid, athlete.uid),
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (following) { await unfollowUser(myUid, athlete.uid); return 'unfollowed'; }
      if (requested) { await declineFollowRequest(athlete.uid, myUid); return 'withdrawn'; }
      return followUser(myUid, athlete.uid);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', myUid, athlete.uid] });
      queryClient.invalidateQueries({ queryKey: ['hasRequestedFollow', myUid, athlete.uid] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      queryClient.invalidateQueries({ queryKey: ['followCounts'] });
      queryClient.invalidateQueries({ queryKey: ['followList'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast({ unfollowed: 'Unfollowed', withdrawn: 'Request withdrawn', requested: 'Follow request sent', followed: 'Following!' }[result]);
    },
    onError: (err: any) => showToast(err?.message || 'Could not update follow', 'error'),
  });

  const rank = athlete.athleteRank?.label || athlete.experienceLevel;
  const profilePath = `/profile/${athlete.username || athlete.uid}`;

  return (
    <motion.div variants={item} className="dx-card p-3.5 flex items-center gap-3">
      <Link to={profilePath} className="shrink-0">
        <img
          src={athlete.photoURL || getAvatarUrl(athlete.displayName, theme)}
          alt={athlete.displayName}
          className="w-12 h-12 rounded-full object-cover"
          style={{ boxShadow: '0 0 0 2px var(--dx-card), 0 0 0 3.5px var(--dx-accent-soft)' }}
          referrerPolicy="no-referrer"
        />
      </Link>
      <Link to={profilePath} className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate">{athlete.displayName}</div>
        <div className="text-[12px] dx-muted truncate">@{athlete.username}</div>
        {rank && <span className="dx-pill dx-pill--accent mt-1 capitalize">{rank}</span>}
      </Link>
      <button
        type="button"
        onClick={() => followMutation.mutate()}
        disabled={followMutation.isPending}
        className={`${following || requested ? 'dx-btn-secondary' : 'dx-btn'} !h-9 !px-3.5 !text-[12px] shrink-0`}
      >
        {following ? <><UserCheck size={14} /> Following</> : requested ? <><Clock size={14} /> Requested</> : <><UserPlus size={14} /> Follow</>}
      </button>
    </motion.div>
  );
}

function ProgramCard({ plan, onImport, importing }: { plan: Plan; onImport: () => void; importing: boolean }) {
  const cat = planCategory(plan);
  return (
    <motion.div variants={item} className="dx-card p-4 flex flex-col">
      <Link to={`/plans/${plan.id}`} className="flex items-start gap-3">
        <PlanBadge plan={plan} size={42} />
        <div className="flex-1 min-w-0">
          <div className="dx-eyebrow">{cat.label}</div>
          <h3 className="mt-0.5 text-[16px] font-semibold leading-snug capitalize">{plan.title}</h3>
        </div>
        <span className="dx-tag shrink-0" title="Times imported"><Download size={11} /> <strong>{plan.usageCount || 0}</strong></span>
      </Link>
      <p className="mt-2.5 text-[13px] dx-muted leading-relaxed line-clamp-2 flex-1">{plan.description}</p>
      {plan.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.tags.slice(0, 4).map(tag => <span key={tag} className="dx-tag capitalize">{tag.replace(/-/g, ' ')}</span>)}
        </div>
      )}
      <div className="mt-4 pt-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--dx-border)' }}>
        <div className="flex flex-col gap-1.5 min-w-0">
          <DaysPerWeek days={plan.daysPerWeek} />
          {plan.estimatedDuration && <span className="text-[11px] dx-muted inline-flex items-center gap-1"><Clock size={11} /> {plan.estimatedDuration}</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link to={`/plans/${plan.id}`} className="dx-btn-secondary !h-9 !px-3 !text-[12px]">Preview</Link>
          <button type="button" onClick={onImport} disabled={importing} className="dx-btn !h-9 !px-3 !text-[12px]">
            <Copy size={14} /> Import
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) === 'users' ? 'users' : 'plans');
  const { user } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [programQuery, setProgramQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [athleteQuery, setAthleteQuery] = useState('');

  const changeTab = (next: Tab) => {
    setTab(next);
    setSearchParams({ tab: next });
  };

  const { data: plans = [], isLoading } = useQuery({ queryKey: ['samplePlans'], queryFn: getSamplePlans });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['searchUsers', athleteQuery],
    queryFn: () => searchUsers(athleteQuery),
    enabled: athleteQuery.trim().length >= 2,
  });

  const cloneMutation = useMutation({
    mutationFn: (planId: string) => clonePlan(planId, 'samplePlans', user!.uid, user!.displayName || 'User'),
    onSuccess: (newPlanId) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan added to your account');
      navigate(`/plans/${newPlanId}`);
    },
    onError: (error: any) => showToast(error?.message || 'Failed to import plan', 'error'),
  });

  const handleImport = async (plan: Plan) => {
    const ok = await confirm({
      title: 'Import program',
      message: `Add "${plan.title}" to your plans? You can customise every day and exercise afterwards.`,
      confirmText: 'Import',
      type: 'info',
      icon: 'check',
    });
    if (ok && plan.id) cloneMutation.mutate(plan.id);
  };

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    plans.forEach(p => counts.set(planCategory(p).label, (counts.get(planCategory(p).label) || 0) + 1));
    return ['All', ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label)];
  }, [plans]);

  const filtered = useMemo(() => {
    const q = programQuery.trim().toLowerCase();
    return plans.filter(p => {
      if (category !== 'All' && planCategory(p).label !== category) return false;
      if (!q) return true;
      return `${p.title} ${p.description} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q);
    });
  }, [plans, programQuery, category]);

  const featured = useMemo(
    () => (programQuery || category !== 'All' ? null : [...plans].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0] || null),
    [plans, programQuery, category],
  );
  const gridPlans = featured ? filtered.filter(p => p.id !== featured.id) : filtered;
  const athletes = searchResults.filter((u: any) => u.uid !== user?.uid);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope max-w-5xl mx-auto pt-1 sm:pt-4 space-y-4 pb-10">
      <motion.header variants={item} className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="dx-eyebrow">Discover</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">Explore</h1>
          <p className="text-[13px] dx-muted mt-0.5">Proven programs and athletes to train with.</p>
        </div>
        <div className="dx-segment sm:w-[280px]" role="tablist">
          <button role="tab" aria-selected={tab === 'plans'} onClick={() => changeTab('plans')}>Programs</button>
          <button role="tab" aria-selected={tab === 'users'} onClick={() => changeTab('users')}>Athletes</button>
        </div>
      </motion.header>

      {tab === 'plans' && (
        <>
          <motion.div variants={item} className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 dx-muted pointer-events-none" />
            <input
              type="search"
              value={programQuery}
              onChange={e => setProgramQuery(e.target.value)}
              placeholder="Search programs, goals or equipment"
              className="dx-input w-full !pl-10"
              aria-label="Search programs"
            />
          </motion.div>

          <motion.div variants={item} className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
            {categories.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className="dx-chip !h-8 !px-3.5 !text-[12px] flex-none"
                style={category === c ? { background: 'var(--dx-ink)', color: 'var(--dx-on-ink)' } : undefined}
              >
                {c}
              </button>
            ))}
          </motion.div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="dx-card h-[210px] animate-pulse" />)}
            </div>
          ) : plans.length === 0 ? (
            <motion.div variants={item} className="dx-card p-8 text-center">
              <Sparkles size={26} className="mx-auto dx-accent" />
              <div className="mt-2 text-[15px] font-semibold">No programs yet</div>
              <p className="mt-1 text-[13px] dx-muted">Sample programs will appear here once they are published.</p>
            </motion.div>
          ) : (
            <>
              {featured && (
                <motion.section variants={item} className="dx-hero p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="dx-hero-icon"><Sparkles size={20} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">Most imported · {planCategory(featured).label}</div>
                      <h2 className="mt-1 text-[22px] sm:text-[26px] font-semibold leading-tight capitalize">{featured.title}</h2>
                      <p className="mt-1.5 text-[13px] opacity-80 leading-relaxed line-clamp-2">{featured.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
                    <DaysPerWeek days={featured.daysPerWeek} light />
                    {featured.estimatedDuration && <span className="inline-flex items-center gap-1 opacity-85"><Clock size={13} /> {featured.estimatedDuration}</span>}
                    <span className="inline-flex items-center gap-1 opacity-85"><Download size={13} /> {featured.usageCount || 0} imports</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => handleImport(featured)} disabled={cloneMutation.isPending} className="dx-hero-btn flex-1">
                      <Copy size={16} /> Import program
                    </button>
                    <Link to={`/plans/${featured.id}`} className="dx-hero-icon" aria-label="Preview program" title="Preview program">
                      <ArrowRight size={18} />
                    </Link>
                  </div>
                </motion.section>
              )}

              <motion.div variants={item} className="flex items-center justify-between">
                <div className="dx-section-title">{category === 'All' ? 'All programs' : category}</div>
                <span className="text-[12px] dx-muted tabular">{filtered.length} program{filtered.length === 1 ? '' : 's'}</span>
              </motion.div>

              {gridPlans.length === 0 && !featured ? (
                <motion.div variants={item} className="dx-card p-6 text-center">
                  <div className="text-[14px] font-semibold">No programs match</div>
                  <p className="mt-1 text-[13px] dx-muted">Try another search or category.</p>
                  <button type="button" onClick={() => { setProgramQuery(''); setCategory('All'); }} className="dx-link mt-3">
                    <X size={13} /> Clear filters
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {gridPlans.map(plan => (
                    <ProgramCard key={plan.id} plan={plan} onImport={() => handleImport(plan)} importing={cloneMutation.isPending} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'users' && (
        <>
          <motion.div variants={item} className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 dx-muted pointer-events-none" />
            <input
              type="search"
              autoFocus
              value={athleteQuery}
              onChange={e => setAthleteQuery(e.target.value)}
              placeholder="Search athletes by name or username"
              className="dx-input w-full !pl-10"
              aria-label="Search athletes"
            />
          </motion.div>

          {athleteQuery.trim().length < 2 ? (
            <motion.div variants={item} className="dx-card p-8 text-center">
              <span className="dx-badge-icon !w-14 !h-14 !rounded-2xl mx-auto"><Users size={24} /></span>
              <div className="mt-3 text-[15px] font-semibold">Find your training crew</div>
              <p className="mt-1 text-[13px] dx-muted max-w-sm mx-auto">Type at least 2 characters to search athletes. Follow them to see their workouts in your feed.</p>
            </motion.div>
          ) : searchLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="dx-card h-[76px] animate-pulse" />)}
            </div>
          ) : athletes.length === 0 ? (
            <motion.div variants={item} className="dx-card p-6 text-center">
              <div className="text-[14px] font-semibold">No athletes found</div>
              <p className="mt-1 text-[13px] dx-muted">Nobody matches “{athleteQuery}”. Check the spelling or try a username.</p>
            </motion.div>
          ) : (
            <>
              <motion.div variants={item} className="text-[12px] dx-muted">{athletes.length} athlete{athletes.length === 1 ? '' : 's'}</motion.div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {athletes.map((u: any) => <AthleteRow key={u.uid} athlete={u} myUid={user!.uid} />)}
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
