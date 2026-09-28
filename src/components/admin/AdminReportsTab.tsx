import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Eye, Flag, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
  banUser, deleteReport, getAdminBans, getAdminReports, getUsersByIds, updateReportStatus,
  type AdminReport, type ReportStatus,
} from '@/services/admin';
import { CopyId, EmptyState, ErrorState, FilterPills, LoadingState, RefreshButton, SectionHeader, formatWhen, useReasonDialog } from './AdminShared';

type ReportFilter = 'queue' | 'resolved' | 'dismissed' | 'all';

const STATUS_STYLE: Record<ReportStatus, string> = {
  open: 'bg-danger/10 text-danger',
  reviewing: 'bg-amber/10 text-amber',
  resolved: 'bg-emerald-500/10 text-emerald-500',
  dismissed: 'bg-ink-3 text-bone-dim',
};

export function AdminReportsTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const [filter, setFilter] = useState<ReportFilter>('queue');

  const reports = useQuery({ queryKey: ['adminReports'], queryFn: getAdminReports });
  const bans = useQuery({ queryKey: ['adminBans'], queryFn: getAdminBans });
  const userIds = useMemo(() => (reports.data || []).flatMap(r => [r.reporterId, r.reportedUserId || '']).filter(Boolean), [reports.data]);
  const people = useQuery({
    queryKey: ['adminReportPeople', [...new Set(userIds)].sort().join(',')],
    queryFn: () => getUsersByIds(userIds),
    enabled: userIds.length > 0,
  });
  const bannedIds = useMemo(() => new Set((bans.data || []).map(b => b.uid)), [bans.data]);

  const counts = useMemo(() => {
    const c = { queue: 0, resolved: 0, dismissed: 0, all: 0 };
    (reports.data || []).forEach(r => {
      c.all++;
      if (r.status === 'open' || r.status === 'reviewing') c.queue++;
      else if (r.status === 'resolved') c.resolved++;
      else if (r.status === 'dismissed') c.dismissed++;
    });
    return c;
  }, [reports.data]);

  // Repeat offenders surface first inside the queue.
  const againstCount = useMemo(() => {
    const m = new Map<string, number>();
    (reports.data || []).forEach(r => { if (r.reportedUserId) m.set(r.reportedUserId, (m.get(r.reportedUserId) || 0) + 1); });
    return m;
  }, [reports.data]);

  const visible = useMemo(() => (reports.data || []).filter(r => {
    if (filter === 'queue') return r.status === 'open' || r.status === 'reviewing';
    if (filter === 'all') return true;
    return r.status === filter;
  }), [reports.data, filter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['adminReports'] });
    queryClient.invalidateQueries({ queryKey: ['adminOverview'] });
    queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: ReportStatus; note?: string }) => updateReportStatus(id, status, note),
    onSuccess: (_, v) => { invalidate(); showToast(`Report marked ${v.status}`); },
    onError: (e: any) => showToast(e?.message || 'Could not update report', 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => { invalidate(); showToast('Report deleted'); },
    onError: (e: any) => showToast(e?.message || 'Could not delete report', 'error'),
  });
  const banMutation = useMutation({
    mutationFn: async ({ report, reason, durationDays }: { report: AdminReport; reason: string; durationDays: number | null }) => {
      const target = people.data?.[report.reportedUserId!];
      await banUser(report.reportedUserId!, { reason, durationDays, label: target ? `@${target.username}` : undefined });
      await updateReportStatus(report.id!, 'resolved', `User suspended: ${reason}`);
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['adminBans'] });
      showToast('User suspended and report resolved');
    },
    onError: (e: any) => showToast(e?.message || 'Could not ban user', 'error'),
  });

  const closeWithNote = async (report: AdminReport, status: 'resolved' | 'dismissed') => {
    const res = await ask({
      title: status === 'resolved' ? 'Resolve report' : 'Dismiss report',
      message: 'Optional note for the moderation record.',
      placeholder: status === 'resolved' ? 'Action taken…' : 'Why no action is needed…',
      confirmText: status === 'resolved' ? 'Resolve' : 'Dismiss',
    });
    if (res) statusMutation.mutate({ id: report.id!, status, note: res.text });
  };

  const banReported = async (report: AdminReport) => {
    const target = people.data?.[report.reportedUserId!];
    const res = await ask({
      title: `Suspend ${target ? `@${target.username}` : 'reported user'}?`,
      message: 'The report will be marked resolved.',
      choiceLabel: 'Duration',
      choices: [{ label: '24 hours', value: '1' }, { label: '7 days', value: '7' }, { label: '30 days', value: '30' }, { label: 'Permanent', value: 'permanent' }],
      initialChoice: '7', required: true, danger: true, confirmText: 'Suspend',
      placeholder: `Reason (report: ${report.reason})`,
    });
    if (!res) return;
    banMutation.mutate({ report, reason: res.text, durationDays: res.choice === 'permanent' ? null : Number(res.choice) });
  };

  const removeReport = async (report: AdminReport) => {
    if (!await confirm({ title: 'Delete report?', message: 'This permanently removes the report record.', confirmText: 'Delete' })) return;
    deleteMutation.mutate(report.id!);
  };

  const busy = statusMutation.isPending || deleteMutation.isPending || banMutation.isPending;
  const name = (uid?: string) => (uid && people.data?.[uid] ? `${people.data[uid].displayName || 'Athlete'} (@${people.data[uid].username})` : uid || 'Not specified');

  return (
    <section className="card p-5">
      {dialog}
      <SectionHeader
        icon={Flag}
        title="Reports"
        description="Review user reports, record a decision, and act on the reported account."
        actions={<RefreshButton busy={reports.isFetching} onClick={() => reports.refetch()} />}
      />
      <div className="mb-4">
        <FilterPills<ReportFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'queue', label: 'Queue', count: counts.queue },
            { id: 'resolved', label: 'Resolved', count: counts.resolved },
            { id: 'dismissed', label: 'Dismissed', count: counts.dismissed },
            { id: 'all', label: 'All', count: counts.all },
          ]}
        />
      </div>

      {reports.error ? <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
        : reports.isLoading ? <LoadingState label="Loading reports…" />
        : visible.length === 0 ? <EmptyState>{filter === 'queue' ? 'The moderation queue is empty.' : 'No reports in this view.'}</EmptyState>
        : (
          <div className="space-y-3">
            {visible.map(report => {
              const reported = report.reportedUserId ? people.data?.[report.reportedUserId] : undefined;
              const isClosed = report.status === 'resolved' || report.status === 'dismissed';
              const priorReports = report.reportedUserId ? againstCount.get(report.reportedUserId) || 0 : 0;
              const alreadyBanned = !!report.reportedUserId && bannedIds.has(report.reportedUserId);
              return (
                <div key={report.id} className="border border-line/50 rounded-xl p-4 bg-ink-2">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] uppercase ${STATUS_STYLE[report.status] || ''}`}>{report.status}</span>
                    <span className="font-mono text-[10px] text-amber uppercase">{report.reason}</span>
                    {priorReports > 1 && <span className="font-mono text-[10px] text-danger">{priorReports} reports on this user</span>}
                    {alreadyBanned && <span className="font-mono text-[10px] text-danger">BANNED</span>}
                    <span className="ml-auto text-[10px] text-bone-dim">{formatWhen(report.createdAt)}</span>
                  </div>
                  <div className="text-sm">
                    Reported: {reported?.username
                      ? <Link to={`/profile/${reported.username}`} className="text-sienna hover:underline">{name(report.reportedUserId)}</Link>
                      : <span className="font-mono text-sienna">{name(report.reportedUserId)}</span>}
                  </div>
                  <div className="text-xs text-bone-dim mt-0.5">Reporter: {name(report.reporterId)}</div>
                  {report.reportedWorkoutId && <div className="text-xs text-bone-dim mt-0.5">Workout: <CopyId value={report.reportedWorkoutId} /></div>}
                  {report.details && <p className="text-sm text-bone-dim mt-3 whitespace-pre-wrap break-words bg-ink-3 rounded-lg p-3">{report.details}</p>}
                  {report.resolutionNote && <p className="text-xs text-bone-dim mt-2 italic">Note: {report.resolutionNote}</p>}
                  {isClosed && report.resolvedAt && <p className="text-[10px] text-bone-dim mt-1 font-mono">Closed {formatWhen(report.resolvedAt)}</p>}

                  <div className="flex flex-wrap gap-2 mt-4">
                    {!isClosed && report.status !== 'reviewing' && (
                      <button disabled={busy} onClick={() => statusMutation.mutate({ id: report.id!, status: 'reviewing' })} className="btn-secondary py-2"><Eye size={13} /> Review</button>
                    )}
                    {!isClosed && <button disabled={busy} onClick={() => closeWithNote(report, 'resolved')} className="btn-primary py-2 px-4"><CheckCircle2 size={13} /> Resolve</button>}
                    {!isClosed && <button disabled={busy} onClick={() => closeWithNote(report, 'dismissed')} className="btn-secondary py-2"><XCircle size={13} /> Dismiss</button>}
                    {!isClosed && report.reportedUserId && !alreadyBanned && !reported?.isAdmin && (
                      <button disabled={busy} onClick={() => banReported(report)} className="btn-danger py-2 gap-1.5"><Ban size={13} /> Ban user</button>
                    )}
                    {isClosed && <button disabled={busy} onClick={() => statusMutation.mutate({ id: report.id!, status: 'open' })} className="btn-secondary py-2"><RotateCcw size={13} /> Reopen</button>}
                    <button disabled={busy} onClick={() => removeReport(report)} className="btn-secondary py-2 ml-auto text-danger" title="Delete report"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}
