import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Eye, EyeOff, PartyPopper, Search, Sprout, Trash2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { deletePlan } from '@/services/plans';
import { seedLibraryExercises } from '@/services/library';
import { getAdminPlans, logAdminAction, seedSamplePlans, setPlanPublic } from '@/services/admin';
import { CopyId, EmptyState, ErrorState, FilterPills, LoadingState, RefreshButton, SectionHeader, formatWhen } from './AdminShared';

type PlanFilter = 'all' | 'public' | 'private' | 'archived';

export function AdminContentTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [running, setRunning] = useState<string | null>(null);

  const plans = useQuery({ queryKey: ['adminPlans'], queryFn: () => getAdminPlans() });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (plans.data || []).filter(p => {
      if (filter === 'public' && !p.isPublic) return false;
      if (filter === 'private' && p.isPublic) return false;
      if (filter === 'archived' && !p.isArchived) return false;
      if (!needle) return true;
      return p.title?.toLowerCase().includes(needle) || p.ownerName?.toLowerCase().includes(needle) || p.ownerId === needle;
    });
  }, [plans.data, search, filter]);

  const refreshPlans = () => {
    queryClient.invalidateQueries({ queryKey: ['adminPlans'] });
    queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
  };

  const deleteMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      await deletePlan(id);
      await logAdminAction('plan.delete', 'plan', id, { label: title });
    },
    onSuccess: () => { refreshPlans(); showToast('Plan deleted'); },
    onError: (e: any) => showToast(e?.message || 'Could not delete plan', 'error'),
  });
  const visibilityMutation = useMutation({
    mutationFn: ({ id, title, isPublic }: { id: string; title: string; isPublic: boolean }) => setPlanPublic(id, isPublic, title),
    onSuccess: (_, v) => { refreshPlans(); showToast(v.isPublic ? 'Plan published' : 'Plan hidden from Explore'); },
    onError: (e: any) => showToast(e?.message || 'Could not update plan', 'error'),
  });

  const runTool = async (id: string, title: string, message: string, fn: () => Promise<string>) => {
    if (!await confirm({ title, message, confirmText: 'Run', type: 'warning', icon: 'alert' })) return;
    setRunning(id);
    try {
      showToast(await fn(), 'success');
    } catch (e: any) {
      showToast(e?.message || 'Operation failed', 'error');
    } finally {
      setRunning(null);
    }
  };

  const tools = [
    {
      id: 'samples', icon: Sprout, label: 'Seed sample plans',
      message: 'Overwrites the sample plan catalog and removes stale sample plans.',
      fn: async () => { const r = await seedSamplePlans(); return `Seeded ${r.written} sample plans (${r.removed} stale removed)`; },
    },
    {
      id: 'library', icon: Database, label: 'Seed exercise library',
      message: 'Overwrites the default exercise documents. Custom user exercises are untouched.',
      fn: async () => {
        const n = await seedLibraryExercises();
        await logAdminAction('catalog.seed_library', 'database', 'exerciseLibrary', { details: `${n} exercises` });
        return `Seeded ${n} exercises`;
      },
    },
    {
      id: 'backfill', icon: PartyPopper, label: 'Backfill celebration posts',
      message: 'Scans concluded challenges and events and generates missing winner posts.',
      fn: async () => {
        const { backfillCelebrationPosts } = await import('@/services/community');
        const res = await backfillCelebrationPosts();
        if (!res.success) throw new Error(res.details || 'Backfill failed');
        ['feed', 'clanPosts', 'allCommunityChallenges', 'allCommunityEvents'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
        await logAdminAction('catalog.backfill_celebrations', 'database', 'community_posts', { details: `${res.events} events, ${res.challenges} challenges` });
        return `Backfill complete: ${res.events} event(s), ${res.challenges} challenge(s)`;
      },
    },
  ];

  const busy = deleteMutation.isPending || visibilityMutation.isPending;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <SectionHeader icon={Database} title="Catalog tools" description="All tools are idempotent and use stable document IDs. Actions are recorded in the audit log." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => runTool(t.id, t.label, t.message, t.fn)}
              disabled={!!running}
              className="btn-secondary py-3 border-sienna/40 text-sienna"
            >
              <t.icon size={15} /> {running === t.id ? 'Running…' : t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader
          title="User plans"
          description={`${plans.data?.length ?? 0} plans loaded. Hide inappropriate public plans or delete them with their days.`}
          actions={<RefreshButton busy={plans.isFetching} onClick={() => plans.refetch()} />}
        />
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search title, owner name or owner UID" />
          </div>
          <FilterPills<PlanFilter>
            value={filter}
            onChange={setFilter}
            options={[{ id: 'all', label: 'All' }, { id: 'public', label: 'Public' }, { id: 'private', label: 'Private' }, { id: 'archived', label: 'Archived' }]}
          />
        </div>
        {plans.error ? <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
          : plans.isLoading ? <LoadingState label="Loading plans…" />
          : !visible.length ? <EmptyState>No plans in this view.</EmptyState>
          : (
            <div className="space-y-2">
              {visible.map(plan => (
                <div key={plan.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-line/50 bg-ink-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">
                      {plan.title || 'Untitled plan'}
                      <span className={`ml-2 font-mono text-[10px] ${plan.isPublic ? 'text-sienna' : 'text-bone-dim'}`}>{plan.isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
                      {plan.isArchived && <span className="ml-1 font-mono text-[10px] text-amber">ARCHIVED</span>}
                    </div>
                    <div className="text-xs text-bone-dim truncate">
                      {plan.ownerName || 'Unknown owner'} · {plan.daysPerWeek ?? '?'} days · used {plan.usageCount ?? 0}× · updated {formatWhen(plan.updatedAt)}
                    </div>
                    <CopyId value={plan.id} />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={busy}
                      onClick={() => visibilityMutation.mutate({ id: plan.id, title: plan.title, isPublic: !plan.isPublic })}
                      className="btn-secondary py-2"
                    >
                      {plan.isPublic ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Publish</>}
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!await confirm({ title: 'Delete plan?', message: `Permanently delete “${plan.title}” and all of its days.`, confirmText: 'Delete' })) return;
                        deleteMutation.mutate({ id: plan.id, title: plan.title });
                      }}
                      className="btn-danger py-2 gap-1.5"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
