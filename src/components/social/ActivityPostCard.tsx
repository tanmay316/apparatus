import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock3, Flame, Heart, MessageCircle, Share2, TrendingUp, Dumbbell,
  MoreHorizontal, Check, Bookmark, Send, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { addComment, getComments, hasLiked, toggleLike } from '@/services/social';
import type { Activity, Comment } from '@/types';
import { calculateBodyweightReps, calculateShareVolume, getActiveMuscles } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
import { COMPACT_LIBRARY } from '@/services/library';
import { AnatomyFigureSVG } from '@/components/ui/AnatomySvg';

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
  const { showToast, units } = useUIStore();
  const queryClient = useQueryClient();

  const [showComments, setShowComments] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [commentText, setCommentText] = useState('');

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
      whileHover={{ y: -4, scale: 1.005 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] dark:border-white/[0.06] light:border-gray-200 bg-[#121826] dark:bg-[#121826] light:bg-white text-[#F7F5F0] dark:text-[#F7F5F0] light:text-gray-900 shadow-xl shadow-black/20 light:shadow-gray-200/50 p-4 sm:p-5 transition-all mb-4"
    >
      {/* Soft background glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#4F9E8D]/10 blur-3xl pointer-events-none" />

      {/* ─── SECTION 1: HEADER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${activity.username || activity.userId}`} className="shrink-0">
            <img
              src={activity.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(activity.userName)}&background=4F9E8D&color=14151A&bold=true`}
              alt={activity.userName}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-[#4F9E8D]/50 object-cover"
              referrerPolicy="no-referrer"
            />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Link
                to={`/profile/${activity.username || activity.userId}`}
                className="font-semibold text-sm hover:text-[#4F9E8D] transition-colors text-bone dark:text-bone light:text-gray-900"
              >
                {activity.userName}
              </Link>
              {activity.username && (
                <span className="text-[11px] font-mono text-[#8B92A5] hidden sm:inline">@{activity.username}</span>
              )}
              {profile?.experienceLevel && (
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#4F9E8D]/10 border border-[#4F9E8D]/20 text-[#4F9E8D]">
                  {profile.experienceLevel}
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-[#4F9E8D] tracking-wide uppercase mt-0.5">
              Completed a workout
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] sm:text-xs font-mono text-[#8B92A5]">
            {timeAgo(activity.createdAt?.seconds)}
          </span>
          <button className="p-1 text-[#8B92A5] hover:text-bone transition-colors" title="Post options">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* ─── SECTION 2: WORKOUT HERO ───────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-xl p-4 sm:p-5 mb-4 border border-white/[0.06] dark:border-white/[0.06] light:border-gray-200 flex flex-col justify-between min-h-[140px]"
        style={{
          background: 'linear-gradient(135deg, rgba(79,158,141,0.12) 0%, rgba(18,24,38,0.95) 50%, rgba(217,164,65,0.06) 100%)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D9A441]/10 border border-[#D9A441]/20 text-[#D9A441]">
                {details.planTitle || 'Custom Program'}
              </span>
              {details.skill && (
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#4F9E8D]/10 border border-[#4F9E8D]/20 text-[#4F9E8D]">
                  Skill — {details.skill}
                </span>
              )}
            </div>

            <h3 className="font-display text-xl sm:text-2xl text-bone dark:text-bone light:text-gray-900 leading-snug">
              {details.dayTitle || activity.summary}
            </h3>
          </div>

          {/* Small size Anatomy figure beside workout day title */}
          {activeMuscleSet.size > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 bg-black/40 p-1.5 rounded-xl border border-white/[0.08]" title="Muscles Targeted">
              <AnatomyFigureSVG view="front" activeMuscles={activeMuscleSet} className="w-7 h-11" />
              <AnatomyFigureSVG view="back" activeMuscles={activeMuscleSet} className="w-7 h-11" />
            </div>
          )}
        </div>

        {/* Muscle Heatmap Text Strip */}
        {activeMuscleList.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-[#8B92A5] flex items-center gap-1">
              <Sparkles size={11} className="text-[#4F9E8D]" /> Trained:
            </span>
            {activeMuscleList.map((m, idx) => (
              <span
                key={idx}
                className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#4F9E8D]/15 border border-[#4F9E8D]/30 text-[#4F9E8D]"
              >
                {m.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─── SECTION 3: METRICS ROW ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {/* Duration */}
        <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-gray-200 bg-white/[0.03] dark:bg-white/[0.03] light:bg-gray-50 p-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#4F9E8D]/10 flex items-center justify-center text-[#4F9E8D] shrink-0">
            <Clock3 size={15} />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-bone dark:text-bone light:text-gray-900">
              {details.durationMin || 0} min
            </div>
            <div className="font-mono text-[9px] text-[#8B92A5] uppercase">Duration</div>
          </div>
        </div>

        {/* Volume */}
        <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-gray-200 bg-white/[0.03] dark:bg-white/[0.03] light:bg-gray-50 p-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#D9A441]/10 flex items-center justify-center text-[#D9A441] shrink-0">
            <TrendingUp size={15} />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-bone dark:text-bone light:text-gray-900">
              {displayVolume > 0 ? displayVolume.toLocaleString() : displayBodyweightReps > 0 ? displayBodyweightReps : '0'}
            </div>
            <div className="font-mono text-[9px] text-[#8B92A5] uppercase">
              {displayVolume > 0 ? 'kg·reps' : repsLabel}
            </div>
          </div>
        </div>

        {/* Calories */}
        <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-gray-200 bg-white/[0.03] dark:bg-white/[0.03] light:bg-gray-50 p-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#B5504A]/10 flex items-center justify-center text-[#B5504A] shrink-0">
            <Flame size={15} />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-bone dark:text-bone light:text-gray-900">
              {displayCalories} kcal
            </div>
            <div className="font-mono text-[9px] text-[#8B92A5] uppercase">Burned</div>
          </div>
        </div>

        {/* Exercise count */}
        <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-gray-200 bg-white/[0.03] dark:bg-white/[0.03] light:bg-gray-50 p-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#4F9E8D]/10 flex items-center justify-center text-[#4F9E8D] shrink-0">
            <Dumbbell size={15} />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-bone dark:text-bone light:text-gray-900">
              {exerciseNames.length}
            </div>
            <div className="font-mono text-[9px] text-[#8B92A5] uppercase">Exercises</div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 4: EXERCISE PREVIEW ───────────────────────────────── */}
      {exerciseNames.length > 0 && (
        <div className="mb-4">
          {/* Default collapsed preview (shows first 2) */}
          {!showAllExercises && (
            <div className="space-y-1.5">
              {exerciseNames.slice(0, 2).map((name, index) => (
                <div
                  key={`${name}-${index}`}
                  className="flex items-center justify-between p-2 rounded-xl border border-white/[0.04] bg-white/[0.02] text-xs font-mono"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-4 h-4 rounded-full bg-[#46C37B]/10 text-[#46C37B] flex items-center justify-center shrink-0">
                      <Check size={10} />
                    </span>
                    <span className="truncate text-bone dark:text-bone light:text-gray-900">{name}</span>
                  </div>
                  <span className="text-[10px] text-[#8B92A5] shrink-0 ml-2">
                    {getExerciseMuscleGroup(name)}
                  </span>
                </div>
              ))}

              {exerciseNames.length > 2 && (
                <button
                  onClick={() => setShowAllExercises(true)}
                  className="w-full py-1.5 text-center text-[11px] font-mono text-[#4F9E8D] hover:underline flex items-center justify-center gap-1"
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
                        <span className="w-4 h-4 rounded-full bg-[#46C37B]/10 text-[#46C37B] flex items-center justify-center shrink-0">
                          <Check size={10} />
                        </span>
                        <span className="truncate text-bone dark:text-bone light:text-gray-900">{name}</span>
                      </div>
                      <span className="text-[10px] text-[#8B92A5] shrink-0 ml-2">
                        {getExerciseMuscleGroup(name)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowAllExercises(false)}
                  className="w-full mt-2 py-1.5 text-center text-[11px] font-mono text-[#4F9E8D] hover:underline flex items-center justify-center gap-1"
                >
                  Show less <ChevronUp size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── SECTION 5: SOCIAL ACTIONS ─────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs font-mono">
        <div className="flex items-center gap-4">
          {/* Like */}
          <motion.button
            whileTap={{ scale: 1.25 }}
            onClick={() => likeMutation.mutate()}
            className={`flex items-center gap-1.5 transition-colors ${
              liked ? 'text-[#B5504A] font-bold' : 'text-[#8B92A5] hover:text-[#B5504A]'
            }`}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            <span>{activity.likesCount || 0}</span>
          </motion.button>

          {/* Comment */}
          <button
            onClick={() => setShowComments(prev => !prev)}
            className="flex items-center gap-1.5 text-[#8B92A5] hover:text-[#4F9E8D] transition-colors"
          >
            <MessageCircle size={16} />
            <span>{activity.commentsCount || 0}</span>
          </button>

          {/* Share */}
          <button
            onClick={() => onShare && onShare(activity)}
            className="flex items-center gap-1.5 text-[#8B92A5] hover:text-[#4F9E8D] transition-colors"
          >
            <Share2 size={15} />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>

        {/* Save Bookmark */}
        <button
          onClick={() => {
            setIsSaved(!isSaved);
            showToast(isSaved ? 'Unsaved post' : 'Saved to bookmarks', 'info');
          }}
          className={`p-1.5 rounded-lg transition-colors ${
            isSaved ? 'text-[#D9A441] bg-[#D9A441]/10' : 'text-[#8B92A5] hover:text-bone'
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
            className="mt-3 pt-3 border-t border-white/[0.04] space-y-2"
          >
            {comments.map((comment: Comment) => (
              <div key={comment.id} className="flex items-start gap-2.5 text-xs">
                <img
                  src={comment.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`}
                  className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
                  alt=""
                />
                <div className="rounded-xl bg-white/[0.03] px-3 py-2 flex-1">
                  <span className="font-bold text-bone dark:text-bone light:text-gray-900">{comment.userName}</span>
                  <p className="text-[#8B92A5] mt-0.5 leading-relaxed">{comment.text}</p>
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
                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-bone outline-none focus:border-[#4F9E8D]/40 font-mono"
              />
              <button
                disabled={!commentText.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                className="px-3 py-2 rounded-xl bg-[#4F9E8D] text-[#14151A] font-bold hover:bg-[#5FB09E] disabled:opacity-50 transition-all flex items-center justify-center shrink-0"
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
    <div className="rounded-2xl border border-white/[0.06] bg-[#121826] p-5 mb-4 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="space-y-2 flex-1">
          <div className="w-32 h-3 bg-white/10 rounded" />
          <div className="w-20 h-2 bg-white/10 rounded" />
        </div>
      </div>
      <div className="h-28 rounded-xl bg-white/5 mb-4" />
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="h-10 rounded-xl bg-white/5" />
        <div className="h-10 rounded-xl bg-white/5" />
        <div className="h-10 rounded-xl bg-white/5" />
        <div className="h-10 rounded-xl bg-white/5" />
      </div>
    </div>
  );
}
