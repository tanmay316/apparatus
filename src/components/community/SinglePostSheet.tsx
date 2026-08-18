import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, MessageSquare, Trash2, Bookmark,
  Share2, ThumbsUp, ThumbsDown, Send, CornerDownLeft, CornerDownRight, Loader2, ImagePlus, Sparkles, Edit3
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPostComments, createPostComment, deleteClanPost,
  toggleLikeClanPost, toggleLikePostComment, toggleDislikePostComment, deletePostComment
} from '@/services/community';
import { compressImageFile } from '@/utils/image-compression';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { CommunityPost, PostComment } from '@/types';
import { useNavigate } from 'react-router-dom';
import { CelebrationPodiumCard } from './CelebrationPodiumCard';
import { EditPostSheet } from './EditPostSheet';
import { ClanPollCard } from './ClanPollCard';
import { getAppShareUrl, shareContent } from '@/lib/share';

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
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; userName: string; userId: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const commentImageInputRef = useRef<HTMLInputElement>(null);
  
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const [isEditing, setIsEditing] = useState(false);
  const [currentPost, setCurrentPost] = useState<CommunityPost | null>(post);

  useEffect(() => {
    setCurrentPost(post);
  }, [post]);

  const activePost = currentPost || post;

  // Optimistic Live Post Likes & Bookmark States
  const [localLiked, setLocalLiked] = useState<boolean>(false);
  const [localLikesCount, setLocalLikesCount] = useState<number>(0);
  const [localSaved, setLocalSaved] = useState<boolean>(false);

  const bookmarks = profile?.bookmarks || [];

  useEffect(() => {
    if (activePost) {
      setLocalLiked((activePost.likedUserIds || []).includes(user?.uid || ''));
      setLocalLikesCount(activePost.likesCount || 0);
      setLocalSaved(bookmarks.includes(activePost.id || ''));
    }
  }, [activePost?.id, activePost?.likedUserIds, activePost?.likesCount, bookmarks, user?.uid]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen]);

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ['postComments', activePost?.id],
    queryFn: () => getPostComments(activePost!.id!),
    enabled: !!activePost && isOpen,
  });

  // Images to display (multi-image support + backward compatibility)
  const postImages = useMemo(() => {
    if (!activePost) return [];
    if (activePost.images && activePost.images.length > 0) return activePost.images;
    if (activePost.imageUrl) return [activePost.imageUrl];
    return [];
  }, [activePost?.images, activePost?.imageUrl]);

  // Like Post Handler with 0ms Instant Optimistic Feedback
  const handleTogglePostLike = async () => {
    if (!user || !post?.id) {
      showToast('Please log in to like posts', 'info');
      return;
    }
    const nextLiked = !localLiked;
    setLocalLiked(nextLiked);
    setLocalLikesCount(prev => nextLiked ? prev + 1 : Math.max(0, prev - 1));

    try {
      await toggleLikeClanPost(post.id, user.uid);
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    } catch {
      setLocalLiked(!nextLiked);
      setLocalLikesCount(prev => !nextLiked ? prev + 1 : Math.max(0, prev - 1));
      showToast('Could not update like', 'error');
    }
  };

  // Bookmark / Save Post Handler
  const handleToggleBookmark = async () => {
    if (!user || !post?.id) return;
    try {
      const nextSaved = !localSaved;
      setLocalSaved(nextSaved);

      const newBookmarks = nextSaved
        ? [...bookmarks.filter((id: string) => id !== post.id), post.id]
        : bookmarks.filter((id: string) => id !== post.id);

      await useAuthStore.getState().updateProfile({ bookmarks: newBookmarks });
      showToast(nextSaved ? 'Saved to bookmarks' : 'Removed from bookmarks', 'info');
      queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
    } catch {
      setLocalSaved(prev => !prev);
      showToast('Could not update bookmark', 'error');
    }
  };

  // Share Post Handler
  const handleShare = async () => {
    if (!post) return;
    const shareUrl = getAppShareUrl(`/post/${post.id}`);
    const shareTitle = post.title || `Post by ${post.authorName}`;
    const shareText = post.text.slice(0, 120);

    const res = await shareContent({
      title: shareTitle,
      text: shareText,
      url: shareUrl,
      dialogTitle: 'Share Post',
    });

    if (res.method === 'clipboard') {
      showToast('Post link copied to clipboard!', 'success');
    }
  };

  // Delete Post with custom Confirmation Modal & Storage cleanup
  const handleDeletePost = async () => {
    if (!post?.id) return;
    const confirmed = await confirm({
      title: 'Delete Post',
      message: 'Are you sure you want to permanently delete this post and all its images? This cannot be undone.',
      confirmText: 'Delete Post',
      cancelText: 'Cancel',
      type: 'danger',
      icon: 'trash',
    });
    if (!confirmed) return;

    try {
      await deleteClanPost(post.id);
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast('Post deleted successfully');
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete post', 'error');
    }
  };

  // Create Comment Mutation
  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || (!commentText.trim() && commentImages.length === 0) || !post?.id) return;
      await createPostComment({
        postId: post.id,
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        text: commentText.trim(),
        images: commentImages.length > 0 ? commentImages : undefined,
        parentId: replyingTo?.commentId || null,
        replyToUserId: replyingTo?.userId || undefined,
        replyToUserName: replyingTo?.userName || undefined,
      });
    },
    onSuccess: () => {
      setCommentText('');
      setCommentImages([]);
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to post comment', 'error')
  });

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (commentImages.length + files.length > 4) {
      showToast('Maximum 4 images allowed per comment', 'error');
      return;
    }

    setIsProcessingImage(true);
    try {
      const processed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 25 * 1024 * 1024) {
          showToast(`File ${file.name} is too large (>25MB).`, 'error');
          continue;
        }
        const compressed = await compressImageFile(file, 800, 800, 0.6);
        processed.push(compressed);
      }
      setCommentImages(prev => [...prev, ...processed].slice(0, 4));
    } catch (err: any) {
      showToast('Failed to process image', 'error');
    } finally {
      setIsProcessingImage(false);
      if (commentImageInputRef.current) commentImageInputRef.current.value = '';
    }
  };

  const removeCommentImage = (index: number) => {
    setCommentImages(prev => prev.filter((_, i) => i !== index));
  };

  // Like Comment Handler with 0ms Instant Optimistic Feedback
  const handleToggleCommentLike = async (comment: PostComment) => {
    if (!user || !comment.id) return;

    queryClient.setQueryData(['postComments', post?.id], (old: PostComment[] = []) => {
      return old.map(c => {
        if (c.id !== comment.id) return c;
        const likedUserIds = c.likedUserIds || [];
        const dislikedUserIds = c.dislikedUserIds || [];
        const isLiked = likedUserIds.includes(user.uid);
        const nextLiked = isLiked ? likedUserIds.filter(id => id !== user.uid) : [...likedUserIds, user.uid];
        const nextDisliked = dislikedUserIds.filter(id => id !== user.uid);
        return {
          ...c,
          likedUserIds: nextLiked,
          likesCount: nextLiked.length,
          dislikedUserIds: nextDisliked,
          dislikesCount: nextDisliked.length
        };
      });
    });

    try {
      await toggleLikePostComment(comment.id, user.uid);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
    }
  };

  // Dislike Comment Handler with 0ms Instant Optimistic Feedback
  const handleToggleCommentDislike = async (comment: PostComment) => {
    if (!user || !comment.id) return;

    queryClient.setQueryData(['postComments', post?.id], (old: PostComment[] = []) => {
      return old.map(c => {
        if (c.id !== comment.id) return c;
        const likedUserIds = c.likedUserIds || [];
        const dislikedUserIds = c.dislikedUserIds || [];
        const isDisliked = dislikedUserIds.includes(user.uid);
        const nextDisliked = isDisliked ? dislikedUserIds.filter(id => id !== user.uid) : [...dislikedUserIds, user.uid];
        const nextLiked = likedUserIds.filter(id => id !== user.uid);
        return {
          ...c,
          dislikedUserIds: nextDisliked,
          dislikesCount: nextDisliked.length,
          likedUserIds: nextLiked,
          likesCount: nextLiked.length
        };
      });
    });

    try {
      await toggleDislikePostComment(comment.id, user.uid);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
    }
  };

  // Delete Comment with custom Confirmation Modal
  const handleDeleteComment = async (commentId: string) => {
    if (!post?.id) return;
    const confirmed = await confirm({
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment and its replies?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      icon: 'trash',
    });
    if (!confirmed) return;

    try {
      await deletePostComment(commentId, post.id);
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
      showToast('Comment deleted');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete comment', 'error');
    }
  };

  const handleStartReply = (c: PostComment) => {
    setReplyingTo({
      commentId: c.parentId || c.id!,
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
    if ((!commentText.trim() && commentImages.length === 0) || commentMutation.isPending || isProcessingImage) return;
    commentMutation.mutate();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && post && (
        <div className="fixed inset-0 z-[600] flex flex-col justify-end sm:justify-center sm:items-center sm:p-3">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Container (Sleek Mobile Frame) */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="bg-ink w-full max-w-xl h-[94vh] sm:h-[88vh] rounded-t-[28px] sm:rounded-[28px] relative z-10 flex flex-col shadow-2xl overflow-hidden border-t sm:border border-line/20"
          >
            {/* Mobile Drag Indicator */}
            <div className="w-10 h-1 bg-line/30 rounded-full mx-auto mt-2.5 mb-0.5 sm:hidden" />

            {/* Top Bar Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line/15 bg-ink/95 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-sienna/20 border border-sienna/30 flex items-center justify-center text-sienna font-bold text-xs">
                  {post.authorName?.charAt(0)?.toUpperCase() || 'P'}
                </div>
                <div className="leading-tight">
                  <h2 className="text-sm font-bold text-bone">Post</h2>
                  <span className="text-[10px] text-bone-dim font-mono">{timeAgo(post.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {(isAdmin || (activePost && user?.uid === activePost.authorId)) && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1.5 rounded-lg bg-ink-2 text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors text-xs font-mono flex items-center gap-1 border border-line/20"
                      title="Edit Post"
                    >
                      <Edit3 size={13} />
                      <span className="hidden sm:inline text-[11px]">Edit</span>
                    </button>
                    <button
                      onClick={handleDeletePost}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-mono flex items-center gap-1 border border-red-500/20"
                      title="Delete Post"
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline text-[11px]">Delete</span>
                    </button>
                  </>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 bg-ink-2 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable Body Content */}
            <div className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-3.5 space-y-4">
              {/* Main Post Card (Sleek Compact View) */}
              <div className="bg-ink-2/70 rounded-2xl p-3.5 sm:p-4 border border-line/20 shadow-sm space-y-3">
                {/* Author Row */}
                <div
                  onClick={() => {
                    if (post.authorId === user?.uid) navigate('/profile');
                    else navigate(`/profile/${post.authorId}`);
                    onClose();
                  }}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <div className="w-9 h-9 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-sm overflow-hidden group-hover:border-sienna/50 transition-colors shrink-0">
                    {post.authorPhoto ? (
                      <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" />
                    ) : (
                      post.authorName?.charAt(0)?.toUpperCase() || '?'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-bone font-bold text-sm truncate group-hover:text-sienna transition-colors">
                      {post.authorName}
                    </div>
                    <div className="text-[11px] text-bone-dim font-mono">{timeAgo(post.createdAt)}</div>
                  </div>
                </div>

                {/* Post Content / Celebration Podium */}
                {post.sourceType === 'challenge' || post.sourceType === 'event' || post.title?.includes('Concluded') || post.text?.includes('🥇') ? (
                  <CelebrationPodiumCard
                    title={post.title}
                    rawText={post.text}
                    winners={(post as any).winners}
                    sourceType={post.sourceType as any}
                    clanName={post.clanName}
                  />
                ) : (
                  <>
                    {/* Post Title */}
                    {post.title && (
                      <h1 className="text-base sm:text-lg font-bold font-display text-bone leading-snug tracking-tight">
                        {post.title}
                      </h1>
                    )}

                    {/* Post Body */}
                    {post.text && (
                      <p className="text-bone/90 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                        {post.text}
                      </p>
                    )}
                  </>
                )}

                {/* Post Images Grid */}
                {postImages.length > 0 && (
                  <div
                    className={`rounded-xl overflow-hidden border border-line/15 gap-1.5 ${
                      postImages.length === 1
                        ? 'flex max-h-[320px]'
                        : postImages.length === 2
                        ? 'grid grid-cols-2 h-44'
                        : postImages.length === 3
                        ? 'grid grid-cols-2 h-48'
                        : 'grid grid-cols-2 h-52'
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
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Attached Poll */}
                {activePost?.poll && (
                  <ClanPollCard
                    postId={activePost.id!}
                    poll={activePost.poll}
                    onPollUpdated={(updatedPoll) => {
                      setCurrentPost(prev => (prev ? { ...prev, poll: updatedPoll } : null));
                    }}
                  />
                )}

                {/* Action Bar (Like, Comment, Save, Share) */}
                <div className="flex items-center justify-between pt-2.5 border-t border-line/15 text-xs font-mono text-bone-dim">
                  {/* Like Button */}
                  <button
                    onClick={handleTogglePostLike}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all active:scale-95 ${
                      localLiked
                        ? 'text-red-500 bg-red-500/10 font-bold'
                        : 'hover:text-red-400 hover:bg-red-500/5'
                    }`}
                  >
                    <AnimatedHeart isLiked={localLiked} size={16} />
                    <span>{localLikesCount}</span>
                  </button>

                  {/* Comment Focus Button */}
                  <button
                    onClick={() => commentInputRef.current?.focus()}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:text-bone hover:bg-ink-3 transition-colors"
                  >
                    <MessageSquare size={15} />
                    <span>{post.commentsCount || 0}</span>
                  </button>

                  {/* Bookmark Button */}
                  <button
                    onClick={handleToggleBookmark}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                      localSaved
                        ? 'text-sienna bg-sienna/10 font-bold'
                        : 'hover:text-sienna hover:bg-sienna/5'
                    }`}
                    title={localSaved ? 'Saved' : 'Save Bookmark'}
                  >
                    <Bookmark size={15} className={localSaved ? 'fill-current' : ''} />
                    <span className="hidden sm:inline text-[11px]">{localSaved ? 'Saved' : 'Save'}</span>
                  </button>

                  {/* Share Button */}
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:text-blue-400 hover:bg-blue-500/5 transition-colors"
                    title="Share Post"
                  >
                    <Share2 size={15} />
                    <span className="hidden sm:inline text-[11px]">Share</span>
                  </button>
                </div>
              </div>

              {/* Twitter (X)-Style Threaded Comments */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-[11px] font-mono uppercase tracking-widest text-bone-dim">
                    Replies ({comments.length})
                  </h3>
                </div>

                {loadingComments ? (
                  <div className="text-center py-8 text-bone-dim flex items-center justify-center gap-2 font-mono text-xs">
                    <Loader2 size={16} className="animate-spin text-sienna" />
                    <span>Loading replies...</span>
                  </div>
                ) : rootComments.length === 0 ? (
                  <div className="text-center py-10 bg-ink-2/30 rounded-2xl border border-dashed border-line/15">
                    <MessageSquare size={28} className="mx-auto mb-1.5 text-bone-dim/40" />
                    <p className="text-xs text-bone-dim">No replies yet.</p>
                    <p className="text-[11px] text-bone-dim/60 mt-0.5">Be the first to reply!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rootComments.map(rootComment => {
                      const replies = replyMap.get(rootComment.id!) || [];
                      const isRootLiked = (rootComment.likedUserIds || []).includes(user?.uid || '');
                      const isRootDisliked = (rootComment.dislikedUserIds || []).includes(user?.uid || '');

                      return (
                        <div key={rootComment.id} className="relative group">
                          {/* Root Comment Row */}
                          <div className="flex gap-2.5 relative">
                            {/* Thread Connector Line */}
                            {replies.length > 0 && (
                              <div className="absolute left-[13px] top-8 bottom-0 w-[1.5px] bg-line/30 rounded-full z-0" />
                            )}

                            {/* Root Avatar */}
                            <div className="w-7 h-7 rounded-full bg-ink-3 border border-line/20 flex items-center justify-center text-bone font-bold text-[10px] shrink-0 overflow-hidden z-10 mt-0.5">
                              {rootComment.userPhoto ? (
                                <img src={rootComment.userPhoto} alt={rootComment.userName} className="w-full h-full object-cover" />
                              ) : (
                                rootComment.userName?.charAt(0)?.toUpperCase() || '?'
                              )}
                            </div>

                            {/* Comment Bubble */}
                            <div className="flex-1 bg-ink-2/60 border border-line/15 rounded-2xl p-2.5 sm:p-3 shadow-sm space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-bone">{rootComment.userName}</span>
                                  <span className="text-[10px] text-bone-dim font-mono">{timeAgo(rootComment.createdAt)}</span>
                                </div>

                                {(isAdmin || user?.uid === rootComment.userId) && (
                                  <button
                                    onClick={() => handleDeleteComment(rootComment.id!)}
                                    className="text-bone-dim/70 hover:text-red-400 p-0.5 transition-colors"
                                    title="Delete reply"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>

                              <p className="text-xs sm:text-sm text-bone/90 leading-relaxed whitespace-pre-wrap">
                                {rootComment.text}
                              </p>

                              {/* Comment Images */}
                              {(rootComment.images || (rootComment.imageUrl ? [rootComment.imageUrl] : [])).length > 0 && (
                                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 max-w-[280px] scrollbar-hide">
                                  {(rootComment.images || [rootComment.imageUrl!]).map((img, idx) => (
                                    <div key={idx} onClick={() => setPreviewImage(img)} className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-ink-3 border border-line/20 cursor-pointer">
                                      <img src={img} alt="Comment attachment" className="w-full h-full object-cover" />
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Comment Action Row */}
                              <div className="flex items-center gap-3 pt-1 border-t border-line/10 text-[10px] font-mono text-bone-dim">
                                {/* Like */}
                                <button
                                  onClick={() => handleToggleCommentLike(rootComment)}
                                  className={`flex items-center gap-1 hover:text-red-400 transition-colors ${
                                    isRootLiked ? 'text-red-500 font-bold' : ''
                                  }`}
                                >
                                  <AnimatedHeart isLiked={isRootLiked} size={12} />
                                  <span>{rootComment.likesCount || 0}</span>
                                </button>

                                {/* Dislike */}
                                <button
                                  onClick={() => handleToggleCommentDislike(rootComment)}
                                  className={`flex items-center gap-1 hover:text-indigo-400 transition-colors ${
                                    isRootDisliked ? 'text-indigo-400 font-bold' : ''
                                  }`}
                                >
                                  <ThumbsDown size={12} className={isRootDisliked ? 'fill-current' : ''} />
                                  <span>{rootComment.dislikesCount || 0}</span>
                                </button>

                                {/* Reply */}
                                <button
                                  onClick={() => handleStartReply(rootComment)}
                                  className="flex items-center gap-1 hover:text-bone text-bone-dim transition-colors ml-auto"
                                >
                                  <CornerDownLeft size={12} />
                                  <span>Reply</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* "See X Replies" Button */}
                          {replies.length > 0 && !expandedReplies.has(rootComment.id!) && (
                            <div className="ml-5 sm:ml-6 mt-1.5 pl-3">
                              <button 
                                onClick={() => toggleReplies(rootComment.id!)}
                                className="text-sienna text-[11px] sm:text-xs font-bold hover:underline flex items-center gap-1.5 py-1"
                              >
                                <div className="w-4 h-[1.5px] bg-line/40 rounded-full" />
                                See {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                              </button>
                            </div>
                          )}

                          {/* Nested Replies (X / Twitter Style) */}
                          {replies.length > 0 && expandedReplies.has(rootComment.id!) && (
                            <div className="ml-4 sm:ml-5 mt-1.5 space-y-1.5 border-l-[1.5px] border-line/30 pl-3 py-0.5">
                              {replies.map(reply => {
                                const isReplyLiked = (reply.likedUserIds || []).includes(user?.uid || '');
                                const isReplyDisliked = (reply.dislikedUserIds || []).includes(user?.uid || '');

                                return (
                                  <div key={reply.id} className="flex gap-2">
                                    <div className="w-6 h-6 rounded-full bg-ink-3 border border-line/20 flex items-center justify-center text-bone font-bold text-[9px] shrink-0 overflow-hidden mt-0.5">
                                      {reply.userPhoto ? (
                                        <img src={reply.userPhoto} alt={reply.userName} className="w-full h-full object-cover" />
                                      ) : (
                                        reply.userName?.charAt(0)?.toUpperCase() || '?'
                                      )}
                                    </div>

                                    <div className="flex-1 bg-ink-2/40 border border-line/15 rounded-2xl p-2.5 shadow-sm space-y-1">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11px] font-bold text-bone">{reply.userName}</span>
                                          {reply.replyToUserName && (
                                            <span className="text-[10px] text-sienna font-mono">
                                              @{reply.replyToUserName}
                                            </span>
                                          )}
                                          <span className="text-[9px] text-bone-dim font-mono">{timeAgo(reply.createdAt)}</span>
                                        </div>

                                        {(isAdmin || user?.uid === reply.userId) && (
                                          <button
                                            onClick={() => handleDeleteComment(reply.id!)}
                                            className="text-bone-dim/70 hover:text-red-400 p-0.5 transition-colors"
                                            title="Delete reply"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        )}
                                      </div>

                                      <p className="text-xs text-bone/90 leading-relaxed whitespace-pre-wrap">
                                        {reply.text}
                                      </p>

                                      {/* Nested Reply Images */}
                                      {(reply.images || (reply.imageUrl ? [reply.imageUrl] : [])).length > 0 && (
                                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 max-w-[260px] scrollbar-hide">
                                          {(reply.images || [reply.imageUrl!]).map((img, idx) => (
                                            <div key={idx} onClick={() => setPreviewImage(img)} className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-ink-3 border border-line/20 cursor-pointer">
                                              <img src={img} alt="Reply attachment" className="w-full h-full object-cover" />
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      <div className="flex items-center gap-3 pt-0.5 border-t border-line/10 text-[10px] font-mono text-bone-dim">
                                        <button
                                          onClick={() => handleToggleCommentLike(reply)}
                                          className={`flex items-center gap-1 hover:text-red-400 transition-colors ${
                                            isReplyLiked ? 'text-red-500 font-bold' : ''
                                          }`}
                                        >
                                          <AnimatedHeart isLiked={isReplyLiked} size={11} />
                                          <span>{reply.likesCount || 0}</span>
                                        </button>

                                        <button
                                          onClick={() => handleToggleCommentDislike(reply)}
                                          className={`flex items-center gap-1 hover:text-indigo-400 transition-colors ${
                                            isReplyDisliked ? 'text-indigo-400 font-bold' : ''
                                          }`}
                                        >
                                          <ThumbsDown size={11} className={isReplyDisliked ? 'fill-current' : ''} />
                                          <span>{reply.dislikesCount || 0}</span>
                                        </button>

                                        <button
                                          onClick={() => handleStartReply(reply)}
                                          className="flex items-center gap-1 hover:text-bone text-bone-dim transition-colors ml-auto"
                                        >
                                          <CornerDownLeft size={11} />
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

            {/* Bottom Sticky Composer Bar (Ultra Sleek) */}
            <div className="p-2.5 sm:p-3 bg-ink/98 border-t border-line/20 sticky bottom-0 z-20 backdrop-blur-md space-y-1.5">
              {/* Replying To Banner */}
              {replyingTo && (
                <div className="flex items-center justify-between bg-sienna/10 border border-sienna/30 px-3 py-1 rounded-xl text-xs">
                  <div className="flex items-center gap-1.5 text-sienna font-mono text-[11px]">
                    <CornerDownLeft size={12} />
                    <span>Replying to <strong className="text-bone">@{replyingTo.userName}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-0.5 hover:bg-sienna/20 rounded-full text-sienna transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Image Previews inside composer */}
              {commentImages.length > 0 && (
                <div className="flex gap-2 pb-1.5 px-2 overflow-x-auto scrollbar-hide">
                  {commentImages.map((img, idx) => (
                    <div key={idx} className="relative w-12 h-12 rounded-lg bg-ink-3 border border-line/20 shrink-0 overflow-hidden group">
                      <img src={img} alt="Upload preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeCommentImage(idx)}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  ))}
                  {isProcessingImage && (
                    <div className="w-12 h-12 rounded-lg bg-ink-2 border border-dashed border-line/30 flex items-center justify-center shrink-0">
                      <Loader2 size={16} className="animate-spin text-bone-dim" />
                    </div>
                  )}
                </div>
              )}

              {/* Composer Input Row */}
              <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-ink-3 border border-line/30 flex items-center justify-center text-bone font-bold text-xs shrink-0 overflow-hidden">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Me" className="w-full h-full object-cover" />
                  ) : (
                    user?.displayName?.charAt(0)?.toUpperCase() || 'U'
                  )}
                </div>

                {/* Upload Image Button */}
                <input 
                  id="post-comment-image-upload"
                  name="postCommentImageUpload"
                  aria-label="Upload comment image"
                  type="file" 
                  ref={commentImageInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  multiple 
                  onChange={handleImageSelect} 
                />
                <button
                  type="button"
                  onClick={() => commentImageInputRef.current?.click()}
                  className="p-1.5 rounded-full text-bone-dim hover:text-sienna hover:bg-sienna/10 transition-colors shrink-0"
                  title="Attach image"
                  disabled={commentImages.length >= 4 || isProcessingImage}
                >
                  <ImagePlus size={18} />
                </button>

                <input
                  id="post-comment-text-input"
                  name="postCommentText"
                  aria-label="Post your reply"
                  autoComplete="off"
                  ref={commentInputRef}
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={replyingTo ? `Reply to @${replyingTo.userName}...` : 'Post your reply...'}
                  className="flex-1 bg-ink-2 border border-line/20 rounded-full px-3.5 py-2 text-xs sm:text-sm text-bone placeholder:text-bone-dim/40 focus:outline-none focus:border-sienna transition-colors shadow-inner min-w-0"
                />

                <button
                  type="submit"
                  disabled={(!commentText.trim() && commentImages.length === 0) || commentMutation.isPending || isProcessingImage}
                  className="w-8 h-8 rounded-full bg-sienna hover:bg-sienna/90 text-bg flex items-center justify-center disabled:opacity-40 shadow-sm transition-all shrink-0 active:scale-95"
                  title="Send reply"
                >
                  {commentMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
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

          {/* Edit Post Modal */}
          {isEditing && activePost && (
            <EditPostSheet
              post={activePost}
              isOpen={isEditing}
              onClose={() => setIsEditing(false)}
              onUpdated={(updated) => {
                setCurrentPost(prev => prev ? ({ ...prev, ...updated }) : null);
              }}
            />
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
