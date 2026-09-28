import type { UserProfile } from '@/types';

export type ProfileVisibility = 'public' | 'followers' | 'private';

/** Legacy profiles only have `isPublic`; newer ones use privacySettings. */
export function getProfileVisibility(profile?: Partial<UserProfile> | null): ProfileVisibility {
  return profile?.privacySettings?.profileVisibility || (profile?.isPublic === false ? 'private' : 'public');
}

/** Only fully private profiles need approval before someone can follow them. */
export function followNeedsApproval(profile?: Partial<UserProfile> | null): boolean {
  return getProfileVisibility(profile) === 'private';
}
