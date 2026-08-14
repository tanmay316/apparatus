import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateClan } from '@/services/community';
import { useUIStore } from '@/stores/ui-store';
import { ClanV2 } from '@/types';

export function EditClanSheet({ clan, isOpen, onClose }: { clan: ClanV2, isOpen: boolean, onClose: () => void }) {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen]);

  const [name, setName] = useState(clan.name);
  const [description, setDescription] = useState(clan.description);
  const [tags, setTags] = useState(clan.tags.join(', '));
  const [coverUrl, setCoverUrl] = useState(clan.coverUrl || '');
  
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      await updateClan(clan.id!, {
        name,
        description,
        tags: parsedTags,
        coverUrl: coverUrl || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clan', clan.id] });
      queryClient.invalidateQueries({ queryKey: ['publicClans'] });
      showToast('Clan updated successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update clan', 'error')
  });

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex flex-col justify-end">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="bg-bg w-full h-[90vh] rounded-t-[32px] relative z-10 flex flex-col shadow-2xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-bone">Edit Clan</h2>
              <button onClick={onClose} className="p-2 bg-ink-2 rounded-full text-bone hover:text-sienna">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Name</label>
                <input 
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full bg-ink-2 border border-line/20 rounded-2xl px-4 py-3 text-bone focus:outline-none focus:border-sienna"
                />
              </div>
              
              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Description</label>
                <textarea 
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full h-24 bg-ink-2 border border-line/20 rounded-2xl p-4 text-bone resize-none focus:outline-none focus:border-sienna"
                />
              </div>
              
              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Tags (comma separated)</label>
                <input 
                  type="text" value={tags} onChange={e => setTags(e.target.value)}
                  className="w-full bg-ink-2 border border-line/20 rounded-2xl px-4 py-3 text-bone focus:outline-none focus:border-sienna"
                  placeholder="e.g. running, beginners, hiit"
                />
              </div>
              
              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Cover Image URL</label>
                <input 
                  type="text" value={coverUrl} onChange={e => setCoverUrl(e.target.value)}
                  className="w-full bg-ink-2 border border-line/20 rounded-2xl px-4 py-3 text-bone focus:outline-none focus:border-sienna"
                  placeholder="https://images.unsplash.com/..."
                />
              </div>
            </div>

            <div className="pt-4 border-t border-line/10 mt-auto">
              <button 
                onClick={() => updateMutation.mutate()}
                disabled={!name.trim() || !description.trim() || updateMutation.isPending}
                className="w-full bg-sienna text-bone px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save size={20} />
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
