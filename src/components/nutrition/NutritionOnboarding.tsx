import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Check, Pencil, Sparkles, Snail, Rabbit, Zap, Repeat, Pizza, Users, CalendarClock, Lightbulb,
  Drumstick, Fish, Salad, Leaf, Apple, Sun, Dumbbell, Heart, Camera, Plus, Target, Scale, X, Flame,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import {
  buildPlan, cmToFtIn, ftInToCm, kgToLb, lbToKg, macrosFor, RATE_LIMITS,
  type Diet, type MacroGoals, type PlanAnswers, type Sex, type WeightGoal, type WorkoutFreq,
} from '@/lib/nutrition-plan';
import { syncPlanToBackend, useUpdateNutritionSetup, type NutritionSetup } from '@/services/nutrition-setup';
import { MACRO_META, NumberSheet, Ring, Ruler, Wheel, useLockBody, type MacroKey } from './cal-ui';

type StepId =
  | 'welcome' | 'gender' | 'workouts' | 'results' | 'body' | 'birth' | 'goal' | 'target' | 'realistic'
  | 'speed' | 'obstacles' | 'diet' | 'accomplish' | 'burned' | 'rollover' | 'ready' | 'generating' | 'plan';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const OBSTACLES = [
  { id: 'consistency', label: 'Lack of consistency', icon: Repeat },
  { id: 'habits', label: 'Unhealthy eating habits', icon: Pizza },
  { id: 'support', label: 'Lack of support', icon: Users },
  { id: 'schedule', label: 'Busy schedule', icon: CalendarClock },
  { id: 'inspiration', label: 'Lack of meal inspiration', icon: Lightbulb },
];
const DIETS: { id: Diet; label: string; icon: typeof Fish }[] = [
  { id: 'classic', label: 'Classic', icon: Drumstick },
  { id: 'pescatarian', label: 'Pescatarian', icon: Fish },
  { id: 'vegetarian', label: 'Vegetarian', icon: Salad },
  { id: 'vegan', label: 'Vegan', icon: Leaf },
];
const ACCOMPLISH = [
  { id: 'healthier', label: 'Eat and live healthier', icon: Apple },
  { id: 'energy', label: 'Boost my energy and mood', icon: Sun },
  { id: 'consistent', label: 'Stay motivated and consistent', icon: Dumbbell },
  { id: 'body', label: 'Feel better about my body', icon: Heart },
];

interface Props {
  existing?: NutritionSetup | null;
  onDone: () => void;
  onClose?: () => void;
}

function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1 }}>{children}</h1>
      {sub && <p className="cal-muted" style={{ marginTop: 10, fontSize: 15, lineHeight: 1.45 }}>{sub}</p>}
    </div>
  );
}

function Option({ selected, onClick, icon: Icon, label, sub }: { selected: boolean; onClick: () => void; icon?: typeof Fish; label: string; sub?: string }) {
  return (
    <button type="button" className="cal-option" aria-pressed={selected} onClick={onClick}>
      {Icon && <span className="cal-option-icon"><Icon size={18} /></span>}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span>{label}</span>
        {sub && <span className="cal-option-sub">{sub}</span>}
      </span>
    </button>
  );
}

function defaultBirth(age?: number | null): string {
  const y = new Date().getFullYear() - (age && age > 10 && age < 100 ? age : 25);
  return `${y}-01-01`;
}

