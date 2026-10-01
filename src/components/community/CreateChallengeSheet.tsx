import { useState } from 'react';
import { CalendarCheck, Dumbbell, Flame, Footprints, Globe, Shield, Sparkles, Trophy, Weight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createChallenge } from '@/services/community';
import { ChallengeMetric } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';
import { PriceField, parsePriceInput } from '@/components/market/PriceField';
import { useMarketConfig } from '@/components/market/CheckoutButton';
import { ChoiceGroup, CoverPicker, Field, FormSection, FormSheet, spanLabel, STATUS_LABEL, StatusPill, type Choice } from '@/components/ui/FormSheet';

const METRICS: Choice<string>[] = [
  { value: 'distance', label: 'Distance', icon: Footprints },
  { value: 'workouts', label: 'Workouts', icon: Dumbbell },
  { value: 'volume', label: 'Volume', icon: Weight },
  { value: 'calories', label: 'Calories', icon: Flame },
  { value: 'streak', label: 'Streak', icon: CalendarCheck },
  { value: 'other', label: 'Custom', icon: Sparkles },
];
const METRIC_UNIT: Record<string, string> = { distance: 'km', calories: 'kcal', workouts: 'days', streak: 'days', volume: 'kg', other: 'reps' };

const VISIBILITY: Choice<'public' | 'clan_only'>[] = [
  { value: 'public', label: 'Public', description: 'Anyone can join.', icon: Globe },
  { value: 'clan_only', label: 'Clan only', description: 'Only your clan members.', icon: Shield },
];

export function CreateChallengeSheet({ onClose, prefilledClanId }: { onClose: () => void, prefilledClanId?: string }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<string>('distance');
  const [customMetric, setCustomMetric] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('km');
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(prefilledClanId ? 'clan_only' : 'public');
  const [prize, setPrize] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const marketConfig = useMarketConfig();

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
      showToast('Cover photo added', 'success');
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
  if (currentNow < startMs) dynamicStatus = 'upcoming';
  else if (endMs && currentNow > endMs) dynamicStatus = 'completed';
  const datesInvalid = !(endMs > startMs);

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

      const price = parsePriceInput(ticketPrice, marketConfig);
      if (price.error) throw new Error(price.error);

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
        ticketPrice: price.value,
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
    if (!startDateTime || !endDateTime || datesInvalid) return;

    createMutation.mutate();
  };

  const isCustomMetric = metric === 'other';
  const targetInvalid = submitted && !isCustomMetric && (!target || parseFloat(target) <= 0);

  return (
    <FormSheet
      icon={Trophy}
      title="New challenge"
      subtitle="Set a goal and compete on a live leaderboard."
      aside={<StatusPill tone={dynamicStatus}>{STATUS_LABEL[dynamicStatus]}</StatusPill>}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Publish challenge"
      busy={createMutation.isPending}
      busyLabel="Publishing…"
      disabled={isCompressing}
    >
      <FormSection title="Basics">
        <CoverPicker value={coverUrl} onPick={handleImageFile} onClear={() => setCoverUrl('')} busy={isCompressing} />
        <Field id="ch-title" label="Challenge name" count={title.length} max={80} error={submitted && !title.trim() && 'Add a name for your challenge'}>
          <input id="ch-title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="e.g. 100 km in October" className="dx-input" aria-invalid={submitted && !title.trim()} />
        </Field>
        <Field id="ch-desc" label="Rules" count={description.length} max={1000} error={submitted && !description.trim() && 'Explain how to take part and win'}>
          <textarea id="ch-desc" value={description} maxLength={1000} onChange={e => setDescription(e.target.value)} rows={4} placeholder="What counts, how progress is measured, how winners are picked…" className="dx-input" aria-invalid={submitted && !description.trim()} />
        </Field>
      </FormSection>

      <FormSection title="Goal" description="What participants are measured on.">
        <ChoiceGroup
          label="Metric"
          columns={3}
          value={metric}
          onChange={val => { setMetric(val); setUnit(METRIC_UNIT[val] || ''); }}
          options={METRICS}
        />
        {isCustomMetric ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="ch-custom" label="What to track" error={submitted && !customMetric.trim() && 'Required'}>
              <input id="ch-custom" value={customMetric} maxLength={40} onChange={e => setCustomMetric(e.target.value)} placeholder="e.g. Pull-ups" className="dx-input" aria-invalid={submitted && !customMetric.trim()} />
            </Field>
            <Field id="ch-unit" label="Unit">
              <input id="ch-unit" value={unit} maxLength={16} onChange={e => setUnit(e.target.value)} placeholder="reps" className="dx-input" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field id="ch-target" label="Target" error={targetInvalid && 'Enter a target above 0'}>
              <input id="ch-target" type="number" inputMode="decimal" step="any" min={0} value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 100" className="dx-input tabular-nums" aria-invalid={targetInvalid} />
            </Field>
            <Field id="ch-unit" label="Unit">
              <input id="ch-unit" value={unit} maxLength={16} onChange={e => setUnit(e.target.value)} className="dx-input" />
            </Field>
          </div>
        )}
      </FormSection>

      <FormSection title="Schedule">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="ch-start" label="Starts">
            <input id="ch-start" type="datetime-local" value={startDateTime} onChange={e => setStartDateTime(e.target.value)} className="dx-input" />
          </Field>
          <Field id="ch-end" label="Ends" error={datesInvalid && 'Must be after the start'} hint={!datesInvalid ? `Runs for ${spanLabel(startMs, endMs)}` : undefined}>
            <input id="ch-end" type="datetime-local" value={endDateTime} onChange={e => setEndDateTime(e.target.value)} className="dx-input" aria-invalid={datesInvalid} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Access & rewards">
        {!prefilledClanId && (
          <ChoiceGroup label="Who can join" value={visibility} onChange={setVisibility} options={VISIBILITY} />
        )}
        <PriceField value={ticketPrice} onChange={setTicketPrice} bucket="ticket" label="Entry fee" unit="entry" />
        <Field id="ch-prize" label="Prizes" optional>
          <input id="ch-prize" value={prize} maxLength={120} onChange={e => setPrize(e.target.value)} placeholder="e.g. Gold badge for the winner" className="dx-input" />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
