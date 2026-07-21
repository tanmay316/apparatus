import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { updateEvent } from '@/services/events';
import type { AppEvent, EventCategory, EventType, GenderRestriction, SkillLevel } from '@/types';

const CATEGORIES: EventCategory[] = ['Gym', 'Calisthenics', 'Yoga', 'Running', 'Meetup', 'Workshop', 'Competition', 'Other'];

export function EditEventModal({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [banner, setBanner] = useState(event.banner || '');
  const [category, setCategory] = useState<EventCategory>(event.category || 'Meetup');
  const [eventType, setEventType] = useState<EventType>(event.eventType || 'Workout');
  const [genderRestriction, setGenderRestriction] = useState<GenderRestriction>(event.genderRestriction || 'Any');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(event.skillLevel || 'All Levels');
  const [venueName, setVenueName] = useState(event.location.venueName);
  const [capacity, setCapacity] = useState(event.capacity);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!event.id) return;
      await updateEvent(event.id, {
        title,
        description,
        banner,
        category,
        eventType,
        genderRestriction,
        skillLevel,
        location: {
          ...event.location,
          venueName,
        },
        capacity: Number(capacity) || 20,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['publishedEvents'] });
      queryClient.invalidateQueries({ queryKey: ['userSubmittedEvents'] });
      showToast('Event updated successfully!');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to update event', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-2xl w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Edit Event</h2>
            <p className="text-xs sm:text-sm text-bone-dim mt-0.5">Update details for {event.title}.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} className="input-field w-full min-h-[100px] py-3" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as EventCategory)} className="input-field w-full">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Event Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value as EventType)} className="input-field w-full">
                <option value="Workout">Workout</option>
                <option value="Competition">Competition</option>
                <option value="Social">Social</option>
                <option value="Workshop">Workshop</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Skill Level</label>
              <select value={skillLevel} onChange={e => setSkillLevel(e.target.value as SkillLevel)} className="input-field w-full">
                <option value="All Levels">All Levels</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Capacity</label>
              <input type="number" min={1} value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="input-field w-full" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Venue / Location</label>
            <input required value={venueName} onChange={e => setVenueName(e.target.value)} className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Banner Image URL</label>
            <input value={banner} onChange={e => setBanner(e.target.value)} className="input-field w-full" />
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={updateMutation.isPending || !title.trim()} className="btn-primary px-6 py-2">{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
