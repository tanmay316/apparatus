import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Upload } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateClan } from '@/services/community';
import { useUIStore } from '@/stores/ui-store';
import { ClanV2, ClanVisibility } from '@/types';
import { compressImageFile } from '@/utils/image-compression';
import { CustomSelect } from '@/components/ui/CustomSelect';

export function EditClanSheet({ clan, isOpen, onClose }: { clan: ClanV2, isOpen: boolean, onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen]);

  const [name, setName] = useState(clan.name);
  const [description, setDescription] = useState(clan.description);
  const [visibility, setVisibility] = useState<ClanVisibility>(clan.visibility || 'public');
  const [tags, setTags] = useState(clan.tags.join(', '));
  const [coverUrl, setCoverUrl] = useState(clan.coverUrl || '');
  const [isCompressing, setIsCompressing] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
      showToast('Cover image compressed and updated!', 'success');
    } catch {
      showToast('Failed to compress image', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      await updateClan(clan.id!, {
        name: name.trim(),
        description: description.trim(),
        visibility,
        tags: parsedTags,
        coverUrl: coverUrl || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clan', clan.id] });
      queryClient.invalidateQueries({ queryKey: ['publicClans'] });
      queryClient.invalidateQueries({ queryKey: ['userClans'] });
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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative bg-ink border-t border-line rounded-t-[32px] p-6 pb-safe overflow-y-auto max-h-[90dvh] shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-display text-bone">Edit Clan</h2>
                <p className="text-sm text-bone-dim">Update your clan identity, bio, and banner.</p>
              </div>
              <button onClick={onClose} className="p-2 bg-ink-2 rounded-full text-bone hover:text-sienna">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 pr-1">
              <div>
                <label htmlFor="edit-clan-name" className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase">Name</label>
                <input 
                  id="edit-clan-name"
                  name="editClanName"
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  className="input-field w-full text-bone text-lg"
                />
              </div>
              
              <div>
                <label htmlFor="edit-clan-desc" className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase">Description</label>
                <textarea 
                  id="edit-clan-desc"
                  name="editClanDescription"
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="input-field w-full h-24 resize-none text-bone"
                />
              </div>

              <div>
                <label htmlFor="edit-clan-visibility" className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase">Visibility</label>
                <CustomSelect
                  id="edit-clan-visibility"
                  name="editClanVisibility"
                  className="w-full"
                  value={visibility}
                  onChange={(val) => setVisibility(val as ClanVisibility)}
                  options={[
                    { value: 'public', label: 'Public (Anyone can join directly)' },
                    { value: 'private', label: 'Private (Request to join)' },
                    { value: 'closed', label: 'Closed (Not accepting new members)' },
                  ]}
                />
              </div>
              
              <div>
                <label htmlFor="edit-clan-tags" className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase">Tags (comma separated)</label>
                <input 
                  id="edit-clan-tags"
                  name="editClanTags"
                  type="text" value={tags} onChange={e => setTags(e.target.value)}
                  className="input-field w-full text-bone"
                  placeholder="e.g. running, beginners, hiit"
                />
              </div>
              
              <div>
                <label htmlFor="edit-clan-cover" className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image</label>
                <div className="flex gap-2">
                  <input 
                    id="edit-clan-cover"
                    name="editClanCover"
                    type="text" 
                    value={coverUrl.startsWith('data:') ? 'Image uploaded & compressed' : coverUrl} 
                    onChange={e => setCoverUrl(e.target.value)} 
                    disabled={coverUrl.startsWith('data:')}
                    placeholder="https://images.unsplash.com/..." 
                    className="input-field flex-1 text-xs font-mono truncate text-bone"
                  />
                  <input 
                    id="edit-clan-file-upload"
                    name="editClanFileUpload"
                    aria-label="Upload clan cover file"
                    ref={fileInputRef} 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageFile} 
                    className="hidden" 
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                    className="px-4 py-2 rounded-xl bg-ink-2 hover:bg-ink-3 border border-line text-xs font-mono text-bone flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <Upload size={14} /> {isCompressing ? 'Compressing...' : 'Upload'}
                  </button>
                </div>

                {coverUrl && (
                  <div className="relative mt-2 h-28 rounded-2xl overflow-hidden border border-line">
                    <img src={coverUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setCoverUrl('')}
                      className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-full transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending || !name.trim()}
                  className="btn-primary w-full py-4 text-lg font-bold flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {updateMutation.isPending ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
