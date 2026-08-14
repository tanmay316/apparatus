import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Camera, Shield, Upload } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClan } from '@/services/community';
import { ClanCategory, ClanVisibility } from '@/types';
import { compressImageFile } from '@/utils/image-compression';

export function CreateClanSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('community-create-open');
    return () => document.body.classList.remove('community-create-open');
  }, []);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ClanCategory>('General');
  const [visibility, setVisibility] = useState<ClanVisibility>('public');
  const [tags, setTags] = useState('');
  const [coverUrl, setCoverUrl] = useState('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop');
  const [isCompressing, setIsCompressing] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
      showToast('Clan cover photo compressed & attached!', 'success');
    } catch {
      showToast('Failed to compress image', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      await createClan({
        name: name.trim(),
        description: description.trim(),
        category,
        visibility,
        tags: tagList,
        coverUrl,
        leaderId: user.uid,
        leaderName: user.displayName || 'Unknown',
        location: { city: '', country: '' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicClans'] });
      queryClient.invalidateQueries({ queryKey: ['userClans'] });
      showToast('Clan created successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create clan', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    createMutation.mutate();
  };

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-ink border-t border-line rounded-t-[32px] p-6 pb-safe overflow-y-auto max-h-[90dvh]"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="font-display text-2xl text-bone">Create Clan</h2>
            <p className="text-sm text-bone-dim">Start your own fitness community and lead.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Cover Image Preview */}
          <div className="relative h-36 bg-ink-3 rounded-2xl overflow-hidden border border-line group">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-bone-dim"><Shield size={32} /></div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Upload size={24} className="text-bone mb-1" />
              <span className="text-xs font-mono text-bone">{isCompressing ? 'Compressing...' : 'Upload Cover'}</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image</label>
            <div className="flex gap-2">
              <input 
                value={coverUrl.startsWith('data:') ? 'Image uploaded & compressed' : coverUrl} 
                onChange={e => setCoverUrl(e.target.value)} 
                disabled={coverUrl.startsWith('data:')}
                placeholder="https://..." 
                className="input-field flex-1 text-xs font-mono truncate" 
              />
              <input 
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
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Clan Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Iron Lifters" className="input-field w-full text-lg" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What is the mission and vision of your clan?" className="input-field w-full min-h-[80px] py-3" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Category</label>
              <CustomSelect
                className="w-full"
                value={category}
                onChange={(val) => setCategory(val as ClanCategory)}
                options={[
                  { value: 'General', label: 'General' },
                  { value: 'Calisthenics', label: 'Calisthenics' },
                  { value: 'Bodybuilding', label: 'Bodybuilding' },
                  { value: 'Running', label: 'Running' },
                  { value: 'CrossFit', label: 'CrossFit' },
                  { value: 'Powerlifting', label: 'Powerlifting' },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Visibility</label>
              <CustomSelect
                className="w-full"
                value={visibility}
                onChange={(val) => setVisibility(val as ClanVisibility)}
                options={[
                  { value: 'public', label: 'Public (Anyone can join)' },
                  { value: 'private', label: 'Private (Invite only)' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Tags (comma separated)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="fitness, hypertrophy, running" className="input-field w-full" />
          </div>

          <button type="submit" disabled={createMutation.isPending || !name.trim() || !description.trim()} className="btn-primary w-full py-4 text-lg mt-4 font-bold">
            {createMutation.isPending ? 'Creating...' : 'Create Clan'}
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
