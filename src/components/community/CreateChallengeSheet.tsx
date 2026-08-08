import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createChallenge } from '@/services/community';
import { ChallengeMetric } from '@/types';
import { Timestamp } from 'firebase/firestore';

export function CreateChallengeSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('distance');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('km');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>('public');
  const [durationDays, setDurationDays] = useState('30');
  const [coverUrl, setCoverUrl] = useState('https://images.unsplash.com/photo-1552674605-171ff7ea90b9?q=80&w=1470&auto=format&fit=crop');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + parseInt(durationDays));

      await createChallenge({
        title,
        description,
        metric,
        target: parseInt(target),
        unit,
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        visibility,
        coverUrl,
        createdBy: user.uid,
        creatorName: user.displayName || 'Unknown',
        creatorPhoto: user.photoURL || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      showToast('Challenge created successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create challenge', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !target) return;
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
            <h2 className="font-display text-2xl text-bone">Create Challenge</h2>
            <p className="text-sm text-bone-dim">Set a goal for everyone to achieve.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 100km Run Club" className="input-field w-full text-lg" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What are the rules and rewards?" className="input-field w-full min-h-[100px] py-3" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Metric</label>
              <CustomSelect 
                className="w-full"
                value={metric} 
                onChange={(val) => {
                  setMetric(val as ChallengeMetric);
                  if (val === 'distance') setUnit('km');
                  else if (val === 'calories') setUnit('kcal');
                  else if (val === 'workouts') setUnit('sessions');
                  else if (val === 'duration') setUnit('min');
                  else setUnit('');
                }}
                options={[
                  { value: 'distance', label: 'Distance' },
                  { value: 'calories', label: 'Calories' },
                  { value: 'workouts', label: 'Workouts' },
                  { value: 'duration', label: 'Duration' },
                  { value: 'steps', label: 'Steps' }
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Target Value</label>
              <div className="relative">
                <input required type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="100" className="input-field w-full pr-12" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-bone-dim uppercase">{unit}</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Duration (Days)</label>
              <CustomSelect
                className="w-full"
                value={durationDays}
                onChange={setDurationDays}
                options={[
                  { value: '7', label: '1 Week' },
                  { value: '14', label: '2 Weeks' },
                  { value: '30', label: '30 Days' },
                  { value: '90', label: '90 Days' }
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Visibility</label>
              <CustomSelect
                className="w-full"
                value={visibility}
                onChange={(val) => setVisibility(val as any)}
                options={[
                  { value: 'public', label: 'Public' },
                  { value: 'clan_only', label: 'Clan Only' }
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image URL</label>
            <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." className="input-field w-full" />
          </div>

          <button type="submit" disabled={createMutation.isPending || !title.trim() || !target} className="btn-primary w-full py-4 text-lg mt-4">
            {createMutation.isPending ? 'Creating...' : 'Launch Challenge'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
