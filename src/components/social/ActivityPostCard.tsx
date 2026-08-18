import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock3, Flame, Heart, MessageSquare, Share2, TrendingUp, Dumbbell,
  MoreHorizontal, Check, Bookmark, Send, ChevronDown, ChevronUp, Sparkles, Calendar as CalendarIcon,
  Zap, Bike, Footprints, Trophy
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { addComment, getComments, hasLiked, toggleLike, deleteActivity } from '@/services/social';
import type { Activity, Comment } from '@/types';
import { calculateBodyweightReps, calculateShareVolume, getActiveMuscleScores } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
import { COMPACT_LIBRARY } from '@/services/library';
import { AnatomyFigureSVG } from '@/components/ui/AnatomySvg';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { getAvatarUrl } from '@/lib/avatar';
import { RouteMap } from '@/components/cardio/RouteMap';
import { CelebrationPodiumCard } from '@/components/community/CelebrationPodiumCard';
import { getAppShareUrl, shareContent } from '@/lib/share';

function timeAgo(seconds?: number): string {
  if (!seconds) return 'just now';
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface ActivityPostCardProps {
  activity: Activity;
  onShare?: (activity: Activity) => void;
  onDelete?: (activityId: string) => void;
  onCommentClick?: () => void;
  hideCommentsToggle?: boolean;
  isEmbedded?: boolean;
}

export function ActivityPostCard({ activity, onShare, onDelete, onCommentClick, hideCommentsToggle, isEmbedded }: ActivityPostCardProps) {
  const { user, profile } = useAuthStore();
  const { showToast, confirm, units, theme, hiddenPosts, hidePost, unhidePost } = useUIStore();
  const queryClient = useQueryClient();

  const [isDeleted, setIsDeleted] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const bookmarks = profile?.bookmarks || [];
  const isSaved = activity.id ? bookmarks.includes(activity.id) : false;

  const details = (activity.details || {}) as Record<string, any>;
  const exerciseNames = (details.exercises || []) as string[];
  const isOwnActivity = activity.userId === user?.uid;
  const activityWeight = details.bodyweight || (isOwnActivity ? profile?.weight : undefined);

  // Detect competition celebration post
  const isCelebration =
    activity.type === 'achievement' ||
    Boolean(details.challengeId) ||
    Boolean(details.eventId) ||
    Boolean(activity.summary?.includes('Concluded')) ||
    (typeof details.text === 'string' && (details.text.includes('🥇') || details.text.includes('🏆')));

  // Stats calculation
  const displayVolume = Array.isArray(details.exerciseLogs)
    ? calculateShareVolume(details.exerciseLogs, activityWeight || 70)
    : Number(details.volume || 0);
  const displayBodyweightReps = Array.isArray(details.exerciseLogs) ? calculateBodyweightReps(details.exerciseLogs) : 0;
  const repsLabel = activityWeight ? `reps @ BW` : 'BW reps';

  const displayCalories = Array.isArray(details.exerciseLogs) && details.exerciseLogs.length > 0
    ? calculateWorkoutCalories(null, details.exerciseLogs as any, activityWeight || 70, details.durationMin)
    : Number(details.calories || 0);

  // Active muscle heatmap regions
  const activeMuscles = getActiveMuscleScores(exerciseNames);
  const activeMuscleList = activeMuscles.map(s => s.muscle).slice(0, 5);
  
  const isCardio = activity.type === 'walk' || activity.type === 'run' || activity.type === 'cycle' || ['walk', 'run', 'cycle'].includes(details.activityType) || (details.distanceKm !== undefined && !details.exercises && !details.exerciseLogs);

  // React Query for Likes & Comments
  const { data: liked = false } = useQuery({
    queryKey: ['liked', activity.id, user?.uid],
    queryFn: () => hasLiked(activity.id!, user!.uid),
    enabled: !!activity.id && !!user,
  });

  // Like Mutation with optimistic update
  const likeMutation = useMutation({
    mutationFn: () => toggleLike(activity.id!, user!.uid),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['liked', activity.id, user?.uid] });
      const previousLiked = queryClient.getQueryData(['liked', activity.id, user?.uid]);
      queryClient.setQueryData(['liked', activity.id, user?.uid], (old: boolean) => !old);
      return { previousLiked };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liked', activity.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (_err, _newVal, context) => {
      queryClient.setQueryData(['liked', activity.id, user?.uid], context?.previousLiked);
      showToast('Could not update like', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteActivity(activity.id!),
    onSuccess: () => {
      setIsDeleted(true);
      showToast('Post deleted', 'success');
      if (activity.id) onDelete?.(activity.id);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['userWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
    onError: () => showToast('Could not delete post', 'error'),
  });

  if (isDeleted) {
    return null;
  }

  // Map exercise name to muscle group
  const getExerciseMuscleGroup = (name: string) => {
    const found = COMPACT_LIBRARY.find(ex => ex.name.toLowerCase() === name.toLowerCase());
    return found?.muscleGroup || 'Full Body';
  };

  if (activity.id && hiddenPosts?.includes(activity.id)) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-center justify-between p-4 mb-4 sm:mb-6 rounded-[24px] bg-[#fdfbfb] border border-[#ececec] text-sm shadow-sm"
      >
        <span className="text-[#777b86] font-medium font-sans">Post hidden</span>
        <button onClick={() => unhidePost(activity.id!)} className="text-[#5d2a1a] font-bold font-sans hover:underline">Undo</button>
      </motion.div>
    );
  }

  return (
    <motion.article
      initial={isEmbedded ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={isEmbedded ? undefined : { y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="activity-post-card relative text-[#17191c] border border-[#ececec] rounded-[24px] bg-[#fdfbfb] shadow-[8px_8px_20px_rgba(0,0,0,0.06),-8px_-8px_20px_rgba(255,255,255,0.8)] p-3.5 sm:p-5 md:p-6 mb-4 sm:mb-6"
    >
      {/* ─── SECTION 1: HEADER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5 relative z-20">
        <div className="flex items-start md:items-center gap-2.5 sm:gap-3 min-w-0">
          <Link to={`/profile/${activity.username || activity.userId}`} className="shrink-0 mt-0.5 md:mt-0">
            <img
              src={activity.userPhoto || getAvatarUrl(activity.userName, theme)}
              alt={activity.userName}
              className="w-10 h-10 md:w-11 md:h-11 rounded-full shadow-[3px_3px_6px_rgba(0,0,0,0.1),-3px_-3px_6px_rgba(255,255,255,1)] object-cover"
              referrerPolicy="no-referrer"
            />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <Link
                to={`/profile/${activity.username || activity.userId}`}
                className="font-bold text-sm hover:text-[#5d2a1a] transition-colors text-[#17191c] truncate max-w-[120px] sm:max-w-[180px]"
              >
                {activity.userName}
              </Link>
              {activity.username && (
                <span className="text-[11px] font-mono text-[#777b86] hidden sm:inline truncate max-w-[80px]">@{activity.username}</span>
              )}
              {isCelebration ? (
                <span className="text-[9px] md:text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30 shrink-0">
                  Arena Official
                </span>
              ) : profile?.experienceLevel && isOwnActivity ? (
                <span className="text-[9px] md:text-[10px] font-mono font-medium uppercase px-2 py-0.5 rounded-full bg-[#fdfbfb] text-[#777b86] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] shrink-0">
                  {profile.experienceLevel}
                </span>
              ) : null}
            </div>
            <div className="text-[10px] md:text-[11px] font-sans font-semibold text-[#777b86] tracking-wider uppercase mt-0.5 md:mt-1 leading-snug flex items-center gap-1">
              {isCelebration ? (
                <>
                  <Trophy size={11} className="text-amber-600 shrink-0" />
                  <span>{details.eventId ? 'EVENT PODIUM' : 'CHALLENGE PODIUM'}</span>
                </>
              ) : activity.type === 'event_join' ? (
                'REGISTERED FOR AN EVENT'
              ) : isCardio ? (
                'COMPLETED A CARDIO SESSION'
              ) : (
                'COMPLETED A WORKOUT'
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <span className="text-[9px] md:text-xs font-mono text-[#777b86] whitespace-nowrap">
            {timeAgo(activity.createdAt?.seconds)}
          </span>
          <div className="relative">
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="p-1.5 text-[#777b86] hover:text-[#17191c] transition-colors rounded-full hover:bg-gray-100" 
              title="Post options"
            >
              <MoreHorizontal size={18} />
            </button>

            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden"
                >
                  <button 
                    onClick={async () => {
                      const res = await shareContent({
                        title: activity.summary || 'Apparatus Activity Post',
                        url: getAppShareUrl(`/post/${activity.id}`),
                        dialogTitle: 'Share Activity Post'
                      });
                      if (res.method === 'clipboard') {
                        showToast('Link copied to clipboard', 'success');
                      }
                      setShowOptions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-[#17191c] hover:bg-gray-50 flex items-center gap-2"
                  >
                    Copy Link
                  </button>
                  {isOwnActivity ? (
                    <button 
                      onClick={async () => {
                        setShowOptions(false);
                        const ok = await confirm({
                          title: 'Delete Workout Post',
                          message: 'Are you sure you want to delete this workout post? This cannot be undone.',
                          confirmText: 'Delete',
                          type: 'danger',
                          icon: 'trash',
                        });
                        if (ok) {
                          deleteMutation.mutate();
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete Post'}
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => {
                          if (activity.id) hidePost(activity.id);
                          showToast('Post hidden');
                          setShowOptions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-[#17191c] hover:bg-gray-50 flex items-center gap-2"
                      >
                        Hide Post
                      </button>
                      <button 
                        onClick={() => {
                          showToast('Post reported to moderators');
                          setShowOptions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        Report
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: WORKOUT / ACHIEVEMENT HERO ─────────────────────── */}
      {isCelebration ? (
        <div className="mb-4 sm:mb-5">
          <CelebrationPodiumCard
            title={activity.summary || (details.title as string) || (details.challengeTitle as string)}
            rawText={(details.text as string) || activity.summary}
            winners={(details.winners as any)}
            sourceType={details.eventId ? 'event' : 'challenge'}
          />
        </div>
      ) : (
        <div
          className="relative overflow-hidden rounded-[20px] p-4 sm:p-6 mb-4 sm:mb-5 bg-[#fdfbfb] shadow-[inset_3px_3px_8px_rgba(0,0,0,0.05),inset_-3px_-3px_8px_rgba(255,255,255,1)] flex flex-col justify-between min-h-[130px]"
        >
          {activity.type === 'event_join' ? (
            <div>
              <h2 className="font-serif text-2xl text-[#17191c] mb-1">{activity.summary}</h2>
              <p className="text-sm text-[#777b86] font-sans flex items-center gap-1 mt-2">
                <CalendarIcon size={14} className="text-[#5d2a1a]" />
                Going to {details.eventTitle || 'an event'}
              </p>
            </div>
          ) : isCardio ? (
            <div className="relative w-full h-[150px] rounded-xl overflow-hidden mt-1 shadow-md">
              {details.route && details.route.length > 0 ? (
                <div className="w-full h-full pointer-events-none">
                  <RouteMap 
                    route={details.route} 
                    theme={theme === 'dark' ? 'dark' : 'light'} 
                    height="150px" 
                    cardioType={activity.type as any}
                  />
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg">
                     {activity.type === 'run' ? <Zap size={32} /> : activity.type === 'cycle' ? <Bike size={32} /> : <Footprints size={32} />}
                  </div>
                </div>
              )}
              
              {/* Overlay Info */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-4 z-10">
                <div className="text-[10px] font-sans font-bold text-white/90 uppercase tracking-widest mb-0.5">
                  {activity.type}
                </div>
                <h3 className="font-serif font-bold text-2xl text-white leading-tight">
                  {details.distanceKm ? `${details.distanceKm.toFixed(2)} km` : 'Cardio'}
                </h3>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs font-sans font-medium text-[#5d2a1a]">
                      {details.planTitle || 'Custom Program'}
                    </span>
                    {details.skill && (
                      <span className="text-xs font-mono text-[#777b86]">
                        · Skill: {details.skill}
                      </span>
                    )}
                  </div>

                  <h3 className="font-serif font-normal text-2xl text-[#17191c] leading-tight">
                    {details.dayTitle || activity.summary}
                  </h3>
                </div>

                {/* Small size Anatomy figure beside workout day title */}
                {activeMuscles.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0 bg-[#fdfbfb] p-2 rounded-2xl shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)]" title="Muscles Targeted">
                    <AnatomyFigureSVG view="front" activeMuscles={activeMuscles} gender={profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male'} className="w-7 h-11" />
                    <AnatomyFigureSVG view="back" activeMuscles={activeMuscles} gender={profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male'} className="w-7 h-11" />
                  </div>
                )}
              </div>

              {/* Muscle Heatmap Text Strip */}
              {activeMuscleList.length > 0 && (
                <div className="mt-4 pt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-semibold text-[#777b86] flex items-center gap-1">
                    <Sparkles size={12} className="text-[#979799]" /> Trained:
                  </span>
                  {activeMuscleList.map((m, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-sans text-[#17191c] bg-[#fdfbfb] px-2.5 py-0.5 rounded-md shadow-[2px_2px_5px_rgba(0,0,0,0.05),-2px_-2px_5px_rgba(255,255,255,1)]"
                    >
                      {m.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activity.type !== 'event_join' && !isCelebration && (
        <>
          {/* ─── SECTION 3: METRICS ROW ────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {/* Duration */}
            <div className="rounded-[16px] bg-[#fdfbfb] shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)] p-1.5 sm:p-3 flex items-center gap-1.5 sm:gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#fdfbfb] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] flex items-center justify-center text-[#777b86] shrink-0">
                <Clock3 size={13} className="sm:w-[15px] sm:h-[15px]" />
              </div>
              <div className="flex-1 min-w-0" style={{ containerType: 'inline-size' }}>
                <div className="font-mono font-bold text-[#17191c] leading-tight truncate" style={{ fontSize: 'clamp(10px, 14cqw, 14px)' }}>
                  {isCardio ? Math.floor((details.durationSec || 0) / 60) : (details.durationMin || 0)} min
                </div>
                <div className="font-mono text-[#777b86] uppercase tracking-wider leading-tight mt-0.5 truncate" style={{ fontSize: 'clamp(8px, 9cqw, 10px)' }}>Duration</div>
              </div>
            </div>

            {/* Calories */}
            <div className="rounded-[16px] bg-[#fdfbfb] shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)] p-1.5 sm:p-3 flex items-center gap-1.5 sm:gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#fdfbfb] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] flex items-center justify-center text-[#777b86] shrink-0">
                <Flame size={13} className="sm:w-[15px] sm:h-[15px]" />
              </div>
              <div className="flex-1 min-w-0" style={{ containerType: 'inline-size' }}>
                <div className="font-mono font-bold text-[#17191c] leading-tight truncate" style={{ fontSize: 'clamp(10px, 14cqw, 14px)' }}>
                  {isCardio ? details.calories : displayCalories} kcal
                </div>
                <div className="font-mono text-[#777b86] uppercase tracking-wider leading-tight mt-0.5 truncate" style={{ fontSize: 'clamp(8px, 9cqw, 10px)' }}>Burned</div>
              </div>
            </div>

            {isCardio ? (
              <>
                {/* Distance */}
                <div className="rounded-[16px] bg-[#fdfbfb] shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)] p-1.5 sm:p-3 flex items-center gap-1.5 sm:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#fdfbfb] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] flex items-center justify-center text-[#777b86] shrink-0">
                    <TrendingUp size={13} className="sm:w-[15px] sm:h-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0" style={{ containerType: 'inline-size' }}>
                    <div className="font-mono font-bold text-[#17191c] leading-tight truncate" style={{ fontSize: 'clamp(10px, 14cqw, 14px)' }}>
                      {details.distanceKm?.toFixed(2)}
                    </div>
                    <div className="font-mono text-[#777b86] uppercase tracking-wider leading-tight mt-0.5 truncate" style={{ fontSize: 'clamp(8px, 9cqw, 10px)' }}>km</div>
                  </div>
                </div>
                {/* Pace */}
                <div className="rounded-[16px] bg-[#fdfbfb] shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)] p-1.5 sm:p-3 flex items-center gap-1.5 sm:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#fdfbfb] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] flex items-center justify-center text-[#777b86] shrink-0">
                    <Zap size={13} className="sm:w-[15px] sm:h-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0" style={{ containerType: 'inline-size' }}>
                    <div className="font-mono font-bold text-[#17191c] leading-tight truncate" style={{ fontSize: 'clamp(10px, 14cqw, 14px)' }}>
                      {details.avgPace?.replace(' /km', '')}
                    </div>
                    <div className="font-mono text-[#777b86] uppercase tracking-wider leading-tight mt-0.5 truncate" style={{ fontSize: 'clamp(8px, 9cqw, 10px)' }}>/km</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Volume */}
                <div className="rounded-[16px] bg-[#fdfbfb] shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)] p-1.5 sm:p-3 flex items-center gap-1.5 sm:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#fdfbfb] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] flex items-center justify-center text-[#777b86] shrink-0">
                    <TrendingUp size={13} className="sm:w-[15px] sm:h-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0" style={{ containerType: 'inline-size' }}>
                    <div className="font-mono font-bold text-[#17191c] leading-tight truncate" style={{ fontSize: 'clamp(10px, 14cqw, 14px)' }}>
                      {displayVolume > 0 ? displayVolume.toLocaleString() : displayBodyweightReps > 0 ? displayBodyweightReps : '0'}
                    </div>
                    <div className="font-mono text-[#777b86] uppercase tracking-wider leading-tight mt-0.5 truncate" style={{ fontSize: 'clamp(8px, 9cqw, 10px)' }}>
                      {displayVolume > 0 ? 'kg·reps' : repsLabel}
                    </div>
                  </div>
                </div>

                {/* Exercise count */}
                <div className="rounded-[16px] bg-[#fdfbfb] shadow-[3px_3px_8px_rgba(0,0,0,0.05),-3px_-3px_8px_rgba(255,255,255,1)] p-1.5 sm:p-3 flex items-center gap-1.5 sm:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#fdfbfb] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] flex items-center justify-center text-[#777b86] shrink-0">
                    <Dumbbell size={13} className="sm:w-[15px] sm:h-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0" style={{ containerType: 'inline-size' }}>
                    <div className="font-mono font-bold text-[#17191c] leading-tight truncate" style={{ fontSize: 'clamp(10px, 14cqw, 14px)' }}>
                      {exerciseNames.length}
                    </div>
                    <div className="font-mono text-[#777b86] uppercase tracking-wider leading-tight mt-0.5 truncate" style={{ fontSize: 'clamp(8px, 9cqw, 10px)' }}>Exercises</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ─── SECTION 4: EXERCISE PREVIEW ───────────────────────────────── */}
          {!isCardio && exerciseNames.length > 0 && (
            <div className="mb-4">
              {/* Default collapsed preview (shows first 2) */}
              {!showAllExercises && (
                <div className="space-y-2">
                  {exerciseNames.slice(0, 2).map((name, index) => (
                    <div
                      key={`${name}-${index}`}
                      className="flex items-center justify-between py-1.5 px-3 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-4 h-4 rounded-full bg-[#e8f5e9] text-[#2e7d32] flex items-center justify-center shrink-0">
                          <Check size={10} />
                        </span>
                        <span className="truncate text-[#17191c] font-medium">{name}</span>
                      </div>
                      <span className="text-[11px] text-[#777b86] shrink-0 ml-2">
                        {getExerciseMuscleGroup(name)}
                      </span>
                    </div>
                  ))}

                  {exerciseNames.length > 2 && (
                    <button
                      onClick={() => setShowAllExercises(true)}
                      className="w-full py-2 text-center text-xs font-sans text-[#17191c] hover:underline flex items-center justify-center gap-1"
                    >
                      Show all {exerciseNames.length} exercises <ChevronDown size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Expanded 2-column exercise grid */}
              <AnimatePresence>
                {showAllExercises && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {exerciseNames.map((name, index) => (
                        <div
                          key={`${name}-${index}`}
                          className="flex items-center justify-between p-2 rounded-xl border border-white/[0.04] bg-white/[0.02] text-xs font-mono"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-4 h-4 rounded-full bg-[#e8f5e9] text-[#2e7d32] flex items-center justify-center shrink-0">
                              <Check size={10} />
                            </span>
                            <span className="truncate text-[#17191c]">{name}</span>
                          </div>
                          <span className="text-[10px] text-[#777b86] shrink-0 ml-2">
                            {getExerciseMuscleGroup(name)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowAllExercises(false)}
                      className="w-full mt-2 py-1.5 text-center text-[11px] font-sans text-[#17191c] hover:underline flex items-center justify-center gap-1"
                    >
                      Show less <ChevronUp size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>)}

      {/* ─── SECTION 5: SOCIAL ACTIONS ─────────────────────────────────── */}
      <div className="flex items-center justify-between mt-4 pt-4 text-xs font-sans">
        <div className="flex items-center gap-4">
          {/* Like */}
          <motion.button
            whileTap={{ scale: 1.25 }}
            onClick={() => !likeMutation.isPending && likeMutation.mutate()}
            disabled={likeMutation.isPending}
            className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-red-500 font-bold' : 'text-[#777b86] hover:text-red-500'} ${likeMutation.isPending ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <AnimatedHeart isLiked={liked} size={18} />
            <span>{activity.likesCount || 0}</span>
          </motion.button>

          {/* Comment */}
          {!hideCommentsToggle && (
            <button
              onClick={() => {
                if (onCommentClick) {
                  onCommentClick();
                }
              }}
              className="flex items-center gap-1.5 text-[#777b86] hover:text-[#17191c] transition-colors"
            >
              <MessageSquare size={16} />
              <span>{activity.commentsCount || 0}</span>
            </button>
          )}

          {/* Share */}
          <button
            onClick={async () => {
              if (isCelebration) {
                const res = await shareContent({
                  title: activity.summary || 'Competition Podium - Apparatus',
                  text: details.text || 'Check out the competition champions on Apparatus!',
                  url: getAppShareUrl(`/post/${activity.id}`),
                  dialogTitle: 'Share Podium Results'
                });
                if (res.method === 'clipboard') {
                  showToast('Podium link copied to clipboard!', 'success');
                }
              } else if (onShare) {
                onShare(activity);
              } else {
                const res = await shareContent({
                  title: activity.summary || 'Workout on Apparatus',
                  url: getAppShareUrl(`/post/${activity.id}`),
                });
                if (res.method === 'clipboard') {
                  showToast('Post link copied to clipboard!', 'success');
                }
              }
            }}
            className="flex items-center gap-1.5 text-[#777b86] hover:text-[#17191c] transition-colors"
          >
            <Share2 size={15} />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>

        {/* Save Bookmark */}
        <button
          onClick={async () => {
            if (!profile || !activity.id) return;
            try {
              const isCurrentlySaved = bookmarks.includes(activity.id);
              const newBookmarks = isCurrentlySaved
                ? bookmarks.filter((id: string) => id !== activity.id)
                : [...bookmarks, activity.id];

              await useAuthStore.getState().updateProfile({ bookmarks: newBookmarks });
              showToast(isCurrentlySaved ? 'Removed from bookmarks' : 'Saved to bookmarks', 'info');
              queryClient.invalidateQueries({ queryKey: ['feed'] });
            } catch (err) {
              showToast('Could not save bookmark', 'error');
            }
          }}
          className={`p-1.5 rounded-lg transition-colors ${isSaved ? 'text-[#5d2a1a] bg-[#fbe1d1]/30' : 'text-[#777b86] hover:text-[#17191c]'
            }`}
          title="Save post"
        >
          <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </motion.article>
  );
}

/** Skeleton Loader Component */
export function ActivityPostCardSkeleton() {
  return (
    <div className="rounded-[24px] border border-[#ececec] bg-[#fdfbfb] shadow-[8px_8px_20px_rgba(0,0,0,0.06),-8px_-8px_20px_rgba(255,255,255,0.8)] p-5 mb-4 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-[#f2f2f3]" />
        <div className="space-y-2 flex-1">
          <div className="w-32 h-3 bg-[#f2f2f3] rounded" />
          <div className="w-20 h-2 bg-[#f2f2f3] rounded" />
        </div>
      </div>
      <div className="h-28 rounded-xl bg-[#f2f2f3] mb-4" />
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
      </div>
    </div>
  );
}
