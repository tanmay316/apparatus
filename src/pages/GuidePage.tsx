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
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';

type GuideSection = 'warmup' | 'nutrition';

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

const warmupExercises = [
  ['Jumping jacks', '60 sec', 'Raise body temperature without tiring yourself.'],
  ['Wrist rocks', '2 x 10', 'Prepare wrists for push-ups, handstands and floor work.'],
  ['Scapular push-ups', '2 x 8', 'Switch on the shoulder blades while keeping elbows straight.'],
  ['Cat-cow', '2 x 8', 'Move the spine slowly and coordinate each movement with breath.'],
  ['Deep squat pry', '60 sec', 'Open hips and ankles in the range needed for squats and lunges.'],
];

const vegetarianProteinFoods = [
  ['Seitan', 'Wheat-based protein with a meaty texture. Offers ~75g of protein per 100g.'],
  ['Soy Chunks / TVP', 'Dehydrated soy protein. Extremely protein-dense (~52g per 100g).'],
  ['Tofu / Tempeh', 'Firm, versatile soy products. Tempeh offers ~19g/100g; Tofu offers ~15g/100g.'],
  ['Paneer', 'Indian cottage cheese block. High in casein protein (~18g per 100g).'],
  ['Greek Yogurt / Cottage Cheese', 'High-protein dairy options. Rich source of slow-digesting protein.'],
  ['Lentils / Chickpeas / Black Beans', 'Excellent plant protein combined with high fiber and complex carbs.'],
  ['Edamame', 'Young, green soybeans served in pods. High-protein complete source (~11g/100g).'],
  ['Hemp Seeds / Pumpkin Seeds', 'Dense protein and healthy fats. Hemp seeds contain ~31g of protein per 100g.'],
  ['Peanuts / Peanut Butter', 'Calorie-dense whole food option offering ~25g of protein per 100g.'],
  ['Nutritional Yeast', 'Deactivated yeast with a cheesy flavor. Packed with B-vitamins and ~40g protein/100g.'],
  ['Quinoa / Amaranth', 'Gluten-free grains that function as complete proteins containing all 9 amino acids.'],
  ['Mycoprotein', 'Fungi-based whole food protein rich in fiber and amino acids.'],
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
  const [meditationMinutes, setMeditationMinutes] = useState(10);
  const [meditationSeconds, setMeditationSeconds] = useState(600);
  const [meditationRunning, setMeditationRunning] = useState(false);

  const playFinishSound = () => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.8);
  };

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

  useEffect(() => {
    if (!meditationRunning || meditationSeconds <= 0) return;
    const timer = window.setInterval(() => setMeditationSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [meditationRunning, meditationSeconds]);

  useEffect(() => {
    if (meditationRunning && meditationSeconds === 0) {
      setMeditationRunning(false);
      playFinishSound();
    }
  }, [meditationSeconds, meditationRunning]);

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

      <section className="card p-5 bg-gradient-to-br from-amber/10 via-ink-2 to-ink-2">
        <div className="flex items-center justify-between gap-3 mb-4"><div><div className="font-mono text-[10px] text-amber tracking-widest">MEDITATION TIMER</div><h2 className="font-display text-xl mt-1">Finish calm and focused</h2></div><TimerReset className="text-amber" size={22} /></div>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <label className="flex-1"><span className="label">Custom time (minutes)</span><input className="input-field" type="number" min="1" max="120" value={meditationMinutes} onChange={e => { const value = Math.max(1, Math.min(120, Number(e.target.value) || 1)); setMeditationMinutes(value); if (!meditationRunning) setMeditationSeconds(value * 60); }} /></label>
          <div className="text-center rounded-xl bg-ink border border-line px-6 py-3"><div className="font-mono text-3xl text-teal tabular-nums">{formatClock(meditationSeconds)}</div><div className="text-[10px] text-bone-dim mt-1">A soft chime plays at the end</div></div>
          <div className="flex gap-2"><button className="btn-primary py-2.5" onClick={() => setMeditationRunning(value => !value)}>{meditationRunning ? 'Pause' : 'Start'}</button><button className="btn-secondary py-2.5" onClick={() => { setMeditationRunning(false); setMeditationSeconds(meditationMinutes * 60); }}>Reset</button></div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-4 mb-4"><div><div className="font-mono text-[10px] text-teal tracking-widest">WARM-UP EXERCISES</div><h2 className="font-display text-xl mt-1">Move through this sequence</h2></div><HeartPulse size={18} className="text-teal" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">{warmupExercises.map(([name, duration, detail]) => <div key={name} className="rounded-lg border border-line bg-ink-2 p-3"><div className="font-semibold text-sm">{name}</div><div className="font-mono text-[10px] text-amber mt-2">{duration}</div><p className="text-xs text-bone-dim mt-1 leading-relaxed">{detail}</p></div>)}</div>
      </section>

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
    <section className="card p-5"><div className="flex items-center gap-2 mb-4"><Leaf size={18} className="text-teal" /><h2 className="font-display text-xl">Vegetarian protein foods</h2></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{vegetarianProteinFoods.map(([name, detail]) => <div key={name} className="rounded-lg border border-line bg-ink-2 p-4"><div className="font-semibold text-sm">{name}</div><p className="text-xs text-bone-dim mt-1 leading-relaxed">{detail}</p></div>)}</div></section>
  </div>;
}

export function GuidePage() {
  const { section } = useParams<{ section: string }>();
  const activeSection: GuideSection = section === 'nutrition' ? section : 'warmup';
  const meta = pageMeta[activeSection];

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
    <div className="pb-5 border-b border-line"><div className="font-mono text-amber text-xs tracking-widest mb-1">{meta.eyebrow}</div><h1 className="font-display text-3xl mb-1">{meta.title}</h1><p className="text-bone-dim text-sm max-w-2xl leading-relaxed">{meta.description}</p></div>
    {activeSection === 'warmup' && <WarmupGuide />}
    {activeSection === 'nutrition' && <NutritionGuide />}
  </motion.div>;
}
