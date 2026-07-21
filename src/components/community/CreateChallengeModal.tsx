import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Trophy, Target, Calendar } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { createCommunityChallenge } from '@/services/events';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/80 backdrop-blur-sm sm:overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="bg-ink rounded-t-[32px] sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full sm:border border-t border-line shadow-2xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-sienna text-xs font-mono uppercase tracking-widest mb-1">
              <Trophy size={14} /> New Challenge
            </div>
            <h2 className="font-display text-xl sm:text-2xl text-bone">Create Community Challenge</h2>
            <p className="text-xs sm:text-sm text-bone-dim mt-0.5">Motivate your community with a competitive fitness challenge.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink-2 text-bone-dim transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Title (e.g. 100 Push-ups in 30 Days)</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 30-Day Handstand Challenge" className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Description</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="Challenge guidelines and goals..." className="input-field w-full min-h-[80px] py-2.5" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Duration (Days)</label>
              <input type="number" min={1} max={365} value={durationDays} onChange={e => setDurationDays(Number(e.target.value))} className="input-field w-full" />
            </div>
            <div>
              <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Target Target Count</label>
              <input type="number" min={1} value={targetCount} onChange={e => setTargetCount(Number(e.target.value))} className="input-field w-full" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Daily Target</label>
            <input value={dailyTarget} onChange={e => setDailyTarget(e.target.value)} placeholder="e.g. 10 reps / 15 mins daily" className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Rewards</label>
            <input value={rewards} onChange={e => setRewards(e.target.value)} placeholder="e.g. Level 18 Badge, Champion Title" className="input-field w-full" />
          </div>

          <div>
            <label className="block text-xs font-mono text-bone-dim mb-1 uppercase">Rules</label>
            <textarea value={rules} onChange={e => setRules(e.target.value)} placeholder="Rules for participants..." className="input-field w-full min-h-[60px] py-2" />
          </div>

          <div className="pt-4 border-t border-line/30 flex gap-3 justify-end shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary px-6 py-2">Cancel</button>
            <button type="submit" disabled={createMutation.isPending || !title.trim()} className="btn-primary px-6 py-2">
              {createMutation.isPending ? 'Creating...' : 'Launch Challenge'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
