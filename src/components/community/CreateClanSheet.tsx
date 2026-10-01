import { useState } from 'react';
import { Ban, Bike, Dumbbell, Flame, Flower2, Footprints, Globe, Lock, Shield, Swords, Users, Waves, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClan } from '@/services/community';
import { ClanCategory, ClanVisibility } from '@/types';
import { compressImageFile } from '@/utils/image-compression';
import { ChoiceGroup, CoverPicker, Field, FormSection, FormSheet, type Choice } from '@/components/ui/FormSheet';

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
  const [isCompressing, setIsCompressing] = useState(false);

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressing(true);
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
      showToast('Cover photo added', 'success');
    } catch {
      showToast('Failed to compress image', 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      await createClan({
        name: name.trim(),
        description: description.trim(),
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

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !description.trim()) return;
    createMutation.mutate();
  };

  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);

  return (
    <FormSheet
      icon={Shield}
      title="Create a clan"
      subtitle="Build a community around how you train."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Create clan"
      busy={createMutation.isPending}
      busyLabel="Creating…"
      disabled={isCompressing}
    >
      <FormSection title="Identity">
        <CoverPicker value={coverUrl} onPick={handleImageFile} onClear={() => setCoverUrl('')} busy={isCompressing} />
        <Field id="create-clan-name" label="Clan name" count={name.length} max={40} error={submitted && !name.trim() && 'Give your clan a name'}>
          <input id="create-clan-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. Iron Lifters" className="dx-input" aria-invalid={submitted && !name.trim()} />
        </Field>
        <Field id="create-clan-desc" label="About" count={description.length} max={300} error={submitted && !description.trim() && 'Tell people what your clan is about'}>
          <textarea id="create-clan-desc" value={description} maxLength={300} onChange={e => setDescription(e.target.value)} placeholder="Mission, training style, who should join…" className="dx-input" rows={3} aria-invalid={submitted && !description.trim()} />
        </Field>
      </FormSection>

      <FormSection title="Focus" description="Helps the right people find you.">
        <ChoiceGroup label="Category" columns={3} value={category} onChange={setCategory} options={CATEGORIES} />
        <Field id="create-clan-tags" label="Tags" optional hint={tagList.length ? undefined : 'Separate with commas.'}>
          <input id="create-clan-tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="hypertrophy, mornings, beginners" className="dx-input" />
          {tagList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tagList.slice(0, 8).map(t => <span key={t} className="dx-tag">#{t}</span>)}
            </div>
          )}
        </Field>
      </FormSection>

      <FormSection title="Membership">
        <ChoiceGroup label="Visibility" columns={1} value={visibility} onChange={setVisibility} options={VISIBILITY} />
      </FormSection>
    </FormSheet>
  );
}

const CATEGORIES: Choice<ClanCategory>[] = [
  { value: 'General', label: 'General', icon: Users },
  { value: 'Gym', label: 'Gym', icon: Dumbbell },
  { value: 'Calisthenics', label: 'Calisthenics', icon: Zap },
  { value: 'Running', label: 'Running', icon: Footprints },
  { value: 'Cycling', label: 'Cycling', icon: Bike },
  { value: 'CrossFit', label: 'CrossFit', icon: Flame },
  { value: 'Yoga', label: 'Yoga', icon: Flower2 },
  { value: 'MMA', label: 'MMA', icon: Swords },
  { value: 'Swimming', label: 'Swimming', icon: Waves },
];

const VISIBILITY: Choice<ClanVisibility>[] = [
  { value: 'public', label: 'Public', description: 'Anyone can find and join instantly.', icon: Globe },
  { value: 'private', label: 'Private', description: 'People request to join; you approve them.', icon: Lock },
  { value: 'closed', label: 'Closed', description: 'Visible, but not accepting new members.', icon: Ban },
];
