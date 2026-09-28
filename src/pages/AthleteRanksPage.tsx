import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trophy,
  Dumbbell,
  Footprints,
  Flame,
  Shield,
  ShieldCheck,
  Zap,
  Lock,
  Check,
  Crown,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info,
  Target,
  Award,
  Sprout,
  Gem,
  Bike,
  CalendarCheck,
  Scale,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import {
  ADHERENCE_WEEKS,
  DIVISIONS,
  RANK_TIERS,
  SCORE_WEIGHTS,
  TARGET_DAYS_PER_WEEK,
  computeAthleteRank,
  pillarBenchmarks,
  type MetricScore,
  type Pillar,
  type RankTier,
} from '@/lib/rank';
import { BADGES } from '@/lib/badges';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

interface TierStyle {
  icon: typeof Shield;
  color: string;
  bgLight: string;
  tagline: string;
  description: string;
}

const TIER_STYLE: Record<RankTier, TierStyle> = {
  Beginner: {
    icon: Shield, color: '#777b86', bgLight: 'rgba(119, 123, 134, 0.12)',
    tagline: 'Foundation & habit building',
    description: 'Learning the movements and building the habit. Every logged session builds the base the other tiers stand on.',
  },
  Novice: {
    icon: Zap, color: '#0891b2', bgLight: 'rgba(8, 145, 178, 0.12)',
    tagline: 'First real strength & aerobic base',
    description: 'Training is a routine. Lifts are near bodyweight, the first strict pull-ups are in, or a 5K no longer feels like a race.',
  },
  Developing: {
    icon: Sprout, color: '#16a34a', bgLight: 'rgba(22, 163, 74, 0.12)',
    tagline: 'Steady progressive overload',
    description: 'Clear progress past the beginner gains: bodyweight bench territory, double-digit pull-ups, or a sub-30 minute 5K.',
  },
  Intermediate: {
    icon: Flame, color: '#b45309', bgLight: 'rgba(180, 83, 9, 0.12)',
    tagline: 'Solid athletic competence',
    description: 'Standards most dedicated recreational athletes reach after a few years of structured training.',
  },
  Advanced: {
    icon: ShieldCheck, color: '#c24e2c', bgLight: 'rgba(194, 78, 44, 0.14)',
    tagline: 'High-performance capability',
    description: 'Well above typical gym-goers or club runners. Usually needs a well-developed second discipline too.',
  },
  Expert: {
    icon: Gem, color: '#7c3aed', bgLight: 'rgba(124, 58, 237, 0.13)',
    tagline: 'Competitive-level athlete',
    description: 'Numbers you would expect at local competitions, backed by strong all-round fitness and months of consistent training.',
  },
  Elite: {
    icon: Crown, color: '#eab308', bgLight: 'rgba(234, 179, 8, 0.16)',
    tagline: 'Pinnacle mastery · top rank',
    description: 'Exceptional in your main discipline, genuinely capable in the other, advanced skills and near-perfect adherence.',
  },
};

const PILLAR_META: Record<Pillar, { label: string; icon: typeof Shield }> = {
  strength: { label: 'Strength', icon: Dumbbell },
  endurance: { label: 'Endurance', icon: Footprints },
  skill: { label: 'Skill', icon: Sparkles },
  consistency: { label: 'Consistency', icon: Flame },
};

function Bar({ value, max = 1000, color }: { value: number; max?: number; color?: string }) {
  return (
    <div className="dx-progress !h-1 mt-1.5">
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

function MetricList({ metrics, empty }: { metrics: MetricScore[]; empty: string }) {
  if (!metrics.length) return <p className="text-[11.5px] dx-muted leading-relaxed">{empty}</p>;
  return (
    <ul className="space-y-2">
      {metrics.map(m => (
        <li key={m.key}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-medium text-[var(--dx-text)] truncate">{m.label}</span>
            <span className="tabular font-semibold text-[var(--dx-text)] shrink-0">{m.score}</span>
          </div>
          <div className="text-[11px] dx-muted">{m.display}{m.date ? ` · ${m.date}` : ''}</div>
          <Bar value={m.score} />
        </li>
      ))}
    </ul>
  );
}

function PathScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="dx-inset p-2.5">
      <div className="text-[10.5px] font-mono uppercase tracking-wider dx-muted">{label}</div>
      <div className="text-[15px] font-semibold tabular leading-tight">{value}<span className="text-[10px] font-normal dx-muted">/1000</span></div>
      <Bar value={value} />
    </div>
  );
}

