import { useState, useEffect } from 'react';
import { MessageSquare, Share2, Bookmark, Send } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { toggleLikeClanPost, getPostComments, createPostComment, type PostComment } from '@/services/community';
import { CommunityPost } from '@/types';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { getAvatarUrl } from '@/lib/avatar';
import { AnimatePresence, motion } from 'framer-motion';

const nmBtn = "bg-ink shadow-sm border border-line/20 hover:border-line/40 transition-colors";

function timeAgo(date: any): string {
  if (!date) return 'Just now';
  const millis = typeof date?.toMillis === 'function' 
    ? date.toMillis() 
    : (date?.seconds ? date.seconds * 1000 : (date instanceof Date ? date.getTime() : 0));
  
  if (!millis) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ClanPostItem({ post, onClick }: { post: CommunityPost, onClick: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');

  const { data: comments = [] } = useQuery({
    queryKey: ['clanPostComments', post.id],
    queryFn: () => getPostComments(post.id!),
    enabled: showComments && !!post.id,
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      await createPostComment({
        postId: post.id!,
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        text: commentText.trim(),
        likesCount: 0,
        likedUserIds: [],
      });
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['clanPostComments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast('Comment posted');
    },
  });

  useEffect(() => {
    setOptimisticLiked(null);
    setOptimisticCount(null);
  }, [post.id, post.likedUserIds, post.likesCount]);

  const isLiked = optimisticLiked !== null
    ? optimisticLiked
    : (post.likedUserIds?.includes(user?.uid || '') || false);
  const likesCount = optimisticCount !== null
    ? optimisticCount
    : (post.likesCount || 0);

  const bookmarks = profile?.bookmarks || [];
  const isSaved = post.id ? bookmarks.includes(post.id) : false;

  const images = post.images && post.images.length > 0
    ? post.images
    : (post.imageUrl ? [post.imageUrl] : []);

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !post.id) {
      showToast('Please log in to like posts', 'info');
      return;
    }
    const nextLiked = !isLiked;
    setOptimisticLiked(nextLiked);
    setOptimisticCount(nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1));

    try {
      await toggleLikeClanPost(post.id, user.uid);
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      setOptimisticLiked(null);
      setOptimisticCount(null);
      showToast('Could not update like', 'error');
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !post.id) return;
    try {
      const isCurrentlySaved = bookmarks.includes(post.id);
      const newBookmarks = isCurrentlySaved
        ? bookmarks.filter((id: string) => id !== post.id)
        : [...bookmarks, post.id];

      await useAuthStore.getState().updateProfile({ bookmarks: newBookmarks });
      showToast(isCurrentlySaved ? 'Removed from bookmarks' : 'Saved to bookmarks', 'info');
      queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      showToast('Could not update bookmark', 'error');
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = window.location.href;
    const shareTitle = post.title || `Post by ${post.authorName}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: post.text.slice(0, 100),
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Post link copied to clipboard!', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  return (
    <div onClick={onClick} className={`p-4 rounded-2xl ${nmBtn} mb-3 cursor-pointer hover:border-sienna/50 transition-all space-y-2.5`}>
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-ink-3 border border-line/20 flex items-center justify-center text-bone font-bold text-xs overflow-hidden shrink-0">
          {post.authorPhoto ? (
            <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" />
          ) : (
            post.authorName?.charAt(0)?.toUpperCase() || '?'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-bone text-xs sm:text-sm font-bold truncate">{post.authorName}</div>
            <div className="text-[10px] text-bone-dim px-1.5 py-0.5 rounded-full bg-ink-2 border border-line/10 truncate max-w-[120px]">
              {post.clanName}
            </div>
          </div>
          <div className="text-[10px] text-bone-dim font-mono">{timeAgo(post.createdAt)}</div>
        </div>
      </div>
      
      {/* Title */}
      {post.title && (
        <h3 className="font-display font-bold text-sm sm:text-base text-bone leading-snug">
          {post.title}
        </h3>
      )}

      {/* Body */}
      {post.text && (
        <p className="text-bone/90 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed line-clamp-3">
          {post.text}
        </p>
      )}
      
      {/* Multi-Image Display */}
      {images.length > 0 && (
        <div className={`rounded-xl overflow-hidden border border-line/10 gap-1.5 ${
          images.length === 1
            ? 'h-40 sm:h-48'
            : images.length === 2
            ? 'grid grid-cols-2 h-36'
            : images.length === 3
            ? 'grid grid-cols-2 h-40'
            : 'grid grid-cols-2 h-44'
        }`}>
          {images.slice(0, 4).map((img, idx) => (
            <div key={idx} className={`relative bg-ink-3 overflow-hidden ${images.length === 3 && idx === 0 ? 'row-span-2' : ''}`}>
              <img src={img} alt="Post attachment" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
      
      {/* Action Row */}
      <div className="flex items-center justify-between text-xs font-mono text-bone-dim border-t border-line/20 pt-2.5">
        <div className="flex items-center gap-3">
          {/* Like */}
          <button 
            onClick={handleToggleLike} 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all active:scale-95 ${
              isLiked ? 'text-red-500 font-bold bg-red-500/10' : 'hover:text-red-400'
            }`}
          >
            <AnimatedHeart isLiked={isLiked} size={16} /> 
            <span>{likesCount}</span>
          </button>

          {/* Comment */}
          <button 
            onClick={() => setShowComments(prev => !prev)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:text-bone transition-colors"
          >
            <MessageSquare size={14} /> 
            <span>{post.commentsCount || 0}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Save Bookmark */}
          <button 
            onClick={handleSave}
            className={`p-1.5 rounded-lg transition-colors ${isSaved ? 'text-sienna bg-sienna/10' : 'hover:text-bone'}`}
          >
            <Bookmark size={14} className={isSaved ? 'fill-current' : ''} />
          </button>

          {/* Share */}
          <button 
            onClick={handleShare}
            className="p-1.5 rounded-lg hover:text-bone transition-colors"
          >
            <Share2 size={14} />
          </button>
        </div>
      </div>

      {/* Comments Drawer */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 pt-3 space-y-2 border-t border-line/10"
          >
            {comments.map((comment: PostComment) => (
              <div key={comment.id} className="flex items-start gap-2.5 text-xs">
                <img
                  src={comment.userPhoto || getAvatarUrl(comment.userName, 'dark', 64)}
                  className="w-6 h-6 rounded-full shadow-[2px_2px_4px_rgba(0,0,0,0.1),-2px_-2px_4px_rgba(255,255,255,1)] object-cover shrink-0 mt-0.5"
                  alt=""
                />
                <div className="rounded-xl bg-ink-2 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05)] px-3 py-2 flex-1">
                  <span className="font-bold text-bone">{comment.userName}</span>
                  <p className="text-bone/80 mt-0.5 leading-relaxed">{comment.text}</p>
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
                placeholder="Write a comment..."
                className="flex-1 bg-ink-2 shadow-[inset_3px_3px_6px_rgba(0,0,0,0.05)] border border-line/10 rounded-xl px-3 py-2 text-xs text-bone outline-none font-sans placeholder:text-bone-dim"
              />
              <button
                disabled={!commentText.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                className="px-3 py-2 rounded-xl bg-sienna text-white shadow-[2px_2px_6px_rgba(0,0,0,0.15)] font-medium hover:bg-sienna/90 disabled:opacity-50 transition-all flex items-center justify-center shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
