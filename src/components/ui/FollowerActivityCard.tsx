import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import type { Activity } from '@/types';

export function FollowerActivityCard({ activity, onShare }: { activity: Activity; onShare?: (activity: Activity) => void }) {
  return <ActivityPostCard activity={activity} onShare={onShare} />;
}
