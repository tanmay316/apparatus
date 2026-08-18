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

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[650] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="bg-white dark:bg-[#16181d] text-[#17191c] dark:text-[#f3f4f6] w-full max-w-lg rounded-t-[32px] sm:rounded-[28px] relative z-10 flex flex-col shadow-2xl p-5 sm:p-6 border-t sm:border border-gray-100 dark:border-white/10 max-h-[92vh] overflow-y-auto"
          >
            {/* Drag Handle for Mobile */}
            <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10 mb-4">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
              <h2 className="text-base sm:text-lg font-bold text-center tracking-tight">Create a Poll</h2>
              <div className="w-8" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Question Field */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Ask a Question<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Type Here..."
                  maxLength={150}
                  className="w-full bg-gray-50 dark:bg-[#1f2229] border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm text-[#17191c] dark:text-white placeholder:text-gray-400 font-medium focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-all shadow-sm"
                  autoFocus
                />
              </div>

              {/* Poll Options */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Poll Options
                </label>
                <div className="space-y-2.5">
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing p-1">
                        <GripVertical size={16} />
                      </div>
                      <div className="flex-1 relative flex items-center">
                        <input
                          type="text"
                          value={opt}
                          onChange={e => handleOptionChange(idx, e.target.value)}
                          placeholder={`Option ${idx + 1}`}
                          maxLength={80}
                          className="w-full bg-gray-50 dark:bg-[#1f2229] border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm text-[#17191c] dark:text-white placeholder:text-gray-400 font-medium focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-all shadow-sm pr-10"
                        />
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            className="absolute right-3 p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                            title="Remove option"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {options.length < 10 && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="w-full mt-2 py-3 px-4 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-[#1f2229] dark:hover:bg-[#282c35] border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <Plus size={16} />
                      <span>Add Another Option</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Poll Settings */}
              <div className="pt-2 border-t border-gray-100 dark:border-white/10">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2.5">
                  Poll Settings
                </label>

                <div className="space-y-3">
                  {/* Setting 1: Multiple Options */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#1f2229]/60">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-[#17191c] dark:text-white">
                        Allow people to choose Multiple Options
                      </h4>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMultipleChoice}
                        onChange={e => setIsMultipleChoice(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Setting 2: Anonymous Voting */}
                  <div
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      isAnonymous
                        ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20'
                        : 'border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#1f2229]/60'
                    }`}
                  >
                    <div className="pr-2">
                      <h4 className="text-xs sm:text-sm font-semibold text-[#17191c] dark:text-white">
                        Enable Anonymous Voting
                      </h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Your vote will not be disclosed to others.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={e => setIsAnonymous(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Setting 3: Set Expiration Date & Time */}
                  <div className="p-3.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-[#1f2229]/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="pr-2">
                        <h4 className="text-xs sm:text-sm font-semibold text-[#17191c] dark:text-white">
                          Set an Expiration Date & Time
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          You can change this later via edit.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={hasExpiration}
                          onChange={e => setHasExpiration(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {/* Expiration Controls when Toggle is ON */}
                    {hasExpiration && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pt-2 border-t border-gray-200 dark:border-white/10 space-y-2.5 overflow-hidden"
                      >
                        <div className="flex flex-wrap gap-2">
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
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                                durationPreset === preset.id
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-white dark:bg-[#16181d] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5'
                              }`}
                            >
                              {durationPreset === preset.id && <Check size={12} />}
                              <span>{preset.label}</span>
                            </button>
                          ))}
                        </div>

                        {durationPreset === 'custom' && (
                          <div className="mt-2">
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Select Expiry Date & Time
                            </label>
                            <input
                              type="datetime-local"
                              value={customExpiry}
                              min={new Date().toISOString().slice(0, 16)}
                              onChange={e => setCustomExpiry(e.target.value)}
                              className="w-full bg-white dark:bg-[#16181d] border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-[#17191c] dark:text-white font-mono focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!isValid}
                  className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/35 transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <span>{initialPoll ? 'Update Poll' : 'Next'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
