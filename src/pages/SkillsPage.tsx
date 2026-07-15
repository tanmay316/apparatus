import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Lock, ShieldCheck, Check, Sparkles, Filter } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { SKILL_ROADMAP, getUserSkills, toggleSkill, SkillItem } from '@/services/skills';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
};

export function SkillsPage() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'push' | 'pull' | 'balance' | 'core'>('all');

  const { data: masteredSkills = [], isLoading } = useQuery({
    queryKey: ['userSkills', profile?.uid],
    queryFn: () => getUserSkills(profile!.uid),
    enabled: !!profile?.uid,
  });

  const skillMutation = useMutation({
    mutationFn: async ({ skillId, isMastered }: { skillId: string; isMastered: boolean }) => {
      await toggleSkill(profile!.uid, skillId, isMastered);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSkills', profile?.uid] });
      // Invalidate stats to trigger potential badge unlocks!
      queryClient.invalidateQueries({ queryKey: ['stats', profile?.uid] });
    }
  });

  if (isLoading || !profile) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleToggle = (skillId: string) => {
    const isMastered = masteredSkills.includes(skillId);
    skillMutation.mutate({ skillId, isMastered: !isMastered });
  };

  const filteredRoadmap = SKILL_ROADMAP.filter(
    s => filter === 'all' || s.category === filter
  );

  // Group by Phase
  const phases = [1, 2, 3, 4] as const;
  const phaseLabels = {
    1: 'Phase 1 • 0–3 Months (Foundations)',
    2: 'Phase 2 • 3–6 Months (Intermediate)',
    3: 'Phase 3 • 6–12 Months (Advanced)',
    4: 'Phase 4 • 1–2 Years+ (Mastery)'
  };

  const totalMastered = masteredSkills.length;
  const totalSkills = SKILL_ROADMAP.length;
  const overallProgress = Math.round((totalMastered / totalSkills) * 100);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item} className="pb-5 border-b border-line mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="font-mono text-amber text-xs tracking-widest mb-1">PROGRESSION ROADMAP</div>
          <h1 className="font-display text-3xl mb-1">Skill Tracker</h1>
          <p className="text-bone-dim text-sm max-w-xl">Master calisthenics movement progressions. Unlock skills from foundational L-sits to the Planche.</p>
        </div>

        {/* Overall mastery progress card */}
        <div className="bg-ink-2 border border-line/50 rounded-lg p-4 flex items-center gap-4 w-full md:w-64">
          <div className="w-12 h-12 rounded-full border border-teal/30 bg-teal/5 flex items-center justify-center text-teal flex-none">
            <Award size={24} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-mono text-bone-dim">ROADMAP MASTERY</div>
            <div className="text-lg font-bold font-mono text-teal">{totalMastered} / {totalSkills}</div>
            <div className="w-full bg-ink h-1.5 rounded-full overflow-hidden mt-1">
              <div className="bg-teal h-full transition-all duration-500" style={{ width: `${overallProgress}%` }} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filter and stats row */}
      <motion.div variants={item} className="flex flex-wrap items-center justify-between gap-4 bg-ink-2 p-3 rounded-lg border border-line/30">
        <div className="flex flex-wrap gap-1">
          {(['all', 'push', 'pull', 'balance', 'core'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded font-mono text-xs capitalize transition-colors ${
                filter === cat
                  ? 'bg-teal text-ink font-bold'
                  : 'text-bone-dim hover:text-bone hover:bg-line/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="text-xs font-mono text-bone-dim flex items-center gap-2">
          <Filter size={12} className="text-teal" />
          Showing {filteredRoadmap.length} skill{filteredRoadmap.length !== 1 ? 's' : ''}
        </div>
      </motion.div>

      {/* Roadmap phases */}
      <div className="space-y-8">
        {phases.map(phaseNum => {
          const phaseSkills = filteredRoadmap.filter(s => s.phase === phaseNum);
          if (phaseSkills.length === 0) return null;

          const allPhaseSkills = SKILL_ROADMAP.filter(s => s.phase === phaseNum);
          const masteredInPhase = allPhaseSkills.filter(s => masteredSkills.includes(s.id)).length;
          const phaseProgress = Math.round((masteredInPhase / allPhaseSkills.length) * 100);

          return (
            <motion.div key={phaseNum} variants={item} className="space-y-4">
              {/* Phase header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-line/30">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${phaseProgress === 100 ? 'bg-teal' : 'bg-amber animate-pulse'}`} />
                  <h3 className="font-display text-lg tracking-wide">{phaseLabels[phaseNum]}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-bone-dim">{masteredInPhase} / {allPhaseSkills.length} mastered</span>
                  <div className="w-24 bg-ink h-1.5 rounded-full overflow-hidden">
                    <div className="bg-amber h-full transition-all duration-500" style={{ width: `${phaseProgress}%` }} />
                  </div>
                </div>
              </div>

              {/* Skills grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {phaseSkills.map(skill => {
                  const isMastered = masteredSkills.includes(skill.id);
                  return (
                    <button
                      key={skill.id}
                      onClick={() => handleToggle(skill.id)}
                      className={`text-left p-4 rounded-lg border transition-all duration-300 relative overflow-hidden group ${
                        isMastered
                          ? 'bg-teal/5 border-teal/40 shadow-[0_0_15px_rgba(79,158,141,0.05)] hover:border-teal/60'
                          : 'bg-ink-2 border-line/50 hover:bg-ink-3 hover:border-bone/20'
                      }`}
                    >
                      {/* Check/Unlocked label at top right */}
                      <div className="absolute top-3 right-3">
                        {isMastered ? (
                          <div className="w-5 h-5 rounded-full bg-teal text-ink flex items-center justify-center">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-ink border border-line flex items-center justify-center text-bone-dim opacity-50 group-hover:opacity-100 transition-opacity">
                            <Lock size={10} />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="pr-6 space-y-2">
                        <span className="font-mono text-[9px] bg-ink px-1.5 py-0.5 rounded text-bone-dim tracking-wider uppercase">
                          {skill.category}
                        </span>
                        <h4 className={`font-display text-base tracking-wide ${isMastered ? 'text-teal' : 'text-bone'}`}>
                          {skill.name}
                        </h4>
                        <p className="text-xs text-bone-dim leading-relaxed">
                          {skill.description}
                        </p>
                      </div>

                      {/* Subtle hover spark effect */}
                      {isMastered && (
                        <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-30 transition-opacity">
                          <Sparkles size={16} className="text-teal" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
