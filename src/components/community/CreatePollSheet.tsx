import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GripVertical, Plus, Check } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import type { ClanPoll, ClanPollOption } from '@/types';

interface CreatePollSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onPollCreated: (poll: ClanPoll) => void;
  initialPoll?: ClanPoll | null;
}

export function CreatePollSheet({
  isOpen,
  onClose,
  onPollCreated,
  initialPoll,
}: CreatePollSheetProps) {
  const { showToast } = useUIStore();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [hasExpiration, setHasExpiration] = useState(false);
  const [durationPreset, setDurationPreset] = useState<'1d' | '3d' | '7d' | 'custom'>('3d');
  const [customExpiry, setCustomExpiry] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (initialPoll) {
        setQuestion(initialPoll.question || '');
        setOptions(initialPoll.options?.map(o => o.text) || ['', '']);
        setIsMultipleChoice(Boolean(initialPoll.isMultipleChoice));
        setIsAnonymous(Boolean(initialPoll.isAnonymous));
        setHasExpiration(Boolean(initialPoll.hasExpiration));
        if (initialPoll.expiresAt) {
          setCustomExpiry(new Date(initialPoll.expiresAt).toISOString().slice(0, 16));
          setDurationPreset('custom');
        } else {
          setDurationPreset('3d');
        }
      } else {
        setQuestion('');
        setOptions(['', '']);
        setIsMultipleChoice(false);
        setIsAnonymous(true);
        setHasExpiration(false);
        setDurationPreset('3d');
        const d = new Date();
        d.setDate(d.getDate() + 3);
        setCustomExpiry(d.toISOString().slice(0, 16));
      }
      document.body.classList.add('community-create-open');
      return () => document.body.classList.remove('community-create-open');
    }
  }, [isOpen, initialPoll]);

  const handleAddOption = () => {
    if (options.length >= 10) {
      showToast('Maximum 10 options allowed', 'info');
      return;
    }
    setOptions(prev => [...prev, '']);
  };

  const handleOptionChange = (index: number, val: string) => {
    setOptions(prev => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      showToast('A poll must have at least 2 options', 'info');
      return;
    }
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      showToast('Please enter a poll question', 'error');
      return;
    }

    const filteredOptions = options.map(o => o.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      showToast('Please provide at least 2 valid options', 'error');
      return;
    }

    let finalExpiresAt: string | null = null;
    if (hasExpiration) {
      const now = new Date();
      if (durationPreset === '1d') {
        const d = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        finalExpiresAt = d.toISOString();
      } else if (durationPreset === '3d') {
        const d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        finalExpiresAt = d.toISOString();
      } else if (durationPreset === '7d') {
        const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        finalExpiresAt = d.toISOString();
      } else if (durationPreset === 'custom' && customExpiry) {
        finalExpiresAt = new Date(customExpiry).toISOString();
      } else {
        const d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        finalExpiresAt = d.toISOString();
      }
    }

    const pollOptions: ClanPollOption[] = filteredOptions.map((text, idx) => {
      const existing = initialPoll?.options?.[idx];
      return {
        id: existing?.id || `opt_${Date.now()}_${idx}`,
        text,
        votesCount: existing?.votesCount || 0,
        voterIds: existing?.voterIds || [],
        voters: existing?.voters || [],
      };
    });

    const newPoll: ClanPoll = {
      question: trimmedQuestion,
      options: pollOptions,
      isMultipleChoice,
      isAnonymous,
      hasExpiration,
      expiresAt: finalExpiresAt,
      totalVotes: initialPoll?.totalVotes || 0,
      votedUserIds: initialPoll?.votedUserIds || [],
      userVotes: initialPoll?.userVotes || {},
      createdAt: initialPoll?.createdAt || new Date().toISOString(),
    };

    onPollCreated(newPoll);
    onClose();
  };

  const isValid = question.trim().length > 0 && options.filter(o => o.trim().length > 0).length >= 2;

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line/20 mb-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-bone-dim hover:text-bone hover:bg-ink-3 transition-colors"
        >
          <X size={20} />
        </button>
        <h2 className="text-base sm:text-lg font-bold text-bone text-center tracking-tight">Create a Poll</h2>
        <div className="w-8" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5 pb-2">
        {/* Question Field */}
        <div>
          <label htmlFor="poll-question-input" className="block text-[11px] font-mono uppercase text-bone-dim mb-1.5 tracking-wider">
            Ask a Question<span className="text-sienna ml-0.5">*</span>
          </label>
          <input
            id="poll-question-input"
            name="pollQuestion"
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Type your question here..."
            maxLength={150}
            className="w-full bg-ink-2 border border-line/25 rounded-xl px-3.5 sm:px-4 py-3 text-sm text-bone placeholder:text-bone-dim/40 font-semibold focus:outline-none focus:border-sienna/80 transition-colors shadow-inner"
            autoFocus
          />
        </div>

        {/* Poll Options */}
        <div>
          <label className="block text-[11px] font-mono uppercase text-bone-dim mb-2 tracking-wider">
            Poll Options
          </label>
          <div className="space-y-2.5">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1.5 sm:gap-2">
                <div className="text-bone-dim/60 cursor-grab active:cursor-grabbing p-1 shrink-0">
                  <GripVertical size={16} />
                </div>
                <div className="flex-1 relative flex items-center min-w-0">
                  <input
                    id={`poll-option-${idx}`}
                    name={`pollOption_${idx}`}
                    aria-label={`Option ${idx + 1}`}
                    type="text"
                    value={opt}
                    onChange={e => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    maxLength={80}
                    className="w-full bg-ink-2 border border-line/25 rounded-xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-bone placeholder:text-bone-dim/40 font-semibold focus:outline-none focus:border-sienna/80 transition-colors shadow-inner pr-9 sm:pr-10"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="absolute right-2 sm:right-3 p-1.5 text-bone-dim hover:text-red-500 rounded-lg hover:bg-ink-3 transition-colors shrink-0"
                      title="Remove option"
                      aria-label={`Remove option ${idx + 1}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="w-full mt-1.5 py-2.5 sm:py-3 px-4 rounded-xl bg-ink-2 hover:bg-ink-3 border border-line/25 text-bone text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-[0.99]"
              >
                <Plus size={15} />
                <span>Add Another Option</span>
              </button>
            )}
          </div>
        </div>

        {/* Poll Settings */}
        <div className="pt-2 border-t border-line/20">
          <label className="block text-[11px] font-mono uppercase text-bone-dim mb-2.5 tracking-wider">
            Poll Settings
          </label>

          <div className="space-y-2.5 sm:space-y-3">
            {/* Setting 1: Multiple Options */}
            <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl border border-line/20 bg-ink-2/60">
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-bold text-bone">
                  Allow Multiple Options
                </h4>
                <p className="text-[11px] text-bone-dim mt-0.5">
                  Voters can choose more than one answer.
                </p>
              </div>
              <label htmlFor="poll-setting-multiple" className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="poll-setting-multiple"
                  name="pollMultipleChoice"
                  aria-label="Allow Multiple Options"
                  type="checkbox"
                  checked={isMultipleChoice}
                  onChange={e => setIsMultipleChoice(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-ink-3 border border-line/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-line/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-sienna peer-checked:border-sienna"></div>
              </label>
            </div>

            {/* Setting 2: Anonymous Voting */}
            <div
              className={`flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl border transition-all ${
                isAnonymous
                  ? 'border-sienna/40 bg-sienna/10'
                  : 'border-line/20 bg-ink-2/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-bold text-bone">
                  Enable Anonymous Voting
                </h4>
                <p className="text-[11px] text-bone-dim mt-0.5">
                  Votes will not be publicly disclosed.
                </p>
              </div>
              <label htmlFor="poll-setting-anonymous" className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="poll-setting-anonymous"
                  name="pollAnonymous"
                  aria-label="Enable Anonymous Voting"
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={e => setIsAnonymous(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-ink-3 border border-line/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-line/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-sienna peer-checked:border-sienna"></div>
              </label>
            </div>

            {/* Setting 3: Set Expiration Date & Time */}
            <div className="p-3 sm:p-3.5 rounded-xl border border-line/20 bg-ink-2/60 space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs sm:text-sm font-bold text-bone">
                    Set an Expiration Date & Time
                  </h4>
                  <p className="text-[11px] text-bone-dim mt-0.5">
                    Automatically closes poll when expired.
                  </p>
                </div>
                <label htmlFor="poll-setting-expiration" className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    id="poll-setting-expiration"
                    name="pollExpiration"
                    aria-label="Set Expiration Date & Time"
                    type="checkbox"
                    checked={hasExpiration}
                    onChange={e => setHasExpiration(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-ink-3 border border-line/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-line/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-sienna peer-checked:border-sienna"></div>
                </label>
              </div>

              {/* Expiration Controls when Toggle is ON */}
              {hasExpiration && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pt-2 border-t border-line/20 space-y-2.5 overflow-hidden"
                >
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {[
                      { id: '1d', label: '1 Day' },
                      { id: '3d', label: '3 Days' },
                      { id: '7d', label: '7 Days' },
                      { id: 'custom', label: 'Custom' },
                    ].map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setDurationPreset(preset.id as any)}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                          durationPreset === preset.id
                            ? 'bg-sienna text-bg shadow-sm'
                            : 'bg-ink-3 text-bone border border-line/20 hover:bg-ink'
                        }`}
                      >
                        {durationPreset === preset.id && <Check size={12} />}
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>

                  {durationPreset === 'custom' && (
                    <div className="mt-2">
                      <label htmlFor="poll-custom-expiry" className="block text-[11px] font-mono uppercase text-bone-dim mb-1 tracking-wider">
                        Select Expiry Date & Time
                      </label>
                      <input
                        id="poll-custom-expiry"
                        name="pollCustomExpiry"
                        type="datetime-local"
                        value={customExpiry}
                        min={new Date().toISOString().slice(0, 16)}
                        onChange={e => setCustomExpiry(e.target.value)}
                        className="w-full bg-ink-3 border border-line/25 rounded-xl px-3 py-2 text-xs text-bone font-mono focus:outline-none focus:border-sienna/80"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2 sticky bottom-0 bg-ink/95 backdrop-blur-sm pb-1 z-10">
          <button
            type="submit"
            disabled={!isValid}
            className="w-full py-3 px-6 rounded-xl bg-sienna hover:bg-sienna/90 text-bg font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-sienna/20 hover:scale-[1.01] active:scale-[0.98] transition-all"
          >
            <span>{initialPoll ? 'Update Poll' : 'Done'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
