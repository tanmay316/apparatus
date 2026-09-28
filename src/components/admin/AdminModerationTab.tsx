import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Users, XCircle } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { approveCommunity, getPendingCommunities, getPendingEvents, rejectCommunity, updateEventStatus } from '@/services/events';
import { createNotification } from '@/services/notifications';
import { getUsersByIds, logAdminAction } from '@/services/admin';
import type { AppEvent, Community } from '@/types';
import { CopyId, EmptyState, ErrorState, LoadingState, RefreshButton, SectionHeader, formatWhen, useReasonDialog } from './AdminShared';

/** Only render images we trust the scheme of; user-supplied banners can be arbitrary URLs. */
const safeImage = (src?: string) => (src && (src.startsWith('https://') || src.startsWith('data:image/')) ? src : null);

async function notifyOwner(userId: string, title: string, body: string) {
  try {
    await createNotification({ userId, title: title.slice(0, 150), body: body.slice(0, 1000), type: 'community_announcement' });
  } catch (err) {
    console.warn('Could not notify submitter:', err);
  }
}

function useModeration<T>(key: QueryKey, invalidate: QueryKey[], fn: (arg: T) => Promise<void>, success: string) {
  const queryClient = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      [key, ['adminOverview'], ['adminAudit'], ...invalidate].forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      showToast(success);
    },
    onError: (e: any) => showToast(e?.message || 'Action failed', 'error'),
  });
}

