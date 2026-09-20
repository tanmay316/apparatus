import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';

interface LiveUserNameProps {
  userId?: string | null;
  fallbackName?: string | null;
  className?: string;
}

/** Renders a user's current display name live, falling back to a denormalized copy. */
export function LiveUserName({ userId, fallbackName, className }: LiveUserNameProps) {
  const { displayName } = useLiveDisplayName(userId, fallbackName);
  return <span className={className}>{displayName}</span>;
}

interface LiveUserAvatarProps {
  userId?: string | null;
  fallbackName?: string | null;
  fallbackPhoto?: string | null;
  className?: string;
}

/** Renders a user's current avatar photo live (falls back to initial letter / stored photo). */
export function LiveUserAvatar({ userId, fallbackName, fallbackPhoto, className }: LiveUserAvatarProps) {
  const { displayName, photoURL } = useLiveDisplayName(userId, fallbackName, fallbackPhoto);
  if (photoURL) {
    return <img src={photoURL} alt={displayName} className={className} />;
  }
  return <>{displayName?.charAt(0)?.toUpperCase() || '?'}</>;
}
