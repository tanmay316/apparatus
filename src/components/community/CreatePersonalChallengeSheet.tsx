import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Upload, Trophy, Sparkles, Calendar, AlertCircle, Zap, Target,
  Dumbbell, Shield, Eye,
  ChevronDown, Check, Activity
} from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createChallenge, getUserClans } from '@/services/community';
import { ChallengeMetric, ChallengeActivityFilter } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { compressImageFile } from '@/utils/image-compression';

const CATEGORY_OPTIONS = [
  { id: 'cardio', label: 'Cardio', icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  { id: 'gym', label: 'Gym', icon: Dumbbell, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30' },
  { id: 'calisthenics', label: 'Calisthenics', icon: Zap, color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
  { id: 'mixed', label: 'Mixed', icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' },
  { id: 'other', label: 'Custom', icon: Sparkles, color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' },
];

const DURATION_PRESETS = [
  { label: '7 days', days: 7 },
  { label: '10 days', days: 10 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: 'Custom', days: 0 },
];

const ACTIVITY_FILTER_OPTIONS: { value: ChallengeActivityFilter; label: string }[] = [
  { value: 'run', label: '🏃 Running Only' },
  { value: 'walk', label: '🚶 Walking Only' },
  { value: 'cycle', label: '🚴 Cycling Only' },
  { value: 'any_cardio', label: '❤️ Any Cardio (Run/Walk/Cycle)' },
  { value: 'workout', label: '🏋️ Gym Workouts Only' },
  { value: 'all', label: '🌐 All Activities' },
];

export function CreatePersonalChallengeSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('community-create-open');
    return () => document.body.classList.remove('community-create-open');
  }, []);

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
  const [clanDropdownOpen, setClanDropdownOpen] = useState(false);

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
      showToast('Image attached!', 'success');
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

  return createPortal(
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} 
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="relative bg-ink border-t border-line rounded-t-[28px] overflow-hidden max-h-[94dvh] flex flex-col shadow-2xl text-bone"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-bone truncate">Personal Challenge</h2>
            <p className="text-[11px] text-bone-dim font-mono mt-0.5">Create your own fitness goal</p>
          </div>
          <button onClick={onClose} className="p-2 bg-ink-2 hover:bg-ink-3 rounded-full text-bone transition-colors shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 overflow-y-auto space-y-4 flex-1">
          {/* Category Selector — Horizontal Scroll */}
          <div className="space-y-2">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider">Category</label>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATEGORY_OPTIONS.map(cat => {
                const Icon = cat.icon;
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      active 
                        ? `${cat.bg} ${cat.color} scale-[1.02] shadow-sm` 
                        : 'bg-ink-2 border-line/30 text-bone-dim hover:border-line/50'
                    }`}
                  >
                    <Icon size={14} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
            {category === 'other' && (
              <input
                type="text"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder="Enter custom category name..."
                className="input-field w-full text-xs font-sans text-bone mt-1"
              />
            )}
          </div>

          {/* Cover Photo */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider">Cover Photo</label>
            <div 
              className="relative h-32 w-full rounded-2xl overflow-hidden border border-line/40 bg-ink-2/80 group cursor-pointer" 
              onClick={() => fileInputRef.current?.click()}
            >
              <img 
                src={coverUrl || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000&auto=format&fit=crop'} 
                alt="Preview" 
                className={`w-full h-full object-cover transition-all ${!coverUrl ? 'opacity-70 grayscale-[30%]' : ''}`} 
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <span className="text-white text-xs font-mono font-bold flex items-center gap-2">
                  <Upload size={14} /> {isCompressing ? 'Compressing...' : (coverUrl ? 'Change Cover' : 'Upload Cover Image')}
                </span>
              </div>
              {coverUrl && (
                <button
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setCoverUrl(''); }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-red-400 transition-colors z-10"
                ><X size={14} /></button>
              )}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageFile} accept="image/*" className="hidden" />
          </div>

          {/* Title */}
          <div id="input-title">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider mb-1">Challenge Title *</label>
            <input
              type="text"
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 15 km Run in 10 Days"
              className={`input-field w-full text-sm text-bone ${submitted && !title.trim() ? 'border-red-500 bg-red-500/10' : ''}`}
            />
            {submitted && !title.trim() && (
              <span className="text-red-400 text-[10px] font-mono mt-0.5 flex items-center gap-1"><AlertCircle size={10} /> Required</span>
            )}
          </div>

          {/* Description */}
          <div id="input-description">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider mb-1">Description & Rules *</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe the challenge goal, rules..."
              className={`input-field w-full text-sm text-bone resize-none ${submitted && !description.trim() ? 'border-red-500 bg-red-500/10' : ''}`}
            />
            {submitted && !description.trim() && (
              <span className="text-red-400 text-[10px] font-mono mt-0.5 flex items-center gap-1"><AlertCircle size={10} /> Required</span>
            )}
          </div>

          {/* Metric */}
          <div className="space-y-2">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider">Metric</label>
            <CustomSelect
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
                { value: 'distance', label: '🏃 Distance' },
                { value: 'workouts', label: '🏋️ Workout Count' },
                { value: 'calories', label: '🔥 Calories' },
                { value: 'duration', label: '⏱️ Duration (min)' },
                { value: 'steps', label: '👣 Steps' },
                { value: 'other', label: '✨ Custom' },
              ]}
            />

            {isCustomMetric && (
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-ink-2 border border-line/30" id="input-customMetric">
                <div>
                  <label className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5">Custom Metric *</label>
                  <input
                    type="text" value={customMetric} onChange={e => setCustomMetric(e.target.value)}
                    placeholder="e.g. Pull-ups" className={`input-field w-full text-xs text-bone ${submitted && !customMetric.trim() ? 'border-red-500' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5">Unit</label>
                  <input type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="reps" className="input-field w-full text-xs text-bone" />
                </div>
              </div>
            )}
          </div>

          {/* Target & Unit — Only when not custom */}
          {!isCustomMetric && (
            <div className="grid grid-cols-2 gap-2" id="input-target">
              <div>
                <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider mb-1">Target *</label>
                <input
                  type="number" step="any" value={target} onChange={e => setTarget(e.target.value)}
                  placeholder="e.g. 15" className={`input-field w-full text-sm font-mono text-bone ${submitted && (!target || parseFloat(target) <= 0) ? 'border-red-500 bg-red-500/10' : ''}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider mb-1">Unit</label>
                <input type="text" value={unit} onChange={e => setUnit(e.target.value)} className="input-field w-full text-sm font-mono text-bone" />
              </div>
            </div>
          )}

          {/* Auto-Track Toggle */}
          <div className="rounded-xl bg-ink-2 border border-line/30 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Zap size={15} className={autoTrack ? 'text-emerald-400' : 'text-bone-dim'} />
                <div>
                  <div className="text-xs font-medium text-bone">Auto-Track Progress</div>
                  <div className="text-[10px] text-bone-dim">Sync from your activities automatically</div>
                </div>
              </div>
              <button
                type="button" onClick={() => setAutoTrack(!autoTrack)}
                className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${autoTrack ? 'bg-emerald-500' : 'bg-ink-3 border border-line/40'}`}
              >
                <motion.div
                  animate={{ x: autoTrack ? 20 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="w-5 h-5 rounded-full bg-white absolute top-0.5 shadow-sm"
                />
              </button>
            </div>
            
            {autoTrack && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <label className="block text-[10px] font-mono text-bone-dim uppercase mb-1">Activity Filter</label>
                <CustomSelect
                  value={activityFilter}
                  onChange={(val) => setActivityFilter(val as ChallengeActivityFilter)}
                  options={ACTIVITY_FILTER_OPTIONS}
                />
              </motion.div>
            )}
          </div>

          {/* Duration Presets */}
          <div className="space-y-2">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider">Duration</label>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setDurationPreset(p.days)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    durationPreset === p.days
                      ? 'bg-sienna/20 text-sienna border border-sienna/40'
                      : 'bg-ink-2 text-bone-dim border border-line/20 hover:border-line/40'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2" id="input-start">
              <div>
                <label className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5 flex items-center gap-1">
                  <Calendar size={11} className="text-emerald-400" /> Start
                </label>
                <input
                  type="datetime-local" value={startDateTime} onChange={e => { setStartDateTime(e.target.value); setDurationPreset(0); }}
                  className="input-field w-full text-[11px] font-mono text-bone"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-bone-dim uppercase mb-0.5 flex items-center gap-1">
                  <Calendar size={11} className="text-amber-400" /> End
                </label>
                <input
                  type="datetime-local" value={endDateTime} onChange={e => { setEndDateTime(e.target.value); setDurationPreset(0); }}
                  className={`input-field w-full text-[11px] font-mono text-bone ${endMs <= startMs ? 'border-red-500 bg-red-500/10' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* Scope — Personal vs Clans */}
          <div className="space-y-2" id="input-clans">
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider">Who Can Join?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button" onClick={() => setScope('personal')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  scope === 'personal' ? 'bg-sienna/15 border-sienna/40 text-sienna' : 'bg-ink-2 border-line/20 text-bone-dim'
                }`}
              >
                <Eye size={14} /> Just Me (Public)
              </button>
              <button
                type="button" onClick={() => setScope('clans')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  scope === 'clans' ? 'bg-blue-500/15 border-blue-500/40 text-blue-400' : 'bg-ink-2 border-line/20 text-bone-dim'
                }`}
              >
                <Shield size={14} /> My Clan(s)
              </button>
            </div>

            {scope === 'clans' && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                {userClans.length === 0 ? (
                  <p className="text-[11px] text-bone-dim font-mono bg-ink-2 rounded-xl px-3 py-3 border border-line/20">
                    You haven't joined any clans yet. Join a clan first to share challenges.
                  </p>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setClanDropdownOpen(!clanDropdownOpen)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-ink-2 border border-line/30 hover:border-line/50 text-xs text-bone transition-colors"
                    >
                      <span className="truncate">
                        {selectedClanIds.length === 0
                          ? 'Select clans...'
                          : `${selectedClanIds.length} clan${selectedClanIds.length > 1 ? 's' : ''} selected`}
                      </span>
                      <ChevronDown size={14} className={`text-bone-dim transition-transform ${clanDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {clanDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-ink-2 border border-line/40 rounded-xl overflow-hidden z-10 shadow-xl max-h-40 overflow-y-auto"
                        >
                          {userClans.map(clan => (
                            <button
                              key={clan.id}
                              type="button"
                              onClick={() => toggleClan(clan.id!)}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-ink-3 transition-colors text-left"
                            >
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                selectedClanIds.includes(clan.id!) ? 'bg-blue-500 border-blue-400' : 'border-line/40 bg-ink'
                              }`}>
                                {selectedClanIds.includes(clan.id!) && <Check size={12} className="text-white" />}
                              </div>
                              {clan.avatarUrl ? (
                                <img src={clan.avatarUrl} className="w-6 h-6 rounded-full object-cover" alt="" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-sienna/20 flex items-center justify-center">
                                  <Shield size={12} className="text-sienna" />
                                </div>
                              )}
                              <span className="text-xs text-bone truncate">{clan.name}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {submitted && scope === 'clans' && selectedClanIds.length === 0 && (
                  <span className="text-red-400 text-[10px] font-mono flex items-center gap-1"><AlertCircle size={10} /> Select at least one clan</span>
                )}
              </motion.div>
            )}
          </div>

          {/* Prize */}
          <div>
            <label className="block text-[11px] font-mono text-bone-dim uppercase tracking-wider mb-1 flex items-center gap-1">
              <Trophy size={12} className="text-amber-400" /> Prize (Optional)
            </label>
            <input
              type="text" value={prize} onChange={e => setPrize(e.target.value)}
              placeholder="e.g. Bragging rights + Gold Badge" className="input-field w-full text-sm text-bone"
            />
          </div>

          {/* Submit */}
          <div className="pt-1 pb-safe">
            <button
              type="submit"
              disabled={createMutation.isPending || isCompressing}
              className="btn-primary w-full py-3.5 text-sm font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(205,111,72,0.3)] flex items-center justify-center gap-2"
            >
              <Target size={16} />
              {createMutation.isPending ? 'Creating...' : 'Start Challenge'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
