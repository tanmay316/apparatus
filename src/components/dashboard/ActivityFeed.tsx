import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import type { Activity } from '@/types';

interface ActivityFeedProps {
  activities: Activity[];
  onShare?: (activity: Activity) => void;
}

export function ActivityFeed({ activities, onShare }: ActivityFeedProps) {
  // Limit dashboard feed preview to 2 posts
  const displayActivities = activities.slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="mb-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-teal" />
          <h3 className="font-mono text-[11px] text-bone-dim tracking-[0.15em] uppercase">Activity Feed</h3>
        </div>
        <Link to="/feed" className="flex items-center gap-1 text-[10px] text-teal font-mono hover:underline tracking-wider">
          View all activity →
        </Link>
      </div>

      {displayActivities.length > 0 ? (
        <div className="space-y-4">
          {displayActivities.map((activity) => (
            <ActivityPostCard key={activity.id} activity={activity} onShare={onShare} />
          ))}

          {/* Bottom link to view full feed */}
          <div className="text-center pt-2">
            <Link
              to="/feed"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-teal/20 bg-teal/10 text-teal font-mono text-xs font-semibold hover:bg-teal/20 transition-all"
            >
              View all activity <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] p-8 text-center" style={{ background: 'rgba(17,21,34,0.5)' }}>
          <Users size={24} className="text-bone-dim/40 mx-auto mb-2" />
          <p className="text-xs text-bone-dim mb-3">No recent activity from followed athletes.</p>
          <Link
            to="/explore"
            className="inline-flex items-center gap-1 text-[11px] text-teal font-mono hover:underline"
          >
            Find athletes to follow →
          </Link>
        </div>
      )}
    </motion.div>
  );
}
