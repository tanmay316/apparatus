import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { ActivityPostCard, ActivityPostCardSkeleton } from '@/components/social/ActivityPostCard';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { getActivityById } from '@/services/social';
import type { Activity } from '@/types';

export function SinglePostPage() {
  const { id } = useParams<{ id: string }>();
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [cardioShareData, setCardioShareData] = useState<CardioShareData | null>(null);

  const { data: activity, isLoading } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => getActivityById(id!),
    enabled: !!id,
  });

  const handleShareActivity = (activity: Activity) => {
    const details = (activity.details as Record<string, any>) || {};
    const isCardio = activity.type === 'walk' || activity.type === 'run' || activity.type === 'cycle' || ['walk', 'run', 'cycle'].includes(details.activityType);
    const createdDate = activity.createdAt?.seconds
      ? new Date(activity.createdAt.seconds * 1000)
      : new Date();
      
    if (isCardio) {
      setCardioShareData({
        type: details.activityType || activity.type || 'walk',
        date: createdDate.toISOString(),
        distanceKm: details.distanceKm || 0,
        durationSec: details.durationSec || 0,
        calories: details.calories || 0,
        avgPace: details.avgPace || '0:00 /km',
        route: details.route || [],
        avgSpeedKmh: details.avgSpeedKmh,
        maxSpeedKmh: details.maxSpeedKmh,
        elevationGainM: details.elevationGainM,
      });
    } else {
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
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8 min-h-[80vh] flex flex-col">
      <div className="mb-6">
        <Link to="/feed" className="inline-flex items-center gap-1.5 text-sm font-sans font-medium text-[#777b86] hover:text-[#17191c] transition-colors">
          <ChevronLeft size={16} />
          Back to Feed
        </Link>
      </div>

      {isLoading ? (
        <ActivityPostCardSkeleton />
      ) : activity ? (
        <ActivityPostCard activity={activity} onShare={handleShareActivity} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-4">
            ?
          </div>
          <h2 className="text-xl font-serif text-[#17191c] mb-2">Post Not Found</h2>
          <p className="text-sm font-sans text-[#777b86] mb-6">This post may have been deleted or is unavailable.</p>
          <Link to="/feed" className="px-5 py-2.5 rounded-full bg-[#17191c] text-white font-sans text-xs font-medium hover:opacity-90 transition-opacity">
            Go to Feed
          </Link>
        </div>
      )}

      {/* Modals */}
      {shareData && (
        <ShareCardModal
          data={shareData}
          onClose={() => setShareData(null)}
        />
      )}

      {cardioShareData && (
        <CardioShareModal
          data={cardioShareData}
          onClose={() => setCardioShareData(null)}
        />
      )}
    </div>
  );
}
