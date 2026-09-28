import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, ChevronDown, ExternalLink, Search, ShieldCheck, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import {
  banUser, getAdminBans, getAdminUserDetail, getAdminUsersPage, getUsersByIds, liftBan, searchAdminUsers,
  type AdminBan, type AdminUser,
} from '@/services/admin';
import { CopyId, EmptyState, ErrorState, FilterPills, LoadingState, RefreshButton, SectionHeader, fmtCount, formatWhen, useReasonDialog } from './AdminShared';

type UserFilter = 'all' | 'active' | 'banned';

const BAN_DURATIONS = [
  { label: '24 hours', value: '1' },
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: 'Permanent', value: 'permanent' },
];

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function UserDetail({ uid }: { uid: string }) {
  const detail = useQuery({ queryKey: ['adminUserDetail', uid], queryFn: () => getAdminUserDetail(uid) });
  if (detail.isLoading) return <div className="text-xs text-bone-dim animate-pulse py-2">Loading activity…</div>;
  if (detail.error) return <div className="text-xs text-danger py-2">Could not load details.</div>;
  const d = detail.data!;
  const stats = [
    ['Workouts', d.workouts], ['Cardio', d.cardio], ['Feed posts', d.activities],
    ['Reports against', d.reportsAgainst], ['Reports filed', d.reportsFiled],
  ] as const;
  return (
    <div className="mt-3 pt-3 border-t border-line/30 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-ink-3 rounded-lg px-3 py-2">
            <div className="font-mono text-[9px] text-bone-dim uppercase">{label}</div>
            <div className={`font-display text-lg ${label === 'Reports against' && (value ?? 0) > 0 ? 'text-danger' : ''}`}>{fmtCount(value)}</div>
          </div>
        ))}
      </div>
      {d.ban && (
        <div className="text-[11px] text-bone-dim font-mono">
          Last ban: {d.ban.active ? 'active' : 'lifted'} · {d.ban.reason || 'no reason'} · issued {formatWhen(d.ban.createdAt)}
          {d.ban.expiresAt ? ` · expires ${formatWhen(d.ban.expiresAt)}` : ''}{d.ban.liftedAt ? ` · lifted ${formatWhen(d.ban.liftedAt)}` : ''}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, ban, expanded, onToggle, onBan, onLift, busy, isSelf }: {
  user: AdminUser; ban?: AdminBan; expanded: boolean; onToggle: () => void;
  onBan: () => void; onLift: () => void; busy: boolean; isSelf: boolean;
}) {
  const theme = useUIStore(s => s.theme);
  return (
    <div className={`p-3 rounded-xl border bg-ink-2 ${ban ? 'border-danger/40' : 'border-line/50'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <img src={user.photoURL || getAvatarUrl(user.displayName, theme)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate flex items-center gap-1.5">
              {user.displayName || 'Athlete'}
              {user.isAdmin && <ShieldCheck size={13} className="text-sienna shrink-0" />}
              <span className="font-mono text-[10px] text-sienna font-normal">@{user.username}</span>
            </div>
            <div className="text-[11px] text-bone-dim truncate">
              Joined {formatWhen(user.createdAt)}{user.athleteRank?.label ? ` · ${user.athleteRank.label}` : ''}
            </div>
            {ban && (
              <div className="text-[11px] text-danger truncate">
                Banned: {ban.reason || 'Policy violation'} · {ban.expiresAt ? `until ${formatWhen(ban.expiresAt)}` : 'permanent'}
              </div>
            )}
          </div>
          <ChevronDown size={15} className={`text-bone-dim shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {user.username && (
            <Link to={`/profile/${user.username}`} className="btn-secondary py-2" title="Open profile"><ExternalLink size={13} /></Link>
          )}
          {ban ? (
            <button onClick={onLift} disabled={busy} className="btn-secondary py-2"><CheckCircle2 size={13} /> Lift ban</button>
          ) : (
            <button onClick={onBan} disabled={busy || isSelf || user.isAdmin} className="btn-danger py-2 gap-1.5" title={isSelf || user.isAdmin ? 'Admins cannot be banned' : undefined}>
              <Ban size={13} /> Ban
            </button>
          )}
        </div>
      </div>
      <div className="mt-1"><CopyId value={user.uid} /></div>
      {expanded && <UserDetail uid={user.uid} />}
    </div>
  );
}

export function AdminUsersTab() {
  const { profile } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const [filter, setFilter] = useState<UserFilter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const term = useDebounced(search.trim());

  const pages = useInfiniteQuery({
    queryKey: ['adminUsers'],
    queryFn: ({ pageParam }) => getAdminUsersPage(pageParam),
    initialPageParam: null as Awaited<ReturnType<typeof getAdminUsersPage>>['cursor'],
    getNextPageParam: last => last.cursor ?? undefined,
  });
  const bans = useQuery({ queryKey: ['adminBans'], queryFn: getAdminBans });
  const remote = useQuery({ queryKey: ['adminUserSearch', term], queryFn: () => searchAdminUsers(term), enabled: term.length >= 2 });

  const banMap = useMemo(() => new Map((bans.data || []).map(b => [b.uid, b])), [bans.data]);
  const banned = useQuery({
    queryKey: ['adminBannedProfiles', [...banMap.keys()].sort().join(',')],
    queryFn: () => getUsersByIds([...banMap.keys()]),
    enabled: filter === 'banned' && banMap.size > 0,
  });

  const list = useMemo(() => {
    const byId = new Map<string, AdminUser>();
    if (filter === 'banned') {
      Object.values(banned.data || {}).forEach(u => byId.set(u.uid, u));
    } else {
      pages.data?.pages.forEach(p => p.users.forEach(u => byId.set(u.uid, u)));
    }
    const needle = term.toLowerCase().replace(/^@/, '');
    if (needle && filter !== 'banned') remote.data?.forEach(u => byId.set(u.uid, u));
    return [...byId.values()].filter(u => {
      if (filter === 'active' && banMap.has(u.uid)) return false;
      if (!needle) return true;
      return u.displayName?.toLowerCase().includes(needle) || u.username?.toLowerCase().includes(needle) || u.uid === term;
    });
  }, [pages.data, banned.data, remote.data, banMap, filter, term]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['adminBans'] });
    queryClient.invalidateQueries({ queryKey: ['adminOverview'] });
    queryClient.invalidateQueries({ queryKey: ['adminUserDetail'] });
    queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
  };

  const banMutation = useMutation({
    mutationFn: (args: { user: AdminUser; reason: string; durationDays: number | null }) =>
      banUser(args.user.uid, { reason: args.reason, durationDays: args.durationDays, label: `@${args.user.username}` }),
    onSuccess: () => { invalidate(); showToast('User suspended'); },
    onError: (e: any) => showToast(e?.message || 'Could not ban user', 'error'),
  });
  const liftMutation = useMutation({
    mutationFn: (user: AdminUser) => liftBan(user.uid, `@${user.username}`),
    onSuccess: () => { invalidate(); showToast('Ban lifted'); },
    onError: (e: any) => showToast(e?.message || 'Could not lift ban', 'error'),
  });

  const handleBan = async (user: AdminUser) => {
    const res = await ask({
      title: `Suspend @${user.username}?`,
      message: 'They are signed out immediately and cannot post, comment or message while suspended.',
      choiceLabel: 'Duration', choices: BAN_DURATIONS, initialChoice: '7',
      placeholder: 'Reason (shown in the audit log)', required: true, confirmText: 'Suspend', danger: true,
    });
    if (!res) return;
    banMutation.mutate({ user, reason: res.text, durationDays: res.choice === 'permanent' ? null : Number(res.choice) });
  };

  const handleLift = async (user: AdminUser) => {
    if (!await confirm({ title: 'Lift ban?', message: `@${user.username} will regain full access.`, confirmText: 'Lift ban', type: 'primary', icon: 'check' })) return;
    liftMutation.mutate(user);
  };

  const busy = banMutation.isPending || liftMutation.isPending;
  const loading = filter === 'banned' ? bans.isLoading || banned.isLoading : pages.isLoading;
  const loadedCount = pages.data?.pages.reduce((n, p) => n + p.users.length, 0) ?? 0;

  return (
    <section className="card p-5">
      {dialog}
      <SectionHeader
        icon={Users}
        title="Users & bans"
        description={`${loadedCount} newest accounts loaded · search also queries the server by handle, name prefix or UID.`}
        actions={<RefreshButton busy={pages.isFetching || bans.isFetching} onClick={() => { pages.refetch(); bans.refetch(); }} />}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" />
          <input id="admin-users-search" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" placeholder="Search @handle, name, or UID" />
        </div>
        <FilterPills<UserFilter>
          value={filter}
          onChange={setFilter}
          options={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'banned', label: 'Banned', count: banMap.size }]}
        />
      </div>

      {pages.error ? <ErrorState error={pages.error} onRetry={() => pages.refetch()} />
        : loading ? <LoadingState label="Loading users…" />
        : list.length === 0 ? <EmptyState>{term ? (remote.isFetching ? 'Searching…' : 'No users match that search.') : 'No users in this view.'}</EmptyState>
        : (
          <div className="space-y-2">
            {list.map(user => (
              <UserRow
                key={user.uid}
                user={user}
                ban={banMap.get(user.uid)}
                expanded={expanded === user.uid}
                onToggle={() => setExpanded(expanded === user.uid ? null : user.uid)}
                onBan={() => handleBan(user)}
                onLift={() => handleLift(user)}
                busy={busy}
                isSelf={user.uid === profile?.uid}
              />
            ))}
          </div>
        )}

      {filter !== 'banned' && pages.hasNextPage && (
        <button onClick={() => pages.fetchNextPage()} disabled={pages.isFetchingNextPage} className="btn-secondary w-full mt-4 py-2.5">
          {pages.isFetchingNextPage ? 'Loading…' : 'Load more users'}
        </button>
      )}
    </section>
  );
}
