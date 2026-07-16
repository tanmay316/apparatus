import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock3, Flame, Heart, MessageCircle, Send, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { addComment, getComments, hasLiked, toggleLike } from '@/services/social';
import type { Activity, Comment } from '@/types';
import { calculateBodyweightReps, calculateShareVolume } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';

function timeAgo(seconds?: number): string {
  if (!seconds) return 'just now';
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function FollowerActivityCard({ activity }: { activity: Activity }) {
  const { user, profile } = useAuthStore();
  const { showToast, units } = useUIStore();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [commentText, setCommentText] = useState('');
  const details = (activity.details || {}) as Record<string, any>;
  const exerciseNames = (details.exercises || []) as string[];

  const isOwnActivity = activity.userId === user?.uid;
  const activityWeight = details.bodyweight || (isOwnActivity ? profile?.weight : undefined);

  const displayVolume = Array.isArray(details.exerciseLogs)
    ? calculateShareVolume(details.exerciseLogs, activityWeight || 70)
    : Number(details.volume || 0);
  const displayBodyweightReps = Array.isArray(details.exerciseLogs) ? calculateBodyweightReps(details.exerciseLogs) : 0;

  const displayWeight = activityWeight ? (units === 'imperial' ? Math.round(activityWeight * 2.20462) : activityWeight) : null;
  const displayWeightUnit = units === 'imperial' ? 'lb' : 'kg';
  const repsLabel = displayWeight ? 'reps @ BW' : 'BW reps';

  const displayCalories = Array.isArray(details.exerciseLogs) && details.exerciseLogs.length > 0
    ? calculateWorkoutCalories(null, details.exerciseLogs as any, activityWeight || 70, details.durationMin)
    : Number(details.calories || 0);
  const { data: liked = false } = useQuery({ queryKey: ['liked', activity.id, user?.uid], queryFn: () => hasLiked(activity.id!, user!.uid), enabled: !!activity.id && !!user });
  const { data: comments = [], refetch: refetchComments } = useQuery({ queryKey: ['comments', activity.id], queryFn: () => getComments(activity.id!), enabled: !!activity.id && showComments });
  const likeMutation = useMutation({ mutationFn: () => toggleLike(activity.id!, user!.uid), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['liked', activity.id] }); queryClient.invalidateQueries({ queryKey: ['feed'] }); }, onError: () => showToast('Could not update like', 'error') });
  const commentMutation = useMutation({
    mutationFn: () => addComment(activity.id!, { userId: user!.uid, userName: profile?.displayName || user!.displayName || 'Athlete', userPhoto: profile?.photoURL || user!.photoURL || '', text: commentText.trim() }),
    onSuccess: () => { setCommentText(''); refetchComments(); queryClient.invalidateQueries({ queryKey: ['feed'] }); },
    onError: () => showToast('Could not add comment', 'error'),
  });

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line/70 bg-gradient-to-br from-ink-2 via-ink-2 to-teal/5 p-4 shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-teal/40">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-teal/10 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <Link to={`/profile/${activity.username || activity.userId}`} className="shrink-0"><img src={activity.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(activity.userName)}&background=4F9E8D&color=14151A&bold=true`} alt={activity.userName} className="h-11 w-11 rounded-full border-2 border-teal/60 object-cover" referrerPolicy="no-referrer" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><div><Link to={`/profile/${activity.username || activity.userId}`} className="font-semibold hover:text-teal">{activity.userName}</Link><div className="text-[10px] font-mono uppercase tracking-wider text-teal">completed a workout</div></div><span className="shrink-0 text-[10px] font-mono text-bone-dim">{timeAgo(activity.createdAt?.seconds)}</span></div>
          <h4 className="mt-3 text-base font-semibold leading-snug text-bone">{details.dayTitle || activity.summary}</h4>
          <p className="mt-1 text-xs text-bone-dim">{details.planTitle || 'Personal session'}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/50 bg-ink/60 p-2.5"><Clock3 size={13} className="mb-1 text-teal" /><div className="font-mono text-xs">{details.durationMin || 0}<span className="ml-1 text-[10px] text-bone-dim">min</span></div></div>
            <div className="rounded-xl border border-line/50 bg-ink/60 p-2.5"><TrendingUp size={13} className="mb-1 text-amber" /><div className="font-mono text-xs">{displayVolume > 0 ? displayVolume.toLocaleString() : displayBodyweightReps > 0 ? displayBodyweightReps : '0'}<span className="ml-1 text-[10px] text-bone-dim">{displayVolume > 0 ? 'kg·r' : repsLabel}</span></div></div>
            <div className="rounded-xl border border-line/50 bg-ink/60 p-2.5"><Flame size={13} className="mb-1 text-danger" /><div className="font-mono text-xs">{displayCalories}<span className="ml-1 text-[10px] text-bone-dim">kcal</span></div></div>
          </div>
          {exerciseNames.length > 0 && <div className="mt-3 space-y-1.5"><div className="grid grid-cols-1 gap-1.5">{(showAllExercises ? exerciseNames : exerciseNames.slice(0, 5)).map((name, index) => <div key={`${name}-${index}`} className="flex items-center gap-2 rounded-lg border border-line/40 bg-ink/45 px-2.5 py-2 text-xs"><span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal/10 font-mono text-[10px] text-teal">{String(index + 1).padStart(2, '0')}</span><span className="truncate text-bone">{name}</span><span className="ml-auto shrink-0 text-[10px] font-mono text-bone-dim">completed</span></div>)}</div>{exerciseNames.length > 5 && <button onClick={() => setShowAllExercises(value => !value)} className="text-[10px] font-mono font-bold uppercase tracking-wider text-teal hover:underline">{showAllExercises ? 'Show less' : `Show ${exerciseNames.length - 5} more exercises`}</button>}</div>}
          <div className="mt-4 flex items-center gap-4 border-t border-line/50 pt-3"><button onClick={() => likeMutation.mutate()} className={`inline-flex items-center gap-1.5 text-xs font-mono transition-colors ${liked ? 'text-danger' : 'text-bone-dim hover:text-danger'}`}><Heart size={15} fill={liked ? 'currentColor' : 'none'} />{activity.likesCount || 0}</button><button onClick={() => setShowComments(value => !value)} className="inline-flex items-center gap-1.5 text-xs font-mono text-bone-dim hover:text-teal"><MessageCircle size={15} />{activity.commentsCount || 0}</button></div>
          {showComments && <div className="mt-3 space-y-2 border-t border-line/40 pt-3">{comments.map((comment: Comment) => <div key={comment.id} className="flex gap-2"><img src={comment.userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.userName)}`} className="h-6 w-6 rounded-full object-cover" alt="" /><div className="rounded-xl bg-ink/70 px-3 py-2 text-xs"><b>{comment.userName}</b><p className="mt-0.5 text-bone-dim">{comment.text}</p></div></div>)}<div className="flex gap-2"><input value={commentText} onChange={event => setCommentText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && commentText.trim()) commentMutation.mutate(); }} placeholder="Say something encouraging…" className="input-field flex-1 py-2 text-xs" /><button disabled={!commentText.trim() || commentMutation.isPending} onClick={() => commentMutation.mutate()} className="btn-primary px-3"><Send size={14} /></button></div></div>}
        </div>
      </div>
    </article>
  );
}
