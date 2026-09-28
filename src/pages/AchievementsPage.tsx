import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, Check, Flame, Trophy, Dumbbell, Footprints } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { BADGES, evaluateBadges } from '@/lib/badges';
import { badgeContextFromStats, effectiveStreak } from '@/lib/stats';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export function AchievementsPage() {
  const { stats } = useAuthStore();

  if (!stats) return null;

  const context = badgeContextFromStats(stats);
  // Persisted badges are never lost; live evaluation covers anything earned before persistence existed.
  const earnedIds = new Set([...(stats.badges || []), ...evaluateBadges(context)]);
  const earnedCount = BADGES.filter(b => earnedIds.has(b.id)).length;
  const totalCount = BADGES.length;
  const progressPct = (earnedCount / totalCount) * 100;
  const ordered = [...BADGES.filter(b => earnedIds.has(b.id)), ...BADGES.filter(b => !earnedIds.has(b.id))];

  const summary = [
    { icon: Dumbbell, label: 'Workouts', value: stats.totalWorkouts || 0 },
    { icon: Footprints, label: 'Cardio', value: stats.totalCardioSessions || 0 },
    { icon: Flame, label: 'Streak', value: `${effectiveStreak(stats)}d` },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="dx pro-scope max-w-4xl mx-auto pt-1 sm:pt-4 space-y-4">
      <motion.header variants={item} className="flex items-center gap-3">
        <Link to="/" className="dx-icon-btn dx-icon-btn--sm" aria-label="Back"><ArrowLeft size={18} /></Link>
        <div>
          <div className="dx-eyebrow">Trophy room</div>
          <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-tight leading-tight">Achievements</h1>
        </div>
      </motion.header>

      <motion.section variants={item} className="dx-card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="dx-badge-icon !w-11 !h-11 !rounded-2xl"><Trophy size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold">{earnedCount} of {totalCount} unlocked</div>
            <div className="text-[12px] dx-muted">Workouts and cardio sessions both count toward your badges.</div>
          </div>
          <span className="text-[13px] font-semibold tabular">{Math.round(progressPct)}%</span>
        </div>
        <div className="dx-progress mt-3.5">
          <motion.span initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {summary.map(({ icon: Icon, label, value }) => (
            <div key={label} className="dx-inset p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium dx-muted"><Icon size={13} /> {label}</div>
              <div className="mt-1 text-[18px] font-semibold tabular leading-none">{value}</div>
            </div>
          ))}
        </div>
      </motion.section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {ordered.map(badge => {
          const isEarned = earnedIds.has(badge.id);
          const progress = !isEarned ? badge.progress?.(context) : undefined;
          const pct = progress ? Math.round((progress.value / progress.target) * 100) : 0;

          return (
            <motion.div
              key={badge.id}
              variants={item}
              className="dx-card p-4 flex flex-col relative"
              style={isEarned ? { borderColor: 'var(--dx-accent)', background: 'linear-gradient(180deg, var(--dx-accent-soft), var(--dx-card) 70%)' } : undefined}
            >
              <span
                className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                style={isEarned ? { background: 'var(--dx-success)', color: '#fff' } : { background: 'var(--dx-card-2)', color: 'var(--dx-muted)' }}
                aria-label={isEarned ? 'Unlocked' : 'Locked'}
              >
                {isEarned ? <Check size={13} strokeWidth={3} /> : <Lock size={11} />}
              </span>
              <div className={`text-[34px] leading-none ${isEarned ? '' : 'grayscale opacity-50'}`}>{badge.icon}</div>
              <div className={`mt-3 text-[14px] font-semibold leading-tight ${isEarned ? '' : 'dx-muted'}`}>{badge.name}</div>
              <div className="mt-1 text-[12px] dx-muted leading-snug flex-1">{badge.desc}</div>
              {progress && (
                <div className="mt-3">
                  <div className="dx-progress !h-1.5"><span style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1 text-[11px] dx-muted tabular">
                    {Number.isInteger(progress.value) ? progress.value : progress.value.toFixed(1)} / {progress.target.toLocaleString()}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
