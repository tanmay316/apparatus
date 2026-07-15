import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Droplets,
  Flame,
  HeartPulse,
  Leaf,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Utensils,
  Wind,
  X,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { getUserSkills, SKILL_ROADMAP, toggleSkill, type SkillItem } from '@/services/skills';
import { useUIStore } from '@/stores/ui-store';

type GuideSection = 'warmup' | 'nutrition' | 'roadmap';

const pageMeta: Record<GuideSection, { eyebrow: string; title: string; description: string }> = {
  warmup: {
    eyebrow: 'PREPARE',
    title: 'Warm-up + Breath',
    description: 'Arrive ready. Raise your temperature, open the joints you need, and use your breath to control effort instead of fighting it.',
  },
  nutrition: {
    eyebrow: 'FUEL',
    title: 'Nutrition',
    description: 'A simple, repeatable framework for eating around training without turning every meal into a spreadsheet.',
  },
  roadmap: {
    eyebrow: 'PROGRESS',
    title: 'Skill Roadmap',
    description: 'Move from foundations to advanced calisthenics skills with clear checkpoints and honest progression.',
  },
};

const warmupSteps = [
  { title: 'Raise temperature', duration: '3 min', detail: 'Easy movement: brisk walk, bike, jumping jacks, or a light circuit. You should feel warmer, not tired.', icon: Flame },
  { title: 'Open the joints', duration: '4 min', detail: 'Use controlled circles for wrists, shoulders, hips, and ankles. Move through the range you plan to train.', icon: RotateCcw },
  { title: 'Switch on the pattern', duration: '3 min', detail: 'Perform 1–2 easy sets of the first movement. Keep two or more reps in reserve.', icon: Target },
  { title: 'Breathe with intent', duration: '2 min', detail: 'Inhale to prepare, brace, then exhale through the hardest part of the rep. Never hold your breath indefinitely.', icon: Wind },
];

const nutritionCards = [
  { label: 'Protein', value: '25–40 g', detail: 'Include a palm-sized serving at each main meal: eggs, dairy, tofu, beans, fish, or meat.', color: 'text-teal', icon: Target },
  { label: 'Carbohydrates', value: 'Train hard', detail: 'Rice, potatoes, fruit, oats, and bread support high-quality sessions and recovery.', color: 'text-amber', icon: Flame },
  { label: 'Plants + fats', value: 'Every meal', detail: 'Add colorful produce and a thumb-sized fat source for micronutrients and satiety.', color: 'text-bone', icon: Leaf },
];

const timingRows = [
  ['2–3 hours before', 'A normal meal with protein, carbs, and fluids. Keep fat and fiber moderate if your stomach is sensitive.'],
  ['30–60 minutes before', 'A small, easy-to-digest snack such as fruit, yogurt, or toast if you need energy.'],
  ['After training', 'Eat a balanced meal when convenient. Protein and carbs over the next few hours matter more than a narrow window.'],
];

