import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { ActivityPostCard, ActivityPostCardSkeleton } from '@/components/social/ActivityPostCard';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { useAuthStore } from '@/stores/auth-store';
import { getActivity, getFeed, getFollowing, getPublicFeed, getBookmarkedActivities } from '@/services/social';
import type { Activity } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export function FeedPage() {
  const { user, profile } = useAuthStore();
  const [tab, setTab] = useState<'following' | 'global' | 'bookmarks'>('following');
  const [searchParams] = useSearchParams();
  const activityId = searchParams.get('activity');
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  const { data: followingUids = [] } = useQuery({
    queryKey: ['following', user?.uid],
    queryFn: () => getFollowing(user!.uid),
    enabled: !!user,
  });

  const { data: feedItems = [], isLoading } = useQuery({
    queryKey: ['feed', tab, user?.uid, followingUids, profile?.bookmarks],
    queryFn: () => {
      if (tab === 'following') return getFeed(user!.uid, followingUids);
      if (tab === 'global') return getPublicFeed();
      return getBookmarkedActivities(profile?.bookmarks || []);
    },
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
      <motion.div variants={item} className="pb-5 border-b border-[#ececec] mb-6">
        <div className="font-sans text-xs font-medium text-[#979799] tracking-widest mb-1 uppercase">COMMUNITY</div>
        <h1 className="font-serif font-normal text-3xl mb-1 text-[#17191c]">Activity Feed</h1>
        <p className="text-[#777b86] text-sm max-w-xl font-sans">See what you and other athletes have been up to.</p>
      </motion.div>

      {/* Tab switcher */}
      <motion.div variants={item} className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-1 mb-6 max-w-sm">
        <button
          onClick={() => setTab('following')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'following' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          Following
        </button>
        <button
          onClick={() => setTab('global')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'global' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          Global
        </button>
        <button
          onClick={() => setTab('bookmarks')}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-mono transition-colors ${tab === 'bookmarks' ? 'bg-ink text-bone font-bold shadow-sm border border-line/20' : 'bg-ink-2 text-bone-dim hover:bg-ink-3 hover:text-bone'}`}
        >
          Bookmarks
        </button>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          <ActivityPostCardSkeleton />
          <ActivityPostCardSkeleton />
          <ActivityPostCardSkeleton />
        </div>
      ) : visibleFeedItems.length === 0 ? (
        <motion.div variants={item} className="text-center py-16 border border-dashed border-[#ececec] rounded-[24px] bg-[#fafafb]">
          <Users size={48} className="mx-auto text-[#979799] mb-4 opacity-50" />
          <h3 className="font-serif font-normal text-lg mb-2 text-[#17191c]">
            {tab === 'bookmarks' ? 'No Bookmarked Posts' : 'No Activity Yet'}
          </h3>
          <p className="text-sm text-[#777b86] max-w-sm mx-auto font-sans">
            {tab === 'following'
              ? 'Complete a workout or follow other athletes to see their activity here.'
              : tab === 'global'
              ? 'No public activity yet. Be the first to post a workout!'
              : 'You haven\'t bookmarked any posts yet. Save posts from the feed to view them here.'
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
