import { useState } from 'react';
import { Bike, CalendarPlus, Dumbbell, Footprints, Globe, Shield, Sparkles, Users, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSimpleEvent } from '@/services/community';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';
import { EntryFeeField, PriceField, parseEntryFee, parsePriceInput } from '@/components/market/PriceField';
import { useMarketConfig } from '@/components/market/CheckoutButton';
import { usePaymentsEnabled } from '@/lib/payments-mode';
import { ChoiceGroup, CoverPicker, Field, FormSection, FormSheet, spanLabel, STATUS_LABEL, StatusPill, type Choice } from '@/components/ui/FormSheet';

const ACTIVITY_TYPES: Choice<string>[] = [
  { value: 'Run', label: 'Run', icon: Footprints },
  { value: 'Calisthenics', label: 'Calisthenics', icon: Zap },
  { value: 'Workout', label: 'Workout', icon: Dumbbell },
  { value: 'Cycling', label: 'Ride', icon: Bike },
  { value: 'Meetup', label: 'Meetup', icon: Users },
  { value: 'Other', label: 'Other', icon: Sparkles },
];

const VISIBILITY: Choice<'public' | 'clan_only'>[] = [
  { value: 'public', label: 'Public', description: 'Anyone can RSVP.', icon: Globe },
  { value: 'clan_only', label: 'Clan only', description: 'Only your clan members.', icon: Shield },
];

export function CreateEventSheet({ onClose, prefilledClanId }: { onClose: () => void, prefilledClanId?: string }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState('Run');
  const [locationName, setLocationName] = useState('');
  const [prize, setPrize] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const payments = usePaymentsEnabled();
  const marketConfig = useMarketConfig();
  const [visibility, setVisibility] = useState<'public' | 'clan_only'>(prefilledClanId ? 'clan_only' : 'public');

  // Start & End Date / Time
  const nowStr = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const endDefaultStr = new Date(Date.now() + 3600000 * 3 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(nowStr);
  const [endDateTime, setEndDateTime] = useState(endDefaultStr);

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
      const compressed = await compressImageFile(file, 700, 700, 0.55);
      setCoverUrl(compressed);
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

  let dynamicStatus: 'upcoming' | 'active' | 'completed' = 'upcoming';
  if (currentNow >= startMs && currentNow <= endMs) dynamicStatus = 'active';
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

      const price = parsePriceInput(ticketPrice, marketConfig);
      if (price.error) throw new Error(price.error);
      const fee = parseEntryFee(entryFee);
      if (!payments && fee.error) throw new Error(fee.error);

      await createSimpleEvent({
        title: title.trim(),
        description: description.trim(),
        activityType,
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        status: dynamicStatus,
        prize: prize.trim() || undefined,
        ticketPrice: price.value,
        entryFee: payments ? undefined : fee.value ?? undefined,
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
    setSubmitted(true);

    if (!title.trim()) return;
    if (!description.trim()) return;
    if (!startDateTime || !endDateTime || datesInvalid) return;

    createMutation.mutate();
  };

  return (
    <FormSheet
      icon={CalendarPlus}
      title="New event"
      subtitle="Bring people together to train."
      aside={<StatusPill tone={dynamicStatus}>{STATUS_LABEL[dynamicStatus]}</StatusPill>}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Publish event"
      busy={createMutation.isPending}
      busyLabel="Publishing…"
      disabled={isCompressing}
    >
      <FormSection title="Basics">
        <CoverPicker value={coverUrl} onPick={handleImageFile} onClear={() => setCoverUrl('')} busy={isCompressing} />
        <Field id="event-title" label="Event name" count={title.length} max={80} error={submitted && !title.trim() && 'Add a name for your event'}>
          <input id="event-title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sunday 10K community run" className="dx-input" aria-invalid={submitted && !title.trim()} />
        </Field>
        <Field id="event-desc" label="Details" count={description.length} max={1000} error={submitted && !description.trim() && 'Describe the plan, meeting point and pace'}>
          <textarea id="event-desc" value={description} maxLength={1000} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Schedule, meeting point, pace groups, what to bring…" className="dx-input" aria-invalid={submitted && !description.trim()} />
        </Field>
        <Field label="Activity">
          <ChoiceGroup label="Activity" columns={3} value={activityType} onChange={setActivityType} options={ACTIVITY_TYPES} />
        </Field>
      </FormSection>

      <FormSection title="When & where">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="event-start" label="Starts">
            <input id="event-start" type="datetime-local" value={startDateTime} onChange={e => setStartDateTime(e.target.value)} className="dx-input" />
          </Field>
          <Field id="event-end" label="Ends" error={datesInvalid && 'Must be after the start'} hint={!datesInvalid ? `Lasts ${spanLabel(startMs, endMs)}` : undefined}>
            <input id="event-end" type="datetime-local" value={endDateTime} onChange={e => setEndDateTime(e.target.value)} className="dx-input" aria-invalid={datesInvalid} />
          </Field>
        </div>
        <Field id="event-location" label="Location" optional>
          <input id="event-location" value={locationName} maxLength={120} onChange={e => setLocationName(e.target.value)} placeholder="e.g. Central Park, Gate 4" className="dx-input" />
        </Field>
      </FormSection>

      <FormSection title="Access & rewards">
        {!prefilledClanId && (
          <ChoiceGroup label="Who can join" value={visibility} onChange={setVisibility} options={VISIBILITY} />
        )}
        <PriceField value={ticketPrice} onChange={setTicketPrice} bucket="ticket" label="Ticket price" unit="ticket" />
        <EntryFeeField id="event-fee" value={entryFee} onChange={setEntryFee} />
        <Field id="event-prize" label="Prizes" optional>
          <input id="event-prize" value={prize} maxLength={120} onChange={e => setPrize(e.target.value)} placeholder="e.g. Medals for the top 3" className="dx-input" />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
