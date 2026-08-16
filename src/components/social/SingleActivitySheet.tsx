import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getComments, addComment } from '@/services/social';
import type { Activity, Comment } from '@/types';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import { getAvatarUrl } from '@/lib/avatar';

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
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<HTMLInputElement>(null);

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

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !commentText.trim() || !activity?.id) return;
      await addComment(activity.id, {
        userId: user.uid,
        userName: user.displayName || 'Athlete',
        userPhoto: user.photoURL || '',
        text: commentText.trim(),
      });
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['activityComments', activity?.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err: any) => showToast(err?.message || 'Failed to post comment', 'error')
  });

  if (!isOpen || !activity) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4 animate-in fade-in duration-300">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-ink w-full h-[100dvh] sm:h-[85vh] sm:max-h-[800px] sm:max-w-2xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-line shrink-0 bg-ink/90 backdrop-blur-md relative z-10">
            <span className="font-mono text-xs uppercase tracking-widest text-bone-dim">Comments</span>
            <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Main Scrollable Area */}
          <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Post Wrapper */}
            <div className="p-4 sm:p-6 border-b border-line/20 bg-ink-2/10">
              <ActivityPostCard activity={activity} hideCommentsToggle />
            </div>

            {/* Comments List */}
            <div className="p-4 sm:p-6 space-y-4">
              {loadingComments ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin text-bone-dim" /></div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-bone-dim bg-ink-2/30 rounded-3xl border border-line/20">
                  <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No comments yet. Be the first to reply!</p>
                </div>
              ) : (
                comments.map((comment: Comment) => (
                  <div key={comment.id} className="flex items-start gap-3">
                    <img
                      src={comment.userPhoto || getAvatarUrl(comment.userName, 'dark', 64)}
                      alt=""
                      className="w-8 h-8 rounded-full shadow-[2px_2px_4px_rgba(0,0,0,0.1)] object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-bone text-sm">{comment.userName}</span>
                        <span className="text-[10px] text-bone-dim font-mono">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="text-bone/90 text-sm leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Comment Input Footer */}
          <div className="p-3 sm:p-4 border-t border-line bg-ink shrink-0 safe-area-bottom">
            <div className="flex items-end gap-2 bg-ink-2 rounded-2xl p-2 focus-within:ring-1 ring-sienna/50 transition-shadow">
              <input
                ref={commentInputRef}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                    e.preventDefault();
                    commentMutation.mutate();
                  }
                }}
                placeholder="Write a comment..."
                className="flex-1 bg-transparent border-none text-sm text-bone px-2 py-2 outline-none font-sans placeholder:text-bone-dim min-h-[40px] max-h-[120px] resize-none"
              />
              <button
                disabled={!commentText.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                className="h-10 px-4 rounded-xl bg-sienna text-white font-medium hover:bg-sienna/90 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
              >
                {commentMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