const phaseLabels: Record<number, string> = {
  1: 'Foundation · 0–3 months',
  2: 'Control · 3–6 months',
  3: 'Strength · 6–12 months',
  4: 'Mastery · 12+ months',
};

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function WarmupGuide() {
  const [completed, setCompleted] = useState<boolean[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('apparatus-warmup-checklist') || '[]');
    } catch {
      return [];
    }
  });
  const [seconds, setSeconds] = useState(120);
  const [running, setRunning] = useState(false);
  const [breathPhase, setBreathPhase] = useState('Inhale');

  useEffect(() => {
    localStorage.setItem('apparatus-warmup-checklist', JSON.stringify(completed));
  }, [completed]);

  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);

  useEffect(() => {
    if (!running) return;
    const phases = ['Inhale', 'Hold', 'Exhale', 'Recover'];
    const timer = window.setInterval(() => {
      setBreathPhase(current => phases[(phases.indexOf(current) + 1) % phases.length]);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [running]);

  const completedCount = completed.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <section className="card p-6 bg-gradient-to-br from-teal/15 via-ink-2 to-ink-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="tag-teal mb-4">10–12 MIN RESET</div>
              <h2 className="font-display text-2xl mb-2">Make the first set feel familiar.</h2>
              <p className="text-sm text-bone-dim leading-relaxed max-w-xl">Use this sequence before strength, skills, or a longer mobility session. Scale every movement to how your body feels today.</p>
            </div>
            <HeartPulse className="text-teal flex-none" size={28} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-6">
            <div className="bg-ink/50 border border-line/60 rounded-lg p-3"><div className="font-mono text-[10px] text-bone-dim">TEMPO</div><div className="font-display text-xl mt-1">Easy</div></div>
            <div className="bg-ink/50 border border-line/60 rounded-lg p-3"><div className="font-mono text-[10px] text-bone-dim">EFFORT</div><div className="font-display text-xl mt-1">RPE 3–4</div></div>
            <div className="bg-ink/50 border border-line/60 rounded-lg p-3"><div className="font-mono text-[10px] text-bone-dim">GOAL</div><div className="font-display text-xl mt-1">Ready</div></div>
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div><div className="font-mono text-[10px] text-amber tracking-widest">BREATHING TIMER</div><h2 className="font-display text-xl mt-1">Downshift the noise</h2></div>
            <Wind className="text-amber" size={22} />
          </div>
          <div className="rounded-xl bg-ink border border-line p-5 text-center">
            <div className="text-xs font-mono text-bone-dim tracking-widest mb-2">{breathPhase.toUpperCase()}</div>
            <div className="font-mono text-4xl text-teal tabular-nums">{formatClock(seconds)}</div>
            <div className="text-xs text-bone-dim mt-2">4s inhale · 4s hold · 4s exhale · 4s recover</div>
            <div className="flex justify-center gap-2 mt-5">
              <button className="btn-primary py-2.5 flex items-center gap-2" onClick={() => setRunning(value => !value)}>
                {running ? <><X size={14} /> Pause</> : <><Play size={14} /> Start</>}
              </button>
              <button className="btn-secondary py-2.5" onClick={() => { setSeconds(120); setRunning(false); setBreathPhase('Inhale'); }} aria-label="Reset breathing timer"><TimerReset size={14} /></button>
            </div>
          </div>
          <p className="text-xs text-bone-dim leading-relaxed mt-4 flex gap-2"><CircleHelp size={14} className="text-amber flex-none mt-0.5" /> Stop if you feel dizzy, sharp pain, or unusual shortness of breath. This is a pacing tool, not a medical treatment.</p>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-4 mb-4"><div><div className="font-mono text-[10px] text-bone-dim tracking-widest">SESSION CHECKLIST</div><h2 className="font-display text-xl mt-1">Arrive prepared</h2></div><span className="font-mono text-xs text-teal">{completedCount}/{warmupSteps.length} complete</span></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {warmupSteps.map((step, index) => {
            const Icon = step.icon;
            const isDone = !!completed[index];
            return <button key={step.title} onClick={() => setCompleted(items => items.map((value, itemIndex) => itemIndex === index ? !value : value))} className={`text-left flex items-start gap-3 rounded-lg border p-4 transition-all ${isDone ? 'border-teal/60 bg-teal/10' : 'border-line bg-ink-2 hover:border-teal-dim'}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-none ${isDone ? 'bg-teal text-ink' : 'bg-ink-3 text-teal'}`}>{isDone ? <Check size={16} /> : <Icon size={16} />}</span>
              <span className="min-w-0"><span className={`font-semibold text-sm block ${isDone ? 'text-teal' : ''}`}>{step.title}</span><span className="text-xs text-bone-dim leading-relaxed block mt-1">{step.detail}</span><span className="text-[10px] font-mono text-amber block mt-2">{step.duration}</span></span>
            </button>;
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="card p-5"><div className="flex items-center gap-2 mb-3"><ShieldCheck size={18} className="text-teal" /><h3 className="font-display text-lg">Training-day rule</h3></div><p className="text-sm text-bone-dim leading-relaxed">Warm-ups should improve the session in front of you. If fatigue is rising before your working sets, shorten the sequence.</p></section>
        <section className="card p-5"><div className="flex items-center gap-2 mb-3"><Sparkles size={18} className="text-amber" /><h3 className="font-display text-lg">Make it yours</h3></div><p className="text-sm text-bone-dim leading-relaxed">For wrists and shoulders, spend extra time on the areas that limit your first exercise. Log the change in your workout notes.</p></section>
      </div>
    </div>
  );
}

function NutritionGuide() {
  const [glasses, setGlasses] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  return <div className="space-y-6">
    <section className="card p-6 bg-gradient-to-br from-amber/15 via-ink-2 to-ink-2">
      <div className="max-w-2xl"><div className="tag-amber mb-4">THE 80/20 PLATE</div><h2 className="font-display text-3xl mb-2">Eat for the next session.</h2><p className="text-sm text-bone-dim leading-relaxed">Build most meals from a reliable base, adjust portions to your goal, and let consistency beat perfect tracking. If you have a medical condition or a history of disordered eating, work with a qualified clinician.</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">{nutritionCards.map(card => { const Icon = card.icon; return <div key={card.label} className="bg-ink/50 border border-line/60 rounded-lg p-4"><Icon size={18} className={card.color} /><div className="font-mono text-[10px] text-bone-dim mt-3">{card.label.toUpperCase()}</div><div className={`font-display text-2xl mt-1 ${card.color}`}>{card.value}</div><p className="text-xs text-bone-dim leading-relaxed mt-2">{card.detail}</p></div>; })}</div>
    </section>

    <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.85fr] gap-4">
      <section className="card p-5"><div className="flex items-center gap-2 mb-4"><Clock3 size={18} className="text-teal" /><h2 className="font-display text-xl">Timing that stays flexible</h2></div><div className="space-y-2">{timingRows.map(([title, detail], index) => <button key={title} onClick={() => setExpanded(expanded === index ? null : index)} className="w-full text-left rounded-lg border border-line bg-ink-2 p-4 hover:border-teal-dim transition-colors"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-sm">{title}</span><ChevronDown size={16} className={`text-bone-dim transition-transform ${expanded === index ? 'rotate-180' : ''}`} /></div>{expanded === index && <p className="text-xs text-bone-dim leading-relaxed mt-2 pr-5">{detail}</p>}</button>)}</div></section>
      <section className="card p-5"><div className="flex items-center justify-between mb-4"><div><div className="font-mono text-[10px] text-teal tracking-widest">HYDRATION CHECK</div><h2 className="font-display text-xl mt-1">Sip steadily</h2></div><Droplets className="text-teal" size={22} /></div><p className="text-sm text-bone-dim leading-relaxed mb-5">Use thirst, sweat, and urine color as signals. There is no universal target, but a simple reminder helps on busy training days.</p><div className="grid grid-cols-4 gap-2 mb-5">{Array.from({ length: 8 }, (_, index) => <button key={index} onClick={() => setGlasses(value => value === index + 1 ? index : index + 1)} className={`h-12 rounded-lg border flex items-center justify-center transition-colors ${index < glasses ? 'bg-teal/20 border-teal text-teal' : 'bg-ink-2 border-line text-bone-dim'}`} aria-label={`Water glass ${index + 1}`}><Droplets size={16} /></button>)}</div><div className="flex items-center justify-between"><span className="font-mono text-xs text-bone-dim">{glasses} / 8 reminders</span><button className="btn-ghost text-xs" onClick={() => setGlasses(0)}>Reset</button></div></section>
    </div>

    <section className="card p-5"><div className="flex items-center gap-2 mb-4"><Utensils size={18} className="text-amber" /><h2 className="font-display text-xl">Build a plate</h2></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{['½ colorful plants', '¼ protein', '¼ carbs', 'Add fluids'].map((label, index) => <div key={label} className="bg-ink-2 rounded-lg border border-line/50 p-4"><div className={`w-8 h-8 rounded-full flex items-center justify-center mb-3 ${index === 0 ? 'bg-teal/20 text-teal' : index === 1 ? 'bg-amber/20 text-amber' : 'bg-bone/10 text-bone'}`}><span className="font-mono text-xs">0{index + 1}</span></div><div className="text-sm font-semibold">{label}</div></div>)}</div></section>
  </div>;
}

function RoadmapGuide() {
  const { profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SkillItem['category'] | 'all'>('all');
  const { data: masteredSkills = [], isLoading } = useQuery({ queryKey: ['userSkills', profile?.uid], queryFn: () => getUserSkills(profile!.uid), enabled: !!profile });
  const mastered = useMemo(() => new Set(masteredSkills), [masteredSkills]);

  const toggle = async (skill: SkillItem) => {
    if (!profile) return;
    try {
      await toggleSkill(profile.uid, skill.id, !mastered.has(skill.id));
      await queryClient.invalidateQueries({ queryKey: ['userSkills', profile.uid] });
      showToast(mastered.has(skill.id) ? `${skill.name} moved back to practice` : `${skill.name} marked mastered`);
    } catch (error: any) {
      showToast(error?.message || 'Could not update skill', 'error');
    }
  };

  return <div className="space-y-6">
    <section className="card p-6 bg-gradient-to-br from-teal/15 via-ink-2 to-ink-2"><div className="flex flex-col md:flex-row md:items-end justify-between gap-5"><div><div className="tag-teal mb-4">HONEST PROGRESSION</div><h2 className="font-display text-3xl mb-2">One clean rep at a time.</h2><p className="text-sm text-bone-dim leading-relaxed max-w-2xl">Mark a skill only when you can repeat it with control. This roadmap is a guide, not a deadline—tendon strength and quality movement take time.</p></div><Link to="/skills" className="btn-secondary inline-flex items-center gap-2 whitespace-nowrap">Open Skill Tracker <ArrowRight size={14} /></Link></div><div className="mt-6 flex items-center gap-4"><div className="flex-1 h-2 bg-line rounded-full overflow-hidden"><div className="h-full bg-teal rounded-full transition-all" style={{ width: `${Math.round((masteredSkills.length / SKILL_ROADMAP.length) * 100)}%` }} /></div><span className="font-mono text-xs text-teal whitespace-nowrap">{masteredSkills.length}/{SKILL_ROADMAP.length} mastered</span></div></section>

    <div className="flex flex-wrap gap-2">{(['all', 'push', 'pull', 'balance', 'core'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`px-3 py-2 rounded-md border font-mono text-[11px] uppercase tracking-wider transition-colors ${filter === value ? 'bg-teal text-ink border-teal font-bold' : 'border-line text-bone-dim hover:text-bone hover:border-teal-dim'}`}>{value}</button>)}</div>

    {isLoading ? <div className="card p-12 text-center text-bone-dim">Loading your roadmap...</div> : <div className="space-y-5">{[1, 2, 3, 4].map(phase => { const skills = SKILL_ROADMAP.filter(skill => skill.phase === phase && (filter === 'all' || skill.category === filter)); if (!skills.length) return null; const phaseSkills = SKILL_ROADMAP.filter(skill => skill.phase === phase); const phaseDone = phaseSkills.filter(skill => mastered.has(skill.id)).length; return <section key={phase} className="card p-5"><div className="flex items-start justify-between gap-4 mb-4"><div><div className="font-mono text-[10px] text-amber tracking-widest">PHASE 0{phase}</div><h2 className="font-display text-xl mt-1">{phaseLabels[phase]}</h2></div><span className="font-mono text-xs text-bone-dim">{phaseDone}/{phaseSkills.length}</span></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{skills.map(skill => { const done = mastered.has(skill.id); return <button key={skill.id} onClick={() => toggle(skill)} className={`text-left rounded-lg border p-4 transition-all ${done ? 'bg-teal/10 border-teal/60' : 'bg-ink-2 border-line hover:border-teal-dim'}`}><div className="flex items-start gap-3"><span className={`w-7 h-7 rounded-md flex items-center justify-center flex-none ${done ? 'bg-teal text-ink' : 'bg-ink-3 text-bone-dim'}`}>{done ? <Check size={15} /> : <LockKeyhole size={13} />}</span><span className="min-w-0"><span className={`font-semibold text-sm block ${done ? 'text-teal' : ''}`}>{skill.name}</span><span className="text-xs text-bone-dim leading-relaxed block mt-1">{skill.description}</span><span className="font-mono text-[10px] uppercase text-amber block mt-2">{skill.category}</span></span></div></button>; })}</div></section>; })}</div>}
    <div className="flex items-start gap-3 card p-4 border-amber/30"><CircleHelp size={17} className="text-amber flex-none mt-0.5" /><p className="text-xs text-bone-dim leading-relaxed">A mastery check is your own training note, not a certification. If pain persists, regress the movement and seek help from a qualified coach or clinician.</p></div>
  </div>;
}

export function GuidePage() {
  const { section } = useParams<{ section: string }>();
  const activeSection: GuideSection = section === 'nutrition' || section === 'roadmap' ? section : 'warmup';
  const meta = pageMeta[activeSection];

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
    <div className="pb-5 border-b border-line"><div className="font-mono text-amber text-xs tracking-widest mb-1">{meta.eyebrow}</div><h1 className="font-display text-3xl mb-1">{meta.title}</h1><p className="text-bone-dim text-sm max-w-2xl leading-relaxed">{meta.description}</p></div>
    {activeSection === 'warmup' && <WarmupGuide />}
    {activeSection === 'nutrition' && <NutritionGuide />}
    {activeSection === 'roadmap' && <RoadmapGuide />}
  </motion.div>;
}
