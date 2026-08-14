import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Trophy, Calendar } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateChallenge } from '@/services/community';
import { ChallengeV2, ChallengeMetric } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';

interface EditChallengeSheetProps {
  challenge: ChallengeV2;
  isOpen: boolean;
  onClose: () => void;
}

export function EditChallengeSheet({ challenge, isOpen, onClose }: EditChallengeSheetProps) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(challenge.title);
  const [description, setDescription] = useState(challenge.description);

  const standardMetrics = ['distance', 'calories', 'workouts', 'duration', 'steps'];
  const isCustomInitially = !standardMetrics.includes(challenge.metric);
  const [metric, setMetric] = useState<string>(isCustomInitially ? 'other' : challenge.metric);
  const [customMetric, setCustomMetric] = useState(isCustomInitially ? challenge.metric : '');

  const [target, setTarget] = useState(challenge.target.toString());
  const [unit, setUnit] = useState(challenge.unit);
  const [prize, setPrize] = useState(challenge.prize || '');
  const [status, setStatus] = useState(challenge.status);
  const [coverUrl, setCoverUrl] = useState(challenge.coverUrl || '');
  const [isCompressing, setIsCompressing] = useState(false);

  // Start Date / Time
  const initialStart = challenge.startDate?.toDate ? challenge.startDate.toDate() : new Date();
  const startStr = new Date(initialStart.getTime() - initialStart.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(startStr);

  // Custom Duration
  const [durationVal, setDurationVal] = useState((challenge.durationValue || 30).toString());
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>(challenge.durationUnit || 'days');

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressedDataUrl = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressedDataUrl);
      showToast('Image compressed & attached!', 'success');
    } catch {
      showToast('Failed to compress image', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
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

      await updateChallenge(challenge.id!, {
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
        status,
        coverUrl: coverUrl.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
      showToast('Challenge updated successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update challenge', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !target) return;
    updateMutation.mutate();
  };

  if (!isOpen) return null;

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
            <h2 className="font-display text-2xl text-bone">Edit Challenge</h2>
            <p className="text-sm text-bone-dim">Update rules, goals, duration, prize, or status.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} className="input-field w-full text-lg text-bone" />
          </div>
          
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} className="input-field w-full min-h-[90px] py-3 text-bone" />
          </div>

          {/* Metric & Target Editing */}
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
                <input required type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} className="input-field w-full pr-14 text-bone" />
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
                  className="input-field w-full text-xs text-bone"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-amber-300 uppercase mb-1">Unit of Measurement</label>
                <input
                  required
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="e.g. reps, sets, liters"
                  className="input-field w-full text-xs text-bone"
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
              placeholder="e.g. 🥇 1st: Gold Badge, 🥈 2nd: Silver Badge, 🥉 3rd: Bronze Badge" 
              className="input-field w-full border-amber-400/30 text-bone" 
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
              className="input-field w-full text-sm font-mono text-bone"
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
                className="input-field w-full font-mono text-bone"
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

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Status</label>
            <CustomSelect 
              className="w-full"
              value={status} 
              onChange={(val) => setStatus(val as any)}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'active', label: 'Active' },
                { value: 'completed', label: 'Completed' }
              ]}
            />
          </div>

          {/* Cover Photo Upload & Compressor */}
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image</label>
            <div className="flex gap-2">
              <input 
                value={coverUrl.startsWith('data:') ? 'Image uploaded & compressed' : coverUrl} 
                onChange={e => setCoverUrl(e.target.value)} 
                disabled={coverUrl.startsWith('data:')}
                placeholder="https://..." 
                className="input-field flex-1 text-xs font-mono truncate text-bone" 
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

          <button type="submit" disabled={updateMutation.isPending || !title.trim() || !target} className="btn-primary w-full py-4 text-lg mt-4 font-bold">
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
