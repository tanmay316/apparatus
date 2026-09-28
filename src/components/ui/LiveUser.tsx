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

interface LiveSenderMessageProps {
  senderId?: string | null;
  senderName?: string | null;
  message: string;
  className?: string;
}

/** Notification text was baked with the sender's old name; swap in their current one. */
export function LiveSenderMessage({ senderId, senderName, message, className }: LiveSenderMessageProps) {
  const isUser = !!senderId && senderId !== 'system';
  const { displayName } = useLiveDisplayName(isUser ? senderId : null, senderName);
  const text = isUser && senderName && displayName && displayName !== senderName
    ? message.split(senderName).join(displayName)
    : message;
  return <span className={className}>{text}</span>;
}
