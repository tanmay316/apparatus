import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock3, Flame, Heart, MessageCircle, Share2, TrendingUp, Dumbbell,
  MoreHorizontal, Check, Bookmark, Send, ChevronDown, ChevronUp, Sparkles, Calendar as CalendarIcon
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { addComment, getComments, hasLiked, toggleLike } from '@/services/social';
import type { Activity, Comment } from '@/types';
import { calculateBodyweightReps, calculateShareVolume, getActiveMuscles } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
import { COMPACT_LIBRARY } from '@/services/library';
import { AnatomyFigureSVG } from '@/components/ui/AnatomySvg';
import { getAvatarUrl } from '@/lib/avatar';

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
}

export function ActivityPostCard({ activity, onShare }: ActivityPostCardProps) {
  const { user, profile } = useAuthStore();
  const { showToast, units, theme } = useUIStore();
  const queryClient = useQueryClient();

  const [showComments, setShowComments] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [commentText, setCommentText] = useState('');

  const bookmarks = profile?.bookmarks || [];
  const isSaved = activity.id ? bookmarks.includes(activity.id) : false;

  const details = (activity.details || {}) as Record<string, any>;
  const exerciseNames = (details.exercises || []) as string[];
  const isOwnActivity = activity.userId === user?.uid;
  const activityWeight = details.bodyweight || (isOwnActivity ? profile?.weight : undefined);

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
  const activeMuscleSet = getActiveMuscles(exerciseNames);
  const activeMuscleList = Array.from(activeMuscleSet).slice(0, 5);

  // React Query for Likes & Comments
  const { data: liked = false } = useQuery({
    queryKey: ['liked', activity.id, user?.uid],
    queryFn: () => hasLiked(activity.id!, user!.uid),
    enabled: !!activity.id && !!user,
  });

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['comments', activity.id],
    queryFn: () => getComments(activity.id!),
    enabled: !!activity.id && showComments,
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

  const commentMutation = useMutation({
    mutationFn: () => addComment(activity.id!, {
      userId: user!.uid,
      userName: profile?.displayName || user!.displayName || 'Athlete',
      userPhoto: profile?.photoURL || user!.photoURL || '',
      text: commentText.trim(),
    }),
    onSuccess: () => {
      setCommentText('');
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: () => showToast('Could not add comment', 'error'),
  });

  // Map exercise name to muscle group
  const getExerciseMuscleGroup = (name: string) => {
    const found = COMPACT_LIBRARY.find(ex => ex.name.toLowerCase() === name.toLowerCase());
    return found?.muscleGroup || 'Full Body';
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="activity-post-card relative overflow-hidden text-[#17191c] border border-[#ececec] rounded-[24px] bg-white shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_20px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.05)] p-6 mb-6"
    >
      {/* ─── SECTION 1: HEADER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${activity.username || activity.userId}`} className="shrink-0">
            <img
              src={activity.userPhoto || getAvatarUrl(activity.userName, theme)}
              alt={activity.userName}
              className="w-10 h-10 md:w-11 md:h-11 rounded-full border-2 border-[#ececec] object-cover"
              referrerPolicy="no-referrer"
            />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Link
                to={`/profile/${activity.username || activity.userId}`}
                className="font-bold text-sm hover:text-[#5d2a1a] transition-colors text-[#17191c]"
              >
                {activity.userName}
              </Link>
              {activity.username && (
                <span className="text-[11px] font-mono text-[#777b86] hidden sm:inline">@{activity.username}</span>
              )}
              {profile?.experienceLevel && (
                <span className="text-[10px] font-mono font-medium uppercase px-2.5 py-0.5 rounded-full bg-[#f2f2f3] text-[#777b86] border border-[#ececec]">
                  {profile.experienceLevel}
                </span>
              )}
            </div>
            <div className="text-[11px] font-sans font-semibold text-[#777b86] tracking-wider uppercase mt-0.5">
              {activity.type === 'event_join' ? 'REGISTERED FOR AN EVENT' : 'COMPLETED A WORKOUT'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-[#777b86]">
            {timeAgo(activity.createdAt?.seconds)}
          </span>
          <button className="p-1.5 text-[#777b86] hover:text-[#17191c] transition-colors" title="Post options">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* ─── SECTION 2: WORKOUT HERO ───────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-[20px] p-6 mb-5 bg-[#fafafb] border border-[#ececec] flex flex-col justify-between min-h-[130px]"
      >
        {activity.type === 'event_join' ? (
          <div>
            <h2 className="font-serif text-2xl text-[#17191c] mb-1">{activity.summary}</h2>
            <p className="text-sm text-[#777b86] font-sans flex items-center gap-1 mt-2">
              <CalendarIcon size={14} className="text-[#5d2a1a]" />
              Going to {details.eventTitle || 'an event'}
            </p>
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
          {activeMuscleSet.size > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 bg-white p-2 rounded-2xl border border-[#ececec]" title="Muscles Targeted">
              <AnatomyFigureSVG view="front" activeMuscles={activeMuscleSet} gender={profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male'} className="w-7 h-11" />
              <AnatomyFigureSVG view="back" activeMuscles={activeMuscleSet} gender={profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male'} className="w-7 h-11" />
            </div>
          )}
        </div>

        {/* Muscle Heatmap Text Strip */}
        {activeMuscleList.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#ececec] flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-[#777b86] flex items-center gap-1">
              <Sparkles size={12} className="text-[#979799]" /> Trained:
            </span>
            {activeMuscleList.map((m, idx) => (
              <span
                key={idx}
                className="text-xs font-sans text-[#17191c] bg-white px-2.5 py-0.5 rounded-md border border-[#ececec]"
              >
                {m.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
          </>
        )}
      </div>

      {activity.type !== 'event_join' && (
        <>
      {/* ─── SECTION 3: METRICS ROW ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {/* Duration */}
        <div className="rounded-[16px] border border-[#ececec] bg-white p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#f2f2f3] flex items-center justify-center text-[#777b86] shrink-0">
            <Clock3 size={15} />
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-[#17191c]">
              {details.durationMin || 0} min
            </div>
            <div className="font-mono text-[9px] text-[#777b86] uppercase tracking-wider">Duration</div>
          </div>
        </div>

        {/* Volume */}
        <div className="rounded-[16px] border border-[#ececec] bg-white p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#f2f2f3] flex items-center justify-center text-[#777b86] shrink-0">
            <TrendingUp size={15} />
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-[#17191c]">
              {displayVolume > 0 ? displayVolume.toLocaleString() : displayBodyweightReps > 0 ? displayBodyweightReps : '0'}
            </div>
            <div className="font-mono text-[9px] text-[#777b86] uppercase tracking-wider">
              {displayVolume > 0 ? 'kg·reps' : repsLabel}
            </div>
          </div>
        </div>

        {/* Calories */}
        <div className="rounded-[16px] border border-[#ececec] bg-white p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#f2f2f3] flex items-center justify-center text-[#777b86] shrink-0">
            <Flame size={15} />
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-[#17191c]">
              {displayCalories} kcal
            </div>
            <div className="font-mono text-[9px] text-[#777b86] uppercase tracking-wider">Burned</div>
          </div>
        </div>

        {/* Exercise count */}
        <div className="rounded-[16px] border border-[#ececec] bg-white p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#f2f2f3] flex items-center justify-center text-[#777b86] shrink-0">
            <Dumbbell size={15} />
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-[#17191c]">
              {exerciseNames.length}
            </div>
            <div className="font-mono text-[9px] text-[#777b86] uppercase tracking-wider">Exercises</div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 4: EXERCISE PREVIEW ───────────────────────────────── */}
      {exerciseNames.length > 0 && (
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
      <div className="flex items-center justify-between border-t border-[#ececec] pt-3 text-xs font-sans">
        <div className="flex items-center gap-4">
          {/* Like */}
          <motion.button
            whileTap={{ scale: 1.25 }}
            onClick={() => likeMutation.mutate()}
            className={`flex items-center gap-1.5 transition-colors ${
              liked ? 'text-red-500 font-bold' : 'text-[#777b86] hover:text-red-500'
            }`}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            <span>{activity.likesCount || 0}</span>
          </motion.button>

          {/* Comment */}
          <button
            onClick={() => setShowComments(prev => !prev)}
            className="flex items-center gap-1.5 text-[#777b86] hover:text-[#17191c] transition-colors"
          >
            <MessageCircle size={16} />
            <span>{activity.commentsCount || 0}</span>
          </button>

          {/* Share */}
          <button
            onClick={() => onShare && onShare(activity)}
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
          className={`p-1.5 rounded-lg transition-colors ${
            isSaved ? 'text-[#5d2a1a] bg-[#fbe1d1]/30' : 'text-[#777b86] hover:text-[#17191c]'
          }`}
          title="Save post"
        >
          <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Comments Drawer */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 pt-3 border-t border-[#ececec] space-y-2"
          >
            {comments.map((comment: Comment) => (
              <div key={comment.id} className="flex items-start gap-2.5 text-xs">
                <img
                  src={comment.userPhoto || getAvatarUrl(comment.userName, theme, 64)}
                  className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
                  alt=""
                />
                <div className="rounded-xl bg-[#f2f2f3] px-3 py-2 flex-1">
                  <span className="font-bold text-[#17191c]">{comment.userName}</span>
                  <p className="text-[#777b86] mt-0.5 leading-relaxed">{comment.text}</p>
                </div>
              </div>
            ))}

            {/* Comment Input */}
            <div className="flex gap-2 pt-1">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && commentText.trim()) commentMutation.mutate();
                }}
                placeholder="Say something encouraging…"
                className="flex-1 bg-[#f2f2f3] border border-[#ececec] rounded-xl px-3 py-2 text-xs text-[#17191c] outline-none focus:border-[#5d2a1a]/40 font-sans"
              />
              <button
                disabled={!commentText.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                className="px-3 py-2 rounded-xl bg-[#17191c] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** Skeleton Loader Component */
export function ActivityPostCardSkeleton() {
  return (
    <div className="rounded-[24px] border border-[#ececec] bg-white p-5 mb-4 animate-pulse">
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
