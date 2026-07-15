import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Send, Clock, TrendingUp, Flame, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getFeed, getFollowing, getPublicFeed, toggleLike, hasLiked, addComment, getComments } from '@/services/social';
import type { Activity, Comment } from '@/types';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

function timeAgo(seconds: number): string {
  const now = Date.now() / 1000;
  const diff = now - seconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

// ─── Activity Card ──────────────────────────────────────
function ActivityCard({ activity }: { activity: Activity }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  
  const { data: liked = false } = useQuery({
    queryKey: ['liked', activity.id, user?.uid],
    queryFn: () => hasLiked(activity.id!, user!.uid),
    enabled: !!user && !!activity.id,
  });
  
  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ['comments', activity.id],
    queryFn: () => getComments(activity.id!),
    enabled: showComments && !!activity.id,
  });
  
  const likeMutation = useMutation({
    mutationFn: () => toggleLike(activity.id!, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liked', activity.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  
  const commentMutation = useMutation({
    mutationFn: () => addComment(activity.id!, {
      userId: user!.uid,
      userName: profile!.displayName,
      userPhoto: profile!.photoURL,
      text: commentText,
    }),
    onSuccess: () => {
      setCommentText('');
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  
  const details = activity.details as Record<string, any> || {};
  
  const profileLink = `/profile/${activity.username || activity.userId}`;
  
  return (
    <motion.div variants={item} className="card p-5">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Link to={profileLink}>
          <img
            src={activity.userPhoto || `https://ui-avatars.com/api/?name=${activity.userName}&background=4F9E8D&color=14151A&bold=true`}
            alt={activity.userName}
            className="w-10 h-10 rounded-full border border-teal flex-none object-cover"
            referrerPolicy="no-referrer"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link to={profileLink} className="font-bold text-sm hover:text-teal transition-colors">
              {activity.userName}
            </Link>
            <span className="font-mono text-[10px] text-bone-dim">
              {activity.createdAt?.seconds ? timeAgo(activity.createdAt.seconds) : ''}
            </span>
          </div>
          <div className="text-sm text-bone-dim mt-0.5">{activity.summary}</div>
        </div>
        
        {activity.type === 'workout' && (
          <div className="bg-teal/10 text-teal px-2 py-0.5 rounded font-mono text-[10px] font-bold flex-none">
            WORKOUT
          </div>
        )}
        {activity.type === 'achievement' && (
          <div className="bg-amber/10 text-amber px-2 py-0.5 rounded font-mono text-[10px] font-bold flex-none">
            ACHIEVEMENT
          </div>
        )}
        {activity.type === 'streak' && (
          <div className="bg-danger/10 text-danger px-2 py-0.5 rounded font-mono text-[10px] font-bold flex-none">
            STREAK
          </div>
        )}
      </div>
      
      {/* Workout stats */}
      {activity.type === 'workout' && details && (
        <div className="grid grid-cols-3 gap-3 p-3 bg-ink-2 rounded-lg border border-line/30 mb-4">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock size={12} className="text-teal" />
            <span className="font-mono text-bone-dim">{details.durationMin || 0} min</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <TrendingUp size={12} className="text-amber" />
            <span className="font-mono text-bone-dim">{(details.volume || 0).toLocaleString()} kg·r</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Flame size={12} className="text-danger" />
            <span className="font-mono text-bone-dim">{details.calories || 0} kcal</span>
          </div>
        </div>
      )}
      
      {/* Action bar */}
      <div className="flex items-center gap-4 pt-3 border-t border-line/30">
        <button 
          onClick={() => likeMutation.mutate()}
          className={`flex items-center gap-1.5 text-xs font-mono transition-colors ${liked ? 'text-danger' : 'text-bone-dim hover:text-danger'}`}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          <span>{activity.likesCount || 0}</span>
        </button>
        <button 
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-xs font-mono text-bone-dim hover:text-teal transition-colors"
        >
          <MessageCircle size={16} />
          <span>{activity.commentsCount || 0}</span>
        </button>
      </div>
      
      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-line/30 space-y-3">
              {comments.length === 0 && (
                <div className="text-xs text-bone-dim text-center py-2">No comments yet. Be the first!</div>
              )}
              {comments.map((c: Comment) => (
                <div key={c.id} className="flex gap-2">
                  <img
                    src={c.userPhoto || `https://ui-avatars.com/api/?name=${c.userName}&background=4F9E8D&color=14151A&bold=true&size=32`}
                    alt={c.userName}
                    className="w-6 h-6 rounded-full flex-none object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="bg-ink-2 rounded-lg px-3 py-2 flex-1">
                    <span className="text-xs font-bold">{c.userName}</span>
                    <p className="text-xs text-bone-dim mt-0.5">{c.text}</p>
                  </div>
                </div>
              ))}
              
              {/* Comment input */}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  className="input-field flex-1 text-xs py-2"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && commentText.trim()) commentMutation.mutate(); }}
                />
                <button 
                  onClick={() => { if (commentText.trim()) commentMutation.mutate(); }}
                  disabled={!commentText.trim() || commentMutation.isPending}
                  className="btn-primary py-2 px-3"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Feed Page ─────────────────────────────────────
export function FeedPage() {
  const { user, profile } = useAuthStore();
  const [tab, setTab] = useState<'following' | 'global'>('following');
  
  const { data: followingUids = [] } = useQuery({
    queryKey: ['following', user?.uid],
    queryFn: () => getFollowing(user!.uid),
    enabled: !!user,
  });
  
  const { data: feedItems = [], isLoading } = useQuery({
    queryKey: ['feed', tab, user?.uid, followingUids],
    queryFn: () => tab === 'following' 
      ? getFeed(user!.uid, followingUids) 
      : getPublicFeed(),
    enabled: !!user,
  });
  
  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="pb-5 border-b border-line mb-6">
        <div className="font-mono text-amber text-xs tracking-widest mb-1">COMMUNITY</div>
        <h1 className="font-display text-3xl mb-1">Activity Feed</h1>
        <p className="text-bone-dim text-sm max-w-xl">See what you and other athletes have been up to.</p>
      </motion.div>
      
      {/* Tab switcher */}
      <motion.div variants={item} className="flex bg-ink-2 border border-line rounded-md p-1 mb-6 max-w-xs">
        <button 
          onClick={() => setTab('following')}
          className={`flex-1 py-2 px-3 rounded text-xs font-mono transition-colors ${tab === 'following' ? 'bg-teal text-ink font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Following
        </button>
        <button 
          onClick={() => setTab('global')}
          className={`flex-1 py-2 px-3 rounded text-xs font-mono transition-colors ${tab === 'global' ? 'bg-teal text-ink font-bold' : 'text-bone-dim hover:text-bone'}`}
        >
          Global
        </button>
      </motion.div>
      
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : feedItems.length === 0 ? (
        <motion.div variants={item} className="text-center py-16 border border-dashed border-line rounded-lg">
          <Users size={48} className="mx-auto text-bone-dim mb-4 opacity-50" />
          <h3 className="font-display text-lg mb-2">No Activity Yet</h3>
          <p className="text-sm text-bone-dim max-w-sm mx-auto">
            {tab === 'following' 
              ? 'Complete a workout or follow other athletes to see their activity here.'
              : 'No public activity yet. Be the first to post a workout!'
            }
          </p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {feedItems.map(activity => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
