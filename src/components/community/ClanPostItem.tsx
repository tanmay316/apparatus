import React, { useState, useEffect } from 'react';
import { MessageSquare, Share2, Bookmark, Flame, Trophy, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQueryClient } from '@tanstack/react-query';
import { toggleLikeClanPost } from '@/services/community';
import { CommunityPost } from '@/types';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { getAvatarUrl } from '@/lib/avatar';
import { motion } from 'framer-motion';
import { CelebrationPodiumCard } from './CelebrationPodiumCard';
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
  const { showToast, theme } = useUIStore();
  const queryClient = useQueryClient();

  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);

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

  const isCelebration = post.sourceType === 'challenge' || 
    post.sourceType === 'event' || 
    post.title?.includes('Concluded') || 
    post.text?.includes('🥇');

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
    const shareUrl = getAppShareUrl(`/post/${post.id}`);
    const shareTitle = post.title || `Post by ${post.authorName}`;

    const res = await shareContent({
      title: shareTitle,
      text: post.text?.slice(0, 120),
      url: shareUrl,
      dialogTitle: 'Share Clan Post',
    });

    if (res.method === 'clipboard') {
      showToast('Post link copied to clipboard!', 'success');
    }
  };

  return (
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
            {post.authorPhoto ? (
              <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" />
            ) : (
              post.authorName?.charAt(0)?.toUpperCase() || '?'
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <span className="font-bold text-sm text-[#17191c] truncate max-w-[140px] sm:max-w-[200px]">
                {post.authorName}
              </span>
              {post.clanName && (
                <span className="text-[9px] md:text-[10px] font-mono font-medium uppercase px-2.5 py-0.5 rounded-full bg-[#fdfbfb] text-[#5d2a1a] border border-[#5d2a1a]/15 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] shrink-0">
                  {post.clanName}
                </span>
              )}
            </div>
            <div className="text-[10px] md:text-[11px] font-sans font-semibold text-[#777b86] tracking-wider uppercase mt-0.5 md:mt-1 leading-snug flex items-center gap-1">
              {isCelebration ? (
                <>
                  <Trophy size={11} className="text-amber-600 shrink-0" />
                  <span>{post.sourceType === 'event' ? 'EVENT CELEBRATION' : 'CHALLENGE WINNERS'}</span>
                </>
              ) : (
                <span>CLAN COMMUNITY POST</span>
              )}
            </div>
          </div>
        </div>

        <span className="text-[9px] md:text-xs font-mono text-[#777b86] whitespace-nowrap shrink-0">
          {timeAgo(post.createdAt)}
        </span>
      </div>

      {/* ─── POST CONTENT / CELEBRATION PODIUM ─── */}
      {isCelebration ? (
        <CelebrationPodiumCard
          title={post.title}
          rawText={post.text}
          winners={(post as any).winners}
          sourceType={post.sourceType as any}
          clanName={post.clanName}
        />
      ) : (
        <div className="mb-4">
          {/* Title */}
          {post.title && (
            <h3 className="font-display font-bold text-base md:text-lg text-[#17191c] leading-snug mb-2">
              {post.title}
            </h3>
          )}

          {/* Body Text */}
          {post.text && (
            <p className="text-[#17191c]/90 whitespace-pre-wrap text-xs md:text-sm leading-relaxed line-clamp-4 font-sans">
              {post.text}
            </p>
          )}
        </div>
      )}

      {/* ─── MULTI-IMAGE NEOMORPHIC ATTACHMENTS ─── */}
      {images.length > 0 && !isCelebration && (
        <div className="rounded-[20px] overflow-hidden border border-[#ececec] bg-[#fdfbfb] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.04),inset_-2px_-2px_5px_rgba(255,255,255,0.8)] p-1.5 mb-4">
          <div className={`rounded-[16px] overflow-hidden gap-1.5 ${
            images.length === 1
              ? 'h-48 sm:h-64'
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
            <span>{post.commentsCount || 0}</span>
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
  );
}
