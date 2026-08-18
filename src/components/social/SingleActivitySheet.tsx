import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, MessageSquare, Trash2, Bookmark,
  Share2, ThumbsDown, Send, CornerDownLeft, Loader2, ImagePlus
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getComments, addComment,
  toggleLikeActivityComment, toggleDislikeActivityComment, deleteActivityComment
} from '@/services/social';
import { compressImageFile } from '@/utils/image-compression';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import type { Activity, Comment } from '@/types';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';

interface SingleActivitySheetProps {
  activity: Activity | null;
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

export function SingleActivitySheet({ activity, isOpen, onClose }: SingleActivitySheetProps) {
  const { user, profile } = useAuthStore();
  const isAdmin = !!profile?.isAdmin;
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen]);

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ['activityComments', activity?.id],
    queryFn: () => getComments(activity!.id!),
    enabled: !!activity && isOpen,
  });

  // Create Comment Mutation
  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || (!commentText.trim() && commentImages.length === 0) || !activity?.id) return;
      await addComment(activity.id, {
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
      queryClient.invalidateQueries({ queryKey: ['activityComments', activity?.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
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
  const handleToggleCommentLike = async (comment: Comment) => {
    if (!user || !comment.id) return;

    queryClient.setQueryData(['activityComments', activity?.id], (old: Comment[] = []) => {
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
      await toggleLikeActivityComment(activity!.id!, comment.id, user.uid);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['activityComments', activity?.id] });
    }
  };

  // Dislike Comment Handler with 0ms Instant Optimistic Feedback
  const handleToggleCommentDislike = async (comment: Comment) => {
    if (!user || !comment.id) return;

    queryClient.setQueryData(['activityComments', activity?.id], (old: Comment[] = []) => {
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
      await toggleDislikeActivityComment(activity!.id!, comment.id, user.uid);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['activityComments', activity?.id] });
    }
  };

  // Delete Comment with custom Confirmation Modal
  const handleDeleteComment = async (commentId: string) => {
    if (!activity?.id) return;
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
      await deleteActivityComment(activity.id, commentId);
      queryClient.invalidateQueries({ queryKey: ['activityComments', activity?.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast('Comment deleted');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete comment', 'error');
    }
  };

  const handleStartReply = (c: Comment) => {
    setReplyingTo({
      commentId: c.parentId || c.id!,
      userName: c.userName,
      userId: c.userId,
    });
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 50);
  };

  // Group comments into root comments & child replies
  const { rootComments, replyMap } = useMemo(() => {
    const roots: Comment[] = [];
    const map = new Map<string, Comment[]>();

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
      {isOpen && activity && (
        <div className="fixed inset-0 z-[600] flex flex-col justify-end sm:justify-center sm:items-center sm:p-3">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
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
                  A
                </div>
                <div className="leading-tight">
                  <h2 className="text-sm font-bold text-bone">Activity</h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
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
              {/* Main Activity Card (Uses the exact same component as the feed, without opening this modal) */}
              <div>
                <ActivityPostCard activity={activity} hideCommentsToggle isEmbedded />
              </div>
              <div className="border-b border-line/10 pt-2" />

              {/* Threaded Comments */}
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
                              {(rootComment.images || []).length > 0 && (
                                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 max-w-[280px] scrollbar-hide">
                                  {(rootComment.images || []).map((img, idx) => (
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

                          {/* Nested Replies */}
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
                                      {(reply.images || []).length > 0 && (
                                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 max-w-[260px] scrollbar-hide">
                                          {(reply.images || []).map((img, idx) => (
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

            {/* Bottom Sticky Composer Bar */}
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

              {/* Image Previews */}
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
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
