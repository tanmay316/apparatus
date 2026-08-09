import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, MessageSquare, CornerDownRight, Image as ImageIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPostComments, createPostComment, likeClanPost } from '@/services/community';
import { CommunityPost } from '@/types';

export function SinglePostSheet({ post, isOpen, onClose }: { post: CommunityPost | null, isOpen: boolean, onClose: () => void }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');

  const { data: comments = [] } = useQuery({
    queryKey: ['postComments', post?.id],
    queryFn: () => getPostComments(post!.id!),
    enabled: !!post && isOpen
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!post) return;
      await likeClanPost(post.id!, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    }
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !newComment.trim() || !post) return;
      await createPostComment({
        postId: post.id!,
        userId: user.uid,
        userName: user.displayName || 'Unknown',
        text: newComment.trim()
      });
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['postComments', post?.id] });
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
    }
  });

  return (
    <AnimatePresence>
      {isOpen && post && (
        <div className="fixed inset-0 z-[400] flex flex-col justify-end">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="bg-bg w-full h-[90vh] rounded-t-[32px] relative z-10 flex flex-col shadow-2xl overflow-hidden border-t border-line/10"
          >
            <div className="flex items-center justify-between p-6 border-b border-line/10">
              <h2 className="text-xl font-bold text-bone">Post</h2>
              <button onClick={onClose} className="p-2 bg-ink-2 rounded-full text-bone hover:text-sienna transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Post Content */}
              <div className="bg-ink-2 shadow-sm border border-line/20 rounded-3xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-ink-3 flex items-center justify-center text-bone font-bold text-lg">
                    {post.authorName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="text-bone font-bold">{post.authorName}</div>
                    <div className="text-xs text-bone-dim font-mono">{post.createdAt?.toDate().toLocaleDateString() || 'Just now'}</div>
                  </div>
                </div>
                
                <p className="text-bone whitespace-pre-wrap mb-4">{post.text}</p>
                
                {post.imageUrl && (
                  <div className="mb-4 rounded-2xl overflow-hidden border border-line/10">
                    <img src={post.imageUrl} alt="Post attachment" className="w-full h-auto max-h-[400px] object-cover" />
                  </div>
                )}
                
                <div className="flex items-center gap-6 text-sm font-mono text-bone-dim border-t border-line/20 pt-4">
                  <button onClick={() => likeMutation.mutate()} className="flex items-center gap-2 hover:text-sienna transition-colors">
                    <Heart size={16} /> {post.likesCount}
                  </button>
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} /> {post.commentsCount}
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div className="flex-1">
                <h3 className="text-sm font-bold text-bone mb-4 px-2">Comments ({comments.length})</h3>
                <div className="space-y-4">
                  {comments.length === 0 ? (
                    <p className="text-bone-dim text-sm text-center py-8">Be the first to comment!</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="flex gap-3">
                        <div className="w-8 h-8 shrink-0 rounded-full bg-ink-3 flex items-center justify-center text-bone font-bold text-xs mt-1">
                          {c.userName?.charAt(0) || '?'}
                        </div>
                        <div className="bg-ink-2 shadow-sm border border-line/10 rounded-2xl rounded-tl-sm p-3 flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-bold text-bone">{c.userName}</span>
                            <span className="text-[10px] text-bone-dim font-mono">{c.createdAt?.toDate().toLocaleDateString() || 'Just now'}</span>
                          </div>
                          <p className="text-sm text-bone/90">{c.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Comment Input */}
            <div className="p-4 bg-bg border-t border-line/10">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-ink-2 border border-line/20 rounded-xl px-4 py-3 text-sm text-bone focus:outline-none focus:border-sienna"
                  onKeyDown={e => e.key === 'Enter' && commentMutation.mutate()}
                />
                <button 
                  onClick={() => commentMutation.mutate()}
                  disabled={!newComment.trim() || commentMutation.isPending}
                  className="bg-sienna text-bone px-4 py-3 rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  Post
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
