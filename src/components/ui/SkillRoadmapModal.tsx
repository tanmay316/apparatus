import { ArrowRight, Check, CircleHelp, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SkillItem } from '@/services/skills';
import { getSkillRoadmap } from '@/services/skills';

export function SkillRoadmapModal({ skill, isOpen, isMastered, onClose, onMarkMastered }: { skill: SkillItem | null; isOpen: boolean; isMastered: boolean; onClose: () => void; onMarkMastered?: () => void }) {
  if (!isOpen || !skill) return null;
  const steps = getSkillRoadmap(skill);
  return <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
    <div className="relative card w-full max-w-2xl max-h-[88vh] overflow-y-auto p-6 z-10">
      <div className="flex items-start justify-between gap-4 mb-5"><div><div className="font-mono text-[10px] text-amber tracking-widest uppercase">{skill.category} · Phase {skill.phase}</div><h2 className="font-display text-2xl mt-1">Roadmap to {skill.name}</h2><p className="text-sm text-bone-dim mt-2 leading-relaxed">{skill.description} Follow each step until the checkpoint feels repeatable, then move forward.</p></div><button onClick={onClose} className="btn-ghost"><X size={17} /></button></div>
      <div className="space-y-3">{steps.map((step, index) => <div key={step.title} className="rounded-lg border border-line bg-ink-2 p-4"><div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-sienna/15 text-sienna flex items-center justify-center font-mono text-sm font-bold flex-none">{index + 1}</div><div className="min-w-0"><h3 className="font-display text-lg">{step.title}</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2"><div><div className="font-mono text-[10px] text-amber uppercase">Goal</div><p className="text-xs text-bone-dim mt-1 leading-relaxed">{step.goal}</p></div><div><div className="font-mono text-[10px] text-sienna uppercase">Practice</div><p className="text-xs text-bone-dim mt-1 leading-relaxed">{step.practice}</p></div></div><div className="flex items-start gap-2 mt-3 text-xs text-bone"><Check size={14} className="text-sienna flex-none mt-0.5" /><span><span className="font-semibold">Checkpoint:</span> {step.checkpoint}</span></div></div></div></div>)}</div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5 pt-4 border-t border-line/50"><div className="flex items-start gap-2 text-xs text-bone-dim"><CircleHelp size={14} className="text-amber flex-none mt-0.5" /> Regress when form breaks or pain appears. Progress is earned through consistency.</div><div className="flex gap-2 shrink-0"><Link to="/skills" onClick={onClose} className="btn-secondary inline-flex items-center gap-2">Open tracker <ArrowRight size={13} /></Link>{onMarkMastered && <button onClick={onMarkMastered} className="btn-primary inline-flex items-center gap-2">{isMastered ? 'Marked mastered' : 'Mark mastered'} <Check size={14} /></button>}</div></div>
    </div>
  </div>;
}
