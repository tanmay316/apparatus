import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, Ban, CheckCircle2, Database, Flag, Gauge, Search, ShieldAlert, Users, XCircle } from 'lucide-react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { db } from '@/lib/firebase';
import { SAMPLE_PLANS } from '@/data/sample-plans';
import { seedLibraryExercises } from '@/services/library';
import { getAdminBans, getAdminOverview, getAdminReports, getAdminUsers, setUserBan, updateReportStatus, type AdminReport } from '@/services/admin';

type AdminTab = 'overview' | 'users' | 'reports' | 'seed';

function Metric({ label, value, detail, icon: Icon, color = 'text-teal' }: { label: string; value: number; detail: string; icon: typeof Users; color?: string }) {
  return <div className="card p-4"><div className="flex items-start justify-between"><div className="font-mono text-[10px] text-bone-dim tracking-wider">{label}</div><Icon size={17} className={color} /></div><div className="font-display text-3xl mt-3">{value.toLocaleString()}</div><div className="text-[11px] text-bone-dim mt-1">{detail}</div></div>;
}

export function AdminPage() {
  const { profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedingLib, setSeedingLib] = useState(false);

  const overview = useQuery({ queryKey: ['adminOverview'], queryFn: getAdminOverview, enabled: !!profile?.isAdmin });
  const users = useQuery({ queryKey: ['adminUsers'], queryFn: getAdminUsers, enabled: !!profile?.isAdmin });
  const bans = useQuery({ queryKey: ['adminBans'], queryFn: getAdminBans, enabled: !!profile?.isAdmin });
  const reports = useQuery({ queryKey: ['adminReports'], queryFn: getAdminReports, enabled: !!profile?.isAdmin });

  const filteredUsers = useMemo(() => {
    const normalized = search.toLowerCase().trim();
    return (users.data || []).filter((user: any) => !normalized || user.displayName?.toLowerCase().includes(normalized) || user.username?.toLowerCase().includes(normalized) || user.email?.toLowerCase().includes(normalized));
  }, [users.data, search]);
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

  if (!profile?.isAdmin) return <Navigate to="/" replace />;

  const handleSeedSamplePlans = async () => {
    if (!confirm('Overwrite the matching sample plan documents?')) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
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
    { id: 'seed', label: 'Database', icon: Database },
  ];

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
    <div className="pb-5 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div><div className="font-mono text-danger text-xs tracking-widest mb-1">OPERATIONS</div><h1 className="font-display text-3xl">Admin Console</h1><p className="text-bone-dim text-sm mt-1">Moderate the community, monitor product health, and maintain shared content.</p></div>
      <div className="tag-amber inline-flex items-center gap-2"><ShieldAlert size={13} /> ADMIN ACCESS</div>
    </div>

    <div className="flex flex-wrap gap-2">{nav.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border font-mono text-xs transition-colors ${tab === item.id ? 'bg-teal text-ink border-teal font-bold' : 'border-line text-bone-dim hover:text-bone hover:border-teal-dim'}`}><Icon size={14} /> {item.label}</button>; })}</div>

    {tab === 'overview' && <div className="space-y-5">
      {overview.isLoading ? <div className="card p-10 text-center text-bone-dim">Loading analytics...</div> : overview.data && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric label="USERS" value={overview.data.users} detail={`${overview.data.activeUsers30d} active in 30 days`} icon={Users} /><Metric label="WORKOUTS" value={overview.data.workouts} detail={`${overview.data.workouts30d} in 30 days`} icon={Activity} /><Metric label="ACTIVITIES" value={overview.data.activities} detail="Published feed records" icon={Gauge} color="text-amber" /><Metric label="OPEN REPORTS" value={overview.data.openReports} detail={`${overview.data.bannedUsers} active bans`} icon={Flag} color="text-danger" /></div>
        <div className="card p-5"><div className="flex items-center gap-2 mb-4"><Activity size={18} className="text-teal" /><h2 className="font-display text-xl">Platform health</h2></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="bg-ink-2 border border-line/50 rounded-lg p-4"><div className="font-mono text-[10px] text-bone-dim">30-DAY USER ACTIVITY</div><div className="font-display text-2xl mt-2 text-teal">{overview.data.activeUsers30d} users</div><div className="text-xs text-bone-dim mt-1">Profiles updated recently</div></div><div className="bg-ink-2 border border-line/50 rounded-lg p-4"><div className="font-mono text-[10px] text-bone-dim">30-DAY TRAINING</div><div className="font-display text-2xl mt-2 text-amber">{overview.data.workouts30d} sessions</div><div className="text-xs text-bone-dim mt-1">Completed workouts logged</div></div><div className="bg-ink-2 border border-line/50 rounded-lg p-4"><div className="font-mono text-[10px] text-bone-dim">MODERATION QUEUE</div><div className="font-display text-2xl mt-2 text-danger">{overview.data.openReports} reports</div><div className="text-xs text-bone-dim mt-1">Open or being reviewed</div></div></div></div>
      </>}
    </div>}

    {tab === 'users' && <section className="card p-5"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5"><div><h2 className="font-display text-xl">Users and bans</h2><p className="text-xs text-bone-dim mt-1">Showing up to 200 newest accounts. Bans prevent access on the next sign-in.</p></div><div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" /><input value={search} onChange={event => setSearch(event.target.value)} className="input-field pl-9" placeholder="Search name, handle, email" /></div></div>{users.isLoading ? <div className="py-10 text-center text-bone-dim">Loading users...</div> : <div className="space-y-2">{filteredUsers.map((user: any) => { const isBanned = banIds.has(user.uid); return <div key={user.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-line/50 bg-ink-2"><img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=4F9E8D&color=14151A&bold=true`} alt="" className="w-9 h-9 rounded-full object-cover" /><div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{user.displayName || 'Athlete'} <span className="font-mono text-[10px] text-teal ml-1">@{user.username}</span></div><div className="text-xs text-bone-dim truncate">{user.email || user.uid}</div></div><div className={`font-mono text-[10px] ${isBanned ? 'text-danger' : 'text-teal'}`}>{isBanned ? 'BANNED' : 'ACTIVE'}</div><button onClick={() => banMutation.mutate({ uid: user.uid, banned: !isBanned })} disabled={banMutation.isPending || user.uid === profile.uid} className={`${isBanned ? 'btn-secondary hover:text-teal' : 'btn-danger'} py-2 inline-flex items-center gap-2`}>{isBanned ? <><CheckCircle2 size={13} /> Lift ban</> : <><Ban size={13} /> Ban</>}</button></div>; })}</div>}</section>}

    {tab === 'reports' && <section className="card p-5"><div className="mb-5"><h2 className="font-display text-xl">Reports</h2><p className="text-xs text-bone-dim mt-1">Review user-submitted reports and record a moderation decision.</p></div>{reports.isLoading ? <div className="py-10 text-center text-bone-dim">Loading reports...</div> : reports.data?.length ? <div className="space-y-3">{reports.data.map(report => <div key={report.id} className="border border-line/50 rounded-lg p-4 bg-ink-2"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><div className="font-mono text-[10px] text-amber uppercase">{report.status} · {report.reason}</div><div className="text-sm mt-2">Reported user: <span className="font-mono text-teal">{report.reportedUserId || 'Not specified'}</span></div><div className="text-xs text-bone-dim mt-1">Reporter: {report.reporterId}</div>{report.details && <p className="text-sm text-bone-dim mt-3">{report.details}</p>}</div><div className="flex gap-2 shrink-0"><button onClick={() => report.id && reportMutation.mutate({ id: report.id, status: 'reviewing' })} className="btn-secondary py-2">Review</button><button onClick={() => report.id && reportMutation.mutate({ id: report.id, status: 'resolved' })} className="btn-primary py-2">Resolve</button><button onClick={() => report.id && reportMutation.mutate({ id: report.id, status: 'dismissed' })} className="btn-secondary py-2"><XCircle size={14} /></button></div></div></div>)}</div> : <div className="py-10 text-center text-bone-dim">No reports in the queue.</div>}</section>}

    {tab === 'seed' && <section className="card p-6 border-danger/30"><h2 className="font-display text-xl mb-2 flex items-center gap-2"><Database size={18} /> Database tools</h2><p className="text-sm text-bone-dim mb-6">Seed the immutable sample catalog and exercise library. These actions overwrite matching IDs only.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><button onClick={handleSeedSamplePlans} disabled={seeding} className="btn-secondary border-teal text-teal hover:bg-teal hover:text-ink inline-flex items-center justify-center gap-2">{seeding ? 'Processing...' : <><CheckCircle2 size={15} /> Seed sample plans</>}</button><button onClick={handleSeedExerciseLibrary} disabled={seedingLib} className="btn-secondary border-teal text-teal hover:bg-teal hover:text-ink inline-flex items-center justify-center gap-2">{seedingLib ? 'Processing...' : <><CheckCircle2 size={15} /> Seed exercise library</>}</button></div></section>}
  </motion.div>;
}
