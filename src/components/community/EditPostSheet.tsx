import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Save, Loader2, Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateClanPost } from '@/services/community';
import type { CommunityPost } from '@/types';

interface EditPostSheetProps {
  post: CommunityPost;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (updated: Partial<CommunityPost>) => void;
}

// Client-side canvas compression for large smartphone photos
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(event.target?.result as string);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to efficient JPEG
        let quality = 0.75;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        if (dataUrl.length > 400 * 1024) {
          quality = 0.6;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function EditPostSheet({ post, isOpen, onClose, onUpdated }: EditPostSheetProps) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(post.title || '');
  const [postText, setPostText] = useState(post.text || '');
  const [images, setImages] = useState<string[]>(() => {
    if (post.images && post.images.length > 0) return post.images;
    if (post.imageUrl) return [post.imageUrl];
    return [];
  });
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when post changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle(post.title || '');
      setPostText(post.text || '');
      setImages(post.images && post.images.length > 0 ? post.images : (post.imageUrl ? [post.imageUrl] : []));
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen, post]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 4) {
      showToast('You can attach up to 4 images per post.', 'error');
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
        const compressed = await compressImage(file);
        processed.push(compressed);
      }
      setImages(prev => [...prev, ...processed].slice(0, 4));
    } catch (err: any) {
      showToast('Failed to process image. Please try again.', 'error');
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to edit posts');
      if (!post?.id) throw new Error('Post ID is missing');
      if (!postText.trim() && !title.trim() && images.length === 0) {
        throw new Error('Post cannot be completely empty');
      }

      await updateClanPost(post.id, {
        title: title.trim(),
        text: postText.trim(),
        images: images,
        imageUrl: images[0] || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clanPosts'] });
      if (post.communityId) {
        queryClient.invalidateQueries({ queryKey: ['clanPosts', post.communityId] });
      }
      queryClient.invalidateQueries({ queryKey: ['singleClanPost', post.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });

      onUpdated?.({
        title: title.trim(),
        text: postText.trim(),
        images,
        imageUrl: images[0] || undefined,
      });

      showToast('Post updated successfully!', 'success');
      onClose();
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to update post', 'error');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateMutation.isPending || isProcessingImage) return;
    updateMutation.mutate();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[650] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="bg-ink w-full max-w-xl rounded-t-[32px] sm:rounded-[28px] relative z-10 flex flex-col shadow-2xl p-5 sm:p-6 border-t sm:border border-line/20 max-h-[92vh] overflow-y-auto"
          >
            {/* Drag Handle on Mobile */}
            <div className="w-12 h-1.5 bg-line/40 rounded-full mx-auto mb-4 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-line/20">
              <div>
                <h2 className="text-lg font-bold text-bone tracking-wide">Edit Post</h2>
                <p className="text-xs text-bone-dim">Modify your post title, text, and photos</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 bg-ink-2 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {/* Title Field */}
              <div>
                <label className="block text-[11px] font-mono uppercase text-bone-dim mb-1.5 tracking-wider">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Give your post a title..."
                  maxLength={100}
                  className="w-full bg-ink-2 border border-line/20 rounded-xl px-4 py-3 text-sm text-bone placeholder:text-bone-dim/40 font-semibold focus:outline-none focus:border-sienna/80 transition-colors shadow-inner"
                />
              </div>

              {/* Body Textarea */}
              <div>
                <label className="block text-[11px] font-mono uppercase text-bone-dim mb-1.5 tracking-wider">
                  Post Content
                </label>
                <textarea
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  placeholder="What's on your mind? Share a workout, question, tip, or achievement..."
                  rows={4}
                  className="w-full bg-ink-2 border border-line/20 rounded-xl p-4 text-sm text-bone placeholder:text-bone-dim/40 resize-none focus:outline-none focus:border-sienna/80 transition-colors leading-relaxed shadow-inner"
                />
              </div>

              {/* Image Previews */}
              {images.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-bone-dim">
                      Attached Images ({images.length}/4)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-ink-3 border border-line/20">
                        <img src={img} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/70 rounded-full text-white hover:bg-red-500 transition-colors shadow-sm"
                          title="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {images.length < 4 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-xl border border-dashed border-line/30 hover:border-sienna/50 bg-ink-2/50 flex flex-col items-center justify-center gap-1 text-bone-dim hover:text-sienna transition-colors"
                      >
                        <Plus size={20} />
                        <span className="text-[11px] font-mono">Add More</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-line/20 mt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= 4 || isProcessingImage}
                    className="px-3.5 py-2.5 bg-ink-2 rounded-xl text-bone-dim hover:text-sienna hover:bg-sienna/10 transition-colors flex items-center gap-2 text-xs font-mono disabled:opacity-50 border border-line/20 hover:border-sienna/30"
                  >
                    {isProcessingImage ? (
                      <Loader2 size={16} className="animate-spin text-sienna" />
                    ) : (
                      <ImageIcon size={16} />
                    )}
                    <span>{images.length > 0 ? 'Add Image' : 'Attach Image'}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-xs font-bold text-bone-dim hover:text-bone transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={(!postText.trim() && !title.trim() && images.length === 0) || updateMutation.isPending || isProcessingImage}
                    className="bg-sienna hover:bg-sienna/90 text-bg px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-sienna/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save size={15} />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
