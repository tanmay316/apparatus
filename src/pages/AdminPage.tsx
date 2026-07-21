import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, Ban, CheckCircle2, Database, Flag, Gauge, Search, ShieldAlert, Users, XCircle, Trash2, Terminal } from 'lucide-react';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { db } from '@/lib/firebase';
import { SAMPLE_PLANS } from '@/data/sample-plans';
import { seedLibraryExercises } from '@/services/library';
import { getAdminBans, getAdminOverview, getAdminReports, getAdminUsers, setUserBan, updateReportStatus, type AdminReport } from '@/services/admin';
import { deletePlan } from '@/services/plans';
import { getSystemLogs, clearAllSystemLogs } from '@/services/logger';
import { getPendingCommunities, approveCommunity, rejectCommunity, getPendingEvents, updateEventStatus } from '@/services/events';
import { getAvatarUrl } from '@/lib/avatar';

type AdminTab = 'overview' | 'users' | 'reports' | 'logs' | 'seed' | 'communities' | 'events';

function Metric({ label, value, detail, icon: Icon, color = 'text-sienna' }: { label: string; value: number; detail: string; icon: typeof Users; color?: string }) {
  return <div className="card p-4"><div className="flex items-start justify-between"><div className="font-mono text-[10px] text-bone-dim tracking-wider">{label}</div><Icon size={17} className={color} /></div><div className="font-display text-3xl mt-3">{value.toLocaleString()}</div><div className="text-[11px] text-bone-dim mt-1">{detail}</div></div>;
}

