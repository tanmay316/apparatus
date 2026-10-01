import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { createCommunityChallenge } from '@/services/events';
import { ChipGroup, Field, FormSection, FormSheet } from '@/components/ui/FormSheet';

const DURATIONS = [7, 14, 21, 30, 60, 90].map(d => ({ value: d, label: `${d} days` }));

export function CreateChallengeModal({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [targetCount, setTargetCount] = useState(100);
  const [dailyTarget, setDailyTarget] = useState('10 reps per day');
  const [rewards, setRewards] = useState('Exclusive Community Badge & XP Multiplier');
  const [rules, setRules] = useState('Log your workout session daily to maintain your streak.');

  const createMutation = useMutation({
    mutationFn: () => createCommunityChallenge({
      communityId,
      title: title.trim(),
      description: description.trim(),
      durationDays: Number(durationDays) || 30,
      targetCount: Number(targetCount) || 100,
      dailyTarget: dailyTarget.trim(),
      rewards: rewards.trim(),
      rules: rules.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityChallenges', communityId] });
      showToast('Community challenge created!');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create challenge', 'error')
  });

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!title.trim() || !description.trim()) return;
    createMutation.mutate();
  };

  return (
    <FormSheet
      icon={Trophy}
      title="Community challenge"
      subtitle="Motivate your community with a shared goal."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Launch challenge"
      busy={createMutation.isPending}
      busyLabel="Launching…"
    >
      <FormSection title="Basics">
        <Field id="cc-title" label="Challenge name" count={title.length} max={80} error={submitted && !title.trim() && 'Add a name for your challenge'}>
          <input id="cc-title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="e.g. 30-day handstand challenge" className="dx-input" aria-invalid={submitted && !title.trim()} />
        </Field>
        <Field id="cc-desc" label="Description" count={description.length} max={600} error={submitted && !description.trim() && 'Describe the goal'}>
          <textarea id="cc-desc" value={description} maxLength={600} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What participants will do and why…" className="dx-input" aria-invalid={submitted && !description.trim()} />
        </Field>
      </FormSection>

      <FormSection title="Goal">
        <Field label="Duration">
          <ChipGroup label="Duration" value={durationDays} onChange={setDurationDays} options={DURATIONS} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="cc-target" label="Total target">
            <input id="cc-target" type="number" inputMode="numeric" min={1} value={targetCount} onChange={e => setTargetCount(Number(e.target.value))} className="dx-input tabular-nums" />
          </Field>
          <Field id="cc-daily" label="Daily target">
            <input id="cc-daily" value={dailyTarget} maxLength={60} onChange={e => setDailyTarget(e.target.value)} placeholder="e.g. 10 reps a day" className="dx-input" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Rules & rewards">
        <Field id="cc-rules" label="Rules">
          <textarea id="cc-rules" value={rules} maxLength={600} onChange={e => setRules(e.target.value)} rows={2} placeholder="How progress is logged and checked…" className="dx-input" />
        </Field>
        <Field id="cc-rewards" label="Rewards" optional>
          <input id="cc-rewards" value={rewards} maxLength={120} onChange={e => setRewards(e.target.value)} placeholder="e.g. Community badge" className="dx-input" />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
