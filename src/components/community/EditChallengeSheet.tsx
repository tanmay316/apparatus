import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Upload, Trophy, Sparkles, Image as ImageIcon, Calendar, Clock, AlertCircle } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
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
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
    }
    return () => document.body.classList.remove('community-create-open');
  }, [isOpen]);

  const [title, setTitle] = useState(challenge.title || '');
  const [description, setDescription] = useState(challenge.description || '');
  
  const initialMetric = ['distance', 'workouts', 'volume', 'calories', 'streak'].includes(challenge.metric) 
    ? challenge.metric 
    : 'other';
  const [metric, setMetric] = useState<string>(initialMetric);
  const [customMetric, setCustomMetric] = useState(initialMetric === 'other' ? challenge.metric : '');
  const [target, setTarget] = useState(String(challenge.target || ''));
  const [unit, setUnit] = useState(challenge.unit || 'km');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(challenge.visibility || 'public');
  const [prize, setPrize] = useState(challenge.prize || '');

  // Dates
  const sDate = challenge.startDate?.toDate ? challenge.startDate.toDate() : new Date();
  const eDate = challenge.endDate?.toDate ? challenge.endDate.toDate() : new Date(Date.now() + 30 * 86400000);

  const [startDateTime, setStartDateTime] = useState(
    new Date(sDate.getTime() - sDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [endDateTime, setEndDateTime] = useState(
    new Date(eDate.getTime() - eDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );

  // Cover Image
  const [coverUrl, setCoverUrl] = useState(challenge.coverUrl || '');
  const [isCompressing, setIsCompressing] = useState(false);

  // Validation
  const [submitted, setSubmitted] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
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

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!user || !challenge.id) throw new Error('Invalid state');
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

      await updateChallenge(challenge.id, {
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
        coverUrl: coverUrl || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] });
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
      showToast('Challenge updated successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update challenge', 'error')
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

    editMutation.mutate();
  };

  if (!isOpen) return null;

  const isCustomMetric = metric === 'other';

  return createPortal(
    <div className="fixed inset-0 z-[700] flex flex-col justify-end">
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
            <h2 className="font-display text-2xl text-bone">Edit Challenge</h2>
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
              className="input-field w-full text-sm font-sans text-bone"
            />
          </div>

          {/* Visibility */}
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

          <div className="pt-2">
            <button
              type="submit"
              disabled={editMutation.isPending || isCompressing}
              className="btn-primary w-full py-4 text-sm font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(205,111,72,0.3)] flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              {editMutation.isPending ? 'Saving Changes...' : 'Save Challenge Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
