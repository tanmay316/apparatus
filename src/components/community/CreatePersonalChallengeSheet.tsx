import { useState, useEffect } from 'react';
import {
  Sparkles, Zap, Target, Dumbbell, Shield, Eye, Check, Activity, Route, Flame, Timer, Footprints,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createChallenge, getUserClans } from '@/services/community';
import { ChallengeMetric, ChallengeActivityFilter } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';
import { Toggle } from '@/components/ui/Toggle';
import { ChipGroup, ChoiceGroup, CoverPicker, Field, FormSection, FormSheet, spanLabel, type Choice } from '@/components/ui/FormSheet';

const CATEGORY_OPTIONS: Choice<string>[] = [
  { value: 'cardio', label: 'Cardio', icon: Activity },
  { value: 'gym', label: 'Gym', icon: Dumbbell },
  { value: 'calisthenics', label: 'Calisthenics', icon: Zap },
  { value: 'mixed', label: 'Mixed', icon: Target },
  { value: 'other', label: 'Custom', icon: Sparkles },
];

const METRIC_OPTIONS: Choice<string>[] = [
  { value: 'distance', label: 'Distance', icon: Route },
  { value: 'workouts', label: 'Workouts', icon: Dumbbell },
  { value: 'calories', label: 'Calories', icon: Flame },
  { value: 'duration', label: 'Duration', icon: Timer },
  { value: 'steps', label: 'Steps', icon: Footprints },
  { value: 'other', label: 'Custom', icon: Sparkles },
];
const METRIC_UNIT: Record<string, string> = { distance: 'km', calories: 'kcal', workouts: 'sessions', duration: 'min', steps: 'steps', other: 'reps' };

const DURATION_PRESETS = [
  { label: '7 days', value: 7 },
  { label: '10 days', value: 10 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: 'Custom', value: 0 },
];

const ACTIVITY_FILTER_OPTIONS: { value: ChallengeActivityFilter; label: string }[] = [
  { value: 'run', label: 'Runs' },
  { value: 'walk', label: 'Walks' },
  { value: 'cycle', label: 'Rides' },
  { value: 'any_cardio', label: 'Any cardio' },
  { value: 'workout', label: 'Gym workouts' },
  { value: 'all', label: 'Everything' },
];

const SCOPE_OPTIONS: Choice<'personal' | 'clans'>[] = [
  { value: 'personal', label: 'Public', description: 'Anyone can join.', icon: Eye },
  { value: 'clans', label: 'My clans', description: 'Only members of clans you pick.', icon: Shield },
];

