import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Lock, ShieldAlert, FileQuestion, Users } from 'lucide-react';
import { ActivityPostCard, ActivityPostCardSkeleton } from '@/components/social/ActivityPostCard';
import { ClanPostItem } from '@/components/community/ClanPostItem';
import { SingleActivitySheet } from '@/components/social/SingleActivitySheet';
import { SinglePostSheet } from '@/components/community/SinglePostSheet';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { getActivityById } from '@/services/social';
import { getClanPostById, getClan, getClanMembership } from '@/services/community';
import { useAuthStore } from '@/stores/auth-store';
import type { Activity, CommunityPost } from '@/types';

export function SinglePostPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [cardioShareData, setCardioShareData] = useState<CardioShareData | null>(null);
  const [selectedActivityForSheet, setSelectedActivityForSheet] = useState<Activity | null>(null);
  const [selectedPostForSheet, setSelectedPostForSheet] = useState<CommunityPost | null>(null);

  // Fetch from activities collection
  const {
    data: activity,
    isLoading: loadingActivity,
  } = useQuery({
    queryKey: ['singleActivity', id],
    queryFn: () => getActivityById(id!),
    enabled: !!id,
  });

  // Fetch from community_posts collection (clan posts, challenge/event podium posts)
  const {
    data: clanPost,
    isLoading: loadingClanPost,
  } = useQuery({
    queryKey: ['singleClanPost', id],
    queryFn: () => getClanPostById(id!),
    enabled: !!id,
  });

  // If clan post found, check clan privacy & membership
  const {
    data: clanPrivacyInfo,
    isLoading: loadingClanPrivacy,
  } = useQuery({
    queryKey: ['clanPostPrivacy', clanPost?.communityId, user?.uid],
    queryFn: async () => {
      if (!clanPost?.communityId) return null;
      const clan = await getClan(clanPost.communityId);
      const isPrivateClan = clan?.visibility === 'private';
      const membership = user?.uid ? await getClanMembership(clanPost.communityId, user.uid) : null;
      const isMember = Boolean(membership && membership.status === 'active');
      return {
        clan,
        isPrivateClan,
        isMember,
        isRestricted: isPrivateClan && !isMember && clanPost.authorId !== user?.uid,
      };
    },
    enabled: !!clanPost?.communityId,
  });

  const isLoading = loadingActivity || loadingClanPost || (!!clanPost?.communityId && loadingClanPrivacy);

  // Determine privacy status
  const isPrivateActivity =
    activity &&
    (activity.visibility === 'private' || (activity as any).isPrivate) &&
    activity.userId !== user?.uid;

  const isPrivateClanPost = clanPrivacyInfo?.isRestricted;

  const handleShareActivity = (act: Activity) => {
    const details = (act.details as Record<string, any>) || {};
    const isCardio =
      act.type === 'walk' ||
      act.type === 'run' ||
      act.type === 'cycle' ||
      ['walk', 'run', 'cycle'].includes(details.activityType);
    const createdDate = act.createdAt?.seconds
      ? new Date(act.createdAt.seconds * 1000)
      : new Date();

    if (isCardio) {
      setCardioShareData({
        type: details.activityType || act.type || 'walk',
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
        dayTitle: details.dayTitle || act.summary,
        planTitle: details.planTitle || 'Workout',
        date: createdDate.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
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
      {/* Top Navigation */}
      <div className="mb-6">
        <Link
          to="/feed"
          className="inline-flex items-center gap-1.5 text-sm font-sans font-medium text-[#777b86] hover:text-[#17191c] transition-colors"
        >
          <ChevronLeft size={16} />
          Back to Feed
        </Link>
      </div>

      {isLoading ? (
        <ActivityPostCardSkeleton />
      ) : isPrivateClanPost ? (
        /* ─── STATE 1: PRIVATE CLAN POST ──────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 border border-[#ececec] rounded-[24px] bg-[#fdfbfb] shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 mb-4 shadow-sm">
            <Lock size={30} />
          </div>
          <h2 className="text-xl font-display font-black text-[#17191c] mb-2 tracking-tight">
            Private Clan Post
          </h2>
          <p className="text-sm font-sans text-[#777b86] max-w-sm mb-6 leading-relaxed">
            This post was shared inside{' '}
            <strong className="text-[#17191c]">
              {clanPrivacyInfo?.clan?.name || 'a private clan'}
            </strong>
            . You need to be a member of this clan to view its posts and discussions.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {clanPost?.communityId && (
              <button
                onClick={() => navigate(`/clan/${clanPost.communityId}`)}
                className="px-5 py-2.5 rounded-full bg-amber-600 text-white font-sans text-xs font-bold hover:bg-amber-700 transition-colors shadow-md flex items-center gap-1.5"
              >
                <Users size={14} />
                View Clan
              </button>
            )}
            <Link
              to="/feed"
              className="px-5 py-2.5 rounded-full bg-[#17191c] text-white font-sans text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Go to Feed
            </Link>
          </div>
        </div>
      ) : isPrivateActivity ? (
        /* ─── STATE 2: PRIVATE ATHLETE ACTIVITY ────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 border border-[#ececec] rounded-[24px] bg-[#fdfbfb] shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 mb-4 shadow-sm">
            <ShieldAlert size={30} />
          </div>
          <h2 className="text-xl font-display font-bold text-[#17191c] mb-2 tracking-tight">
            Private Activity
          </h2>
          <p className="text-sm font-sans text-[#777b86] max-w-sm mb-6 leading-relaxed">
            This workout activity has been marked as private by the athlete and is not available for public view.
          </p>
          <Link
            to="/feed"
            className="px-5 py-2.5 rounded-full bg-[#17191c] text-white font-sans text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Go to Feed
          </Link>
        </div>
      ) : activity ? (
        /* ─── STATE 3: ACTIVITY POST (WORKOUT / CARDIO) ───────────── */
        <div>
          <ActivityPostCard
            activity={activity}
            onShare={handleShareActivity}
            onCommentClick={() => setSelectedActivityForSheet(activity)}
          />
        </div>
      ) : clanPost ? (
        /* ─── STATE 4: CLAN POST / WINNER CELEBRATION ────────────── */
        <div>
          <ClanPostItem
            post={clanPost}
            onClick={() => setSelectedPostForSheet(clanPost)}
          />
        </div>
      ) : (
        /* ─── STATE 5: NOT FOUND / DELETED ────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-4">
            <FileQuestion size={28} />
          </div>
          <h2 className="text-xl font-display font-bold text-[#17191c] mb-2">
            Post Not Found
          </h2>
          <p className="text-sm font-sans text-[#777b86] mb-6 max-w-sm">
            This post may have been removed, deleted, or the link is invalid.
          </p>
          <Link
            to="/feed"
            className="px-5 py-2.5 rounded-full bg-[#17191c] text-white font-sans text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Go to Feed
          </Link>
        </div>
      )}

      {/* Activity Comment Modal Sheet */}
      {selectedActivityForSheet && (
        <SingleActivitySheet
          activity={selectedActivityForSheet}
          isOpen={!!selectedActivityForSheet}
          onClose={() => setSelectedActivityForSheet(null)}
        />
      )}

      {/* Clan Post Comment Modal Sheet */}
      {selectedPostForSheet && (
        <SinglePostSheet
          post={selectedPostForSheet}
          isOpen={!!selectedPostForSheet}
          onClose={() => setSelectedPostForSheet(null)}
        />
      )}

      {/* Modals */}
      {shareData && (
        <ShareCardModal data={shareData} onClose={() => setShareData(null)} />
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
