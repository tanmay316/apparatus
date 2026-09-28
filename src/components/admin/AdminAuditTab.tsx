import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search } from 'lucide-react';
import { getAdminAuditLog } from '@/services/admin';
import { EmptyState, ErrorState, FilterPills, LoadingState, RefreshButton, SectionHeader, formatWhen } from './AdminShared';

type AuditFilter = 'all' | 'user' | 'report' | 'content' | 'system';

const GROUPS: Record<Exclude<AuditFilter, 'all'>, string[]> = {
  user: ['user.'],
  report: ['report.'],
  content: ['community.', 'event.', 'plan.', 'announcement.'],
  system: ['catalog.', 'storage.', 'logs.', 'settings.'],
};

const actionTone = (action: string) =>
  action.includes('ban') || action.includes('delete') || action.includes('reject') || action.includes('cleanup') || action.includes('clear')
    ? 'text-danger'
    : action.includes('approve') || action.includes('publish') || action.includes('resolved') || action.includes('unban')
      ? 'text-emerald-500'
      : 'text-amber';

export function AdminAuditTab() {
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [search, setSearch] = useState('');
  const audit = useQuery({ queryKey: ['adminAudit'], queryFn: () => getAdminAuditLog(300) });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (audit.data || []).filter(e => {
      if (filter !== 'all' && !GROUPS[filter].some(p => e.action.startsWith(p))) return false;
      if (!needle) return true;
      return [e.action, e.targetId, e.targetLabel, e.details, e.adminName].some(v => v?.toLowerCase().includes(needle));
    });
  }, [audit.data, filter, search]);

  return (
    <section className="card p-5">
      <SectionHeader
        icon={History}
        title="Audit log"
        description="Append-only record of admin actions. Entries cannot be edited or deleted, even by admins."
        actions={<RefreshButton busy={audit.isFetching} onClick={() => audit.refetch()} />}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search action, target or note" />
        </div>
        <FilterPills<AuditFilter>
          value={filter}
          onChange={setFilter}
          options={[{ id: 'all', label: 'All' }, { id: 'user', label: 'Users' }, { id: 'report', label: 'Reports' }, { id: 'content', label: 'Content' }, { id: 'system', label: 'System' }]}
        />
      </div>
      {audit.error ? <ErrorState error={audit.error} onRetry={() => audit.refetch()} />
        : audit.isLoading ? <LoadingState />
        : !visible.length ? <EmptyState>No audit entries yet.</EmptyState>
        : (
          <div className="divide-y divide-line/30 border border-line/40 rounded-xl overflow-hidden">
            {visible.map(e => (
              <div key={e.id} className="p-3 bg-ink-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs">
                <span className={`font-mono font-bold shrink-0 sm:w-48 ${actionTone(e.action)}`}>{e.action}</span>
                <span className="flex-1 min-w-0 truncate">
                  <span className="text-bone">{e.targetLabel || e.targetId}</span>
                  {e.details && <span className="text-bone-dim"> — {e.details}</span>}
                </span>
                <span className="font-mono text-[10px] text-bone-dim shrink-0">{e.adminName || e.adminUid.slice(0, 8)} · {formatWhen(e.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
