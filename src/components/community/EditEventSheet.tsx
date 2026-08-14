import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Trophy, Upload, MapPin, Calendar } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSimpleEvent } from '@/services/community';
import { useUIStore } from '@/stores/ui-store';
import { SimpleEvent } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { compressImageFile } from '@/utils/image-compression';

export function EditEventSheet({ event, isOpen, onClose }: { event: SimpleEvent, isOpen: boolean, onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen]);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [locationName, setLocationName] = useState(event.location?.name || '');
  const [prize, setPrize] = useState(event.prize || '');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(event.visibility);
  const [coverUrl, setCoverUrl] = useState(event.coverUrl || '');
  const [isCompressing, setIsCompressing] = useState(false);

  // Start Date / Time
  const initialStart = event.startTime?.toDate ? event.startTime.toDate() : new Date();
  const startStr = new Date(initialStart.getTime() - initialStart.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(startStr);

  // Custom Duration
  const [durationVal, setDurationVal] = useState((event.durationValue || 2).toString());
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>(event.durationUnit || 'hours');

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
      showToast('Image compressed and updated!', 'success');
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

      await updateSimpleEvent(event.id!, {
        title: title.trim(),
        description: description.trim(),
        location: locationName.trim() ? { name: locationName.trim() } : undefined,
        prize: prize.trim() || undefined,
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        durationValue: numVal,
        durationUnit,
        visibility,
        coverUrl
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      queryClient.invalidateQueries({ queryKey: ['publicEvents'] });
      queryClient.invalidateQueries({ queryKey: ['clanEvents'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityEvents'] });
      showToast('Event updated successfully!', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update event', 'error')
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
                <h2 className="text-2xl font-display text-bone">Edit Event</h2>
                <p className="text-sm text-bone-dim">Update details, schedule, location, or prize.</p>
              </div>
              <button onClick={onClose} className="p-2 bg-ink-2 rounded-full text-bone hover:text-sienna">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 pr-1">
              <div>
                <label className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase">Title</label>
                <input 
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
                  className="input-field w-full text-bone text-lg"
                />
              </div>
              
              <div>
                <label className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase">Description</label>
                <textarea 
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="input-field w-full h-24 resize-none text-bone"
                />
              </div>
              
              <div>
                <label className="block text-xs font-mono text-bone-dim mb-1 ml-1 uppercase flex items-center gap-1">
                  <MapPin size={13} /> Location
                </label>
                <input 
                  type="text" value={locationName} onChange={e => setLocationName(e.target.value)}
                  className="input-field w-full text-bone"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-amber-300 font-bold mb-1 ml-1 uppercase flex items-center gap-1.5">
                  <Trophy size={14} /> Prize & Rewards (Optional)
                </label>
                <input 
                  type="text" value={prize} onChange={e => setPrize(e.target.value)}
                  placeholder="e.g. 🥇 1st: Gold Badge + Custom Trophy, 🥈 2nd: Silver Badge"
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
                <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Cover Image</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
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
                  <div className="relative mt-2 h-24 rounded-2xl overflow-hidden border border-line">
                    <img src={coverUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setCoverUrl('')}
                      className="absolute top-2 right-2 p-1 bg-black/70 hover:bg-black text-white rounded-full transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending || !title.trim()}
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
