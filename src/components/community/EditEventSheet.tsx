import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSimpleEvent } from '@/services/community';
import { useUIStore } from '@/stores/ui-store';
import { SimpleEvent } from '@/types';
import { Timestamp } from 'firebase/firestore';

export function EditEventSheet({ event, isOpen, onClose }: { event: SimpleEvent, isOpen: boolean, onClose: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [locationName, setLocationName] = useState(event.location?.name || '');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(event.visibility);
  const [coverUrl, setCoverUrl] = useState(event.coverUrl || '');
  
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();

  const updateMutation = useMutation({
    mutationFn: async () => {
      await updateSimpleEvent(event.id!, {
        title,
        description,
        location: locationName ? { name: locationName } : undefined,
        visibility,
        coverUrl
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      showToast('Event updated successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update event', 'error')
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[400] flex flex-col justify-end">
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
              <h2 className="text-xl font-bold text-bone">Edit Event</h2>
              <button onClick={onClose} className="p-2 bg-ink-2 rounded-full text-bone hover:text-sienna">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Title</label>
                <input 
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
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
                <label className="block text-sm text-bone-dim mb-1 ml-2">Location</label>
                <input 
                  type="text" value={locationName} onChange={e => setLocationName(e.target.value)}
                  className="w-full bg-ink-2 border border-line/20 rounded-2xl px-4 py-3 text-bone focus:outline-none focus:border-sienna"
                />
              </div>

              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Visibility</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setVisibility('public')}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-colors ${visibility === 'public' ? 'bg-sienna text-bg' : 'bg-ink-2 text-bone hover:bg-ink-3'}`}
                  >
                    Public
                  </button>
                  <button 
                    onClick={() => setVisibility('clan_only')}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-colors ${visibility === 'clan_only' ? 'bg-sienna text-bg' : 'bg-ink-2 text-bone hover:bg-ink-3'}`}
                  >
                    Clan Only
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-bone-dim mb-1 ml-2">Cover Image URL</label>
                <input 
                  type="text" value={coverUrl} onChange={e => setCoverUrl(e.target.value)}
                  className="w-full bg-ink-2 border border-line/20 rounded-2xl px-4 py-3 text-bone focus:outline-none focus:border-sienna"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-line/10 mt-auto">
              <button 
                onClick={() => updateMutation.mutate()}
                disabled={!title.trim() || updateMutation.isPending}
                className="w-full bg-sienna text-bone px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save size={20} />
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
