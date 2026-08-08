import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClan } from '@/services/community';
import { ClanCategory, ClanVisibility } from '@/types';

export function CreateClanSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ClanCategory>('General');
  const [visibility, setVisibility] = useState<ClanVisibility>('public');
  const [tags, setTags] = useState('');
  const [coverUrl, setCoverUrl] = useState('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      await createClan({
        name,
        description,
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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
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
            <p className="text-sm text-bone-dim">Start your own community and lead.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Cover Image */}
          <div className="relative h-32 bg-ink-3 rounded-2xl overflow-hidden border border-line group">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover opacity-60" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-bone-dim"><Shield size={32} /></div>
            )}
            <button type="button" className="absolute inset-0 flex flex-col items-center justify-center bg-ink/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={24} className="text-bone mb-1" />
              <span className="text-xs font-mono text-bone">Change Cover</span>
            </button>
          </div>
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image URL</label>
            <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Clan Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Iron Lifters" className="input-field w-full text-lg" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this clan about?" className="input-field w-full min-h-[100px] py-3" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as ClanCategory)} className="input-field w-full">
                <option value="General">General</option>
                <option value="Calisthenics">Calisthenics</option>
                <option value="Gym">Gym</option>
                <option value="Running">Running</option>
                <option value="Cycling">Cycling</option>
                <option value="CrossFit">CrossFit</option>
                <option value="Yoga">Yoga</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Visibility</label>
              <select value={visibility} onChange={e => setVisibility(e.target.value as ClanVisibility)} className="input-field w-full">
                <option value="public">Public</option>
                <option value="private">Private (Invite Only)</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Tags (comma separated)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. strength, local" className="input-field w-full" />
          </div>

          <button type="submit" disabled={createMutation.isPending || !name.trim() || !description.trim()} className="btn-primary w-full py-4 text-lg mt-4">
            {createMutation.isPending ? 'Creating...' : 'Create Clan'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