export default function NutritionOnboarding({ existing, onDone, onClose }: Props) {
  useLockBody();
  const profile = useAuthStore(s => s.profile);
  const { units: appUnits, showToast } = useUIStore();
  const update = useUpdateNutritionSetup();

  const prev = existing?.answers;
  const [a, setA] = useState<Partial<PlanAnswers>>(() => ({
    gender: prev?.gender ?? (profile?.gender === 'male' || profile?.gender === 'female' ? profile.gender : undefined),
    workouts: prev?.workouts,
    heightCm: prev?.heightCm ?? (profile?.height && profile.height > 100 ? Math.round(profile.height) : 170),
    weightKg: prev?.weightKg ?? (profile?.weight && profile.weight > 25 ? Math.round(profile.weight * 2) / 2 : 70),
    birthDate: prev?.birthDate ?? defaultBirth(profile?.age),
    goal: prev?.goal,
    targetWeightKg: prev?.targetWeightKg,
    weeklyRateKg: prev?.weeklyRateKg,
    obstacles: prev?.obstacles ?? [],
    diet: prev?.diet,
    accomplish: prev?.accomplish ?? [],
    units: prev?.units ?? (appUnits === 'imperial' ? 'imperial' : 'metric'),
  }));
  const [prefs, setPrefs] = useState<{ addBurned?: boolean; rollover?: boolean }>({ addBurned: existing?.prefs?.addBurned ?? true, rollover: existing?.prefs?.rollover });
  const [stepIndex, setStepIndex] = useState(existing ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [goals, setGoals] = useState<MacroGoals | null>(null);
  const [editing, setEditing] = useState<MacroKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [genPct, setGenPct] = useState(0);

  const set = <K extends keyof PlanAnswers>(k: K, v: PlanAnswers[K]) => setA(cur => ({ ...cur, [k]: v }));
  const toggle = (k: 'obstacles' | 'accomplish', id: string) =>
    setA(cur => {
      const list = cur[k] || [];
      return { ...cur, [k]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] };
    });

  const maintain = a.goal === 'maintain';
  const steps = useMemo<StepId[]>(() => {
    const all: StepId[] = ['welcome', 'gender', 'workouts', 'results', 'body', 'birth', 'goal', 'target', 'realistic', 'speed', 'obstacles', 'diet', 'accomplish', 'burned', 'rollover', 'ready', 'generating', 'plan'];
    return maintain ? all.filter(s => s !== 'target' && s !== 'realistic' && s !== 'speed') : all;
  }, [maintain]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const progressSteps = steps.length - 3;
  const progress = Math.min(1, Math.max(0, (stepIndex - 1) / progressSteps));

  const imperial = a.units === 'imperial';
  const weight = a.weightKg ?? 70;
  const target = a.targetWeightKg ?? (a.goal === 'gain' ? weight + 5 : weight - 5);
  const rateLimits = a.goal === 'gain' ? RATE_LIMITS.gain : RATE_LIMITS.lose;
  const rate = a.weeklyRateKg ?? rateLimits.recommended;
  const wUnit = imperial ? 'lb' : 'kg';
  const showW = (kg: number) => (imperial ? Math.round(kgToLb(kg)) : Math.round(kg * 10) / 10);

  const full: PlanAnswers = {
    gender: a.gender ?? 'other',
    workouts: a.workouts ?? '3-5',
    heightCm: a.heightCm ?? 170,
    weightKg: weight,
    birthDate: a.birthDate ?? defaultBirth(),
    goal: a.goal ?? 'maintain',
    targetWeightKg: maintain ? weight : target,
    weeklyRateKg: maintain ? 0 : rate,
    obstacles: a.obstacles ?? [],
    diet: a.diet ?? 'classic',
    accomplish: a.accomplish ?? [],
    units: a.units ?? 'metric',
  };
  const plan = useMemo(() => buildPlan(full), [JSON.stringify(full)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the target weight when the goal changes direction.
  useEffect(() => {
    if (!a.goal || a.goal === 'maintain') return;
    const t = a.targetWeightKg;
    if (t === undefined || (a.goal === 'lose' && t >= weight) || (a.goal === 'gain' && t <= weight)) {
      set('targetWeightKg', Math.round((a.goal === 'lose' ? weight * 0.93 : weight * 1.06) * 2) / 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.goal, weight]);

  const canContinue = (() => {
    switch (step) {
      case 'gender': return !!a.gender;
      case 'workouts': return !!a.workouts;
      case 'goal': return !!a.goal;
      case 'target': return a.goal === 'lose' ? target < weight : target > weight;
      case 'diet': return !!a.diet;
      case 'burned': return prefs.addBurned !== undefined;
      case 'rollover': return prefs.rollover !== undefined;
      default: return true;
    }
  })();

  const go = (delta: number) => {
    setDir(delta);
    setStepIndex(i => Math.max(0, Math.min(steps.length - 1, i + delta)));
  };

  // Plan generation animation.
  useEffect(() => {
    if (step !== 'generating') return;
    setGenPct(0);
    const start = Date.now();
    let done = 0;
    const timer = window.setInterval(() => {
      const p = Math.max(0, Math.min(100, Math.round(((Date.now() - start) / 3200) * 100)));
      setGenPct(p);
      if (p >= 100) {
        window.clearInterval(timer);
        done = window.setTimeout(() => { setGoals(macrosFor(plan.calories, full)); go(1); }, 350);
      }
    }, 40);
    return () => { window.clearInterval(timer); window.clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const finish = async () => {
    if (!goals) return;
    setSaving(true);
    try {
      await update({
        version: 1,
        answers: full,
        goals,
        prefs: { addBurned: !!prefs.addBurned, rollover: !!prefs.rollover },
        completedAt: Date.now(),
      }, prevSetup => ({ ...prevSetup, version: 1, answers: full, goals, prefs: { addBurned: !!prefs.addBurned, rollover: !!prefs.rollover }, completedAt: Date.now() }));
      syncPlanToBackend(full, goals).catch(err => console.warn('Backend profile sync failed', err));
      onDone();
    } catch (err) {
      console.error(err);
      showToast('Could not save your plan. Check your connection and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const weightDiff = Math.abs(target - weight);
  const goalVerb = a.goal === 'gain' ? 'Gaining' : 'Losing';

  let body: ReactNode;
  switch (step) {
    case 'welcome':
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 20 }}>
          <div style={{ position: 'relative', width: 220, height: 220, marginBottom: 30 }}>
            <Ring size={220} stroke={16} pct={0.72} color="var(--cal-text)">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Flame size={30} />
                <span className="cal-tabular" style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4 }}>1,250</span>
                <span className="cal-muted" style={{ fontSize: 13, fontWeight: 600 }}>Calories left</span>
              </div>
            </Ring>
            {[
              { k: 'protein' as const, x: -10, y: 150 },
              { k: 'carbs' as const, x: 170, y: 10 },
              { k: 'fat' as const, x: 180, y: 160 },
            ].map(({ k, x, y }) => {
              const M = MACRO_META[k];
              return (
                <div key={k} className="cal-card" style={{ position: 'absolute', left: x, top: y, padding: '8px 10px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                  <M.icon size={14} color={M.color} /> {M.label}
                </div>
              );
            })}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1 }}>Calorie tracking<br />made easy</h1>
          <p className="cal-muted" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.5, maxWidth: 320 }}>Just snap a quick photo of your meal and we'll do the rest. Answer a few questions to get your custom plan.</p>
        </div>
      );
      break;

    case 'gender':
      body = (
        <>
          <Title sub="This will be used to calibrate your custom plan.">Choose your gender</Title>
          <div style={{ display: 'grid', gap: 12 }}>
            {(['male', 'female', 'other'] as Sex[]).map(g => (
              <Option key={g} selected={a.gender === g} onClick={() => set('gender', g)} label={g[0].toUpperCase() + g.slice(1)} />
            ))}
          </div>
        </>
      );
      break;

    case 'workouts':
      body = (
        <>
          <Title sub="This will be used to calibrate your custom plan.">How many workouts do you do per week?</Title>
          <div style={{ display: 'grid', gap: 12 }}>
            {([
              { id: '0-2', sub: 'Workouts now and then', dots: 1 },
              { id: '3-5', sub: 'A few workouts per week', dots: 2 },
              { id: '6+', sub: 'Dedicated athlete', dots: 3 },
            ] as { id: WorkoutFreq; sub: string; dots: number }[]).map(o => (
              <button key={o.id} type="button" className="cal-option" aria-pressed={a.workouts === o.id} onClick={() => set('workouts', o.id)}>
                <span className="cal-option-icon" style={{ gap: 2 }}>
                  {Array.from({ length: o.dots }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: 5, background: 'currentColor' }} />)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{o.id}</span>
                  <span className="cal-option-sub">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      );
      break;

    case 'results': {
      const W = 300, H = 150;
      body = (
        <>
          <Title>Tracking beats guessing</Title>
          <div className="cal-card-2" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Your weight</div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} aria-hidden>
              <path d={`M10 40 C 80 44, 110 110, 150 112 S 230 60, 290 36`} fill="none" stroke="var(--cal-bad)" strokeWidth={3} strokeLinecap="round" />
              <path d={`M10 40 C 80 44, 110 110, 150 112 S 230 118, 290 124 L290 ${H} L10 ${H} Z`} fill="color-mix(in srgb, var(--cal-text) 8%, transparent)" />
              <path d={`M10 40 C 80 44, 110 110, 150 112 S 230 118, 290 124`} fill="none" stroke="var(--cal-text)" strokeWidth={3} strokeLinecap="round" />
              <circle cx={10} cy={40} r={5} fill="var(--cal-card)" stroke="var(--cal-text)" strokeWidth={2.5} />
              <circle cx={290} cy={124} r={5} fill="var(--cal-card)" stroke="var(--cal-text)" strokeWidth={2.5} />
              <text x={200} y={30} fontSize={12} fontWeight={600} fill="var(--cal-bad)">Guessing</text>
              <text x={210} y={146} fontSize={12} fontWeight={700} fill="var(--cal-text)">Tracking</text>
            </svg>
            <div className="cal-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginTop: 6 }}><span>Month 1</span><span>Month 6</span></div>
          </div>
          <p className="cal-muted" style={{ marginTop: 18, fontSize: 15, lineHeight: 1.5, textAlign: 'center' }}>Crash diets rebound. Knowing what you eat every day is what makes results last.</p>
        </>
      );
      break;
    }

    case 'body': {
      const hIn = cmToFtIn(a.heightCm ?? 170);
      body = (
        <>
          <Title sub="This will be used to calibrate your custom plan.">Height &amp; weight</Title>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 22, fontSize: 16, fontWeight: 700 }}>
            <span className={imperial ? '' : 'cal-muted'}>Imperial</span>
            <button
              type="button"
              role="switch"
              aria-checked={!imperial}
              aria-label="Use metric units"
              onClick={() => set('units', imperial ? 'metric' : 'imperial')}
              style={{ width: 52, height: 30, borderRadius: 30, background: 'var(--cal-primary)', position: 'relative' }}
            >
              <span style={{ position: 'absolute', top: 3, left: imperial ? 3 : 25, width: 24, height: 24, borderRadius: 24, background: 'var(--cal-on-primary)', transition: 'left 0.2s' }} />
            </button>
            <span className={imperial ? 'cal-muted' : ''}>Metric</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Height</div>
              {imperial ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Wheel items={Array.from({ length: 5 }, (_, i) => ({ value: i + 3, label: `${i + 3} ft` }))} value={hIn.ft} onChange={ft => set('heightCm', ftInToCm(ft, hIn.inch))} width="50%" />
                  <Wheel items={Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i} in` }))} value={hIn.inch} onChange={inch => set('heightCm', ftInToCm(hIn.ft, inch))} width="50%" />
                </div>
              ) : (
                <Wheel items={Array.from({ length: 111 }, (_, i) => ({ value: i + 120, label: `${i + 120} cm` }))} value={Math.round(a.heightCm ?? 170)} onChange={v => set('heightCm', v)} />
              )}
            </div>
            <div>
              <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Weight</div>
              {imperial ? (
                <Wheel items={Array.from({ length: 485 }, (_, i) => ({ value: i + 66, label: `${i + 66} lb` }))} value={Math.round(kgToLb(weight))} onChange={lb => set('weightKg', Math.round(lbToKg(lb) * 10) / 10)} />
              ) : (
                <Wheel items={Array.from({ length: 221 }, (_, i) => ({ value: i + 30, label: `${i + 30} kg` }))} value={Math.round(weight)} onChange={v => set('weightKg', v)} />
              )}
            </div>
          </div>
        </>
      );
      break;
    }

    case 'birth': {
      const [y, m, d] = (a.birthDate ?? defaultBirth()).split('-').map(Number);
      const thisYear = new Date().getFullYear();
      const daysIn = new Date(y, m, 0).getDate();
      const setBirth = (yy: number, mm: number, dd: number) => {
        const max = new Date(yy, mm, 0).getDate();
        set('birthDate', `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dd, max)).padStart(2, '0')}`);
      };
      body = (
        <>
          <Title sub="This will be used to calibrate your custom plan.">When were you born?</Title>
          <div style={{ display: 'flex', gap: 6 }}>
            <Wheel items={MONTHS.map((name, i) => ({ value: i + 1, label: name }))} value={m} onChange={mm => setBirth(y, mm, d)} width="44%" />
            <Wheel items={Array.from({ length: daysIn }, (_, i) => ({ value: i + 1, label: String(i + 1).padStart(2, '0') }))} value={Math.min(d, daysIn)} onChange={dd => setBirth(y, m, dd)} width="22%" />
            <Wheel items={Array.from({ length: 88 }, (_, i) => ({ value: thisYear - 13 - i, label: String(thisYear - 13 - i) }))} value={y} onChange={yy => setBirth(yy, m, d)} width="34%" />
          </div>
        </>
      );
      break;
    }

    case 'goal':
      body = (
        <>
          <Title sub="This helps us generate a plan for your calorie intake.">What is your goal?</Title>
          <div style={{ display: 'grid', gap: 12 }}>
            {([
              { id: 'lose', label: 'Lose weight' },
              { id: 'maintain', label: 'Maintain' },
              { id: 'gain', label: 'Gain weight' },
            ] as { id: WeightGoal; label: string }[]).map(o => (
              <Option key={o.id} selected={a.goal === o.id} onClick={() => set('goal', o.id)} label={o.label} />
            ))}
          </div>
        </>
      );
      break;

    case 'target':
      body = (
        <>
          <Title>What is your desired weight?</Title>
          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <div className="cal-muted" style={{ fontSize: 15, fontWeight: 600 }}>{a.goal === 'gain' ? 'Gain weight' : 'Lose weight'}</div>
            <div className="cal-tabular" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6 }}>{showW(target)} {wUnit}</div>
            {!canContinue && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cal-bad)', marginTop: 4 }}>{a.goal === 'gain' ? 'Pick a weight above' : 'Pick a weight below'} your current {showW(weight)} {wUnit}</div>}
          </div>
          <div style={{ marginTop: 26 }}>
            {imperial ? (
              <Ruler key="lb" min={66} max={550} step={1} value={Math.round(kgToLb(target))} onChange={lb => set('targetWeightKg', Math.round(lbToKg(lb) * 10) / 10)} />
            ) : (
              <Ruler key="kg" min={30} max={250} step={0.5} value={target} onChange={kg => set('targetWeightKg', kg)} />
            )}
          </div>
        </>
      );
      break;

    case 'realistic':
      body = (
        <div style={{ textAlign: 'center', paddingTop: 70 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.2 }}>
            {goalVerb} <span style={{ color: 'var(--cal-carbs)' }}>{showW(weightDiff)} {wUnit}</span> is a realistic target. It&apos;s not hard at all!
          </h1>
          <p className="cal-muted" style={{ marginTop: 16, fontSize: 15, lineHeight: 1.5 }}>Small daily changes add up. Logging your meals keeps you honest and shows you exactly what works.</p>
        </div>
      );
      break;

    case 'speed': {
      const shown = imperial ? Math.round(kgToLb(rate) * 10) / 10 : rate;
      const zone = rate < rateLimits.recommended - 0.25 ? 0 : rate > rateLimits.recommended + 0.35 ? 2 : 1;
      const msg = zone === 0 ? 'Slow and steady — easy to sustain.' : zone === 1 ? 'Recommended' : a.goal === 'gain' ? 'Fast gains add more fat along with muscle.' : 'You may feel very tired and hungry at this pace.';
      body = (
        <>
          <Title>How fast do you want to reach your goal?</Title>
          <div style={{ textAlign: 'center', marginTop: 26 }}>
            <div className="cal-muted" style={{ fontSize: 15, fontWeight: 600 }}>{a.goal === 'gain' ? 'Gain' : 'Loss'} speed per week</div>
            <div className="cal-tabular" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6 }}>{shown.toFixed(1)} {wUnit}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '26px 6px 12px' }}>
            {[Snail, Rabbit, Zap].map((Icon, i) => (
              <Icon key={i} size={30} style={{ color: zone === i ? 'var(--cal-carbs)' : 'var(--cal-muted)', opacity: zone === i ? 1 : 0.55, transition: 'color 0.2s' }} />
            ))}
          </div>
          <input
            type="range"
            className="cal-range"
            min={rateLimits.min}
            max={rateLimits.max}
            step={rateLimits.step}
            value={rate}
            onChange={e => set('weeklyRateKg', Number(e.target.value))}
            aria-label="Weekly rate"
            style={{ background: `linear-gradient(90deg, var(--cal-primary) ${((rate - rateLimits.min) / (rateLimits.max - rateLimits.min)) * 100}%, color-mix(in srgb, var(--cal-muted) 35%, transparent) 0)` }}
          />
          <div className="cal-muted cal-tabular" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
            <span>{imperial ? kgToLb(rateLimits.min).toFixed(1) : rateLimits.min} {wUnit}</span>
            <span>{imperial ? kgToLb(rateLimits.recommended).toFixed(1) : rateLimits.recommended} {wUnit}</span>
            <span>{imperial ? kgToLb(rateLimits.max).toFixed(1) : rateLimits.max} {wUnit}</span>
          </div>
          <div className="cal-card-2" style={{ marginTop: 26, padding: '14px 16px', textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{msg}</div>
        </>
      );
      break;
    }

    case 'obstacles':
      body = (
        <>
          <Title sub="Choose all that apply.">What&apos;s stopping you from reaching your goals?</Title>
          <div style={{ display: 'grid', gap: 12 }}>
            {OBSTACLES.map(o => <Option key={o.id} selected={!!a.obstacles?.includes(o.id)} onClick={() => toggle('obstacles', o.id)} icon={o.icon} label={o.label} />)}
          </div>
        </>
      );
      break;

    case 'diet':
      body = (
        <>
          <Title>Do you follow a specific diet?</Title>
          <div style={{ display: 'grid', gap: 12 }}>
            {DIETS.map(o => <Option key={o.id} selected={a.diet === o.id} onClick={() => set('diet', o.id)} icon={o.icon} label={o.label} />)}
          </div>
        </>
      );
      break;

    case 'accomplish':
      body = (
        <>
          <Title sub="Choose all that apply.">What would you like to accomplish?</Title>
          <div style={{ display: 'grid', gap: 12 }}>
            {ACCOMPLISH.map(o => <Option key={o.id} selected={!!a.accomplish?.includes(o.id)} onClick={() => toggle('accomplish', o.id)} icon={o.icon} label={o.label} />)}
          </div>
        </>
      );
      break;

    case 'burned':
      body = (
        <>
          <Title>Add calories burned back to your daily goal?</Title>
          <div className="cal-card" style={{ padding: 18, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="cal-muted" style={{ fontSize: 13, fontWeight: 600 }}>Today&apos;s goal</div>
                <div className="cal-tabular" style={{ fontSize: 26, fontWeight: 800 }}>{plan.calories.toLocaleString()} <span style={{ fontSize: 14 }}>cals</span></div>
              </div>
              <Ring size={64} stroke={7} pct={0.6} color="var(--cal-text)"><Flame size={20} /></Ring>
            </div>
            <div className="cal-card-2" style={{ marginTop: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>
              <span className="cal-option-icon" style={{ width: 32, height: 32 }}><Dumbbell size={15} /></span>
              Workout <span style={{ marginLeft: 'auto', color: 'var(--cal-good)' }}>+150 cals</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Option selected={prefs.addBurned === false} onClick={() => setPrefs(p => ({ ...p, addBurned: false }))} label="No" />
            <Option selected={prefs.addBurned === true} onClick={() => setPrefs(p => ({ ...p, addBurned: true }))} label="Yes" />
          </div>
          <p className="cal-muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5 }}>Workouts and runs you track in Apparatus are counted automatically.</p>
        </>
      );
      break;

    case 'rollover':
      body = (
        <>
          <Title>Rollover extra calories to the next day?</Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Yesterday', left: 350, total: 2000, note: 'Up to 200 cals' },
              { label: 'Today', left: 2200, total: 2200, note: '+200 rollover' },
            ].map((c, i) => (
              <div key={c.label} className="cal-card" style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</div>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                  <Ring size={70} stroke={7} pct={i === 0 ? 0.82 : 0.1} color="var(--cal-text)">
                    <span className="cal-tabular" style={{ fontSize: 13, fontWeight: 800 }}>{c.left}</span>
                  </Ring>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: i === 1 ? 'var(--cal-fat)' : 'var(--cal-muted)' }}>{c.note}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Option selected={prefs.rollover === false} onClick={() => setPrefs(p => ({ ...p, rollover: false }))} label="No" />
            <Option selected={prefs.rollover === true} onClick={() => setPrefs(p => ({ ...p, rollover: true }))} label="Yes" />
          </div>
        </>
      );
      break;

    case 'ready':
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 40 }}>
          <div style={{ width: 180, height: 180, borderRadius: 999, background: 'var(--cal-card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30 }}>
            <div style={{ width: 110, height: 110, borderRadius: 999, background: 'var(--cal-primary)', color: 'var(--cal-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={44} />
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--cal-carbs)' }}><Check size={16} /> All done!</div>
          <h1 style={{ marginTop: 10, fontSize: 32, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.12 }}>Time to generate<br />your custom plan!</h1>
        </div>
      );
      break;

    case 'generating': {
      const items = ['Calories', 'Carbs', 'Protein', 'Fats', 'Health score'];
      body = (
        <div style={{ paddingTop: 40, textAlign: 'center' }}>
          <div className="cal-tabular" style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.04em' }}>{genPct}%</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 }}>We&apos;re setting<br />everything up for you</h1>
          <div style={{ height: 8, borderRadius: 8, background: 'var(--cal-card-2)', margin: '26px 0 10px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${genPct}%`, borderRadius: 8, background: 'linear-gradient(90deg, var(--cal-protein), var(--cal-carbs), var(--cal-fat))' }} />
          </div>
          <div className="cal-muted" style={{ fontSize: 14, fontWeight: 600 }}>{genPct < 35 ? 'Applying BMR formula…' : genPct < 70 ? 'Calculating your macros…' : 'Finalizing results…'}</div>
          <div className="cal-card" style={{ marginTop: 28, padding: 18, textAlign: 'left' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Daily recommendation for</div>
            {items.map((label, i) => {
              const done = genPct >= (i + 1) * 18;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 15, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--cal-text)' }} />
                  {label}
                  <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--cal-primary)' : 'var(--cal-card-2)', color: 'var(--cal-on-primary)', transition: 'background 0.2s' }}>
                    {done && <Check size={13} strokeWidth={3} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    }

    case 'plan': {
      const g = goals ?? macrosFor(plan.calories, full);
      const tiles: { k: MacroKey; max: number }[] = [
        { k: 'calories', max: 8000 }, { k: 'carbs', max: 1200 }, { k: 'protein', max: 600 }, { k: 'fat', max: 400 },
      ];
      body = (
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 44, background: 'var(--cal-primary)', color: 'var(--cal-on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={22} strokeWidth={3} /></span>
          </div>
          <h1 style={{ marginTop: 14, textAlign: 'center', fontSize: 28, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.15 }}>Congratulations<br />your custom plan is ready!</h1>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{maintain ? 'You should maintain:' : a.goal === 'gain' ? 'You should gain:' : 'You should lose:'}</div>
            <div className="cal-card-2" style={{ display: 'inline-block', marginTop: 8, padding: '8px 16px', borderRadius: 999, fontSize: 15, fontWeight: 700 }}>
              {maintain ? `${showW(weight)} ${wUnit}` : `${showW(weightDiff)} ${wUnit} by ${plan.eta ? format(plan.eta, 'MMMM d') : '—'}`}
            </div>
          </div>
          <div className="cal-card" style={{ marginTop: 22, padding: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Daily recommendation</div>
            <div className="cal-muted" style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>You can edit this anytime</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {tiles.map(({ k }) => {
                const M = MACRO_META[k];
                return (
                  <div key={k} className="cal-card-2" style={{ padding: 12, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}><M.icon size={15} color={M.color} /> {M.label}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                      <Ring size={84} stroke={7} pct={0.72} color={M.color} track="var(--cal-card)">
                        <span className="cal-tabular" style={{ fontSize: 18, fontWeight: 800 }}>{g[k]}{M.unit}</span>
                      </Ring>
                    </div>
                    <button type="button" onClick={() => setEditing(k)} aria-label={`Edit ${M.label}`} style={{ position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cal-card)' }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="cal-card" style={{ marginTop: 14, padding: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>How to reach your goals:</div>
            {[
              { icon: Camera, text: 'Snap a photo of every meal — the AI works out calories and macros' },
              { icon: Plus, text: 'Use the + button for barcodes, the food database or saved foods' },
              { icon: Target, text: `Stay close to your ${g.calories.toLocaleString()} calorie target each day` },
              { icon: Scale, text: 'Log your weight weekly to see your progress' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="cal-card-2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8, fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
                <span className="cal-option-icon" style={{ width: 34, height: 34 }}><Icon size={16} /></span>
                {text}
              </div>
            ))}
            <div className="cal-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
              Based on the Mifflin-St Jeor equation. Estimated maintenance: {plan.tdee.toLocaleString()} kcal/day · BMI {plan.bmi}. This is general guidance, not medical advice.
            </div>
          </div>
        </div>
      );
      break;
    }
  }

  const ctaLabel = step === 'welcome' ? 'Get started' : step === 'ready' ? 'Create my plan' : step === 'plan' ? "Let's get started!" : 'Continue';
  const showChrome = step !== 'welcome' && step !== 'generating' && step !== 'plan';

  return createPortal(
    <div className="cal cal-screen" style={{ position: 'fixed', inset: 0, zIndex: 10005, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', paddingTop: 'max(14px, env(safe-area-inset-top))', height: 'calc(max(14px, env(safe-area-inset-top)) + 48px)', flexShrink: 0 }}>
        {showChrome ? (
          <button type="button" className="cal-icon-btn" onClick={() => go(-1)} aria-label="Back"><ArrowLeft size={19} /></button>
        ) : onClose && step !== 'generating' ? (
          <button type="button" className="cal-icon-btn" onClick={onClose} aria-label="Close"><X size={19} /></button>
        ) : <span style={{ width: 40 }} />}
        {showChrome && (
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--cal-card-2)', overflow: 'hidden' }}>
            <motion.div style={{ height: '100%', borderRadius: 4, background: 'var(--cal-primary)' }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.3 }} />
          </div>
        )}
        {showChrome && onClose && <button type="button" className="cal-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ maxWidth: 520, margin: '0 auto', padding: '18px 24px 24px' }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>

      {step !== 'generating' && (
        <div style={{ flexShrink: 0, padding: '12px 24px', paddingBottom: 'max(18px, env(safe-area-inset-bottom))', maxWidth: 520, width: '100%', margin: '0 auto' }}>
          <button
            type="button"
            className="cal-btn"
            style={{ width: '100%' }}
            disabled={!canContinue || saving}
            onClick={() => (step === 'plan' ? finish() : go(1))}
          >
            {saving ? 'Saving…' : ctaLabel}
          </button>
        </div>
      )}

      <AnimatePresence>
        {editing && goals && (
          <NumberSheet
            title={`${MACRO_META[editing].label} target`}
            value={goals[editing]}
            unit={editing === 'calories' ? 'kcal' : 'g'}
            min={editing === 'calories' ? 800 : 0}
            max={editing === 'calories' ? 8000 : editing === 'carbs' ? 1200 : editing === 'protein' ? 600 : editing === 'fat' ? 400 : 150}
            onSave={v => setGoals(g => (g ? { ...g, [editing]: v } : g))}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