export function CreatePersonalChallengeSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('cardio');
  const [customCategory, setCustomCategory] = useState('');
  const [metric, setMetric] = useState<string>('distance');
  const [customMetric, setCustomMetric] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('km');
  const [autoTrack, setAutoTrack] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ChallengeActivityFilter>('run');
  const [durationPreset, setDurationPreset] = useState(7);
  const [prize, setPrize] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Scope
  const [scope, setScope] = useState<'personal' | 'clans'>('personal');
  const [selectedClanIds, setSelectedClanIds] = useState<string[]>([]);

  // Dates
  const nowStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const getEndStr = (days: number) => new Date(Date.now() + days * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [startDateTime, setStartDateTime] = useState(nowStr);
  const [endDateTime, setEndDateTime] = useState(getEndStr(7));

  // Fetch user's clans
  const { data: userClans = [] } = useQuery({
    queryKey: ['userClans', user?.uid],
    queryFn: () => (user ? getUserClans(user.uid) : []),
    enabled: !!user
  });

  // Update end date when preset changes
  useEffect(() => {
    if (durationPreset > 0) {
      const startMs = new Date(startDateTime).getTime();
      const endDate = new Date(startMs + durationPreset * 86400000);
      setEndDateTime(new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
  }, [durationPreset, startDateTime]);

  // Auto-set activity filter based on category
  useEffect(() => {
    if (category === 'cardio') setActivityFilter('run');
    else if (category === 'gym') setActivityFilter('workout');
    else if (category === 'calisthenics') setActivityFilter('workout');
    else if (category === 'mixed') setActivityFilter('all');
    else setActivityFilter('all');
  }, [category]);

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

  const toggleClan = (clanId: string) => {
    setSelectedClanIds(prev => 
      prev.includes(clanId) ? prev.filter(id => id !== clanId) : [...prev, clanId]
    );
  };

  const startMs = new Date(startDateTime).getTime();
  const endMs = new Date(endDateTime).getTime();
  const currentNow = Date.now();

  let dynamicStatus: 'upcoming' | 'active' | 'completed' = 'active';
  if (currentNow < startMs) dynamicStatus = 'upcoming';
  else if (endMs && currentNow > endMs) dynamicStatus = 'completed';

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid dates');
      if (end.getTime() <= start.getTime()) throw new Error('End date must be after start');

      const isCustom = metric === 'other';
      const finalMetric = (isCustom ? (customMetric.trim() || 'custom') : metric) as ChallengeMetric;
      const finalTarget = isCustom ? 1 : (parseFloat(target) || 1);
      const finalUnit = isCustom ? (unit.trim() || 'reps') : unit.trim();
      const finalCategory = category === 'other' ? (customCategory.trim() || 'other') : category;

      const selectedClans = userClans.filter(c => selectedClanIds.includes(c.id!));

      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        metric: finalMetric,
        target: finalTarget,
        unit: finalUnit,
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        status: dynamicStatus,
        visibility: scope === 'clans' ? 'clan_only' : 'public',
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1552674605-171ff7ea90b9?q=80&w=1470&auto=format&fit=crop',
        createdBy: user.uid,
        creatorName: user.displayName || 'Unknown',
        creatorPhoto: user.photoURL || '',
        challengeType: 'personal',
        category: finalCategory,
        autoTrack,
      };

      if (prize.trim()) payload.prize = prize.trim();
      if (autoTrack && activityFilter) payload.activityFilter = activityFilter;
      if (scope === 'clans') {
        if (selectedClans.length === 1) {
          payload.clanId = selectedClans[0].id;
          payload.clanName = selectedClans[0].name;
        }
        payload.clanIds = selectedClanIds;
        payload.clanNames = selectedClans.map(c => c.name);
      }

      await createChallenge(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publicChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['clanChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['allCommunityChallenges'] });
      queryClient.invalidateQueries({ queryKey: ['personalChallenges'] });
      showToast('Personal challenge created! 🎯', 'success');
      onClose();
    },
    onError: (err: any) => showToast(err?.message || 'Failed to create challenge', 'error')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const isCustom = metric === 'other';
    let firstErrorId: string | null = null;

    if (!title.trim()) firstErrorId = firstErrorId || 'input-title';
    if (!description.trim()) firstErrorId = firstErrorId || 'input-description';
    if (isCustom && !customMetric.trim()) firstErrorId = firstErrorId || 'input-customMetric';
    if (!isCustom && (!target || parseFloat(target) <= 0)) firstErrorId = firstErrorId || 'input-target';
    if (!startDateTime || !endDateTime) firstErrorId = firstErrorId || 'input-start';
    if (scope === 'clans' && selectedClanIds.length === 0) firstErrorId = firstErrorId || 'input-clans';

    if (firstErrorId) {
      document.getElementById(firstErrorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    createMutation.mutate();
  };

  const isCustomMetric = metric === 'other';
  const targetInvalid = submitted && !isCustomMetric && (!target || parseFloat(target) <= 0);
  const datesInvalid = !(endMs > startMs);

  return (
    <FormSheet
      icon={Target}
      title="Personal challenge"
      subtitle="Set your own goal; we track it from your activities."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Start challenge"
      busy={createMutation.isPending}
      busyLabel="Creating…"
      disabled={isCompressing}
    >
      <FormSection title="Basics">
        <ChoiceGroup label="Category" columns={3} value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        {category === 'other' && (
          <Field id="input-category" label="Category name">
            <input id="input-category" value={customCategory} maxLength={30} onChange={e => setCustomCategory(e.target.value)} placeholder="e.g. Mobility" className="dx-input" />
          </Field>
        )}
        <CoverPicker value={coverUrl} onPick={handleImageFile} onClear={() => setCoverUrl('')} busy={isCompressing} />
        <Field id="input-title" label="Challenge name" count={title.length} max={80} error={submitted && !title.trim() && 'Add a name for your challenge'}>
          <input id="input-title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="e.g. 15 km in 10 days" className="dx-input" aria-invalid={submitted && !title.trim()} />
        </Field>
        <Field id="input-description" label="Rules" count={description.length} max={600} error={submitted && !description.trim() && 'Describe the goal and the rules'}>
          <textarea id="input-description" value={description} maxLength={600} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What counts and how you'll measure it…" className="dx-input" aria-invalid={submitted && !description.trim()} />
        </Field>
      </FormSection>

      <FormSection title="Goal">
        <ChoiceGroup
          label="Metric"
          columns={3}
          value={metric}
          onChange={val => { setMetric(val); setUnit(METRIC_UNIT[val] || ''); }}
          options={METRIC_OPTIONS}
        />
        {isCustomMetric ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="input-customMetric" label="What to track" error={submitted && !customMetric.trim() && 'Required'}>
              <input id="input-customMetric" value={customMetric} maxLength={40} onChange={e => setCustomMetric(e.target.value)} placeholder="e.g. Pull-ups" className="dx-input" aria-invalid={submitted && !customMetric.trim()} />
            </Field>
            <Field id="input-unit" label="Unit">
              <input id="input-unit" value={unit} maxLength={16} onChange={e => setUnit(e.target.value)} placeholder="reps" className="dx-input" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field id="input-target" label="Target" error={targetInvalid && 'Enter a target above 0'}>
              <input id="input-target" type="number" inputMode="decimal" step="any" min={0} value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 15" className="dx-input tabular-nums" aria-invalid={targetInvalid} />
            </Field>
            <Field id="input-unit" label="Unit">
              <input id="input-unit" value={unit} maxLength={16} onChange={e => setUnit(e.target.value)} className="dx-input" />
            </Field>
          </div>
        )}
        <div className="dx-inset px-3.5">
          <Toggle
            checked={autoTrack}
            onChange={setAutoTrack}
            label="Track automatically"
            description="Progress updates from the activities you log."
            icon={<Zap size={16} />}
          />
          {autoTrack && (
            <div className="pb-3.5">
              <div className="text-[12px] font-medium dx-muted mb-2">Counts</div>
              <ChipGroup label="Activities that count" value={activityFilter} onChange={setActivityFilter} options={ACTIVITY_FILTER_OPTIONS} />
            </div>
          )}
        </div>
      </FormSection>

      <FormSection title="Schedule">
        <ChipGroup label="Duration" value={durationPreset} onChange={setDurationPreset} options={DURATION_PRESETS} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="input-start" label="Starts">
            <input id="input-start" type="datetime-local" value={startDateTime} onChange={e => { setStartDateTime(e.target.value); setDurationPreset(0); }} className="dx-input" />
          </Field>
          <Field id="input-end" label="Ends" error={datesInvalid && 'Must be after the start'} hint={!datesInvalid ? spanLabel(startMs, endMs) : undefined}>
            <input id="input-end" type="datetime-local" value={endDateTime} onChange={e => { setEndDateTime(e.target.value); setDurationPreset(0); }} className="dx-input" aria-invalid={datesInvalid} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Who can join">
        <ChoiceGroup label="Who can join" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        {scope === 'clans' && (
          <div id="input-clans">
            {userClans.length === 0 ? (
              <p className="dx-inset px-3.5 py-3 text-[12.5px] dx-muted">You haven&apos;t joined any clans yet. Join one to share challenges with it.</p>
            ) : (
              <div className="dx-inset overflow-hidden dx-list">
                {userClans.map(clan => {
                  const on = selectedClanIds.includes(clan.id!);
                  return (
                    <button key={clan.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggleClan(clan.id!)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left">
                      {clan.avatarUrl ? (
                        <img src={clan.avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                      ) : (
                        <span className="dx-badge-icon !w-8 !h-8 !rounded-full"><Shield size={14} /></span>
                      )}
                      <span className="flex-1 min-w-0 text-[13.5px] font-medium truncate">{clan.name}</span>
                      <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: on ? 'var(--dx-accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--dx-border-strong)', color: 'var(--dx-on-accent)' }}>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {submitted && selectedClanIds.length === 0 && userClans.length > 0 && (
              <p role="alert" className="mt-1.5 text-[12px] font-medium" style={{ color: '#dc2626' }}>Pick at least one clan</p>
            )}
          </div>
        )}
        <Field id="input-prize" label="Prize" optional>
          <input id="input-prize" value={prize} maxLength={120} onChange={e => setPrize(e.target.value)} placeholder="e.g. Bragging rights" className="dx-input" />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
