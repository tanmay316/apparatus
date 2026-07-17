import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { ActivityPostCard, ActivityPostCardSkeleton } from '@/components/social/ActivityPostCard';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { useAuthStore } from '@/stores/auth-store';
import { getActivity, getFeed, getFollowing, getPublicFeed } from '@/services/social';
import type { Activity } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export function FeedPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'following' | 'global'>('following');
  const [searchParams] = useSearchParams();
  const activityId = searchParams.get('activity');
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  const { data: followingUids = [] } = useQuery({
    queryKey: ['following', user?.uid],
    queryFn: () => getFollowing(user!.uid),
    enabled: !!user,
  });

  const { data: feedItems = [], isLoading } = useQuery({
    queryKey: ['feed', tab, user?.uid, followingUids],
    queryFn: () => tab === 'following'
      ? getFeed(user!.uid, followingUids)
      : getPublicFeed(),
    enabled: !!user,
  });

  const { data: linkedActivity } = useQuery({
    queryKey: ['activity', activityId],
    queryFn: () => getActivity(activityId!),
    enabled: !!activityId,
  });

  const visibleFeedItems = linkedActivity && !feedItems.some(activity => activity.id === linkedActivity.id)
    ? [linkedActivity, ...feedItems]
    : feedItems;

  useEffect(() => {
    if (!activityId || !linkedActivity) return;
    window.setTimeout(() => document.getElementById(`activity-${activityId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }, [activityId, linkedActivity]);

  const handleShareActivity = (activity: Activity) => {
    const details = (activity.details as Record<string, any>) || {};
    const createdDate = activity.createdAt?.seconds
      ? new Date(activity.createdAt.seconds * 1000)
      : new Date();

    setShareData({
      dayTitle: details.dayTitle || activity.summary,
      planTitle: details.planTitle || 'Workout',
      date: createdDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      durationMin: details.durationMin || 0,
      volume: details.volume || 0,
      calories: details.calories || 0,
      exerciseNames: details.exercises || [],
      exerciseLogs: details.exerciseLogs || undefined,
    });
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-2xl mx-auto">
      <motion.div variants={item} className="pb-5 border-b border-white/[0.06] mb-6">
        <div className="font-mono text-amber text-xs tracking-widest mb-1">COMMUNITY</div>
        <h1 className="font-display text-3xl mb-1 text-bone">Activity Feed</h1>
        <p className="text-bone-dim text-sm max-w-xl">See what you and other athletes have been up to.</p>
      </motion.div>

      {/* Tab switcher */}
      <motion.div variants={item} className="flex bg-ink-2 border border-white/[0.06] rounded-xl p-1 mb-6 max-w-xs">
        <button
          onClick={() => setTab('following')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono transition-colors ${tab === 'following' ? 'bg-teal text-ink font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Following
        </button>
        <button
          onClick={() => setTab('global')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-mono transition-colors ${tab === 'global' ? 'bg-teal text-ink font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Global
        </button>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          <ActivityPostCardSkeleton />
          <ActivityPostCardSkeleton />
          <ActivityPostCardSkeleton />
        </div>
      ) : visibleFeedItems.length === 0 ? (
        <motion.div variants={item} className="text-center py-16 border border-dashed border-white/[0.08] rounded-2xl bg-ink-2/40">
          <Users size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
          <h3 className="font-display text-lg mb-2 text-bone">No Activity Yet</h3>
          <p className="text-sm text-bone-dim max-w-sm mx-auto">
            {tab === 'following'
              ? 'Complete a workout or follow other athletes to see their activity here.'
              : 'No public activity yet. Be the first to post a workout!'
            }
          </p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {visibleFeedItems.map(activity => (
            <div id={`activity-${activity.id}`} key={activity.id}>
              <ActivityPostCard
                activity={activity}
                onShare={handleShareActivity}
              />
            </div>
          ))}
        </div>
      )}

      {/* Share Card Modal for past workouts */}
      {shareData && (
        <ShareCardModal
          data={shareData}
          onClose={() => setShareData(null)}
        />
      )}
    </motion.div>
  );
}
