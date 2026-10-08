import type { QueryClient } from '@tanstack/react-query';

/**
 * A new notification usually means data on screen changed (request accepted, joined a clan,
 * new clan post...). Refetch the related queries instead of waiting for their 5-minute staleTime.
 */
export function refreshForNotification(
  queryClient: QueryClient,
  note: { type?: string; senderId?: string; extra?: Record<string, any> | null },
  myUid: string,
) {
  const invalidate = (...keys: unknown[][]) => keys.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
  const sender = note.senderId;
  const clanId = note.extra?.clanId as string | undefined;

  switch (note.type) {
    case 'follow':
    case 'follow_request':
    case 'unfollow':
      if (sender) invalidate(['isFollowing', myUid, sender], ['hasRequestedFollow', myUid, sender], ['followCounts', sender], ['followList', sender]);
      invalidate(['followCounts', myUid], ['followList', myUid], ['following'], ['feed']);
      break;
    case 'clan_join_accepted':
    case 'clan_join_request':
      invalidate(['userClans'], ['isMemberOfClan'], ['publicClans']);
      if (clanId) invalidate(['userClanJoinRequest', clanId], ['clanJoinRequests', clanId], ['clan', clanId], ['clanMembers', clanId], ['clanPosts', clanId], ['clanChallenges', clanId], ['clanEvents', clanId], ['clanAnnouncements', clanId]);
      break;
    case 'clan_post':
    case 'clan_poll':
      if (clanId) invalidate(['clanPosts', clanId]);
      invalidate(['feed']);
      break;
    case 'clan_announcement':
      if (clanId) invalidate(['clanAnnouncements', clanId]);
      break;
    case 'registration_approved':
    case 'ticket_confirmed':
    case 'event_cancelled':
      invalidate(['communityEvents'], ['userEvents'], ['clanEvents']);
      break;
  }
}
