import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ArrowDown, ArrowRight, ArrowUp, Check, ChevronRight, Clock, Compass, Dumbbell, Flame,
  Footprints, GraduationCap, Lock, Minus, Plus, RotateCcw, Settings2, Shield, Sparkles,
  Target, Timer, TrendingUp, Trophy, X, Youtube,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import {
  FAMILY_LABELS, SKILLS, SKILL_BY_ID, TIER_NAMES,
  type CalisthenicsSkill, type SkillFamily, type SkillStep, type SkillTier,
} from '@/data/calisthenics-curriculum';
import {
  ASSESSMENT_QUESTIONS, EMPTY_ASSESSMENT, MAX_ACTIVE_SKILLS, PASSES_TO_ADVANCE, WEEKDAY_NAMES,
  buildSession, coachGreeting, effectiveLevel, formatWeeks, levelFromAssessment, logPractice,
  missingPrerequisites, placeAllSkills, prescribe, recommendSkills, refreshActiveSkills, remainingWeeks,
  skillCompletion, skillStatus, stepBack, stepOf, weeksFromHere, weeklySchedule,
  type Assessment, type LogResult, type Prescription, type ProgressMap, type SkillProgress, type TutorProfile,
} from '@/lib/skill-tutor';
import { loadSkillTutor, saveSkillTutor, type SkillTutorState } from '@/services/skills';
import { syncTutorSkills } from '@/services/stats';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

type Tab = 'today' | 'path' | 'library';

const LEVEL_BLURB: Record<SkillTier, string> = {
  0: 'Building the base: push-ups, rows, hollow body, squats and joint prep.',
  1: 'Unlocking your first skills: pull-ups, dips, L-sit, crow and wall handstand.',
  2: 'Chasing big skills: muscle-up, freestanding handstand, back lever, pistol.',
  3: 'Advanced statics and power: front lever, planche, human flag, one-arm work.',
  4: 'Elite mastery: full planche, one-arm pull-up, manna, one-arm handstand.',
};

const FAMILY_ICONS: Record<SkillFamily, typeof Target> = {
  push: ArrowUp,
  pull: ArrowDown,
  core: Shield,
  legs: Footprints,
  balance: Compass,
  mobility: Activity,
};

function SkillBadgeIcon({ family, size = 18, className = '' }: { family: SkillFamily; size?: number; className?: string }) {
  const Icon = FAMILY_ICONS[family] || Target;
  return (
    <span className={`dx-badge-icon flex-none ${className}`}>
      <Icon size={size} />
    </span>
  );
}

const dose = (step: SkillStep, value = step.target, sets = step.sets) =>
  `${sets} × ${value}${step.unit === 'sec' ? 's' : ''}${step.perSide ? ' / side' : ''}`;

const unitLabel = (step: SkillStep) => (step.unit === 'sec' ? 'seconds' : 'reps');

const techniqueUrl = (skill: CalisthenicsSkill, step?: SkillStep) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${step?.name ?? skill.name} calisthenics tutorial`)}`;

