import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Upload, Trophy, Calendar, MapPin, Sparkles } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSimpleEvent } from '@/services/community';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';

export function CreateEventSheet({ onClose, prefilledClanId }: { onClose: () => void, prefilledClanId?: string }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('community-create-open');
    return () => document.body.classList.remove('community-create-open');
  }, []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState('Run');
  const [locationName, setLocationName] = useState('');
  const [prize, setPrize] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(prefilledClanId ? 'clan_only' : 'public');

  // Start Date / Time
  const defaultStartStr = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(defaultStartStr);

  // Custom Duration
  const [durationVal, setDurationVal] = useState('2');
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>('hours');

  // Cover Image
  const [coverUrl, setCoverUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
      showToast('Image compressed and attached!', 'success');
    } catch {
      showToast('Failed to compress image', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      
      const start = new Date(startDateTime);
      const end = new Date(start.getTime());

      const numVal = parseFloat(durationVal) || 1;
      if (durationUnit === 'minutes') {
        end.setMinutes(end.getMinutes() + numVal);
      } else if (durationUnit === 'hours') {
        end.setHours(end.getHours() + numVal);
      } else if (durationUnit === 'days') {
        end.setDate(end.getDate() + numVal);
      } else if (durationUnit === 'weeks') {
        end.setDate(end.getDate() + numVal * 7);
      } else if (durationUnit === 'months') {
        end.setMonth(end.getMonth() + numVal);
      }

      await createSimpleEvent({
        title: title.trim(),
        description: description.trim(),
        activityType,
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        durationValue: numVal,
        durationUnit,
        prize: prize.trim() || undefined,
        location: locationName.trim() ? { name: locationName.trim() } : undefined,
        visibility,
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?q=80&w=1470&auto=format&fit=crop',
        createdBy: user.uid,
        creatorName: user.displayName || 'Unknown',
        creatorPhoto: user.photoURL || '',
        clanId: prefilledClanId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
      showToast('Event created successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create event', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
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
            <h2 className="font-display text-2xl text-bone">Create Event</h2>
            <p className="text-sm text-bone-dim">Organize real-world or virtual meetups, prizes, and schedules.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sunday Morning 10K Run" className="input-field w-full text-lg" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What are the details, meetup spots, and rules?" className="input-field w-full min-h-[90px] py-3" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Activity Type</label>
              <CustomSelect
                className="w-full"
                value={activityType}
                onChange={setActivityType}
                options={[
                  { value: 'Run', label: 'Run / Jog' },
                  { value: 'Workout', label: 'Strength Workout' },
                  { value: 'Cycling', label: 'Cycling' },
                  { value: 'Calisthenics', label: 'Calisthenics Jam' },
                  { value: 'Yoga', label: 'Yoga & Recovery' },
                  { value: 'Other', label: 'Other Meetup' }
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase flex items-center gap-1">
                <MapPin size={13} /> Location / Virtual
              </label>
              <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. Central Park / Discord" className="input-field w-full" />
            </div>
          </div>

          {/* Prize / Rewards Field */}
          <div>
            <label className="block text-xs font-mono text-amber-300 font-bold mb-1 uppercase flex items-center gap-1.5">
              <Trophy size={14} /> Prize & Rewards (Optional)
            </label>
            <input 
              value={prize} 
              onChange={e => setPrize(e.target.value)} 
              placeholder="e.g. 🥇 1st: Gold Badge + Custom Trophy, 🥈 2nd: Silver Badge" 
              className="input-field w-full border-amber-400/30 focus:border-amber-400" 
            />
          </div>

          {/* Start Date & Time */}
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase flex items-center gap-1.5">
              <Calendar size={13} /> Start Date & Time
            </label>
            <input
              type="datetime-local"
              required
              value={startDateTime}
              onChange={e => setStartDateTime(e.target.value)}
              className="input-field w-full text-sm font-mono"
            />
          </div>

          {/* Custom Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Duration Length</label>
              <input
                type="number"
                min="1"
                required
                value={durationVal}
                onChange={e => setDurationVal(e.target.value)}
                className="input-field w-full font-mono"
                placeholder="2"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Duration Unit</label>
              <CustomSelect
                className="w-full"
                value={durationUnit}
                onChange={(val) => setDurationUnit(val as any)}
                options={[
                  { value: 'minutes', label: 'Minutes' },
                  { value: 'hours', label: 'Hours' },
                  { value: 'days', label: 'Days' },
                  { value: 'weeks', label: 'Weeks' },
                  { value: 'months', label: 'Months' }
                ]}
              />
            </div>
          </div>

          <div className="space-y-1 relative z-30">
            <label className="text-[10px] font-mono text-bone-dim uppercase">Visibility</label>
            <CustomSelect
              className="w-full text-sm"
              value={visibility}
              disabled={!!prefilledClanId}
              onChange={(val) => setVisibility(val as any)}
              options={[
                { value: 'public', label: 'Public (Everyone)' },
                { value: 'clan_only', label: 'Clan Only' }
              ]}
            />
            {prefilledClanId && (
              <p className="text-[10px] font-mono text-sienna mt-1">Locked to clan because you are creating from within a clan.</p>
            )}
          </div>

          {/* Cover Photo Upload & Compressor */}
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image</label>
            <div className="flex gap-2">
              <input 
                value={coverUrl.startsWith('data:') ? 'Image uploaded & compressed' : coverUrl} 
                onChange={e => setCoverUrl(e.target.value)} 
                disabled={coverUrl.startsWith('data:')}
                placeholder="https://images.unsplash.com/..." 
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

          <button type="submit" disabled={createMutation.isPending || !title.trim()} className="btn-primary w-full py-4 text-lg mt-4 font-bold">
            {createMutation.isPending ? 'Publishing...' : 'Publish Event'}
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
