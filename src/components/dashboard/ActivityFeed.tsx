import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import { ClanPostItem } from '@/components/community/ClanPostItem';
import { SinglePostSheet } from '@/components/community/SinglePostSheet';
import { SingleActivitySheet } from '@/components/social/SingleActivitySheet';
import type { FeedItem } from '@/services/social';
import type { Activity, CommunityPost } from '@/types';

interface ActivityFeedProps {
  activities: FeedItem[];
  onShare?: (activity: Activity) => void;
}

export function ActivityFeed({ activities, onShare }: ActivityFeedProps) {
  // Limit dashboard feed preview to 2 posts
  const displayActivities = activities.slice(0, 2);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="mb-3"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-[#979799]" />
            <h3 className="font-sans text-xs font-medium text-[#777b86] tracking-wider uppercase">Activity Feed</h3>
          </div>
          <Link to="/feed" className="flex items-center gap-1 text-xs text-[#17191c] font-sans font-medium hover:underline">
            View all activity →
          </Link>
        </div>

        {displayActivities.length > 0 ? (
          <div className="space-y-3">
            {displayActivities.map((item) => {
              if ('feedType' in item && item.feedType === 'clan_post') {
                return <ClanPostItem key={item.id} post={item as any} onClick={() => setSelectedPost(item as any)} />;
              }
              return (
                <ActivityPostCard
                  key={item.id}
                  activity={item as any}
                  onShare={onShare}
                  onCommentClick={() => setSelectedActivity(item as any)}
                />
              );
            })}

            {/* Bottom link to view full feed */}
            <div className="text-center pt-2">
              <Link
                to="/feed"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#17191c] text-white font-sans text-xs font-medium hover:opacity-90 transition-all"
              >
                View all activity <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#ececec] p-4 text-center bg-[#fafafb]">
            <Users size={24} className="text-[#979799] mx-auto mb-2" />
            <p className="text-xs text-[#777b86] mb-3 font-sans">No recent activity from followed athletes.</p>
            <Link
              to="/explore"
              className="inline-flex items-center gap-1 text-xs text-[#17191c] font-sans font-medium hover:underline"
            >
              Find athletes to follow →
            </Link>
          </div>
        )}
      </motion.div>

      <SinglePostSheet post={selectedPost} isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} />
      <SingleActivitySheet activity={selectedActivity} isOpen={!!selectedActivity} onClose={() => setSelectedActivity(null)} />
    </>
  );
}
