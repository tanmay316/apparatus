import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSimpleEvent } from '@/services/community';
import { Timestamp } from 'firebase/firestore';

export function CreateEventSheet({ onClose, prefilledClanId }: { onClose: () => void, prefilledClanId?: string }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState('Run');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [locationName, setLocationName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(prefilledClanId ? 'clan_only' : 'public');

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      
      const startDateTime = new Date(`${date}T${time}`);
      const endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000); // Default +2 hours

      await createSimpleEvent({
        title,
        description,
        activityType,
        startTime: Timestamp.fromDate(startDateTime),
        endTime: Timestamp.fromDate(endDateTime),
        location: { name: locationName },
        visibility,
        createdBy: user.uid,
        creatorName: user.displayName || 'Unknown',
        creatorPhoto: user.photoURL || '',
        clanId: prefilledClanId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      showToast('Event created successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create event', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !date || !time) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-[300] flex flex-col justify-end">
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
            <h2 className="font-display text-2xl text-bone">Create Event</h2>
            <p className="text-sm text-bone-dim">Organize a real-world or virtual meetup.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sunday Long Run" className="input-field w-full text-lg" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What should people expect?" className="input-field w-full min-h-[80px] py-3" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Date</label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Time</label>
              <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="input-field w-full" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Activity Type</label>
              <CustomSelect
                className="w-full"
                value={activityType}
                onChange={setActivityType}
                options={[
                  { value: 'Run', label: 'Run' },
                  { value: 'Ride', label: 'Ride' },
                  { value: 'Calisthenics', label: 'Calisthenics' },
                  { value: 'Yoga', label: 'Yoga' },
                  { value: 'Meetup', label: 'Meetup' }
                ]}
              />
            </div>
            <div className="space-y-1 relative z-30">
              <label className="text-[10px] font-mono text-bone-dim uppercase">Visibility</label>
              <CustomSelect
                className="w-full text-sm"
                value={visibility}
                disabled={!!prefilledClanId}
                onChange={(val) => setVisibility(val as any)}
                options={[
                  { value: 'public', label: 'Public' },
                  { value: 'clan_only', label: 'Clan Only' }
                ]}
              />
              {prefilledClanId && (
                <p className="text-[10px] font-mono text-sienna mt-1">Locked to clan because you are creating from within a clan.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Location (Optional)</label>
            <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. Central Park" className="input-field w-full" />
          </div>

          <button type="submit" disabled={createMutation.isPending || !title.trim() || !date || !time} className="btn-primary w-full py-4 text-lg mt-4">
            {createMutation.isPending ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