function BreakdownCard({ icon, title, score, children }: { icon: ReactNode; title: string; score: number; children: ReactNode }) {
  return (
    <div className="dx-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--dx-text)]">{icon} {title}</div>
        <span className="text-[14px] font-bold tabular">{score}<span className="text-[10px] font-normal dx-muted">/1000</span></span>
      </div>
      {children}
    </div>
  );
}

export function AthleteRanksPage() {
  const navigate = useNavigate();
  const { stats, profile } = useAuthStore();
  const gender = profile?.gender;

  const rank = useMemo(() => computeAthleteRank(stats, profile?.weight, { gender }), [stats, profile?.weight, gender]);
  const benchmarks = useMemo(
    () => Object.fromEntries(RANK_TIERS.map(t => [t.name, pillarBenchmarks(t.min, gender)])),
    [gender],
  );

  const currentTierIndex = RANK_TIERS.findIndex(t => t.name === rank.tier);
  const [openTiers, setOpenTiers] = useState<Set<RankTier>>(
    () => new Set([rank.tier, RANK_TIERS[currentTierIndex + 1]?.name].filter(Boolean) as RankTier[]),
  );
  const toggleTier = (tier: RankTier) => setOpenTiers(prev => {
    const next = new Set(prev);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    return next;
  });

  const isTopRank = !rank.nextStep;
  const style = TIER_STYLE[rank.tier];
  const stepRange = rank.nextStep ? rank.nextStep.min - rank.currentStep.min : 1;
  const progressToNext = rank.nextStep
    ? Math.min(100, Math.max(0, Math.round(((rank.score - rank.currentStep.min) / stepRange) * 100)))
    : 100;
  const pointsNeeded = rank.nextStep ? Math.max(0, rank.nextStep.min - rank.score) : 0;

  const secondary: Pillar = rank.primary === 'endurance' ? 'strength' : 'endurance';
  const primary: Pillar = rank.primary === 'endurance' ? 'endurance' : 'strength';
  const pillarRows: { key: Pillar; value: number; role: string }[] = [
    { key: primary, value: primary === 'strength' ? rank.strengthScore : rank.enduranceScore, role: `Primary · ${SCORE_WEIGHTS.primary * 100}%` },
    { key: secondary, value: secondary === 'strength' ? rank.strengthScore : rank.enduranceScore, role: `Secondary · ${SCORE_WEIGHTS.secondary * 100}%` },
    { key: 'skill', value: rank.skillScore, role: `${SCORE_WEIGHTS.skill * 100}%` },
    { key: 'consistency', value: rank.consistencyScore, role: `${SCORE_WEIGHTS.consistency * 100}%` },
  ];

  const b = rank.breakdown;
  const earnedBadges = new Set(stats?.badges || []);
  const earnedCount = BADGES.filter(badge => earnedBadges.has(badge.id)).length;
  const maxWeek = Math.max(TARGET_DAYS_PER_WEEK, ...b.weekCounts);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="dx pro-scope max-w-4xl mx-auto pt-1 sm:pt-4 pb-12 space-y-4"
    >
      {/* ─── Header ─── */}
      <motion.header variants={item} className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="dx-icon-btn dx-icon-btn--sm" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="dx-eyebrow">Progression Ladder</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">Athlete Ranks & Tiers</h1>
        </div>
      </motion.header>

      {/* ─── Hero: current standing ─── */}
      <motion.section variants={item} className="dx-card p-4 sm:p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span
              className="dx-badge-icon !w-13 !h-13 !rounded-2xl shrink-0 shadow-sm"
              style={{ background: style.bgLight, color: style.color, border: `1px solid ${style.color}55` }}
            >
              <style.icon size={26} />
            </span>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider dx-muted">Current Rank</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <h2 className="text-[20px] sm:text-[23px] font-bold tracking-tight text-[var(--dx-text)]">{rank.label}</h2>
                {isTopRank && (
                  <span className="dx-pill !bg-amber-500/20 !text-amber-500 text-[10px] font-bold uppercase tracking-wider">★ Top Rank</span>
                )}
              </div>
              <div className="text-[12px] dx-muted mt-0.5">{style.tagline}</div>
            </div>
          </div>

          <div className="flex items-baseline sm:flex-col sm:items-end gap-2 sm:gap-0.5">
            <div className="text-[11px] font-mono uppercase tracking-wider dx-muted">Rank Score</div>
            <div className="text-[26px] sm:text-[30px] font-bold tabular leading-none text-[var(--dx-text)]">
              {rank.score}
              <span className="text-[13px] font-normal dx-muted"> / 1000</span>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-[var(--dx-line)]">
          <div className="flex items-center justify-between text-[12px] mb-2 gap-2">
            <span className="dx-muted">
              {rank.nextStep ? (
                <>Next: <strong className="text-[var(--dx-text)] font-semibold">{rank.nextStep.label}</strong> ({rank.nextStep.min} pts)</>
              ) : (
                <span className="text-amber-500 font-semibold flex items-center gap-1"><Sparkles size={13} /> Maximum rank achieved</span>
              )}
            </span>
            <span className="tabular font-semibold text-[var(--dx-text)] shrink-0">
              {rank.nextStep ? `${pointsNeeded} pts to go` : '100%'}
            </span>
          </div>
          <div className="dx-progress !h-2.5">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${progressToNext}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{ background: style.color }}
            />
          </div>
          {rank.nextTier && rank.nextStep?.tier !== rank.nextTier.name && (
            <div className="mt-1.5 text-[11px] dx-muted">
              Next tier: <strong className="text-[var(--dx-text)]">{rank.nextTier.name}</strong> at {rank.nextTier.min} pts
            </div>
          )}
        </div>

        {/* Four pillars */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {pillarRows.map(row => {
            const Icon = PILLAR_META[row.key].icon;
            return (
              <div key={row.key} className="dx-inset p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium dx-muted">
                  <Icon size={13} /> {PILLAR_META[row.key].label}
                </div>
                <div className="mt-1 text-[16px] sm:text-[18px] font-semibold tabular leading-none">
                  {row.value}<span className="text-[10px] font-normal dx-muted">/1000</span>
                </div>
                <Bar value={row.value} />
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono dx-muted">
                  <span>{row.role}</span>
                  <span className="text-[var(--dx-text)] font-semibold">+{rank.contributions[row.key]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {!rank.bodyweightKnown && (
          <Link
            to="/settings"
            className="mt-3 p-2.5 rounded-xl bg-[var(--dx-card-2)] flex items-center gap-2 text-[11.5px] dx-muted hover:text-[var(--dx-text)] transition-colors"
          >
            <Scale size={14} className="dx-accent shrink-0" />
            <span className="flex-1">Strength is judged relative to bodyweight. Add your weight in Settings for accurate standards (using {rank.bodyweightKg} kg).</span>
            <ChevronRight size={13} />
          </Link>
        )}
      </motion.section>

      {/* ─── Your performance breakdown ─── */}
      <motion.section variants={item} className="space-y-3">
        <div className="px-1">
          <h3 className="text-[16px] font-semibold tracking-tight text-[var(--dx-text)]">What your score is made of</h3>
          <p className="text-[12px] dx-muted">Your best recent performances. Results older than 6 months slowly fade, so the rank reflects what you can do now.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BreakdownCard icon={<Dumbbell size={15} className="text-orange-500" />} title="Strength" score={rank.strengthScore}>
            <div className="grid grid-cols-2 gap-2">
              <PathScore label="Gym lifts" value={b.gym} />
              <PathScore label="Bodyweight" value={b.bodyweight} />
            </div>
            <MetricList
              metrics={[...b.lifts, ...b.bodyweightMoves]}
              empty="Log barbell squat, bench, deadlift, overhead press or rows (1-12 reps), or pull-ups, dips and push-ups."
            />
            <p className="text-[10.5px] dx-muted">Your stronger path counts fully, the other adds 20%. Lifts use estimated 1RM ÷ bodyweight.</p>
          </BreakdownCard>

          <BreakdownCard icon={<Footprints size={15} className="text-cyan-500" />} title="Endurance" score={rank.enduranceScore}>
            <div className="grid grid-cols-3 gap-2">
              <PathScore label="Run" value={b.run} />
              <PathScore label="Ride" value={b.cycle} />
              <PathScore label="Walk" value={b.walk} />
            </div>
            <MetricList metrics={b.endurance} empty="Track a run, ride or walk. Runs of 1.6 km+ set your 5K-equivalent pace, rides of 10 km+ your speed." />
            <p className="text-[10.5px] dx-muted">Each activity has its own standards; walking alone tops out at 400. Best activity + 15% of the next.</p>
          </BreakdownCard>

          <BreakdownCard icon={<Sparkles size={15} className="text-amber-500" />} title="Skill" score={rank.skillScore}>
            <MetricList
              metrics={b.skills.slice(0, 5)}
              empty="Log skills like L-sit, handstand, muscle-up or front lever holds, or progress them in the Skills tutor."
            />
            <p className="text-[10.5px] dx-muted">
              Hardest skill counts 70%, your next three 30%. Tuck/straddle variations count as partial progress.{' '}
              <Link to="/skills" className="dx-accent font-semibold hover:underline">Open Skills →</Link>
            </p>
          </BreakdownCard>

          <BreakdownCard icon={<CalendarCheck size={15} className="text-emerald-500" />} title="Consistency" score={rank.consistencyScore}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="dx-inset p-2">
                <div className="text-[15px] font-semibold tabular">{Math.round(b.adherence * 100)}%</div>
                <div className="text-[10px] dx-muted">Adherence</div>
              </div>
              <div className="dx-inset p-2">
                <div className="text-[15px] font-semibold tabular">{b.weekStreak}<span className="text-[10px] dx-muted">/{ADHERENCE_WEEKS}</span></div>
                <div className="text-[10px] dx-muted">Week streak</div>
              </div>
              <div className="dx-inset p-2">
                <div className="text-[15px] font-semibold tabular">{b.trainingDays}</div>
                <div className="text-[10px] dx-muted">Training days</div>
              </div>
            </div>
            <div className="flex items-end gap-1 h-12" aria-label="Qualifying training days per week, last 12 weeks">
              {[...b.weekCounts].reverse().map((count, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${count} day${count === 1 ? '' : 's'}`}>
                  <div
                    className="rounded-sm"
                    style={{
                      height: `${Math.max(6, (count / maxWeek) * 100)}%`,
                      background: count >= TARGET_DAYS_PER_WEEK ? 'var(--dx-success)' : count >= 2 ? 'var(--dx-accent)' : 'var(--dx-line)',
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-[10.5px] dx-muted">
              70% adherence ({TARGET_DAYS_PER_WEEK} qualifying days/week over {ADHERENCE_WEEKS} weeks, extra days don't count) + 30% weeks in a row with 2+ days.
              A day qualifies with 15+ minutes of training (or real work: 1.5 t volume / 2 km).
            </p>
          </BreakdownCard>
        </div>
      </motion.section>

      {/* ─── Ladder ─── */}
      <motion.section variants={item} className="space-y-3">
        <div className="flex items-center justify-between px-1 gap-2">
          <div>
            <h3 className="text-[16px] font-semibold tracking-tight text-[var(--dx-text)]">All Rank Tiers & Standards</h3>
            <p className="text-[12px] dx-muted">
              Each pillar uses the same 0-1000 scale. The standards show what one pillar needs for that level, and any path counts.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--dx-card-2)] text-[var(--dx-muted)] shrink-0">
            {RANK_TIERS.length} tiers · {RANK_TIERS.length * DIVISIONS.length} ranks
          </span>
        </div>

        <div className="space-y-3">
          {RANK_TIERS.map((t, idx) => {
            const tierStyle = TIER_STYLE[t.name];
            const TierIcon = tierStyle.icon;
            const max = (RANK_TIERS[idx + 1]?.min ?? 1001) - 1;
            const isCurrent = rank.tier === t.name;
            const isUnlocked = rank.score >= t.min;
            const isTop = idx === RANK_TIERS.length - 1;
            const open = openTiers.has(t.name);
            const bm = benchmarks[t.name];
            const size = (max + 1 - t.min) / DIVISIONS.length;

            return (
              <motion.div
                key={t.name}
                variants={item}
                className="dx-card p-4 sm:p-5 relative transition-all"
                style={{
                  border: isCurrent ? `1.5px solid ${tierStyle.color}` : isTop ? '1.5px solid rgba(234, 179, 8, 0.45)' : undefined,
                  background: isCurrent ? `linear-gradient(180deg, ${tierStyle.bgLight}, var(--dx-card) 90%)` : undefined,
                }}
              >
                <button type="button" onClick={() => toggleTier(t.name)} className="w-full text-left flex items-start justify-between gap-3" aria-expanded={open}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: isUnlocked ? tierStyle.bgLight : 'var(--dx-card-2)', color: isUnlocked ? tierStyle.color : 'var(--dx-muted)' }}
                    >
                      {isUnlocked ? <TierIcon size={20} /> : <Lock size={17} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[16px] font-bold tracking-tight text-[var(--dx-text)]">{t.name}</span>
                        {isTop && <span className="dx-pill !bg-amber-500/20 !text-amber-500 text-[10px] font-bold uppercase">👑 Top Rank</span>}
                        {isCurrent && <span className="dx-pill dx-pill--accent text-[10px] font-bold uppercase">You are here</span>}
                      </div>
                      <div className="text-[12px] font-medium text-[var(--dx-muted)] leading-tight mt-0.5">{tierStyle.tagline}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-start gap-2">
                    <div>
                      <div className="text-[14px] sm:text-[15px] font-bold font-mono tabular" style={{ color: tierStyle.color }}>{t.min} pts</div>
                      <div className="text-[10px] font-mono text-[var(--dx-muted)]">to {max}</div>
                    </div>
                    <ChevronDown size={16} className={`mt-1 dx-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Divisions */}
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {DIVISIONS.map((roman, i) => {
                    const min = t.min + Math.ceil(i * size);
                    const reached = rank.score >= min;
                    const here = isCurrent && rank.division === i + 1;
                    return (
                      <div
                        key={roman}
                        className="rounded-lg px-2 py-1.5 text-center text-[11px] font-mono"
                        style={{
                          background: here ? tierStyle.color : reached ? tierStyle.bgLight : 'var(--dx-card-2)',
                          color: here ? '#fff' : reached ? tierStyle.color : 'var(--dx-muted)',
                          fontWeight: here ? 700 : 500,
                        }}
                      >
                        {roman} · {min}
                      </div>
                    );
                  })}
                </div>

                {open && (
                  <>
                    <p className="mt-3 text-[12.5px] dx-muted leading-relaxed">{tierStyle.description}</p>
                    <div className="mt-3.5 pt-3 border-t border-[var(--dx-line)]">
                      <div className="text-[10.5px] font-mono uppercase tracking-wider text-[var(--dx-muted)] mb-2">
                        {t.min === 0 ? 'Getting started' : `Pillar standards at ${t.name} (reach them through any path)`}
                      </div>
                      {t.min === 0 ? (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                          {['Log your first workouts and cardio', 'Learn technique on the basic lifts & bodyweight moves', 'Set your bodyweight for fair strength standards', 'Train 2+ days a week to start a week streak'].map(line => (
                            <li key={line} className="flex items-center gap-2 text-[var(--dx-text)]">
                              <Check size={12} className="text-[var(--dx-success)] shrink-0" /> {line}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                          {[
                            { icon: Dumbbell, label: 'Gym', text: bm.gym },
                            { icon: Target, label: 'Bodyweight', text: bm.bodyweight },
                            { icon: Footprints, label: 'Run', text: bm.run },
                            { icon: Bike, label: 'Ride', text: bm.cycle },
                            { icon: Sparkles, label: 'Skill', text: bm.skill },
                            { icon: Flame, label: 'Consistency', text: bm.consistency },
                          ].map(row => (
                            <li key={row.label} className="flex items-start gap-2 text-[var(--dx-text)]">
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-px"
                                style={{ background: isUnlocked ? 'var(--dx-success-soft)' : 'var(--dx-card-2)', color: isUnlocked ? 'var(--dx-success)' : 'var(--dx-muted)' }}
                              >
                                <row.icon size={11} />
                              </span>
                              <span>
                                <span className="font-semibold">{row.label}:</span>{' '}
                                <span className={isUnlocked ? '' : 'dx-muted'}>{row.text}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {!isUnlocked && (
                  <div className="mt-3 pt-2 text-[11px] font-mono text-[var(--dx-muted)] flex items-center justify-between">
                    <span>Unlocks at {t.min} points</span>
                    <span className="font-semibold text-amber-500">+{t.min - rank.score} pts needed</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* ─── How it works ─── */}
      <motion.section variants={item} className="dx-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="dx-accent" size={18} />
          <h3 className="dx-section-title">How the rank works</h3>
        </div>

        <div className="p-3 rounded-xl bg-[var(--dx-card-2)] text-center font-mono text-[12px] sm:text-[13px] text-[var(--dx-text)]">
          Score = 60% Primary + 20% Secondary + 10% Skill + 10% Consistency
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="dx-inset p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--dx-text)]">
              <Dumbbell size={15} className="text-orange-500" /> Strength
            </div>
            <p className="mt-1 text-[11.5px] dx-muted leading-relaxed">
              Your main discipline when strength leads. Gym lifts and bodyweight strength are both first-class paths, judged relative to bodyweight.
            </p>
          </div>
          <div className="dx-inset p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--dx-text)]">
              <Footprints size={15} className="text-cyan-500" /> Endurance
            </div>
            <p className="mt-1 text-[11.5px] dx-muted leading-relaxed">
              Your main discipline when endurance leads. Running pace & distance, cycling speed & range and brisk walking each have their own standards.
            </p>
          </div>
          <div className="dx-inset p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--dx-text)]">
              <Zap size={15} className="text-amber-500" /> Hybrid
            </div>
            <p className="mt-1 text-[11.5px] dx-muted leading-relaxed">
              Shown when your secondary discipline is at least 300 and 60% of your primary, showing strength in both.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[var(--dx-card-2)] flex items-start gap-2.5">
          <Info size={15} className="dx-accent shrink-0 mt-0.5" />
          <div className="text-[11.5px] dx-muted leading-relaxed">
            <strong className="text-[var(--dx-text)] font-semibold">Rank measures current ability, not lifetime volume.</strong>{' '}
            Workout counts, total kilograms and total kilometres are achievements; they do not raise your rank on their own.
            A pure specialist tops out around Advanced/Expert; <strong>Elite</strong> needs excellence in your discipline plus a real second discipline, skills and months of consistent training.
          </div>
        </div>
      </motion.section>

      {/* ─── Lifetime achievements (separate from rank) ─── */}
      <motion.section variants={item} className="dx-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Award className="dx-accent" size={18} />
          <h3 className="dx-section-title flex-1">Lifetime achievements</h3>
          <span className="text-[11px] font-mono dx-muted">{earnedCount}/{BADGES.length} badges</span>
        </div>
        <p className="text-[12px] dx-muted">Experience you've built up. These earn badges, not rank points.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Sessions', value: ((stats?.totalWorkouts || 0) + (stats?.totalCardioSessions || 0)).toLocaleString() },
            { label: 'Volume lifted', value: `${Math.round(stats?.totalVolume || 0).toLocaleString()} kg` },
            { label: 'Distance', value: `${Math.round(stats?.totalDistanceKm || 0).toLocaleString()} km` },
            { label: 'Best day streak', value: `${stats?.longestStreak || 0} days` },
          ].map(row => (
            <div key={row.label} className="dx-inset p-3">
              <div className="text-[10.5px] font-mono uppercase tracking-wider dx-muted">{row.label}</div>
              <div className="mt-1 text-[15px] font-semibold tabular text-[var(--dx-text)]">{row.value}</div>
            </div>
          ))}
        </div>
        <Link
          to="/achievements"
          className="py-2.5 px-3 rounded-xl bg-[var(--dx-card-2)] hover:bg-[var(--dx-line)] transition-all flex items-center justify-between text-[12px] font-semibold text-[var(--dx-text)] group"
        >
          <span className="flex items-center gap-1.5"><Trophy size={14} className="dx-accent" /> View all badges</span>
          <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </motion.section>
    </motion.div>
  );
}

export default AthleteRanksPage;
