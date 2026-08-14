import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Upload, Trophy, Sparkles, Image as ImageIcon, Calendar } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createChallenge } from '@/services/community';
import { ChallengeMetric } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';

export function CreateChallengeSheet({ onClose, prefilledClanId }: { onClose: () => void, prefilledClanId?: string }) {
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
  const [metric, setMetric] = useState<string>('distance');
  const [customMetric, setCustomMetric] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('km');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(prefilledClanId ? 'clan_only' : 'public');
  const [prize, setPrize] = useState('');

  // Start Date / Time
  const defaultStartStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(defaultStartStr);

  // Custom Duration
  const [durationVal, setDurationVal] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>('days');

  // Cover Image
  const [coverUrl, setCoverUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressedDataUrl = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressedDataUrl);
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

      const finalMetric = (metric === 'other' ? (customMetric.trim() || 'custom') : metric) as ChallengeMetric;

      await createChallenge({
        title: title.trim(),
        description: description.trim(),
        metric: finalMetric,
        target: parseFloat(target),
        unit: unit.trim(),
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        durationValue: numVal,
        durationUnit,
        prize: prize.trim() || undefined,
        visibility,
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1552674605-171ff7ea90b9?q=80&w=1470&auto=format&fit=crop',
        createdBy: user.uid,
        creatorName: user.displayName || 'Unknown',
        creatorPhoto: user.photoURL || '',
        clanId: prefilledClanId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
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

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-ink border-t border-line rounded-t-[32px] p-6 pb-safe overflow-y-auto max-h-[90dvh] shadow-2xl"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="font-display text-2xl text-bone">Create Challenge</h2>
            <p className="text-sm text-bone-dim">Set goals, custom durations, prizes, and rewards.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 1000 Pushups Challenge" className="input-field w-full text-lg" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="What are the rules, goals, and details?" className="input-field w-full min-h-[90px] py-3" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Metric / Goal</label>
              <CustomSelect 
                className="w-full"
                value={metric} 
                onChange={(val) => {
                  setMetric(val);
                  if (val === 'distance') setUnit('km');
                  else if (val === 'calories') setUnit('kcal');
                  else if (val === 'workouts') setUnit('sessions');
                  else if (val === 'duration') setUnit('min');
                  else if (val === 'steps') setUnit('steps');
                  else if (val === 'other') setUnit('reps');
                }}
                options={[
                  { value: 'distance', label: 'Distance' },
                  { value: 'calories', label: 'Calories' },
                  { value: 'workouts', label: 'Workouts' },
                  { value: 'duration', label: 'Duration' },
                  { value: 'steps', label: 'Steps' },
                  { value: 'other', label: 'Other (Custom Metric)' }
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Target Value</label>
              <div className="relative">
                <input required type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="100" className="input-field w-full pr-14" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-bone-dim uppercase">{unit}</span>
              </div>
            </div>
          </div>

          {/* Custom Metric Fields if 'other' is selected */}
          {metric === 'other' && (
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-ink-2/60 border border-line/40 rounded-2xl">
              <div>
                <label className="block text-[10px] font-mono text-amber-300 uppercase mb-1">Custom Metric Name</label>
                <input
                  required
                  value={customMetric}
                  onChange={e => setCustomMetric(e.target.value)}
                  placeholder="e.g. Pull-ups / Water"
                  className="input-field w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-amber-300 uppercase mb-1">Unit of Measurement</label>
                <input
                  required
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="e.g. reps, sets, liters"
                  className="input-field w-full text-xs"
                />
              </div>
            </div>
          )}

          {/* Prize / Rewards Field */}
          <div>
            <label className="block text-xs font-mono text-amber-300 font-bold mb-1 uppercase flex items-center gap-1.5">
              <Trophy size={14} /> Prize & Rewards
            </label>
            <input 
              value={prize} 
              onChange={e => setPrize(e.target.value)} 
              placeholder="e.g. 🥇 1st: Gold Badge + 500 XP, 🥈 2nd: Silver Badge, 🥉 3rd: Bronze Badge" 
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
              value={startDateTime}
              onChange={e => setStartDateTime(e.target.value)}
              className="input-field w-full text-sm font-mono"
            />
          </div>
          
          {/* Custom Duration Value + Unit */}
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
                placeholder="30"
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

          <button type="submit" disabled={createMutation.isPending || !title.trim() || !target} className="btn-primary w-full py-4 text-lg mt-4 font-bold">
            {createMutation.isPending ? 'Launching...' : 'Launch Challenge'}
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
