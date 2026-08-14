import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Upload, Trophy, Sparkles, Image as ImageIcon, Calendar, Clock, AlertCircle } from 'lucide-react';
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
  const nowStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const nextMonthStr = new Date(Date.now() + 30 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(nowStr);
  const [endDateTime, setEndDateTime] = useState(nextMonthStr);

  // Cover Image
  const [coverUrl, setCoverUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);

  // Validation
  const [submitted, setSubmitted] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressedDataUrl = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressedDataUrl);
      showToast('Image attached and compressed!', 'success');
    } catch {
      showToast('Failed to compress image', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  // Dynamic status based on start & end dates
  const startMs = new Date(startDateTime).getTime();
  const endMs = new Date(endDateTime).getTime();
  const currentNow = Date.now();

  let dynamicStatus: 'upcoming' | 'active' | 'completed' = 'active';
  let dynamicStatusLabel = '🔥 Active (Ongoing)';
  let dynamicStatusColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

  if (currentNow < startMs) {
    dynamicStatus = 'upcoming';
    dynamicStatusLabel = '🟢 Upcoming';
    dynamicStatusColor = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  } else if (endMs && currentNow > endMs) {
    dynamicStatus = 'completed';
    dynamicStatusLabel = '🏁 Completed';
    dynamicStatusColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid start or end date');
      }
      if (end.getTime() <= start.getTime()) {
        throw new Error('End date must be after start date');
      }

      const isCustom = metric === 'other';
      const finalMetric = (isCustom ? (customMetric.trim() || 'custom') : metric) as ChallengeMetric;
      const finalTarget = isCustom ? 1 : (parseFloat(target) || 1);
      const finalUnit = isCustom ? (unit.trim() || 'reps') : unit.trim();

      await createChallenge({
        title: title.trim(),
        description: description.trim(),
        metric: finalMetric,
        target: finalTarget,
        unit: finalUnit,
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        status: dynamicStatus,
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
    setSubmitted(true);

    const isCustom = metric === 'other';
    if (!title.trim()) return;
    if (!description.trim()) return;
    if (isCustom && !customMetric.trim()) return;
    if (!isCustom && (!target || parseFloat(target) <= 0)) return;
    if (!startDateTime || !endDateTime) return;

    createMutation.mutate();
  };

  const isCustomMetric = metric === 'other';

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-ink border-t border-line rounded-t-[32px] overflow-hidden max-h-[92dvh] flex flex-col shadow-2xl text-bone"
      >
        <div className="flex items-center justify-between p-6 border-b border-line">
          <div>
            <h2 className="font-display text-2xl text-bone">Create Challenge</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${dynamicStatusColor}`}>
                {dynamicStatusLabel}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-ink-2 hover:bg-ink-3 rounded-full text-bone transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Cover Photo Upload with Live Preview */}
          <div className="space-y-2">
            <label className="block text-xs font-mono text-bone-dim uppercase">Cover Photo / Banner</label>
            {coverUrl ? (
              <div className="relative max-h-56 w-full rounded-2xl overflow-hidden border border-line/40 group bg-ink-2/80 flex items-center justify-center p-2">
                <img src={coverUrl} alt="Preview" className="w-full max-h-52 object-contain rounded-xl" />
                <button
                  type="button"
                  onClick={() => setCoverUrl('')}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/80 hover:bg-black text-red-400 transition-colors shadow-lg"
                  title="Remove Image"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressing}
                  className="btn-secondary flex-1 py-3 text-xs font-mono flex items-center justify-center gap-2"
                >
                  <Upload size={14} /> {isCompressing ? 'Compressing...' : 'Upload Image'}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFile}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            )}
            {!coverUrl && (
              <input
                type="url"
                value={coverUrl}
                onChange={e => setCoverUrl(e.target.value)}
                placeholder="Or paste image URL (https://...)"
                className="input-field w-full text-xs font-mono text-bone py-2"
              />
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-mono text-bone-dim uppercase mb-1">Challenge Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Double Pahadi Climb Challenge"
              className={`input-field w-full text-sm font-sans text-bone ${
                submitted && !title.trim() ? 'border-red-500 bg-red-500/10 focus:border-red-500' : ''
              }`}
            />
            {submitted && !title.trim() && (
              <span className="text-red-400 text-[11px] font-mono mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> This field is required
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-mono text-bone-dim uppercase mb-1">Description & Rules *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the challenge rules, goal, and evaluation criteria..."
              className={`input-field w-full text-sm font-sans text-bone ${
                submitted && !description.trim() ? 'border-red-500 bg-red-500/10 focus:border-red-500' : ''
              }`}
            />
            {submitted && !description.trim() && (
              <span className="text-red-400 text-[11px] font-mono mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> This field is required
              </span>
            )}
          </div>

          {/* Metric Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-mono text-bone-dim uppercase">Challenge Type / Metric</label>
            <CustomSelect
              value={metric}
              onChange={(val) => {
                setMetric(val);
                if (val === 'distance') setUnit('km');
                else if (val === 'calories') setUnit('kcal');
                else if (val === 'workouts' || val === 'streak') setUnit('days');
                else if (val === 'volume') setUnit('kg');
                else if (val === 'other') setUnit('reps');
              }}
              options={[
                { value: 'distance', label: '🏃 Distance (Cardio)' },
                { value: 'workouts', label: '🏋️ Workout Count' },
                { value: 'volume', label: '💪 Total Volume (kg)' },
                { value: 'calories', label: '🔥 Calories Burned' },
                { value: 'streak', label: '⚡ Daily Streak' },
                { value: 'other', label: '✨ Other (Custom Metric)' },
              ]}
            />

            {/* Custom Metric Name and Unit (when 'other' is selected) */}
            {isCustomMetric && (
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-ink-2 border border-line/40">
                <div>
                  <label className="block text-[10px] font-mono text-bone-dim uppercase mb-1">Custom Metric / Goal *</label>
                  <input
                    type="text"
                    value={customMetric}
                    onChange={e => setCustomMetric(e.target.value)}
                    placeholder="e.g. 250 Pahadi Steps"
                    className={`input-field w-full text-xs font-sans text-bone ${
                      submitted && !customMetric.trim() ? 'border-red-500 bg-red-500/10' : ''
                    }`}
                  />
                  {submitted && !customMetric.trim() && (
                    <span className="text-red-400 text-[10px] font-mono mt-1 block">* Required</span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-bone-dim uppercase mb-1">Unit of Measurement</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    placeholder="e.g. steps, reps, min"
                    className="input-field w-full text-xs font-mono text-bone"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Target & Unit (Hidden when metric === 'other' to eliminate redundancy) */}
          {!isCustomMetric && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-bone-dim uppercase mb-1">Target Value *</label>
                <input
                  type="number"
                  step="any"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder="e.g. 50"
                  className={`input-field w-full text-sm font-mono text-bone ${
                    submitted && (!target || parseFloat(target) <= 0) ? 'border-red-500 bg-red-500/10' : ''
                  }`}
                />
                {submitted && (!target || parseFloat(target) <= 0) && (
                  <span className="text-red-400 text-[11px] font-mono mt-1 block">* Required</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono text-bone-dim uppercase mb-1">Unit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  className="input-field w-full text-sm font-mono text-bone"
                />
              </div>
            </div>
          )}

          {/* Start & End Date / Time with Dynamic Status */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-bone-dim uppercase mb-1 flex items-center gap-1">
                  <Calendar size={13} className="text-emerald-400" /> Start Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={startDateTime}
                  onChange={e => setStartDateTime(e.target.value)}
                  className="input-field w-full text-xs font-mono text-bone"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-bone-dim uppercase mb-1 flex items-center gap-1">
                  <Calendar size={13} className="text-amber-400" /> End Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={endDateTime}
                  onChange={e => setEndDateTime(e.target.value)}
                  className={`input-field w-full text-xs font-mono text-bone ${
                    endMs <= startMs ? 'border-red-500 bg-red-500/10' : ''
                  }`}
                />
                {endMs <= startMs && (
                  <span className="text-red-400 text-[11px] font-mono mt-1 block">* End date must be after start date</span>
                )}
              </div>
            </div>
          </div>

          {/* Prize / Reward */}
          <div>
            <label className="block text-xs font-mono text-bone-dim uppercase mb-1 flex items-center gap-1">
              <Trophy size={13} className="text-amber-400" /> Prize / Rewards (Optional)
            </label>
            <input
              type="text"
              value={prize}
              onChange={e => setPrize(e.target.value)}
              placeholder="e.g. ₹5,000 Cash Prize + Gold Badge"
              className="input-field w-full text-sm font-sans text-bone"
            />
          </div>

          {/* Visibility */}
          {!prefilledClanId && (
            <div>
              <label className="block text-xs font-mono text-bone-dim uppercase mb-1">Visibility</label>
              <CustomSelect
                value={visibility}
                onChange={(val) => setVisibility(val as any)}
                options={[
                  { value: 'public', label: '🌍 Public (Anyone can join)' },
                  { value: 'clan_only', label: '🛡️ Clan Only' },
                ]}
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending || isCompressing}
              className="btn-primary w-full py-4 text-sm font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(205,111,72,0.3)] flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              {createMutation.isPending ? 'Publishing Challenge...' : 'Publish Challenge'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
