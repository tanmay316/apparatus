import type { Timestamp } from 'firebase/firestore';

/** Mirrors notBanned() in firestore.rules: a ban with a past expiresAt has lapsed. */
export function isBanActive(ban: { active?: boolean; expiresAt?: Timestamp | null } | null | undefined, now = Date.now()) {
  if (!ban?.active) return false;
  const expires = ban.expiresAt?.toMillis?.();
  return !expires || expires > now;
}