export function SkillsPage() {
  const { profile: user } = useAuthStore();
  const uid = user?.uid;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('today');
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<{ skillId: string; isTest: boolean } | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['skillTutor', uid],
    queryFn: () => loadSkillTutor(uid!),
    enabled: !!uid,
  });

  const tutor = data?.profile ?? null;
  const progress = data?.progress ?? {};

  // Skill progress feeds the athlete rank's Skill pillar.
  useEffect(() => {
    if (uid && data) syncTutorSkills(uid, data.progress).catch(() => {});
  }, [uid, data]);

  const persist = (next: SkillTutorState, changed: { profile?: TutorProfile; progress?: SkillProgress[] }) => {
    if (!uid) return;
    queryClient.setQueryData(['skillTutor', uid], next);
    setSaveError(null);
    saveSkillTutor(uid, changed)
      .then(() => queryClient.invalidateQueries({ queryKey: ['userSkills', uid] }))
      .catch(() => {
        setSaveError('Could not save your progress. Check your connection and try again.');
        queryClient.invalidateQueries({ queryKey: ['skillTutor', uid] });
      });
  };

  const finishAssessment = (assessment: Assessment, daysPerWeek: number) => {
    const level = levelFromAssessment(assessment);
    const placed = placeAllSkills(assessment, level, progress);
    const nextProfile: TutorProfile = {
      level,
      assessment,
      assessedAt: Date.now(),
      daysPerWeek,
      activeSkills: recommendSkills(level, placed),
    };
    const changed = Object.values(placed).filter(p => placed[p.skillId] !== progress[p.skillId]);
    persist({ profile: nextProfile, progress: placed }, { profile: nextProfile, progress: changed });
    setAssessing(false);
    setTab('today');
  };

  const updateProfile = (patch: Partial<TutorProfile>) => {
    if (!tutor) return;
    const nextProfile = { ...tutor, ...patch };
    persist({ profile: nextProfile, progress }, { profile: nextProfile });
  };

  const toggleActive = (skillId: string) => {
    if (!tutor) return;
    const active = tutor.activeSkills.includes(skillId)
      ? tutor.activeSkills.filter(id => id !== skillId)
      : [...tutor.activeSkills, skillId].slice(-MAX_ACTIVE_SKILLS);
    updateProfile({ activeSkills: active });
  };

  const submitLog = (skillId: string, values: number[], isTest: boolean): LogResult => {
    const skill = SKILL_BY_ID[skillId];
    const result = logPractice(skill, progress[skillId], values, { isTest });
    const nextProgress = { ...progress, [skillId]: result.progress };
    let nextProfile = tutor ?? undefined;
    if (tutor) {
      const active = tutor.activeSkills.includes(skillId) ? tutor.activeSkills : [...tutor.activeSkills, skillId].slice(-MAX_ACTIVE_SKILLS);
      const withActive = { ...tutor, activeSkills: active };
      nextProfile = { ...withActive, activeSkills: refreshActiveSkills(withActive, nextProgress) };
    }
    persist({ profile: nextProfile ?? null, progress: nextProgress }, { profile: nextProfile, progress: [result.progress] });
    return result;
  };

  const goBackStep = (skillId: string) => {
    const next = stepBack(SKILL_BY_ID[skillId], progress[skillId]);
    persist({ profile: tutor, progress: { ...progress, [skillId]: next } }, { progress: [next] });
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tutor || assessing) {
    return (
      <AssessmentFlow
        initial={tutor?.assessment}
        initialDays={tutor?.daysPerWeek}
        canCancel={!!tutor}
        onCancel={() => setAssessing(false)}
        onDone={finishAssessment}
      />
    );
  }

  const openSkill = openSkillId ? SKILL_BY_ID[openSkillId] : null;
  const logSkill = logFor ? SKILL_BY_ID[logFor.skillId] : null;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope max-w-4xl mx-auto pt-1 sm:pt-4 space-y-4 pb-10">
      <motion.header variants={item} className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="dx-eyebrow">Calisthenics coach</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">Skills</h1>
        </div>
        <button onClick={() => setAssessing(true)} className="dx-icon-btn dx-icon-btn--sm" aria-label="Retake assessment" title="Retake assessment">
          <Settings2 size={17} />
        </button>
      </motion.header>

      {saveError && (
        <motion.div variants={item} className="dx-card p-3 text-[13px]" style={{ borderColor: 'var(--dx-warning)' }}>{saveError}</motion.div>
      )}

      <CoachHero tutor={tutor} progress={progress} />

      <motion.div variants={item} className="dx-segment" role="tablist">
        {([['today', 'Today'], ['path', 'My path'], ['library', 'All skills']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </motion.div>

      {tab === 'today' && (
        <TodayView tutor={tutor} progress={progress} onOpen={setOpenSkillId} onLog={id => setLogFor({ skillId: id, isTest: false })} />
      )}
      {tab === 'path' && (
        <PathView
          tutor={tutor}
          progress={progress}
          onOpen={setOpenSkillId}
          onToggle={toggleActive}
          onDays={d => updateProfile({ daysPerWeek: d })}
          onBrowse={() => setTab('library')}
        />
      )}
      {tab === 'library' && <LibraryView tutor={tutor} progress={progress} onOpen={setOpenSkillId} />}

      <AnimatePresence>
        {openSkill && !logSkill && (
          <SkillSheet
            key={openSkill.id}
            skill={openSkill}
            tutor={tutor}
            progress={progress}
            onClose={() => setOpenSkillId(null)}
            onOpen={setOpenSkillId}
            onToggle={() => toggleActive(openSkill.id)}
            onLog={isTest => setLogFor({ skillId: openSkill.id, isTest })}
            onStepBack={() => goBackStep(openSkill.id)}
          />
        )}
        {logSkill && logFor && (
          <LogSheet
            key={`log-${logSkill.id}`}
            skill={logSkill}
            progress={progress}
            isTest={logFor.isTest}
            onClose={() => setLogFor(null)}
            onSubmit={values => submitLog(logSkill.id, values, logFor.isTest)}
            onStepBack={() => goBackStep(logSkill.id)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Hero ─────────────────────────────────────────────────── */

function CoachHero({ tutor, progress }: { tutor: TutorProfile; progress: ProgressMap }) {
  const level = effectiveLevel(tutor, progress);
  const mastered = SKILLS.filter(s => progress[s.id]?.mastered).length;
  const session = buildSession(tutor, progress, new Date().getDay());
  const pct = Math.round((mastered / SKILLS.length) * 100);

  return (
    <motion.section variants={item} className="dx-hero p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="dx-hero-icon !w-12 !h-12"><GraduationCap size={22} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">Level {level} · {TIER_NAMES[level]}</div>
          <p className="mt-1 text-[15px] font-semibold leading-snug">{coachGreeting(level, session, mastered)}</p>
          <p className="mt-1 text-[12px] opacity-75 leading-snug">{LEVEL_BLURB[level]}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Mastered', value: `${mastered}/${SKILLS.length}` },
          { label: 'Training', value: `${tutor.activeSkills.length} skills` },
          { label: session.isRestDay ? 'Rest day' : 'Today', value: `${session.minutes} min` },
        ].map(s => (
          <div key={s.label} className="rounded-2xl py-2.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="text-[16px] font-semibold tabular leading-none">{s.value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider opacity-70">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <motion.div className="h-full rounded-full" style={{ background: 'var(--dx-hero-btn)' }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9 }} />
      </div>
    </motion.section>
  );
}

/* ─── Today ────────────────────────────────────────────────── */

function TodayView({ tutor, progress, onOpen, onLog }: { tutor: TutorProfile; progress: ProgressMap; onOpen: (id: string) => void; onLog: (id: string) => void }) {
  const weekday = new Date().getDay();
  const session = buildSession(tutor, progress, weekday);

  if (tutor.activeSkills.length === 0) {
    return (
      <motion.div variants={item} className="dx-card p-5 text-center">
        <Sparkles className="mx-auto dx-accent" size={24} />
        <p className="mt-2 text-[14px] font-semibold">No skills in your path yet</p>
        <p className="mt-1 text-[12px] dx-muted">Open “All skills” and add the ones you want to learn.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <div className="dx-eyebrow">{WEEKDAY_NAMES[weekday]}</div>
          <div className="dx-section-title">{session.isRestDay ? 'Recovery day' : "Today's lesson"}</div>
        </div>
        <span className="dx-chip"><Clock size={13} /> ~{session.minutes} min</span>
      </motion.div>

      {session.isRestDay && (
        <motion.div variants={item} className="dx-card p-4">
          <p className="text-[13px] leading-relaxed">
            No skill training today. Muscles, tendons and your nervous system adapt while you rest.
            {session.nextTrainingDay !== undefined && <> Next lesson: <strong>{WEEKDAY_NAMES[session.nextTrainingDay]}</strong>.</>}
          </p>
        </motion.div>
      )}

      <motion.div variants={item} className="dx-card p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Flame size={15} className="dx-accent" /> {session.isRestDay ? 'Light mobility' : 'Warm-up · 6–8 min'}</div>
        <ul className="mt-2 dx-list">
          {session.warmup.map(w => <li key={w} className="py-2 text-[13px] dx-muted">{w}</li>)}
        </ul>
      </motion.div>

      {session.items.map((p, i) => (
        <LessonCard key={p.skill.id} index={i + 1} p={p} progress={progress} onOpen={() => onOpen(p.skill.id)} onLog={() => onLog(p.skill.id)} />
      ))}

      {!session.isRestDay && (
        <motion.div variants={item} className="dx-card p-4 text-[13px] dx-muted leading-relaxed">
          <strong className="text-[var(--dx-text)]">Cool-down:</strong> 5 minutes of stretching: hanging stretch, pike fold, and wrist stretches. Log each skill so your coach can adjust tomorrow’s targets.
        </motion.div>
      )}
    </div>
  );
}

function LessonCard({ index, p, progress, onOpen, onLog }: { index: number; p: Prescription; progress: ProgressMap; onOpen: () => void; onLog: () => void }) {
  const passes = progress[p.skill.id]?.passes ?? 0;
  const loggedToday = isToday(progress[p.skill.id]?.lastPracticed);
  return (
    <motion.div variants={item} className="dx-card p-4">
      <div className="flex items-start gap-3">
        <SkillBadgeIcon family={p.skill.family} size={18} className="!w-10 !h-10 !rounded-xl" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] dx-muted">{index}. {p.skill.name} · Step {p.stepIndex + 1} of {p.skill.steps.length}</div>
          <div className="text-[15px] font-semibold leading-tight">{p.step.name}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="dx-tag"><Target size={11} /> <strong>{dose(p.step, p.value, p.sets)}</strong> {p.step.unit === 'reps' ? 'reps' : ''}</span>
            <span className="dx-tag"><Timer size={11} /> Rest {p.restSec}s</span>
            <span className="dx-tag">Pass {passes}/{PASSES_TO_ADVANCE}</span>
          </div>
        </div>
        {loggedToday && <span className="dx-pill dx-pill--success"><Check size={11} /> Done</span>}
      </div>
      <p className="mt-3 text-[12px] dx-muted leading-snug">{p.note}</p>
      <ul className="mt-2 space-y-1">
        {p.step.cues.map(c => (
          <li key={c} className="flex gap-2 text-[12px] leading-snug"><Check size={13} className="mt-0.5 flex-none dx-accent" /> {c}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button onClick={onLog} className="dx-btn flex-1 h-10 text-[13px]"><Dumbbell size={15} /> Log sets</button>
        <button onClick={onOpen} className="dx-btn-secondary h-10 text-[13px]">How to</button>
      </div>
    </motion.div>
  );
}

const isToday = (ts?: number) => !!ts && new Date(ts).toDateString() === new Date().toDateString();

/* ─── Path ─────────────────────────────────────────────────── */

function PathView({ tutor, progress, onOpen, onToggle, onDays, onBrowse }: {
  tutor: TutorProfile; progress: ProgressMap; onOpen: (id: string) => void; onToggle: (id: string) => void; onDays: (d: number) => void; onBrowse: () => void;
}) {
  const schedule = weeklySchedule(tutor);
  const level = effectiveLevel(tutor, progress);
  const suggestions = recommendSkills(level, progress, 12).filter(id => !tutor.activeSkills.includes(id)).slice(0, 4);

  return (
    <div className="space-y-3">
      <motion.div variants={item} className="dx-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[14px] font-semibold">Weekly plan</div>
          <span className="text-[11px] dx-muted">Days per week</span>
        </div>
        <div className="dx-segment mt-2" role="tablist">
          {[2, 3, 4, 5, 6].map(d => (
            <button key={d} role="tab" aria-selected={tutor.daysPerWeek === d} onClick={() => onDays(d)}>{d}</button>
          ))}
        </div>
        <ul className="mt-3 dx-list">
          {schedule.map(day => (
            <li key={day.weekday} className="py-2.5 flex items-start gap-3">
              <span className="w-10 flex-none text-[12px] font-semibold pt-1">{WEEKDAY_NAMES[day.weekday].slice(0, 3)}</span>
              <div className="flex flex-wrap gap-1.5">
                {day.skillIds.length === 0 && <span className="text-[12px] dx-muted pt-1">Mobility only</span>}
                {day.skillIds.map(id => (
                  <span key={id} className="dx-chip">
                    <SkillBadgeIcon family={SKILL_BY_ID[id].family} size={11} className="!w-4 !h-4 !rounded-md !bg-transparent !border-0 p-0 text-[var(--dx-accent)]" /> {SKILL_BY_ID[id].name}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] dx-muted">Other days are rest or light mobility. Each skill is spaced by how often it should be trained.</p>
      </motion.div>

      <motion.div variants={item} className="flex items-center justify-between">
        <div className="dx-section-title">Skills you’re learning</div>
        <span className="text-[12px] dx-muted">{tutor.activeSkills.length}/{MAX_ACTIVE_SKILLS}</span>
      </motion.div>

      {tutor.activeSkills.map(id => {
        const skill = SKILL_BY_ID[id];
        const step = skill.steps[stepOf(progress, id)];
        const pct = Math.round(skillCompletion(skill, progress) * 100);
        return (
          <motion.button key={id} variants={item} onClick={() => onOpen(id)} className="dx-card p-4 w-full text-left">
            <div className="flex items-center gap-3">
              <SkillBadgeIcon family={skill.family} size={18} className="!w-10 !h-10 !rounded-xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold truncate">{skill.name}</span>
                  <span className="dx-pill dx-pill--neutral">{TIER_NAMES[skill.tier]}</span>
                </div>
                <div className="text-[12px] dx-muted truncate">Now: {step?.name ?? 'Mastered'} · {formatWeeks(remainingWeeks(skill, progress))} left</div>
              </div>
              <ChevronRight size={18} className="dx-muted" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="dx-progress flex-1"><span style={{ width: `${pct}%` }} /></div>
              <span className="text-[11px] tabular dx-muted">{pct}%</span>
            </div>
            <StepDots skill={skill} progress={progress} />
          </motion.button>
        );
      })}

      {suggestions.length > 0 && (
        <motion.div variants={item} className="dx-card p-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold"><Sparkles size={15} className="dx-accent" /> Coach suggests next</div>
          <ul className="mt-2 dx-list">
            {suggestions.map(id => {
              const s = SKILL_BY_ID[id];
              return (
                <li key={id} className="py-2.5 flex items-center gap-3">
                  <SkillBadgeIcon family={s.family} size={15} className="!w-8 !h-8 !rounded-lg" />
                  <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(id)}>
                    <div className="text-[13px] font-semibold truncate">{s.name}</div>
                    <div className="text-[11px] dx-muted truncate">{s.summary}</div>
                  </button>
                  <button
                    onClick={() => onToggle(id)}
                    disabled={tutor.activeSkills.length >= MAX_ACTIVE_SKILLS}
                    className="dx-btn-secondary h-8 px-3 text-[12px]"
                  >
                    <Plus size={13} /> Add
                  </button>
                </li>
              );
            })}
          </ul>
          {tutor.activeSkills.length >= MAX_ACTIVE_SKILLS && (
            <p className="mt-2 text-[11px] dx-muted">Your path is full. Remove a skill to add another; focus beats spreading thin.</p>
          )}
        </motion.div>
      )}

      <motion.button variants={item} onClick={onBrowse} className="dx-btn-secondary w-full">
        Browse all {SKILLS.length} skills <ArrowRight size={15} />
      </motion.button>
    </div>
  );
}

function StepDots({ skill, progress }: { skill: CalisthenicsSkill; progress: ProgressMap }) {
  const current = stepOf(progress, skill.id);
  return (
    <div className="mt-2 flex gap-1" aria-hidden>
      {skill.steps.map((s, i) => (
        <span
          key={s.id}
          className="h-1 flex-1 rounded-full"
          style={{ background: i < current ? 'var(--dx-success)' : i === current ? 'var(--dx-accent)' : 'var(--dx-card-2)' }}
        />
      ))}
    </div>
  );
}

/* ─── Library ──────────────────────────────────────────────── */

function LibraryView({ tutor, progress, onOpen }: { tutor: TutorProfile; progress: ProgressMap; onOpen: (id: string) => void }) {
  const [family, setFamily] = useState<SkillFamily | 'all'>('all');
  const filtered = SKILLS.filter(s => family === 'all' || s.family === family);

  return (
    <div className="space-y-4">
      <motion.div variants={item} className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
        {(['all', ...Object.keys(FAMILY_LABELS)] as (SkillFamily | 'all')[]).map(f => (
          <button
            key={f}
            onClick={() => setFamily(f)}
            className="dx-chip !h-8 !px-3 !text-[12px] flex-none"
            style={family === f ? { background: 'var(--dx-ink)', color: 'var(--dx-on-ink)' } : undefined}
          >
            {f === 'all' ? 'All' : FAMILY_LABELS[f]}
          </button>
        ))}
      </motion.div>

      {([0, 1, 2, 3, 4] as SkillTier[]).map(tier => {
        const tierSkills = filtered.filter(s => s.tier === tier);
        if (tierSkills.length === 0) return null;
        const done = tierSkills.filter(s => progress[s.id]?.mastered).length;
        return (
          <motion.section key={tier} variants={item} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="dx-eyebrow">Level {tier}</div>
                <div className="dx-section-title">{TIER_NAMES[tier]}</div>
              </div>
              <span className="text-[12px] dx-muted tabular">{done}/{tierSkills.length} mastered</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tierSkills.map(skill => <SkillTile key={skill.id} skill={skill} tutor={tutor} progress={progress} onOpen={() => onOpen(skill.id)} />)}
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

function SkillTile({ skill, tutor, progress, onOpen }: { skill: CalisthenicsSkill; tutor: TutorProfile; progress: ProgressMap; onOpen: () => void }) {
  const status = skillStatus(skill, progress, tutor);
  const step = stepOf(progress, skill.id);
  const locked = status === 'locked';
  const pill = {
    mastered: <span className="dx-pill dx-pill--success"><Check size={11} /> Mastered</span>,
    active: <span className="dx-pill dx-pill--accent">Step {step + 1}/{skill.steps.length}</span>,
    available: step > 0
      ? <span className="dx-pill dx-pill--neutral">Step {step + 1}/{skill.steps.length}</span>
      : <span className="dx-pill dx-pill--neutral">Ready</span>,
    locked: <span className="dx-pill dx-pill--neutral"><Lock size={10} /> Locked</span>,
  }[status];

  return (
    <button onClick={onOpen} className="dx-card p-3.5 text-left flex items-start gap-3" style={status === 'active' ? { borderColor: 'var(--dx-accent)' } : undefined}>
      <SkillBadgeIcon family={skill.family} size={18} className={`!w-10 !h-10 !rounded-xl ${locked ? 'opacity-40' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[14px] font-semibold truncate ${locked ? 'dx-muted' : ''}`}>{skill.name}</span>
          {pill}
        </div>
        <div className="mt-0.5 text-[12px] dx-muted leading-snug line-clamp-2">{skill.summary}</div>
        <div className="mt-1.5 text-[11px] dx-muted flex items-center gap-1">
          <Clock size={11} /> {status === 'mastered' ? 'Complete' : `${formatWeeks(weeksFromHere(skill, progress))} from here`} · {FAMILY_LABELS[skill.family]}
        </div>
      </div>
    </button>
  );
}

/* ─── Sheets ───────────────────────────────────────────────── */

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dx pro-scope dx-overlay z-[100]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="dx-backdrop" />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />
        {children}
      </motion.div>
    </div>
  );
}

function SkillSheet({ skill, tutor, progress, onClose, onOpen, onToggle, onLog, onStepBack }: {
  skill: CalisthenicsSkill; tutor: TutorProfile; progress: ProgressMap;
  onClose: () => void; onOpen: (id: string) => void; onToggle: () => void; onLog: (isTest: boolean) => void; onStepBack: () => void;
}) {
  const status = skillStatus(skill, progress, tutor);
  const current = stepOf(progress, skill.id);
  const missing = missingPrerequisites(skill, progress);
  const rx = prescribe(skill, progress);
  const p = progress[skill.id];
  const isActive = tutor.activeSkills.includes(skill.id);
  const canTrain = status !== 'locked' && status !== 'mastered';

  return (
    <Sheet label={skill.name} onClose={onClose}>
      <div className="dx-sheet-header items-center">
        <SkillBadgeIcon family={skill.family} size={20} className="!w-12 !h-12 !rounded-2xl" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-semibold tracking-tight truncate">{skill.name}</h2>
          <p className="text-[12px] dx-muted">{TIER_NAMES[skill.tier]} · {FAMILY_LABELS[skill.family]} · {skill.steps.length} steps</p>
        </div>
        <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
      </div>

      <div className="dx-sheet-body space-y-5">
        <p className="text-[13px] leading-relaxed">{skill.why}</p>

        <div className="grid grid-cols-3 gap-2">
          <div className="dx-inset p-3">
            <div className="text-[11px] dx-muted">Time to master</div>
            <div className="mt-1 text-[14px] font-semibold">{status === 'mastered' ? 'Done' : formatWeeks(weeksFromHere(skill, progress))}</div>
          </div>
          <div className="dx-inset p-3">
            <div className="text-[11px] dx-muted">Frequency</div>
            <div className="mt-1 text-[14px] font-semibold">{skill.daysPerWeek}× / week</div>
          </div>
          <div className="dx-inset p-3">
            <div className="text-[11px] dx-muted">Sessions</div>
            <div className="mt-1 text-[14px] font-semibold tabular">{p?.sessions ?? 0}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {skill.muscles.map(m => <span key={m} className="dx-tag">{m}</span>)}
          {skill.equipment.map(e => <span key={e} className="dx-tag"><Dumbbell size={10} /> {e}</span>)}
        </div>

        {missing.length > 0 && (
          <div className="dx-inset p-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><Lock size={14} /> Unlock this skill first</div>
            <ul className="mt-2 space-y-1.5">
              {missing.map(m => (
                <li key={m.skill.id}>
                  <button onClick={() => onOpen(m.skill.id)} className="w-full flex items-center gap-2 text-left text-[12px]">
                    <SkillBadgeIcon family={m.skill.family} size={13} className="!w-6 !h-6 !rounded-md" />
                    <span className="flex-1">
                      <strong>{m.skill.name}</strong>
                      <span className="dx-muted"> ({m.step ? `reach “${m.step.name}”` : 'master it'})</span>
                    </span>
                    <ChevronRight size={14} className="dx-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rx && status !== 'locked' && (
          <div className="rounded-2xl p-3.5" style={{ background: 'var(--dx-accent-soft)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider dx-accent">Your next session</div>
            <div className="mt-1 text-[15px] font-semibold">{rx.step.name}: {dose(rx.step, rx.value, rx.sets)} {rx.step.unit === 'reps' ? 'reps' : ''}</div>
            <div className="mt-0.5 text-[12px]">Rest {rx.restSec}s between sets. {rx.note}</div>
          </div>
        )}

        <div>
          <div className="dx-eyebrow mb-2">Progression ladder</div>
          <ol className="space-y-2">
            {skill.steps.map((s, i) => {
              const done = i < current;
              const isCurrent = i === current && status !== 'mastered';
              return (
                <li key={s.id} className="dx-inset p-3" style={isCurrent ? { outline: '2px solid var(--dx-accent)', outlineOffset: -2 } : undefined}>
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 flex-none rounded-full flex items-center justify-center text-[12px] font-semibold"
                      style={done ? { background: 'var(--dx-success)', color: '#fff' } : isCurrent ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' } : { background: 'var(--dx-card)', color: 'var(--dx-muted)' }}
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-semibold ${!done && !isCurrent ? 'dx-muted' : ''}`}>{s.name}</div>
                      <div className="text-[11px] dx-muted">Pass: {dose(s)} {unitLabel(s)} · {s.weeks[0]}–{s.weeks[1]} wk</div>
                    </div>
                  </div>
                  {isCurrent && (
                    <div className="mt-2.5 pl-10 space-y-1.5">
                      {s.cues.map(c => (
                        <div key={c} className="flex gap-2 text-[12px] leading-snug"><Check size={13} className="mt-0.5 flex-none dx-accent" /> {c}</div>
                      ))}
                      <div className="text-[11px] dx-muted">
                        Hit every set at target in {PASSES_TO_ADVANCE} sessions ({p?.passes ?? 0}/{PASSES_TO_ADVANCE} so far). Best set: {p?.best ?? 0}{s.unit === 'sec' ? 's' : ''}.
                      </div>
                      <a href={techniqueUrl(skill, s)} target="_blank" rel="noopener noreferrer" className="dx-link !text-[12px]">
                        <Youtube size={13} /> Watch technique
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <div className="dx-eyebrow mb-2">Common mistakes</div>
          <ul className="space-y-1.5">
            {skill.mistakes.map(m => <li key={m} className="flex gap-2 text-[12px] leading-snug"><X size={13} className="mt-0.5 flex-none" style={{ color: 'var(--dx-warning)' }} /> {m}</li>)}
          </ul>
        </div>

        <div>
          <div className="dx-eyebrow mb-2">Coach tips</div>
          <ul className="space-y-1.5">
            {skill.tips.map(t => <li key={t} className="flex gap-2 text-[12px] leading-snug"><Sparkles size={13} className="mt-0.5 flex-none dx-accent" /> {t}</li>)}
            <li className="flex gap-2 text-[12px] leading-snug"><Sparkles size={13} className="mt-0.5 flex-none dx-accent" /> Stop a set 1–2 reps (or a few seconds) before your form breaks. Pain in joints means stop and step back.</li>
          </ul>
        </div>

        {(current > 0 || status === 'mastered') && (
          <button onClick={onStepBack} className="dx-link !text-[12px]"><RotateCcw size={13} /> Too hard? Go back one step</button>
        )}
      </div>

      <div className="dx-sheet-footer flex gap-2">
        {canTrain ? (
          <>
            <button onClick={() => onLog(false)} className="dx-btn flex-1"><Dumbbell size={16} /> Log practice</button>
            <button onClick={() => onLog(true)} className="dx-btn-secondary" title="Already able to do this step? Test out.">
              <TrendingUp size={15} /> Test out
            </button>
          </>
        ) : status === 'mastered' ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--dx-success)' }}>
            <Trophy size={16} /> Skill mastered
          </div>
        ) : (
          <div className="flex-1 text-[12px] dx-muted self-center">Finish the requirements above to unlock this skill.</div>
        )}
        {status !== 'mastered' && (
          <button
            onClick={onToggle}
            disabled={!isActive && (status === 'locked' || tutor.activeSkills.length >= MAX_ACTIVE_SKILLS)}
            className="dx-icon-btn"
            aria-label={isActive ? 'Remove from my path' : 'Add to my path'}
            title={isActive ? 'Remove from my path' : 'Add to my path'}
          >
            {isActive ? <Minus size={16} /> : <Plus size={16} />}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function LogSheet({ skill, progress, isTest, onClose, onSubmit, onStepBack }: {
  skill: CalisthenicsSkill; progress: ProgressMap; isTest: boolean; onClose: () => void; onSubmit: (values: number[]) => LogResult; onStepBack: () => void;
}) {
  // Freeze the prescription so the result screen survives the step changing underneath it.
  const [rx] = useState(() => prescribe(skill, progress));
  const step = rx?.step;
  const [values, setValues] = useState<number[]>(() => (isTest || !rx ? [rx?.step.target ?? 0] : Array.from({ length: rx.sets }, () => rx.value)));
  const [result, setResult] = useState<LogResult | null>(null);

  if (!rx || !step) return null;

  const setValue = (i: number, v: number) => setValues(vs => vs.map((x, j) => (j === i ? Math.max(0, Math.min(999, v)) : x)));
  const inc = step.unit === 'sec' ? 5 : 1;

  const outcomeTone: Record<LogResult['outcome'], { icon: ReactNode; title: string }> = {
    mastered: { icon: <Trophy size={28} />, title: 'Skill mastered!' },
    advanced: { icon: <TrendingUp size={28} />, title: 'Level up!' },
    passed: { icon: <Check size={28} />, title: 'Target hit' },
    improved: { icon: <Sparkles size={28} />, title: 'New personal best' },
    held: { icon: <Dumbbell size={28} />, title: 'Session logged' },
    regress: { icon: <RotateCcw size={28} />, title: 'Coach suggestion' },
  };

  return (
    <Sheet label={`Log ${skill.name}`} onClose={onClose}>
      <div className="dx-sheet-header items-center">
        <SkillBadgeIcon family={skill.family} size={18} className="!w-10 !h-10 !rounded-xl" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight truncate">{isTest ? 'Test out' : 'Log practice'} · {step.name}</h2>
          <p className="text-[12px] dx-muted">Target: {dose(step)} {unitLabel(step)}</p>
        </div>
        <button onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
      </div>

      {result ? (
        <div className="dx-sheet-body text-center py-6 space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ background: result.outcome === 'regress' ? 'var(--dx-card-2)' : 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}>
            {outcomeTone[result.outcome].icon}
          </div>
          <div className="text-[18px] font-semibold">{outcomeTone[result.outcome].title}</div>
          <p className="text-[13px] dx-muted leading-relaxed max-w-sm mx-auto">{result.message}</p>
          <div className="flex gap-2 justify-center pt-2">
            {result.outcome === 'regress' && (
              <button onClick={() => { onStepBack(); onClose(); }} className="dx-btn-secondary"><RotateCcw size={15} /> Step back</button>
            )}
            <button onClick={onClose} className="dx-btn">Done</button>
          </div>
        </div>
      ) : (
        <>
          <div className="dx-sheet-body space-y-3">
            <p className="text-[12px] dx-muted leading-relaxed">
              {isTest
                ? `Already able to do this? Enter your best clean set. Reaching ${step.target}${step.unit === 'sec' ? 's' : ' reps'}${step.perSide ? ' per side' : ''} skips you to the next step.`
                : `Enter the ${unitLabel(step)} you achieved on each set${step.perSide ? ' (weaker side)' : ''}. Only count reps with good form.`}
            </p>
            {values.map((v, i) => (
              <div key={i} className="dx-inset p-2.5 flex items-center gap-3">
                <span className="w-14 text-[12px] font-semibold dx-muted">{isTest ? 'Best' : `Set ${i + 1}`}</span>
                <button onClick={() => setValue(i, v - inc)} className="dx-icon-btn dx-icon-btn--sm" aria-label="Decrease"><Minus size={15} /></button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  value={v}
                  onChange={e => setValue(i, Number(e.target.value))}
                  className="dx-input flex-1 text-center !h-10 tabular"
                  aria-label={isTest ? 'Best set' : `Set ${i + 1}`}
                />
                <button onClick={() => setValue(i, v + inc)} className="dx-icon-btn dx-icon-btn--sm" aria-label="Increase"><Plus size={15} /></button>
                <span className="w-8 text-[11px] dx-muted">{step.unit === 'sec' ? 'sec' : 'reps'}</span>
              </div>
            ))}
            {!isTest && (
              <div className="flex gap-2">
                <button onClick={() => setValues(vs => [...vs, vs[vs.length - 1] ?? rx.value])} className="dx-btn-secondary h-9 text-[12px] flex-1"><Plus size={13} /> Add set</button>
                {values.length > 1 && (
                  <button onClick={() => setValues(vs => vs.slice(0, -1))} className="dx-btn-secondary h-9 text-[12px] flex-1"><Minus size={13} /> Remove set</button>
                )}
              </div>
            )}
          </div>
          <div className="dx-sheet-footer">
            <button onClick={() => setResult(onSubmit(values))} className="dx-btn w-full"><Check size={16} /> Save session</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ─── Assessment ───────────────────────────────────────────── */

function AssessmentFlow({ initial, initialDays, canCancel, onCancel, onDone }: {
  initial?: Assessment; initialDays?: number; canCancel: boolean; onCancel: () => void; onDone: (a: Assessment, days: number) => void;
}) {
  const [stage, setStage] = useState<'intro' | 'test' | 'result'>(initial ? 'test' : 'intro');
  const [answers, setAnswers] = useState<Assessment>(initial ?? { ...EMPTY_ASSESSMENT });
  const [days, setDays] = useState(initialDays ?? 3);
  const level = levelFromAssessment(answers);
  const preview = useMemo(() => {
    const placed = placeAllSkills(answers, level);
    return { placed, picks: recommendSkills(level, placed) };
  }, [answers, level]);

  const set = (metric: keyof Assessment, v: number) => setAnswers(a => ({ ...a, [metric]: Math.max(0, Math.min(999, Math.round(v) || 0)) }));

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope max-w-2xl mx-auto pt-1 sm:pt-4 space-y-4 pb-10">
      <motion.header variants={item} className="flex items-center gap-3">
        <div className="flex-1">
          <div className="dx-eyebrow">Calisthenics coach</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">
            {stage === 'intro' ? 'Meet your coach' : stage === 'test' ? 'Level assessment' : 'Your plan'}
          </h1>
        </div>
        {canCancel && <button onClick={onCancel} className="dx-icon-btn dx-icon-btn--sm" aria-label="Cancel"><X size={17} /></button>}
      </motion.header>

      {stage === 'intro' && (
        <>
          <motion.section variants={item} className="dx-hero p-5 sm:p-6">
            <span className="dx-hero-icon"><GraduationCap size={22} /></span>
            <h2 className="mt-3 text-[20px] font-semibold leading-tight">From your first push-up to the full planche.</h2>
            <p className="mt-2 text-[13px] opacity-80 leading-relaxed">
              {SKILLS.length} skills, {SKILLS.reduce((n, s) => n + s.steps.length, 0)} progression steps. Your coach tells you exactly what to do each session,
              how many sets and reps, when you’ve earned the next step, and how long each skill will take.
            </p>
            <button onClick={() => setStage('test')} className="dx-hero-btn w-full mt-4">Take the 2-minute assessment <ArrowRight size={16} /></button>
          </motion.section>
          <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { icon: <Target size={16} />, title: 'Placed at your level', body: 'Skip what you already own. Start where you are.' },
              { icon: <TrendingUp size={16} />, title: 'Auto progression', body: `Hit the target in ${PASSES_TO_ADVANCE} sessions and the next step unlocks.` },
              { icon: <Clock size={16} />, title: 'Real timelines', body: 'Honest estimates for every step and skill.' },
            ].map(f => (
              <div key={f.title} className="dx-card p-4">
                <span className="dx-accent">{f.icon}</span>
                <div className="mt-2 text-[13px] font-semibold">{f.title}</div>
                <div className="mt-1 text-[12px] dx-muted leading-snug">{f.body}</div>
              </div>
            ))}
          </motion.div>
          <motion.button variants={item} onClick={() => onDone({ ...EMPTY_ASSESSMENT }, 3)} className="dx-btn-secondary w-full">
            I am a complete beginner, start from zero
          </motion.button>
        </>
      )}

      {stage === 'test' && (
        <>
          <motion.p variants={item} className="text-[13px] dx-muted leading-relaxed">
            Enter your best strict effort for each. Warm up first, rest 2–3 minutes between tests, and put 0 if you can’t do it yet; that is perfectly fine.
          </motion.p>
          {ASSESSMENT_QUESTIONS.map(q => (
            <motion.div key={q.metric} variants={item} className="dx-card p-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold">{q.label}</div>
                <div className="text-[11px] dx-muted leading-snug">{q.hint}</div>
              </div>
              <button onClick={() => set(q.metric, answers[q.metric] - (q.unit === 'sec' ? 5 : 1))} className="dx-icon-btn dx-icon-btn--sm" aria-label={`Decrease ${q.label}`}><Minus size={15} /></button>
              <div className="w-16">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  value={answers[q.metric]}
                  onChange={e => set(q.metric, Number(e.target.value))}
                  className="dx-input w-full text-center !h-10 tabular"
                  aria-label={q.label}
                />
                <div className="text-center text-[10px] dx-muted mt-0.5">{q.unit}</div>
              </div>
              <button onClick={() => set(q.metric, answers[q.metric] + (q.unit === 'sec' ? 5 : 1))} className="dx-icon-btn dx-icon-btn--sm" aria-label={`Increase ${q.label}`}><Plus size={15} /></button>
            </motion.div>
          ))}
          <motion.div variants={item} className="dx-card p-4">
            <div className="text-[14px] font-semibold">How many days a week can you train?</div>
            <div className="dx-segment mt-2" role="tablist">
              {[2, 3, 4, 5, 6].map(d => <button key={d} role="tab" aria-selected={days === d} onClick={() => setDays(d)}>{d}</button>)}
            </div>
            <p className="mt-2 text-[11px] dx-muted">3–4 days is ideal for most people. Skills are spaced so each gets enough recovery.</p>
          </motion.div>
          <motion.button variants={item} onClick={() => setStage('result')} className="dx-btn w-full">See my level <ArrowRight size={16} /></motion.button>
        </>
      )}

      {stage === 'result' && (
        <>
          <motion.section variants={item} className="dx-hero p-5 sm:p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">Your starting level</div>
            <div className="mt-1 text-[28px] font-semibold leading-tight">Level {level} · {TIER_NAMES[level]}</div>
            <p className="mt-2 text-[13px] opacity-80 leading-relaxed">{LEVEL_BLURB[level]}</p>
            <div className="mt-3 text-[12px] opacity-80">
              {Object.values(preview.placed).filter(p => p.mastered).length} skills already credited ·{' '}
              {Object.values(preview.placed).filter(p => !p.mastered && p.step > 0).length} started part-way
            </div>
          </motion.section>
          <motion.div variants={item} className="dx-card p-4">
            <div className="text-[14px] font-semibold">Your first {preview.picks.length} skills</div>
            <ul className="mt-2 dx-list">
              {preview.picks.map(id => {
                const s = SKILL_BY_ID[id];
                const step = s.steps[stepOf(preview.placed, id)];
                return (
                  <li key={id} className="py-2.5 flex items-center gap-3">
                    <SkillBadgeIcon family={s.family} size={15} className="!w-8 !h-8 !rounded-lg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold">{s.name}</div>
                      <div className="text-[11px] dx-muted">Start: {step?.name} · {formatWeeks(remainingWeeks(s, preview.placed))} to master</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] dx-muted">Training {days} days a week. You can change skills and days any time.</p>
          </motion.div>
          <motion.div variants={item} className="flex gap-2">
            <button onClick={() => setStage('test')} className="dx-btn-secondary">Edit answers</button>
            <button onClick={() => onDone(answers, days)} className="dx-btn flex-1"><Check size={16} /> Start training</button>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
