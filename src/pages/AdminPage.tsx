import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity, Bike, Bot, CalendarClock, Database, Flag, Gauge, HardDrive, History, Megaphone, ShieldAlert, Terminal, Ticket, UserPlus, Users, UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { getAdminOverview } from '@/services/admin';
import { ErrorState, LoadingState, Metric, RefreshButton, SectionHeader, fmtCount, useIsAdmin } from '@/components/admin/AdminShared';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { AdminReportsTab } from '@/components/admin/AdminReportsTab';
import { AdminModerationTab } from '@/components/admin/AdminModerationTab';
import { AdminContentTab } from '@/components/admin/AdminContentTab';
import { AdminStorageTab } from '@/components/admin/AdminStorageTab';
import { AdminLogsTab } from '@/components/admin/AdminLogsTab';
import { AdminAnnouncementsTab } from '@/components/admin/AdminAnnouncementsTab';
import { AdminAuditTab } from '@/components/admin/AdminAuditTab';
import { AdminCouponsTab } from '@/components/admin/AdminCouponsTab';
import AdminNutritionSettings from '@/components/admin/AdminNutritionSettings';
import { AdminBell } from '@/components/admin/AdminBell';

const TABS = ['overview', 'users', 'reports', 'communities', 'events', 'content', 'updates', 'coupons', 'ai', 'logs', 'storage', 'audit'] as const;
type AdminTab = typeof TABS[number];

function OverviewTab({ go }: { go: (tab: AdminTab) => void }) {
  const overview = useQuery({ queryKey: ['adminOverview'], queryFn: getAdminOverview, refetchInterval: 60_000 });
  if (overview.isLoading) return <LoadingState label="Loading analytics…" />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const d = overview.data!;

  const queue = [
    { label: 'Open reports', value: d.openReports, tab: 'reports' as const, icon: Flag },
    { label: 'Pending communities', value: d.pendingCommunities, tab: 'communities' as const, icon: UsersRound },
    { label: 'Pending events', value: d.pendingEvents, tab: 'events' as const, icon: CalendarClock },
    { label: 'Errors in 24h', value: d.logs24h, tab: 'logs' as const, icon: Terminal },
  ];
  const pending = queue.filter(q => (q.value ?? 0) > 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><RefreshButton busy={overview.isFetching} onClick={() => overview.refetch()} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="USERS" value={d.users} detail={`${fmtCount(d.newUsers7d)} new this week`} icon={Users} onClick={() => go('users')} />
        <Metric label="ACTIVE (30D)" value={d.activeUsers30d} detail="Profiles updated in 30 days" icon={UserPlus} tone="text-amber" />
        <Metric label="WORKOUTS" value={d.workouts} detail={`${fmtCount(d.workouts30d)} in 30 days`} icon={Activity} />
        <Metric label="CARDIO" value={d.cardio} detail={`${fmtCount(d.cardio30d)} in 30 days`} icon={Bike} tone="text-amber" />
        <Metric label="FEED POSTS" value={d.activities} detail="Published activity records" icon={Gauge} />
        <Metric label="CLANS" value={d.clans} detail="Clans created" icon={UsersRound} />
        <Metric label="OPEN REPORTS" value={d.openReports} detail="Open or in review" icon={Flag} tone="text-danger" onClick={() => go('reports')} />
        <Metric label="ACTIVE BANS" value={d.bannedUsers} detail="Suspended accounts" icon={ShieldAlert} tone="text-danger" onClick={() => go('users')} />
      </div>

      <section className="card p-5">
        <SectionHeader title="Needs attention" description="Queues waiting on an admin decision." />
        {pending.length === 0 ? (
          <div className="text-sm text-bone-dim">All queues are clear.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pending.map(q => (
              <button key={q.label} onClick={() => go(q.tab)} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-ink-2 border border-line/50 hover:border-sienna/40 text-left">
                <span className="flex items-center gap-2 text-sm"><q.icon size={15} className="text-sienna" /> {q.label}</span>
                <span className="font-display text-xl text-danger">{fmtCount(q.value)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {Object.values(d).some(v => v === null) && (
        <p className="text-[11px] text-bone-dim">“—” means that count could not be loaded (missing index or permission).</p>
      )}
    </div>
  );
}

export function AdminPage() {
  const { initialized } = useAuthStore();
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: AdminTab = (TABS as readonly string[]).includes(raw || '') ? (raw as AdminTab) : 'overview';
  const go = (next: AdminTab) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  const overview = useQuery({ queryKey: ['adminOverview'], queryFn: getAdminOverview, enabled: isAdmin, refetchInterval: 60_000 });

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (!initialized) return <LoadingState />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const nav: { id: AdminTab; label: string; icon: LucideIcon; badge?: number | null }[] = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'reports', label: 'Reports', icon: Flag, badge: overview.data?.openReports },
    { id: 'communities', label: 'Communities', icon: UsersRound, badge: overview.data?.pendingCommunities },
    { id: 'events', label: 'Events', icon: CalendarClock, badge: overview.data?.pendingEvents },
    { id: 'content', label: 'Content', icon: Database },
    { id: 'updates', label: 'Announcements', icon: Megaphone },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'ai', label: 'AI keys', icon: Bot },
    { id: 'logs', label: 'Logs', icon: Terminal, badge: overview.data?.logs24h },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'audit', label: 'Audit', icon: History },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="pb-5 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="font-mono text-danger text-xs tracking-widest mb-1">OPERATIONS</div>
          <h1 className="font-display text-3xl">Admin Console</h1>
          <p className="text-bone-dim text-sm mt-1">Moderate the community, monitor product health, and maintain shared content.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="tag-amber inline-flex items-center gap-2"><ShieldAlert size={13} /> ADMIN ACCESS</div>
          <AdminBell />
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-1 -mx-1">
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => go(item.id)}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full font-mono text-sm transition-colors ${tab === item.id ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
          >
            <item.icon size={14} /> {item.label}
            {!!item.badge && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] leading-[18px] text-center">{item.badge > 99 ? '99+' : item.badge}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab go={go} />}
      {tab === 'users' && <AdminUsersTab />}
      {tab === 'reports' && <AdminReportsTab />}
      {tab === 'communities' && <AdminModerationTab key="communities" kind="communities" />}
      {tab === 'events' && <AdminModerationTab key="events" kind="events" />}
      {tab === 'content' && <AdminContentTab />}
      {tab === 'updates' && <AdminAnnouncementsTab />}
      {tab === 'coupons' && <AdminCouponsTab />}
      {tab === 'ai' && <AdminNutritionSettings />}
      {tab === 'logs' && <AdminLogsTab />}
      {tab === 'storage' && <AdminStorageTab />}
      {tab === 'audit' && <AdminAuditTab />}
    </motion.div>
  );
}
