import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
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
  // Limit dashboard feed preview to top 5 posts
  const displayActivities = activities.slice(0, 5);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        aria-label="Activity feed"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="dx-section-title">Activity</h3>
          <Link to="/feed" className="dx-link">
            See all <ChevronRight size={14} />
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

            <Link to="/feed" className="dx-btn-secondary w-full">
              View all activity <ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="dx-card p-6 text-center">
            <div className="w-11 h-11 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--dx-card-2)' }}>
              <Users size={20} className="dx-muted" />
            </div>
            <p className="text-[14px] font-semibold">No recent activity</p>
            <p className="text-[12.5px] dx-muted mt-1 mb-4">Activity from athletes you follow shows up here.</p>
            <Link to="/explore" className="dx-btn-secondary">
              Find athletes to follow
            </Link>
          </div>
        )}
      </motion.section>

      <SinglePostSheet post={selectedPost} isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} />
      <SingleActivitySheet activity={selectedActivity} isOpen={!!selectedActivity} onClose={() => setSelectedActivity(null)} />
    </>
  );
}