export function AdminPage() {
  const { profile } = useAuthStore();
  const { showToast, theme } = useUIStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedingLib, setSeedingLib] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['adminOverview'], queryFn: getAdminOverview, enabled: !!profile?.isAdmin });
  const users = useQuery({ queryKey: ['adminUsers'], queryFn: getAdminUsers, enabled: !!profile?.isAdmin });
  const bans = useQuery({ queryKey: ['adminBans'], queryFn: getAdminBans, enabled: !!profile?.isAdmin });
  const reports = useQuery({ queryKey: ['adminReports'], queryFn: getAdminReports, enabled: !!profile?.isAdmin });
  const plans = useQuery({ queryKey: ['adminPlans'], queryFn: async () => { const snap = await getDocs(collection(db, 'plans')); return snap.docs.map(item => ({ id: item.id, ...item.data() } as any)); }, enabled: !!profile?.isAdmin });
  const logs = useQuery({ queryKey: ['adminLogs'], queryFn: () => getSystemLogs(100), enabled: !!profile?.isAdmin });
  const pendingCommunities = useQuery({ queryKey: ['adminPendingCommunities'], queryFn: getPendingCommunities, enabled: !!profile?.isAdmin });
  const pendingEvents = useQuery({ queryKey: ['adminPendingEvents'], queryFn: getPendingEvents, enabled: !!profile?.isAdmin });

  const filteredUsers = useMemo(() => {
    const normalized = search.toLowerCase().trim();
    return (users.data || []).filter((user: any) => !normalized || user.displayName?.toLowerCase().includes(normalized) || user.username?.toLowerCase().includes(normalized) || user.email?.toLowerCase().includes(normalized));
  }, [users.data, search]);
  
  const approveCommunityMutation = useMutation({
    mutationFn: (id: string) => approveCommunity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPendingCommunities'] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      queryClient.invalidateQueries({ queryKey: ['userCommunities'] });
      queryClient.invalidateQueries({ queryKey: ['userSubmittedCommunities'] });
      showToast('Community approved & verified');
    },
    onError: (err: any) => showToast(err?.message || 'Error approving community', 'error'),
  });

  const rejectCommunityMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectCommunity(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPendingCommunities'] });
      queryClient.invalidateQueries({ queryKey: ['userSubmittedCommunities'] });
      showToast('Community rejected');
    },
    onError: (err: any) => showToast(err?.message || 'Error rejecting community', 'error'),
  });

  const approveEventMutation = useMutation({
    mutationFn: (id: string) => updateEventStatus(id, 'published'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPendingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['publishedEvents'] });
      queryClient.invalidateQueries({ queryKey: ['userSubmittedEvents'] });
      showToast('Event published');
    },
    onError: (err: any) => showToast(err?.message || 'Error publishing event', 'error'),
  });

  const rejectEventMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => updateEventStatus(id, 'rejected', reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminPendingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['userSubmittedEvents'] });
      showToast('Event rejected');
    },
    onError: (err: any) => showToast(err?.message || 'Error rejecting event', 'error'),
  });
  const banIds = new Set((bans.data || []).map((ban: any) => ban.uid));

  const banMutation = useMutation({
    mutationFn: ({ uid, banned }: { uid: string; banned: boolean }) => setUserBan(uid, profile!.uid, banned),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminBans'] });
      showToast(variables.banned ? 'User banned' : 'User ban lifted');
    },
    onError: (error: any) => showToast(error?.message || 'Could not update ban', 'error'),
  });

  const reportMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminReport['status'] }) => updateReportStatus(id, status, profile!.uid),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminReports'] }); queryClient.invalidateQueries({ queryKey: ['adminOverview'] }); showToast('Report updated'); },
    onError: (error: any) => showToast(error?.message || 'Could not update report', 'error'),
  });

  const clearLogsMutation = useMutation({
    mutationFn: () => clearAllSystemLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminLogs'] });
      showToast('System logs cleared');
    },
    onError: (error: any) => showToast(error?.message || 'Could not clear logs', 'error'),
  });

  if (!profile?.isAdmin) return <Navigate to="/" replace />;

  const handleSeedSamplePlans = async () => {
    if (!confirm('Overwrite the matching sample plan documents?')) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      const expectedIds = new Set(SAMPLE_PLANS.map(plan => 'sample_' + plan.title.toLowerCase().replace(/[^a-z0-9]/g, '_')));
      const existing = await getDocs(collection(db, 'samplePlans'));
      for (const existingPlan of existing.docs) {
        if (!expectedIds.has(existingPlan.id)) {
          const oldDays = await getDocs(collection(db, `samplePlans/${existingPlan.id}/days`));
          oldDays.docs.forEach(day => batch.delete(day.ref));
          batch.delete(existingPlan.ref);
        }
      }
      for (const plan of SAMPLE_PLANS) {
        const planId = 'sample_' + plan.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const { days, ...planData } = plan;
        batch.set(doc(db, 'samplePlans', planId), { ...planData, type: 'sample' });
        days?.forEach(day => batch.set(doc(db, `samplePlans/${planId}/days`, `day_${day.dayNumber}`), day));
      }
      await batch.commit();
      showToast('Sample plans seeded successfully');
    } catch (error: any) { showToast(error?.message || 'Could not seed sample plans', 'error'); }
    finally { setSeeding(false); }
  };

  const handleDeletePlan = async (planId: string, title: string) => {
    if (!confirm(`Permanently delete “${title}” and all of its days?`)) return;
    setDeletingPlanId(planId);
    try {
      await deletePlan(planId);
      await queryClient.invalidateQueries({ queryKey: ['adminPlans'] });
      showToast('Plan deleted');
    } catch (error: any) { showToast(error?.message || 'Could not delete plan', 'error'); }
    finally { setDeletingPlanId(null); }
  };

  const handleSeedExerciseLibrary = async () => {
    if (!confirm('Overwrite matching default exercise documents?')) return;
    setSeedingLib(true);
    try { await seedLibraryExercises(); showToast('Exercise library seeded successfully'); }
    catch (error: any) { showToast(error?.message || 'Could not seed exercise library', 'error'); }
    finally { setSeedingLib(false); }
  };

  const nav: { id: AdminTab; label: string; icon: typeof Activity }[] = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'users', label: 'Users & bans', icon: Users },
    { id: 'reports', label: 'Reports', icon: Flag },
    { id: 'communities', label: 'Communities', icon: Users },
    { id: 'events', label: 'Events', icon: Activity },
    { id: 'logs', label: 'System Logs', icon: Terminal },
    { id: 'seed', label: 'Database', icon: Database },
  ];

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
    <div className="pb-5 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div><div className="font-mono text-danger text-xs tracking-widest mb-1">OPERATIONS</div><h1 className="font-display text-3xl">Admin Console</h1><p className="text-bone-dim text-sm mt-1">Moderate the community, monitor product health, and maintain shared content.</p></div>
      <div className="tag-amber inline-flex items-center gap-2"><ShieldAlert size={13} /> ADMIN ACCESS</div>
    </div>

    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-1">{nav.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full font-mono text-sm transition-colors ${tab === item.id ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}><Icon size={14} /> {item.label}</button>; })}</div>

    {tab === 'overview' && <div className="space-y-5">
      {overview.isLoading ? <div className="card p-10 text-center text-bone-dim">Loading analytics...</div> : overview.data && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric label="USERS" value={overview.data.users} detail={`${overview.data.activeUsers30d} active in 30 days`} icon={Users} /><Metric label="WORKOUTS" value={overview.data.workouts} detail={`${overview.data.workouts30d} in 30 days`} icon={Activity} /><Metric label="ACTIVITIES" value={overview.data.activities} detail="Published feed records" icon={Gauge} color="text-amber" /><Metric label="OPEN REPORTS" value={overview.data.openReports} detail={`${overview.data.bannedUsers} active bans`} icon={Flag} color="text-danger" /></div>
        <div className="card p-5"><div className="flex items-center gap-2 mb-4"><Activity size={18} className="text-sienna" /><h2 className="font-display text-xl">Platform health</h2></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="bg-ink-2 border border-line/50 rounded-lg p-4"><div className="font-mono text-[10px] text-bone-dim">30-DAY USER ACTIVITY</div><div className="font-display text-2xl mt-2 text-sienna">{overview.data.activeUsers30d} users</div><div className="text-xs text-bone-dim mt-1">Profiles updated recently</div></div><div className="bg-ink-2 border border-line/50 rounded-lg p-4"><div className="font-mono text-[10px] text-bone-dim">30-DAY TRAINING</div><div className="font-display text-2xl mt-2 text-amber">{overview.data.workouts30d} sessions</div><div className="text-xs text-bone-dim mt-1">Completed workouts logged</div></div><div className="bg-ink-2 border border-line/50 rounded-lg p-4"><div className="font-mono text-[10px] text-bone-dim">MODERATION QUEUE</div><div className="font-display text-2xl mt-2 text-danger">{overview.data.openReports} reports</div><div className="text-xs text-bone-dim mt-1">Open or being reviewed</div></div></div></div>
      </>}
    </div>}

    {tab === 'users' && <section className="card p-5"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5"><div><h2 className="font-display text-xl">Users and bans</h2><p className="text-xs text-bone-dim mt-1">Showing up to 200 newest accounts. Bans prevent access on the next sign-in.</p></div><div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" /><input value={search} onChange={event => setSearch(event.target.value)} className="input-field pl-9" placeholder="Search name, handle, email" /></div></div>{users.isLoading ? <div className="py-10 text-center text-bone-dim">Loading users...</div> : <div className="space-y-2">{filteredUsers.map((user: any) => { const isBanned = banIds.has(user.uid); return <div key={user.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-line/50 bg-ink-2"><img src={user.photoURL || getAvatarUrl(user.displayName, theme)} alt="" className="w-9 h-9 rounded-full object-cover" /><div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{user.displayName || 'Athlete'} <span className="font-mono text-[10px] text-sienna ml-1">@{user.username}</span></div><div className="text-xs text-bone-dim truncate">{user.email || user.uid}</div></div><div className={`font-mono text-[10px] ${isBanned ? 'text-danger' : 'text-sienna'}`}>{isBanned ? 'BANNED' : 'ACTIVE'}</div><button onClick={() => banMutation.mutate({ uid: user.uid, banned: !isBanned })} disabled={banMutation.isPending || user.uid === profile.uid} className={`${isBanned ? 'btn-secondary hover:text-sienna' : 'btn-danger'} py-2 inline-flex items-center gap-2`}>{isBanned ? <><CheckCircle2 size={13} /> Lift ban</> : <><Ban size={13} /> Ban</>}</button></div>; })}</div>}</section>}

    {tab === 'reports' && <section className="card p-5"><div className="mb-5"><h2 className="font-display text-xl">Reports</h2><p className="text-xs text-bone-dim mt-1">Review user-submitted reports and record a moderation decision.</p></div>{reports.isLoading ? <div className="py-10 text-center text-bone-dim">Loading reports...</div> : reports.data?.length ? <div className="space-y-3">{reports.data.map(report => <div key={report.id} className="border border-line/50 rounded-lg p-4 bg-ink-2"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><div className="font-mono text-[10px] text-amber uppercase">{report.status} · {report.reason}</div><div className="text-sm mt-2">Reported user: <span className="font-mono text-sienna">{report.reportedUserId || 'Not specified'}</span></div><div className="text-xs text-bone-dim mt-1">Reporter: {report.reporterId}</div>{report.details && <p className="text-sm text-bone-dim mt-3">{report.details}</p>}</div><div className="flex gap-2 shrink-0"><button onClick={() => report.id && reportMutation.mutate({ id: report.id, status: 'reviewing' })} className="btn-secondary py-2">Review</button><button onClick={() => report.id && reportMutation.mutate({ id: report.id, status: 'resolved' })} className="btn-primary py-2">Resolve</button><button onClick={() => report.id && reportMutation.mutate({ id: report.id, status: 'dismissed' })} className="btn-secondary py-2"><XCircle size={14} /></button></div></div></div>)}</div> : <div className="py-10 text-center text-bone-dim">No reports in the queue.</div>}</section>}

    {tab === 'communities' && <section className="card p-5"><div className="mb-5"><h2 className="font-display text-xl">Pending Communities</h2><p className="text-xs text-bone-dim mt-1">Review user requests to create communities.</p></div>{pendingCommunities.isLoading ? <div className="py-10 text-center text-bone-dim">Loading communities...</div> : pendingCommunities.data?.length ? <div className="space-y-3">{pendingCommunities.data.map((community: any) => <div key={community.id} className="border border-line/50 rounded-lg p-4 bg-ink-2"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><div className="font-semibold text-lg">{community.name}</div><div className="text-sm mt-1">{community.description}</div><div className="text-xs text-bone-dim mt-2">Owner ID: {community.ownerId}</div></div><div className="flex gap-2 shrink-0"><button onClick={() => community.id && approveCommunityMutation.mutate(community.id)} className="btn-primary py-2" disabled={approveCommunityMutation.isPending}>Approve</button><button onClick={() => { if (!community.id) return; const r = prompt('Reason for rejection (optional):'); if (r !== null) rejectCommunityMutation.mutate({ id: community.id, reason: r || undefined }); }} className="btn-secondary py-2 border-danger text-danger hover:bg-danger/10" disabled={rejectCommunityMutation.isPending}>Reject</button></div></div></div>)}</div> : <div className="py-10 text-center text-bone-dim">No pending communities.</div>}</section>}

    {tab === 'events' && <section className="card p-5"><div className="mb-5"><h2 className="font-display text-xl">Pending Events</h2><p className="text-xs text-bone-dim mt-1">Review user requests to host events outside of a community.</p></div>{pendingEvents.isLoading ? <div className="py-10 text-center text-bone-dim">Loading events...</div> : pendingEvents.data?.length ? <div className="space-y-3">{pendingEvents.data.map((event: any) => <div key={event.id} className="border border-line/50 rounded-lg p-4 bg-ink-2"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><div className="font-semibold text-lg">{event.title} <span className="text-xs font-normal text-amber ml-2">{event.category}</span></div><div className="text-sm mt-1">{event.description}</div><div className="text-xs text-bone-dim mt-2">Organizer: {event.organizerName} | Date: {event.dateTime?.start?.toDate ? event.dateTime.start.toDate().toLocaleString() : 'TBD'}</div></div><div className="flex gap-2 shrink-0"><button onClick={() => event.id && approveEventMutation.mutate(event.id)} className="btn-primary py-2" disabled={approveEventMutation.isPending}>Approve</button><button onClick={() => { if (!event.id) return; const r = prompt('Reason for rejection (optional):'); if (r !== null) rejectEventMutation.mutate({ id: event.id, reason: r || undefined }); }} className="btn-secondary py-2 border-danger text-danger hover:bg-danger/10" disabled={rejectEventMutation.isPending}>Reject</button></div></div></div>)}</div> : <div className="py-10 text-center text-bone-dim">No pending events.</div>}</section>}

    {tab === 'seed' && <section className="card p-6 border-danger/30 space-y-6"><div><h2 className="font-display text-xl mb-2 flex items-center gap-2"><Database size={18} /> Database tools</h2><p className="text-sm text-bone-dim">Seeding is idempotent: it uses stable document IDs, overwrites the expected catalog, and removes stale duplicate sample-plan documents.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><button onClick={handleSeedSamplePlans} disabled={seeding} className="btn-secondary border-sienna text-sienna hover:bg-sienna hover:text-bone inline-flex items-center justify-center gap-2">{seeding ? 'Processing...' : <><CheckCircle2 size={15} /> Seed sample plans</>}</button><button onClick={handleSeedExerciseLibrary} disabled={seedingLib} className="btn-secondary border-sienna text-sienna hover:bg-sienna hover:text-bone inline-flex items-center justify-center gap-2">{seedingLib ? 'Processing...' : <><CheckCircle2 size={15} /> Seed exercise library</>}</button></div><div className="border-t border-line/50 pt-5"><div className="flex items-center justify-between mb-3"><div><h3 className="font-display text-lg">All user plans</h3><p className="text-xs text-bone-dim mt-1">Admin deletion permanently removes the plan and its day documents.</p></div></div>{plans.isLoading ? <div className="text-sm text-bone-dim">Loading plans...</div> : <div className="space-y-2">{plans.data?.length ? plans.data.map((plan: any) => <div key={plan.id} className="flex items-center justify-between gap-3 rounded-lg border border-line/50 bg-ink-2 p-3"><div className="min-w-0"><div className="font-semibold text-sm truncate">{plan.title}</div><div className="text-xs text-bone-dim truncate">{plan.ownerName || plan.ownerId} · {plan.isArchived ? 'archived' : 'active'}</div></div><button onClick={() => handleDeletePlan(plan.id, plan.title)} disabled={deletingPlanId === plan.id} className="btn-danger py-2 inline-flex items-center gap-2 shrink-0"><Trash2 size={13} /> {deletingPlanId === plan.id ? 'Deleting...' : 'Delete'}</button></div>) : <div className="text-sm text-bone-dim">No user plans found.</div>}</div>}</div></section>}

    {tab === 'logs' && <section className="card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div>
          <h2 className="font-display text-xl">System Logs & Errors</h2>
          <p className="text-xs text-bone-dim mt-1">
            Displaying the 100 most recent client-side exceptions and unhandled rejections.
          </p>
        </div>
        <button
          onClick={() => { if(confirm('Clear all system logs permanently?')) clearLogsMutation.mutate(); }}
          disabled={clearLogsMutation.isPending || logs.data?.length === 0}
          className="btn-danger py-2 inline-flex items-center gap-1.5 self-start animate-pulse"
        >
          <Trash2 size={13} /> Clear Logs
        </button>
      </div>

      {logs.isLoading ? (
        <div className="py-10 text-center text-bone-dim">Loading system logs...</div>
      ) : logs.data?.length ? (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {logs.data.map((log: any) => (
            <div key={log.id} className="border border-line/40 rounded bg-ink-3 p-3 font-mono text-xs text-bone leading-relaxed">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/30 pb-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${log.context === 'window_onerror' || log.context === 'unhandled_rejection' ? 'bg-danger/10 text-danger' : 'bg-amber/10 text-amber'}`}>
                    {log.context?.toUpperCase()}
                  </span>
                  {log.userName && (
                    <span className="text-sienna">@{log.userName}</span>
                  )}
                </div>
                <div className="text-[10px] text-bone-dim">
                  {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : 'Just now'}
                </div>
              </div>
              
              <div className="text-bone font-semibold mb-1">{log.message}</div>
              {log.stack && (
                <pre className="text-[10px] text-bone-dim/80 bg-ink-2/65 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap select-text leading-snug border border-line/10">
                  {log.stack}
                </pre>
              )}
              
              <div className="mt-2 pt-2 border-t border-line/20 grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-bone-dim">
                <div className="truncate"><span className="text-bone">URL:</span> {log.url}</div>
                <div className="truncate"><span className="text-bone">Browser:</span> {log.userAgent}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-bone-dim border border-dashed border-line rounded">
          No system logs or exceptions recorded. The app is running smoothly!
        </div>
      )}
    </section>}
  </motion.div>;
}
