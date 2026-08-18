import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Share2, Bookmark, Trophy,
  MoreHorizontal, Edit3, Trash2, Link as LinkIcon
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toggleLikeClanPost, deleteClanPost } from '@/services/community';
import { CommunityPost } from '@/types';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { motion, AnimatePresence } from 'framer-motion';
import { CelebrationPodiumCard } from './CelebrationPodiumCard';
import { EditPostSheet } from './EditPostSheet';
import { ClanPollCard } from './ClanPollCard';
import { getAppShareUrl, shareContent } from '@/lib/share';

function timeAgo(date: any): string {
  if (!date) return 'just now';
  const millis = typeof date?.toMillis === 'function' 
    ? date.toMillis() 
    : (date?.seconds ? date.seconds * 1000 : (date instanceof Date ? date.getTime() : 0));
  
  if (!millis) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ClanPostItem({ post, onClick }: { post: CommunityPost, onClick: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();

  const [currentPost, setCurrentPost] = useState<CommunityPost>(post);
  const [showOptions, setShowOptions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    setCurrentPost(post);
  }, [post]);

  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);

  useEffect(() => {
    setOptimisticLiked(null);
    setOptimisticCount(null);
  }, [currentPost.id, currentPost.likedUserIds, currentPost.likesCount]);

  const isLiked = optimisticLiked !== null
    ? optimisticLiked
    : (currentPost.likedUserIds?.includes(user?.uid || '') || false);
  const likesCount = optimisticCount !== null
    ? optimisticCount
    : (currentPost.likesCount || 0);

  const bookmarks = profile?.bookmarks || [];
  const isSaved = currentPost.id ? bookmarks.includes(currentPost.id) : false;

  const images = currentPost.images && currentPost.images.length > 0
    ? currentPost.images
    : (currentPost.imageUrl ? [currentPost.imageUrl] : []);

  const isCelebration = currentPost.sourceType === 'challenge' || 
    currentPost.sourceType === 'event' || 
    currentPost.title?.includes('Concluded') || 
    currentPost.text?.includes('🥇');

  const isAuthor = user?.uid === currentPost.authorId;
  const canManage = isAuthor || Boolean(profile?.isAdmin);

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !currentPost.id) {
      showToast('Please log in to like posts', 'info');
      return;
    }

    const nextLiked = !isLiked;
    const nextCount = nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

    setOptimisticLiked(nextLiked);
    setOptimisticCount(nextCount);

    try {
      await toggleLikeClanPost(currentPost.id, user.uid);
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    } catch {
      setOptimisticLiked(!nextLiked);
      setOptimisticCount(likesCount);
      showToast('Could not update like', 'error');
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !currentPost.id) return;
    try {
      const isCurrentlySaved = bookmarks.includes(currentPost.id);
      const newBookmarks = isCurrentlySaved
        ? bookmarks.filter((id: string) => id !== currentPost.id)
        : [...bookmarks, currentPost.id];

      await useAuthStore.getState().updateProfile({ bookmarks: newBookmarks });
      showToast(isCurrentlySaved ? 'Removed from bookmarks' : 'Saved to bookmarks', 'info');
      queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch {
      showToast('Could not update bookmark', 'error');
    }
  };

  const handleShare = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const shareUrl = getAppShareUrl(`/post/${currentPost.id}`);
    const shareTitle = currentPost.title || `Post by ${currentPost.authorName}`;

    const res = await shareContent({
      title: shareTitle,
      text: currentPost.text?.slice(0, 120),
      url: shareUrl,
      dialogTitle: 'Share Clan Post',
    });

    if (res.method === 'clipboard') {
      showToast('Post link copied to clipboard!', 'success');
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOptions(false);
    if (!currentPost.id) return;

    const confirmed = await confirm({
      title: 'Delete Post',
      message: 'Are you sure you want to permanently delete this post and its photos? This cannot be undone.',
      confirmText: 'Delete Post',
      cancelText: 'Cancel',
      type: 'danger',
      icon: 'trash',
    });

    if (!confirmed) return;

    try {
      await deleteClanPost(currentPost.id);
      setIsDeleted(true);
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
      if (currentPost.communityId) {
        queryClient.invalidateQueries({ queryKey: ['clanPosts', currentPost.communityId] });
      }
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast('Post deleted successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete post', 'error');
    }
  };

  if (isDeleted) return null;

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={onClick}
        className="clan-post-card activity-post-card relative text-[#17191c] border border-[#ececec] rounded-[24px] bg-[#fdfbfb] shadow-[8px_8px_20px_rgba(0,0,0,0.06),-8px_-8px_20px_rgba(255,255,255,0.8)] p-3.5 sm:p-5 md:p-6 mb-4 sm:mb-6 hover:shadow-[10px_10px_24px_rgba(0,0,0,0.08),-10px_-10px_24px_rgba(255,255,255,0.9)] transition-all cursor-pointer"
      >
        {/* ─── HEADER ─── */}
        <div className="flex items-center justify-between gap-3 mb-4 relative z-20">
          <div className="flex items-start md:items-center gap-3 min-w-0">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-full shadow-[3px_3px_6px_rgba(0,0,0,0.1),-3px_-3px_6px_rgba(255,255,255,1)] overflow-hidden bg-[#fdfbfb] flex items-center justify-center text-[#17191c] font-bold text-sm shrink-0 border border-[#ececec]/60">
              {currentPost.authorPhoto ? (
                <img src={currentPost.authorPhoto} alt={currentPost.authorName} className="w-full h-full object-cover" />
              ) : (
                currentPost.authorName?.charAt(0)?.toUpperCase() || '?'
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <span className="font-bold text-sm text-[#17191c] truncate max-w-[140px] sm:max-w-[200px]">
                  {currentPost.authorName}
                </span>
                {currentPost.clanName && (
                  <span className="text-[9px] md:text-[10px] font-mono font-medium uppercase px-2.5 py-0.5 rounded-full bg-[#fdfbfb] text-[#5d2a1a] border border-[#5d2a1a]/15 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] shrink-0">
                    {currentPost.clanName}
                  </span>
                )}
              </div>
              <div className="text-[10px] md:text-[11px] font-sans font-semibold text-[#777b86] tracking-wider uppercase mt-0.5 md:mt-1 leading-snug flex items-center gap-1">
                {isCelebration ? (
                  <>
                    <Trophy size={11} className="text-amber-600 shrink-0" />
                    <span>{currentPost.sourceType === 'event' ? 'EVENT CELEBRATION' : 'CHALLENGE WINNERS'}</span>
                  </>
                ) : (
                  <span>CLAN COMMUNITY POST</span>
                )}
              </div>
            </div>
          </div>

          {/* Timestamp & Options Menu */}
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <span className="text-[9px] md:text-xs font-mono text-[#777b86] whitespace-nowrap shrink-0">
              {timeAgo(currentPost.createdAt)}
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOptions(!showOptions);
                }}
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
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 w-44 bg-white rounded-2xl shadow-2xl border border-gray-100 py-1.5 z-50 overflow-hidden text-left"
                  >
                    {canManage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowOptions(false);
                          setIsEditing(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-[#17191c] hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2.5 transition-colors font-medium"
                      >
                        <Edit3 size={14} className="text-amber-600" />
                        Edit Post
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowOptions(false);
                        handleShare();
                      }}
                      className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-[#17191c] hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
                    >
                      <LinkIcon size={14} className="text-[#777b86]" />
                      Copy Link
                    </button>

                    {canManage && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                      >
                        <Trash2 size={14} className="text-red-500" />
                        Delete Post
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ─── POST CONTENT / CELEBRATION PODIUM ─── */}
        {isCelebration ? (
          <CelebrationPodiumCard
            title={currentPost.title}
            rawText={currentPost.text}
            winners={(currentPost as any).winners}
            sourceType={currentPost.sourceType as any}
            clanName={currentPost.clanName}
          />
        ) : (
          <div className="mb-4">
            {/* Title */}
            {currentPost.title && (
              <h3 className="font-display font-bold text-base md:text-lg text-[#17191c] leading-snug mb-2">
                {currentPost.title}
              </h3>
            )}

            {/* Body text */}
            {currentPost.text && (
              <p className="text-xs md:text-sm text-[#4b4d54] whitespace-pre-wrap leading-relaxed">
                {currentPost.text}
              </p>
            )}
          </div>
        )}

        {/* ─── ATTACHED IMAGES ─── */}
        {!isCelebration && images.length > 0 && (
          <div className="mb-4 rounded-2xl overflow-hidden border border-[#ececec]/80 shadow-sm bg-gray-50">
            <div className={`gap-1 ${
              images.length === 1
                ? 'max-h-80 sm:max-h-96'
                : images.length === 2
                ? 'grid grid-cols-2 h-44 sm:h-52'
                : images.length === 3
                ? 'grid grid-cols-2 h-48 sm:h-56'
                : 'grid grid-cols-2 h-52 sm:h-60'
            }`}>
              {images.slice(0, 4).map((img, idx) => (
                <div key={idx} className={`relative bg-gray-100 overflow-hidden ${images.length === 3 && idx === 0 ? 'row-span-2' : ''}`}>
                  <img src={img} alt="Post attachment" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── ATTACHED POLL ─── */}
        {!isCelebration && currentPost.poll && (
          <ClanPollCard
            postId={currentPost.id!}
            poll={currentPost.poll}
            onPollUpdated={(updatedPoll) => {
              setCurrentPost(prev => ({ ...prev, poll: updatedPoll }));
            }}
          />
        )}

        {/* ─── SOCIAL ACTIONS BAR ─── */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#ececec]/60 text-xs font-sans">
          <div className="flex items-center gap-4">
            {/* Like */}
            <motion.button
              whileTap={{ scale: 1.25 }}
              onClick={handleToggleLike}
              className={`flex items-center gap-1.5 transition-colors ${
                isLiked ? 'text-red-500 font-bold' : 'text-[#777b86] hover:text-red-500'
              }`}
            >
              <AnimatedHeart isLiked={isLiked} size={18} />
              <span>{likesCount}</span>
            </motion.button>

            {/* Comment */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="flex items-center gap-1.5 text-[#777b86] hover:text-[#17191c] transition-colors"
            >
              <MessageSquare size={16} />
              <span>{currentPost.commentsCount || 0}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Save Bookmark */}
            <button
              onClick={handleSave}
              className={`p-1.5 rounded-full hover:bg-black/5 transition-colors ${
                isSaved ? 'text-[#5d2a1a]' : 'text-[#777b86] hover:text-[#17191c]'
              }`}
            >
              <Bookmark size={15} className={isSaved ? 'fill-current' : ''} />
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              className="p-1.5 rounded-full text-[#777b86] hover:text-[#17191c] hover:bg-black/5 transition-colors"
            >
              <Share2 size={15} />
            </button>
          </div>
        </div>
      </motion.article>

      {/* Edit Post Modal Sheet */}
      {isEditing && (
        <EditPostSheet
          post={currentPost}
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          onUpdated={(updated) => {
            setCurrentPost(prev => ({ ...prev, ...updated }));
          }}
        />
      )}
    </>
  );
}
