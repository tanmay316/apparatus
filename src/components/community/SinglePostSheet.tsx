import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, MessageSquare, CornerDownRight, Trash2, Bookmark,
  Share2, ThumbsUp, ThumbsDown, Send, CornerDownLeft, Check,
  ChevronDown, ChevronUp, Loader2, Sparkles
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPostComments, createPostComment, deleteClanPost,
  toggleLikeClanPost, toggleLikePostComment, toggleDislikePostComment, deletePostComment
} from '@/services/community';
import { CommunityPost, PostComment } from '@/types';
import { useNavigate } from 'react-router-dom';

interface SinglePostSheetProps {
  post: CommunityPost | null;
  isOpen: boolean;
  onClose: () => void;
}

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

export function SinglePostSheet({ post, isOpen, onClose }: SinglePostSheetProps) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; userName: string; userId: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen]);

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ['postComments', post?.id],
    queryFn: () => getPostComments(post!.id!),
    enabled: !!post && isOpen,
  });

  // Check if post is liked by current user
  const isPostLiked = useMemo(() => {
    if (!post || !user) return false;
    return (post.likedUserIds || []).includes(user.uid);
  }, [post?.likedUserIds, user?.uid]);

  // Check if post is bookmarked by current user
  const bookmarks = profile?.bookmarks || [];
  const isPostSaved = post?.id ? bookmarks.includes(post.id) : false;

  // Images to display (multi-image support + backward compatibility)
  const postImages = useMemo(() => {
    if (!post) return [];
    if (post.images && post.images.length > 0) return post.images;
    if (post.imageUrl) return [post.imageUrl];
    return [];
  }, [post?.images, post?.imageUrl]);

  // Like Post Mutation
  const likePostMutation = useMutation({
    mutationFn: async () => {
      if (!user || !post?.id) return;
      await toggleLikeClanPost(post.id, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    },
    onError: () => {
      showToast('Could not update like', 'error');
    }
  });

  // Bookmark / Save Post Mutation
  const handleToggleBookmark = async () => {
    if (!user || !post?.id) return;
    try {
      const isCurrentlySaved = bookmarks.includes(post.id);
      const newBookmarks = isCurrentlySaved
        ? bookmarks.filter((id: string) => id !== post.id)
        : [...bookmarks, post.id];

      await useAuthStore.getState().updateProfile({ bookmarks: newBookmarks });
      showToast(isCurrentlySaved ? 'Removed from bookmarks' : 'Saved to bookmarks', 'info');
      queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
    } catch {
      showToast('Could not update bookmark', 'error');
    }
  };

  // Share Post Handler
  const handleShare = async () => {
    if (!post) return;
    const shareUrl = window.location.href;
    const shareTitle = post.title || `Post by ${post.authorName}`;
    const shareText = post.text.slice(0, 100);

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
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

  // Delete Post Mutation
  const deletePostMutation = useMutation({
    mutationFn: async () => {
      if (!post?.id) return;
      if (window.confirm('Are you sure you want to permanently delete this post and its attachments?')) {
        await deleteClanPost(post.id);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
        showToast('Post deleted successfully');
        onClose();
      }
    },
    onError: (err: any) => showToast(err?.message || 'Failed to delete post', 'error')
  });

  // Create Comment Mutation
  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !commentText.trim() || !post?.id) return;
      await createPostComment({
        postId: post.id,
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        text: commentText.trim(),
        parentId: replyingTo?.commentId || null,
        replyToUserId: replyingTo?.userId || undefined,
        replyToUserName: replyingTo?.userName || undefined,
      });
    },
    onSuccess: () => {
      setCommentText('');
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to post comment', 'error')
  });

  // Like Comment Mutation
  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) return;
      await toggleLikePostComment(commentId, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
    }
  });

  // Dislike Comment Mutation
  const dislikeCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) return;
      await toggleDislikePostComment(commentId, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
    }
  });

  // Delete Comment Mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!post?.id) return;
      if (window.confirm('Delete this comment?')) {
        await deletePostComment(commentId, post.id);
        return true;
      }
      return false;
    },
    onSuccess: (didDelete) => {
      if (didDelete) {
        queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
        queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
        showToast('Comment deleted');
      }
    }
  });

  const handleStartReply = (c: PostComment) => {
    setReplyingTo({
      commentId: c.parentId || c.id!, // Thread under root if already in a thread
      userName: c.userName,
      userId: c.userId,
    });
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 50);
  };

  // Group comments into root comments & child replies (Twitter / X threading)
  const { rootComments, replyMap } = useMemo(() => {
    const roots: PostComment[] = [];
    const map = new Map<string, PostComment[]>();

    comments.forEach(c => {
      if (!c.parentId) {
        roots.push(c);
      } else {
        const existing = map.get(c.parentId) || [];
        existing.push(c);
        map.set(c.parentId, existing);
      }
    });

    return { rootComments: roots, replyMap: map };
  }, [comments]);

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || commentMutation.isPending) return;
    commentMutation.mutate();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && post && (
        <div className="fixed inset-0 z-[600] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="bg-ink w-full max-w-2xl h-[92vh] sm:h-[88vh] rounded-t-[32px] sm:rounded-[32px] relative z-10 flex flex-col shadow-2xl overflow-hidden border-t sm:border border-line/20"
          >
            {/* Mobile Drag Bar */}
            <div className="w-12 h-1.5 bg-line/40 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line/20 bg-ink/90 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-sienna/20 border border-sienna/40 flex items-center justify-center text-sienna font-bold text-xs">
                  {post.authorName?.charAt(0)?.toUpperCase() || 'P'}
                </div>
                <div>
                  <h2 className="text-base font-bold text-bone leading-tight">Post</h2>
                  <span className="text-[11px] text-bone-dim font-mono">{timeAgo(post.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(isAdmin || user?.uid === post.authorId) && (
                  <button
                    onClick={() => deletePostMutation.mutate()}
                    disabled={deletePostMutation.isPending}
                    className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-mono flex items-center gap-1.5 border border-red-500/20"
                    title="Delete Post"
                  >
                    <Trash2 size={15} />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 bg-ink-2 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body Scroll Area */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
              {/* Main Post Card */}
              <div className="bg-ink-2/80 rounded-3xl p-5 border border-line/20 shadow-sm space-y-4">
                {/* Author Info */}
                <div className="flex items-center justify-between">
                  <div
                    onClick={() => {
                      if (post.authorId === user?.uid) navigate('/profile');
                      else navigate(`/profile/${post.authorId}`);
                      onClose();
                    }}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <div className="w-11 h-11 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-base overflow-hidden group-hover:border-sienna/50 transition-colors">
                      {post.authorPhoto ? (
                        <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" />
                      ) : (
                        post.authorName?.charAt(0)?.toUpperCase() || '?'
                      )}
                    </div>
                    <div>
                      <div className="text-bone font-bold text-sm sm:text-base group-hover:text-sienna transition-colors">
                        {post.authorName}
                      </div>
                      <div className="text-xs text-bone-dim font-mono">{timeAgo(post.createdAt)}</div>
                    </div>
                  </div>
                </div>

                {/* Post Title */}
                {post.title && (
                  <h1 className="text-lg sm:text-xl font-bold font-display text-bone leading-snug tracking-tight">
                    {post.title}
                  </h1>
                )}

                {/* Post Body */}
                {post.text && (
                  <p className="text-bone/90 text-sm sm:text-base whitespace-pre-wrap leading-relaxed">
                    {post.text}
                  </p>
                )}

                {/* Post Images Grid (Twitter / X Style) */}
                {postImages.length > 0 && (
                  <div
                    className={`rounded-2xl overflow-hidden border border-line/20 gap-2 ${
                      postImages.length === 1
                        ? 'flex'
                        : postImages.length === 2
                        ? 'grid grid-cols-2 aspect-[16/9]'
                        : postImages.length === 3
                        ? 'grid grid-cols-2 aspect-[16/9]'
                        : 'grid grid-cols-2 aspect-square'
                    }`}
                  >
                    {postImages.map((img, idx) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewImage(img)}
                        className={`relative bg-ink-3 overflow-hidden cursor-pointer group ${
                          postImages.length === 3 && idx === 0 ? 'row-span-2' : ''
                        }`}
                      >
                        <img
                          src={img}
                          alt="Post attachment"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 max-h-[480px]"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Bar (Like, Comment, Save, Share) */}
                <div className="flex items-center justify-between pt-3 border-t border-line/20 text-xs font-mono text-bone-dim">
                  {/* Like Button */}
                  <button
                    onClick={() => likePostMutation.mutate()}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${
                      isPostLiked
                        ? 'text-red-500 bg-red-500/10 font-bold'
                        : 'hover:text-red-400 hover:bg-red-500/5'
                    }`}
                  >
                    <Heart size={16} className={isPostLiked ? 'fill-current' : ''} />
                    <span>{post.likesCount || 0}</span>
                  </button>

                  {/* Comment Focus Button */}
                  <button
                    onClick={() => commentInputRef.current?.focus()}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:text-bone hover:bg-ink-3 transition-colors"
                  >
                    <MessageSquare size={16} />
                    <span>{post.commentsCount || 0}</span>
                  </button>

                  {/* Bookmark Button */}
                  <button
                    onClick={handleToggleBookmark}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors ${
                      isPostSaved
                        ? 'text-sienna bg-sienna/10 font-bold'
                        : 'hover:text-sienna hover:bg-sienna/5'
                    }`}
                    title={isPostSaved ? 'Saved' : 'Save Bookmark'}
                  >
                    <Bookmark size={16} className={isPostSaved ? 'fill-current' : ''} />
                    <span className="hidden sm:inline">{isPostSaved ? 'Saved' : 'Save'}</span>
                  </button>

                  {/* Share Button */}
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:text-blue-400 hover:bg-blue-500/5 transition-colors"
                    title="Share Post"
                  >
                    <Share2 size={16} />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </div>
              </div>

              {/* Twitter (X)-Style Threaded Comments */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-bone-dim">
                    Replies ({comments.length})
                  </h3>
                </div>

                {loadingComments ? (
                  <div className="text-center py-10 text-bone-dim flex items-center justify-center gap-2 font-mono text-sm">
                    <Loader2 size={18} className="animate-spin text-sienna" />
                    <span>Loading replies...</span>
                  </div>
                ) : rootComments.length === 0 ? (
                  <div className="text-center py-12 bg-ink-2/40 rounded-3xl border border-dashed border-line/20">
                    <MessageSquare size={36} className="mx-auto mb-2 text-bone-dim/40" />
                    <p className="text-sm text-bone-dim">No replies yet.</p>
                    <p className="text-xs text-bone-dim/60 mt-1">Be the first to join the conversation!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rootComments.map(rootComment => {
                      const replies = replyMap.get(rootComment.id!) || [];
                      const isRootLiked = (rootComment.likedUserIds || []).includes(user?.uid || '');
                      const isRootDisliked = (rootComment.dislikedUserIds || []).includes(user?.uid || '');

                      return (
                        <div key={rootComment.id} className="relative group">
                          {/* Root Comment Container */}
                          <div className="flex gap-3 relative">
                            {/* Thread Line Connector */}
                            {replies.length > 0 && (
                              <div className="absolute left-4 top-10 bottom-0 w-[2px] bg-line/30 rounded-full z-0" />
                            )}

                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-ink-3 border border-line/20 flex items-center justify-center text-bone font-bold text-xs shrink-0 overflow-hidden z-10">
                              {rootComment.userPhoto ? (
                                <img src={rootComment.userPhoto} alt={rootComment.userName} className="w-full h-full object-cover" />
                              ) : (
                                rootComment.userName?.charAt(0)?.toUpperCase() || '?'
                              )}
                            </div>

                            {/* Comment Card */}
                            <div className="flex-1 bg-ink-2/60 border border-line/20 rounded-2xl p-3.5 shadow-sm space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-bone">{rootComment.userName}</span>
                                  <span className="text-[10px] text-bone-dim font-mono">{timeAgo(rootComment.createdAt)}</span>
                                </div>

                                {(isAdmin || user?.uid === rootComment.userId) && (
                                  <button
                                    onClick={() => deleteCommentMutation.mutate(rootComment.id!)}
                                    className="text-bone-dim hover:text-red-400 p-1 transition-colors"
                                    title="Delete comment"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>

                              <p className="text-xs sm:text-sm text-bone/90 leading-relaxed whitespace-pre-wrap">
                                {rootComment.text}
                              </p>

                              {/* Comment Action Row */}
                              <div className="flex items-center gap-4 pt-1.5 border-t border-line/10 text-[11px] font-mono text-bone-dim">
                                {/* Like */}
                                <button
                                  onClick={() => likeCommentMutation.mutate(rootComment.id!)}
                                  className={`flex items-center gap-1 hover:text-sienna transition-colors ${
                                    isRootLiked ? 'text-sienna font-bold' : ''
                                  }`}
                                >
                                  <ThumbsUp size={13} className={isRootLiked ? 'fill-current' : ''} />
                                  <span>{rootComment.likesCount || 0}</span>
                                </button>

                                {/* Dislike */}
                                <button
                                  onClick={() => dislikeCommentMutation.mutate(rootComment.id!)}
                                  className={`flex items-center gap-1 hover:text-red-400 transition-colors ${
                                    isRootDisliked ? 'text-red-400 font-bold' : ''
                                  }`}
                                >
                                  <ThumbsDown size={13} className={isRootDisliked ? 'fill-current' : ''} />
                                  <span>{rootComment.dislikesCount || 0}</span>
                                </button>

                                {/* Reply */}
                                <button
                                  onClick={() => handleStartReply(rootComment)}
                                  className="flex items-center gap-1 hover:text-bone text-bone-dim transition-colors ml-auto"
                                >
                                  <CornerDownLeft size={13} />
                                  <span>Reply</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Nested Replies (X / Twitter Style) */}
                          {replies.length > 0 && (
                            <div className="ml-5 sm:ml-7 mt-2 space-y-2 border-l-2 border-line/30 pl-4 py-1">
                              {replies.map(reply => {
                                const isReplyLiked = (reply.likedUserIds || []).includes(user?.uid || '');
                                const isReplyDisliked = (reply.dislikedUserIds || []).includes(user?.uid || '');

                                return (
                                  <div key={reply.id} className="flex gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-ink-3 border border-line/20 flex items-center justify-center text-bone font-bold text-[10px] shrink-0 overflow-hidden">
                                      {reply.userPhoto ? (
                                        <img src={reply.userPhoto} alt={reply.userName} className="w-full h-full object-cover" />
                                      ) : (
                                        reply.userName?.charAt(0)?.toUpperCase() || '?'
                                      )}
                                    </div>

                                    <div className="flex-1 bg-ink-2/40 border border-line/20 rounded-2xl p-3 shadow-sm space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-bone">{reply.userName}</span>
                                          {reply.replyToUserName && (
                                            <span className="text-[10px] text-sienna font-mono">
                                              @{reply.replyToUserName}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-bone-dim font-mono">{timeAgo(reply.createdAt)}</span>
                                        </div>

                                        {(isAdmin || user?.uid === reply.userId) && (
                                          <button
                                            onClick={() => deleteCommentMutation.mutate(reply.id!)}
                                            className="text-bone-dim hover:text-red-400 p-1 transition-colors"
                                            title="Delete reply"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>

                                      <p className="text-xs sm:text-sm text-bone/90 leading-relaxed whitespace-pre-wrap">
                                        {reply.text}
                                      </p>

                                      <div className="flex items-center gap-4 pt-1 border-t border-line/10 text-[11px] font-mono text-bone-dim">
                                        <button
                                          onClick={() => likeCommentMutation.mutate(reply.id!)}
                                          className={`flex items-center gap-1 hover:text-sienna transition-colors ${
                                            isReplyLiked ? 'text-sienna font-bold' : ''
                                          }`}
                                        >
                                          <ThumbsUp size={12} className={isReplyLiked ? 'fill-current' : ''} />
                                          <span>{reply.likesCount || 0}</span>
                                        </button>

                                        <button
                                          onClick={() => dislikeCommentMutation.mutate(reply.id!)}
                                          className={`flex items-center gap-1 hover:text-red-400 transition-colors ${
                                            isReplyDisliked ? 'text-red-400 font-bold' : ''
                                          }`}
                                        >
                                          <ThumbsDown size={12} className={isReplyDisliked ? 'fill-current' : ''} />
                                          <span>{reply.dislikesCount || 0}</span>
                                        </button>

                                        <button
                                          onClick={() => handleStartReply(reply)}
                                          className="flex items-center gap-1 hover:text-bone text-bone-dim transition-colors ml-auto"
                                        >
                                          <CornerDownLeft size={12} />
                                          <span>Reply</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Sticky Comment Composer */}
            <div className="p-3.5 sm:p-4 bg-ink/95 border-t border-line/20 sticky bottom-0 z-20 backdrop-blur-md space-y-2">
              {/* Replying To Banner */}
              {replyingTo && (
                <div className="flex items-center justify-between bg-sienna/10 border border-sienna/30 px-3 py-1.5 rounded-xl text-xs">
                  <div className="flex items-center gap-1.5 text-sienna font-mono">
                    <CornerDownLeft size={13} />
                    <span>Replying to <strong className="text-bone">@{replyingTo.userName}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-sienna/20 rounded-full text-sienna transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Composer Form */}
              <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-xs shrink-0 overflow-hidden">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Me" className="w-full h-full object-cover" />
                  ) : (
                    user?.displayName?.charAt(0)?.toUpperCase() || 'U'
                  )}
                </div>

                <input
                  ref={commentInputRef}
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={replyingTo ? `Reply to @${replyingTo.userName}...` : 'Post your reply...'}
                  className="flex-1 bg-ink-2 border border-line/20 rounded-xl px-4 py-2.5 text-sm text-bone placeholder:text-bone-dim/40 focus:outline-none focus:border-sienna transition-colors shadow-inner"
                />

                <button
                  type="submit"
                  disabled={!commentText.trim() || commentMutation.isPending}
                  className="bg-sienna text-bg px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 flex items-center gap-1.5 hover:bg-sienna/90 shadow-md shadow-sienna/20 transition-all shrink-0"
                >
                  {commentMutation.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                  <span className="hidden sm:inline">Reply</span>
                </button>
              </form>
            </div>
          </motion.div>

          {/* Full Screen Image Preview Lightbox */}
          {previewImage && (
            <div
              onClick={() => setPreviewImage(null)}
              className="fixed inset-0 z-[700] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
            >
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-5 right-5 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <X size={24} />
              </button>
              <img
                src={previewImage}
                alt="Enlarged preview"
                className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
              />
            </div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
