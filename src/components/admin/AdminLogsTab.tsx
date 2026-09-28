import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Search, Terminal, Trash2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { clearAllSystemLogs, deleteSystemLogs, getSystemLogs } from '@/services/logger';
import { logAdminAction } from '@/services/admin';
import type { SystemLog } from '@/types';
import { EmptyState, ErrorState, FilterPills, LoadingState, RefreshButton, SectionHeader, formatWhen } from './AdminShared';

type LogFilter = 'all' | 'crash' | 'other';
const CRASH_CONTEXTS = new Set(['window_onerror', 'unhandled_rejection']);

interface LogGroup { key: string; latest: SystemLog; ids: string[]; users: Set<string> }

export function AdminLogsTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [max, setMax] = useState(100);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const logs = useQuery({ queryKey: ['adminLogs', max], queryFn: () => getSystemLogs(max) });

  // Identical errors are grouped so one noisy bug doesn't bury everything else.
  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const map = new Map<string, LogGroup>();
    for (const log of logs.data || []) {
      const crash = CRASH_CONTEXTS.has(log.context || '');
      if (filter === 'crash' && !crash) continue;
      if (filter === 'other' && crash) continue;
      if (needle && ![log.message, log.context, log.userName, log.url].some(v => v?.toLowerCase().includes(needle))) continue;
      const key = `${log.context}|${log.message}`;
      const g = map.get(key);
      if (g) { g.ids.push(log.id!); if (log.userId) g.users.add(log.userId); }
      else map.set(key, { key, latest: log, ids: [log.id!], users: new Set(log.userId ? [log.userId] : []) });
    }
    return [...map.values()];
  }, [logs.data, search, filter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['adminLogs'] });
    queryClient.invalidateQueries({ queryKey: ['adminOverview'] });
    queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
  };

  const deleteGroup = useMutation({
    mutationFn: (ids: string[]) => deleteSystemLogs(ids),
    onSuccess: (_, ids) => { invalidate(); showToast(`Deleted ${ids.length} log(s)`); },
    onError: (e: any) => showToast(e?.message || 'Could not delete logs', 'error'),
  });
  const clearAll = useMutation({
    mutationFn: async () => { await clearAllSystemLogs(); await logAdminAction('logs.clear', 'database', 'systemLogs'); },
    onSuccess: () => { invalidate(); showToast('System logs cleared'); },
    onError: (e: any) => showToast(e?.message || 'Could not clear logs', 'error'),
  });

  return (
    <section className="card p-5">
      <SectionHeader
        icon={Terminal}
        title="System logs"
        description={`Latest ${max} client exceptions, grouped by message.`}
        actions={<>
          <RefreshButton busy={logs.isFetching} onClick={() => logs.refetch()} />
          <button
            onClick={async () => { if (await confirm({ title: 'Clear all logs?', message: 'Every stored system log is permanently deleted.', confirmText: 'Clear' })) clearAll.mutate(); }}
            disabled={clearAll.isPending || !logs.data?.length}
            className="btn-danger py-2 gap-1.5"
          >
            <Trash2 size={13} /> Clear all
          </button>
        </>}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search message, context, user or route" />
        </div>
        <FilterPills<LogFilter> value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'crash', label: 'Crashes' }, { id: 'other', label: 'Handled' }]} />
        <select value={max} onChange={e => setMax(Number(e.target.value))} className="input-field sm:w-32">
          <option value={100}>100</option>
          <option value={250}>250</option>
          <option value={500}>500</option>
        </select>
      </div>

      {logs.error ? <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        : logs.isLoading ? <LoadingState label="Loading logs…" />
        : !groups.length ? <EmptyState>{logs.data?.length ? 'No logs match these filters.' : 'No exceptions recorded. The app is running smoothly.'}</EmptyState>
        : (
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {groups.map(({ key, latest: log, ids, users }) => {
              const crash = CRASH_CONTEXTS.has(log.context || '');
              const isOpen = open === key;
              return (
                <div key={key} className="border border-line/40 rounded-xl bg-ink-3 font-mono text-xs">
                  <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left p-3 flex items-start gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${crash ? 'bg-danger/10 text-danger' : 'bg-amber/10 text-amber'}`}>
                      {(log.context || 'app_error').toUpperCase().slice(0, 40)}
                    </span>
                    <span className="flex-1 min-w-0 text-bone break-words line-clamp-2">{log.message}</span>
                    {ids.length > 1 && <span className="shrink-0 text-danger font-bold">×{ids.length}</span>}
                    <span className="shrink-0 text-[10px] text-bone-dim">{formatWhen(log.createdAt, 'pending')}</span>
                    <ChevronDown size={13} className={`shrink-0 text-bone-dim transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      <div className="text-bone whitespace-pre-wrap break-words">{log.message}</div>
                      {log.stack && (
                        <pre className="text-[10px] text-bone-dim bg-ink-2 p-2 rounded max-h-60 overflow-auto whitespace-pre-wrap select-text leading-snug">{log.stack}</pre>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[10px] text-bone-dim">
                        <div className="truncate"><span className="text-bone">Route:</span> {log.url}</div>
                        <div className="truncate"><span className="text-bone">Latest user:</span> {log.userName || log.userId || 'anonymous'} · {users.size} affected</div>
                        <div className="truncate md:col-span-2"><span className="text-bone">Agent:</span> {log.userAgent}</div>
                      </div>
                      <button disabled={deleteGroup.isPending} onClick={() => deleteGroup.mutate(ids)} className="btn-secondary py-1.5 text-danger">
                        <Trash2 size={12} /> Delete {ids.length > 1 ? `all ${ids.length}` : ''}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}
