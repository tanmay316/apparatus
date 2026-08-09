import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Send } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClanPost } from '@/services/community';

export function CreatePostSheet({ clanId, isOpen, onClose }: { clanId: string, isOpen: boolean, onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  
  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) { // 2MB limit before compression
      showToast('Image is too large. Please select a smaller image.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress heavily to keep Firestore happy
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setPostImage(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      if (!postText.trim() && !postImage) throw new Error('Post cannot be empty');
      
      await createClanPost({
        communityId: clanId,
        authorId: user.uid,
        authorName: user.displayName || 'Unknown',
        authorPhoto: user.photoURL || '',
        title: '',
        text: postText.trim(),
        imageUrl: postImage || undefined
      });
    },
    onSuccess: () => {
      setPostText('');
      setPostImage(null);
      queryClient.invalidateQueries({ queryKey: ['clanPosts', clanId] });
      showToast('Post created successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create post', 'error')
  });

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-bg w-full rounded-t-[32px] relative z-10 flex flex-col shadow-2xl p-6 border-t border-line/10"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-bone">Create Post</h2>
              <button onClick={onClose} className="p-2 bg-ink-2 rounded-full text-bone hover:text-sienna transition-colors">
                <X size={20} />
              </button>
            </div>

            <textarea 
              value={postText}
              onChange={e => setPostText(e.target.value)}
              placeholder="Share something with the clan..."
              className="w-full bg-ink-2 border border-line/20 rounded-2xl p-4 text-bone placeholder:text-bone-dim/50 resize-none h-32 focus:outline-none focus:border-sienna mb-4"
            />

            {postImage && (
              <div className="relative mb-4 rounded-xl overflow-hidden border border-line/10 inline-block">
                <img src={postImage} alt="Preview" className="max-h-[200px] object-contain" />
                <button 
                  onClick={() => setPostImage(null)}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/80"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mt-auto">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-ink-2 rounded-xl text-bone-dim hover:text-sienna hover:bg-sienna/10 transition-colors flex items-center gap-2"
              >
                <ImageIcon size={20} />
                <span className="text-sm font-medium">Add Image</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden" 
              />

              <button 
                onClick={() => createMutation.mutate()}
                disabled={(!postText.trim() && !postImage) || createMutation.isPending}
                className="bg-sienna text-bone px-6 py-3 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Send size={16} />
                Post
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