export function AdminModerationTab({ kind }: { kind: 'communities' | 'events' }) {
  const { confirm } = useUIStore();
  const { ask, dialog } = useReasonDialog();
  const isCommunity = kind === 'communities';
  const key = isCommunity ? ['adminPendingCommunities'] : ['adminPendingEvents'];

  const items = useQuery<(Community | AppEvent)[]>({ queryKey: key, queryFn: isCommunity ? getPendingCommunities : getPendingEvents });
  const ownerIds = useMemo(() => (items.data || []).map(i => ('ownerId' in i ? i.ownerId : (i as AppEvent).organizerId)), [items.data]);
  const owners = useQuery({
    queryKey: ['adminModerationOwners', kind, ownerIds.join(',')],
    queryFn: () => getUsersByIds(ownerIds),
    enabled: ownerIds.length > 0,
  });

  const approve = useModeration<Community | AppEvent>(
    key,
    isCommunity ? [['communities'], ['userCommunities'], ['userSubmittedCommunities']] : [['publishedEvents'], ['userSubmittedEvents']],
    async item => {
      const ownerId = isCommunity ? (item as Community).ownerId : (item as AppEvent).organizerId;
      const label = isCommunity ? (item as Community).name : (item as AppEvent).title;
      if (isCommunity) await approveCommunity(item.id!);
      else await updateEventStatus(item.id!, 'published');
      await logAdminAction(isCommunity ? 'community.approve' : 'event.publish', isCommunity ? 'community' : 'event', item.id!, { label });
      await notifyOwner(ownerId, isCommunity ? 'Community approved' : 'Event published', `“${label}” is now live.`);
    },
    isCommunity ? 'Community approved' : 'Event published',
  );

  const reject = useModeration<{ item: Community | AppEvent; reason: string }>(
    key,
    isCommunity ? [['userSubmittedCommunities']] : [['userSubmittedEvents']],
    async ({ item, reason }) => {
      const ownerId = isCommunity ? (item as Community).ownerId : (item as AppEvent).organizerId;
      const label = isCommunity ? (item as Community).name : (item as AppEvent).title;
      if (isCommunity) await rejectCommunity(item.id!, reason || undefined);
      else await updateEventStatus(item.id!, 'rejected', reason || undefined);
      await logAdminAction(isCommunity ? 'community.reject' : 'event.reject', isCommunity ? 'community' : 'event', item.id!, { label, details: reason });
      await notifyOwner(ownerId, isCommunity ? 'Community request declined' : 'Event request declined', `“${label}” was not approved.${reason ? ` Reason: ${reason}` : ''}`);
    },
    isCommunity ? 'Community rejected' : 'Event rejected',
  );

  const handleApprove = async (item: Community | AppEvent, label: string) => {
    if (!await confirm({ title: isCommunity ? 'Approve community?' : 'Publish event?', message: `“${label}” becomes visible to everyone and the submitter is notified.`, confirmText: 'Approve', type: 'primary', icon: 'check' })) return;
    approve.mutate(item);
  };

  const handleReject = async (item: Community | AppEvent, label: string) => {
    const res = await ask({ title: `Reject “${label}”?`, message: 'The reason is shown to the submitter.', placeholder: 'Reason (optional)', confirmText: 'Reject', danger: true });
    if (res) reject.mutate({ item, reason: res.text });
  };

  const busy = approve.isPending || reject.isPending;

  return (
    <section className="card p-5">
      {dialog}
      <SectionHeader
        icon={isCommunity ? Users : CalendarClock}
        title={isCommunity ? 'Pending communities' : 'Pending events'}
        description={isCommunity ? 'User requests to create verified communities.' : 'Events submitted for publication outside a clan.'}
        actions={<RefreshButton busy={items.isFetching} onClick={() => items.refetch()} />}
      />
      {items.error ? <ErrorState error={items.error} onRetry={() => items.refetch()} />
        : items.isLoading ? <LoadingState />
        : !items.data?.length ? <EmptyState>Nothing waiting for review.</EmptyState>
        : (
          <div className="space-y-3">
            {items.data.map(item => {
              const community = isCommunity ? (item as Community) : null;
              const event = !isCommunity ? (item as AppEvent) : null;
              const label = community?.name || event?.title || 'Untitled';
              const ownerId = community?.ownerId || event?.organizerId || '';
              const owner = owners.data?.[ownerId];
              const banner = safeImage(item.banner);
              return (
                <div key={item.id} className="border border-line/50 rounded-xl p-4 bg-ink-2">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {banner && <img src={banner} alt="" className="w-full sm:w-32 h-24 object-cover rounded-lg shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-lg break-words">
                        {label}
                        {event?.category && <span className="text-xs font-normal text-amber ml-2">{event.category}</span>}
                      </div>
                      <p className="text-sm text-bone-dim mt-1 whitespace-pre-wrap break-words line-clamp-4">{item.description}</p>
                      <div className="text-xs text-bone-dim mt-2 space-y-0.5">
                        <div>
                          {isCommunity ? 'Owner' : 'Organizer'}: {owner ? `${owner.displayName} (@${owner.username})` : event?.organizerName || ownerId}
                        </div>
                        {event && (
                          <>
                            <div>When: {formatWhen(event.dateTime?.start, 'TBD')} · Capacity {event.capacity ?? '—'} · {event.pricing?.type === 'paid' ? `Paid ${event.pricing.basePrice ?? ''} ${event.pricing.currency ?? ''}` : 'Free'}</div>
                            <div>Where: {event.location?.isOnline ? 'Online' : [event.location?.venueName, event.location?.address].filter(Boolean).join(', ') || '—'}</div>
                          </>
                        )}
                        {community?.tags?.length ? <div>Tags: {community.tags.join(', ')}</div> : null}
                        <div>Submitted {formatWhen(item.createdAt)}</div>
                      </div>
                      <div className="mt-1"><CopyId value={item.id!} /></div>
                    </div>
                    <div className="flex sm:flex-col gap-2 shrink-0">
                      <button disabled={busy} onClick={() => handleApprove(item, label)} className="btn-primary py-2 px-4"><CheckCircle2 size={13} /> Approve</button>
                      <button disabled={busy} onClick={() => handleReject(item, label)} className="btn-danger py-2 gap-1.5"><XCircle size={13} /> Reject</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}
