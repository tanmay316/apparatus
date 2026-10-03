import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock3, Flame, Heart, MessageSquare, Share2, TrendingUp, Dumbbell,
  MoreHorizontal, Check, Bookmark, Send, ChevronDown, ChevronUp, Sparkles, Calendar as CalendarIcon,
  Zap, Bike, Footprints, Trophy, Mountain, Gauge, Timer
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { addComment, getComments, hasLiked, toggleLike, deleteActivity } from '@/services/social';
import type { Activity, Comment } from '@/types';
import { calculateBodyweightReps, calculateShareVolume, getActiveMuscleScores, getActiveMusclesFromLogs, isWarmupOrCooldown, muscleFocus, type MuscleScore } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
import { AnatomyFigureSVG } from '@/components/ui/AnatomySvg';
import { AnimatedHeart } from '@/components/ui/AnimatedHeart';
import { getAvatarUrl } from '@/lib/avatar';
import { RouteMap } from '@/components/cardio/RouteMap';
import { CelebrationPodiumCard } from '@/components/community/CelebrationPodiumCard';
import { getAppShareUrl, shareContent } from '@/lib/share';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import { BRAND } from '@/lib/brand';

/** Defers heavy children (Leaflet maps) until the card scrolls near the viewport, then keeps them. */
function MountWhenNear({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return <div ref={ref} className={className}>{near ? children : null}</div>;
}

function timeAgo(seconds?: number): string {
  if (!seconds) return 'just now';
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatClock(totalSec?: number): string {
  const s = Math.max(0, Math.round(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface CardioPostHeroProps {
  details: Record<string, any>;
  activityType: string;
  createdAtSec?: number;
  theme: 'light' | 'dark';
}

/** Feed layout for a completed cardio session: title, map + primary stats, then every other KPI. */
function CardioPostHero({ details, activityType, createdAtSec, theme }: CardioPostHeroProps) {
  const [showMore, setShowMore] = useState(false);
  const kind = (['walk', 'run', 'cycle'].includes(details.activityType) ? details.activityType : activityType) as 'walk' | 'run' | 'cycle' | string;
  const isCycle = kind === 'cycle';
  const kindLabel = kind === 'run' ? 'Run' : isCycle ? 'Ride' : 'Walk';
  const KindIcon = kind === 'run' ? Zap : isCycle ? Bike : Footprints;

  const when = createdAtSec ? new Date(createdAtSec * 1000) : null;
  const hour = when ? when.getHours() : 12;
  const partOfDay = hour >= 5 && hour < 12 ? 'Morning' : hour >= 12 && hour < 17 ? 'Afternoon' : hour >= 17 && hour < 21 ? 'Evening' : 'Night';
  const title = (typeof details.title === 'string' && details.title.trim()) || `${partOfDay} ${kindLabel}`;
  const dateLabel = when
    ? when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;

  const distanceKm = num(details.distanceKm);
  const durationSec = num(details.movingDurationSec) ?? num(details.durationSec);
  const pace = typeof details.avgPace === 'string' ? details.avgPace.replace(/\s*\/\s*km\s*$/i, '').trim() : null;
  const avgSpeed = num(details.avgSpeedKmh) ?? (distanceKm && durationSec ? distanceKm / (durationSec / 3600) : null);
  const maxSpeed = num(details.maxSpeedKmh);
  const elevation = num(details.elevationGainM);
  const calories = num(details.calories);
  const steps = num(details.steps);
  const hasRoute = Array.isArray(details.route) && details.route.length > 1;

  const primary: { label: string; value: string; unit?: string }[] = [
    { label: 'Distance', value: distanceKm !== null ? distanceKm.toFixed(2) : '0.00', unit: 'km' },
    { label: 'Duration', value: formatClock(durationSec ?? 0) },
    isCycle
      ? { label: 'Avg Speed', value: avgSpeed !== null ? avgSpeed.toFixed(1) : '--', unit: 'km/h' }
      : { label: 'Pace', value: pace && pace !== '0:00' ? pace : '--', unit: '/km' },
  ];

  const secondary: { label: string; value: string; unit?: string; icon: typeof Flame }[] = [];
  if (calories !== null) secondary.push({ label: 'Calories', value: String(Math.round(calories)), unit: 'kcal', icon: Flame });
  if (isCycle && pace && pace !== '0:00') secondary.push({ label: 'Pace', value: pace, unit: '/km', icon: Timer });
  if (!isCycle && avgSpeed !== null) secondary.push({ label: 'Avg Speed', value: avgSpeed.toFixed(1), unit: 'km/h', icon: Gauge });
  if (maxSpeed !== null && maxSpeed > 0) secondary.push({ label: 'Max Speed', value: maxSpeed.toFixed(1), unit: 'km/h', icon: TrendingUp });
  if (steps !== null && steps > 0) secondary.push({ label: 'Steps', value: Math.round(steps).toLocaleString(), icon: Footprints });

  const allSecondary = [{ label: 'Elevation', value: elevation !== null ? `+${Math.round(elevation)}` : '+0', unit: 'm', icon: Mountain }, ...secondary];

  return (
    <div className="mb-4">
      <div className="mb-3 min-w-0">
        <h3 className="font-serif font-normal text-[22px] leading-tight text-[#17191c] truncate">{title}</h3>
        {dateLabel && <p className="text-[11px] font-mono text-[#777b86] mt-1 truncate">{dateLabel}</p>}
      </div>

      {/* Map stretches to the height of the stat column so both sides line up. */}
      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3 items-stretch">
        <div className="cardio-post-map relative w-full min-h-[184px] overflow-hidden rounded-[18px]">
          {hasRoute ? (
            <MountWhenNear className="absolute inset-0 pointer-events-none">
              <RouteMap
                route={details.route}
                theme={theme === 'dark' ? 'dark' : 'light'}
                height="100%"
                fitToContainer
                interactive={false}
                variant="card"
                hideMarkers
                noGlow
                highlightColor={theme === 'dark' ? '#b07458' : '#d9532f'}
                cardioType={kind as any}
                mapPaddingTopLeft={[20, 34]}
                mapPaddingBottomRight={[20, 20]}
              />
            </MountWhenNear>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="cardio-post-badge w-14 h-14 rounded-full flex items-center justify-center">
                <KindIcon size={24} />
              </div>
            </div>
          )}
          <span className="cardio-post-chip absolute left-2.5 top-2.5 z-[500] inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider">
            <KindIcon size={11} /> {kindLabel}
          </span>
        </div>

        <div className="flex flex-col gap-2.5 min-w-0">
          {primary.map((s) => (
            <div key={s.label} className="cardio-post-stat flex-1 flex flex-col justify-center px-3 py-2 min-w-0 min-h-[56px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#777b86] leading-none truncate">{s.label}</div>
              <div className="mt-1.5 flex items-baseline gap-1 min-w-0">
                <span className="font-mono font-bold text-[#17191c] text-[17px] leading-none tabular-nums truncate">{s.value}</span>
                {s.unit && <span className="text-[10px] font-mono text-[#777b86] leading-none shrink-0">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary KPIs — collapsed behind "Show more" */}
      {allSecondary.length > 0 && (
        <>
          <AnimatePresence initial={false}>
            {showMore && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                  {allSecondary.map((s) => (
                    <div key={s.label} className="cardio-post-stat flex items-center gap-2.5 px-2.5 py-2.5 min-w-0 min-h-[52px]">
                      <span className="cardio-post-badge w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0">
                        <s.icon size={13} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-0.5 min-w-0">
                          <span className="font-mono font-bold text-[#17191c] text-[13px] leading-none tabular-nums truncate">{s.value}</span>
                          {s.unit && <span className="text-[9px] font-mono text-[#777b86] leading-none shrink-0">{s.unit}</span>}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-normal text-[#777b86] leading-tight mt-1 whitespace-nowrap">{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="w-full mt-2 py-1.5 text-center text-[12px] font-semibold text-[#777b86] hover:text-[#17191c] flex items-center justify-center gap-1 transition-colors"
          >
            {showMore ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
          </button>
        </>
      )}
    </div>
  );
}

type LoggedSet = { completed?: boolean; reps?: number; weight?: number; seconds?: number };

const isCountedSet = (s: LoggedSet) =>
  s.completed !== false && (s.completed === true || Number(s.reps) > 0 || Number(s.weight) > 0 || Number(s.seconds) > 0);

interface StrengthPostHeroProps {
  details: Record<string, any>;
  title: string;
  createdAtSec?: number;
  activeMuscles: MuscleScore[];
  calories: number;
  volumeKg: number;
  bodyweightReps: number;
  gender: 'male' | 'female';
  theme: 'light' | 'dark';
  imperial: boolean;
}

/** Feed layout for a strength session: title, body map + primary stats, muscle focus, then the exercise log. */
function StrengthPostHero({ details, title, createdAtSec, activeMuscles, calories, volumeKg, bodyweightReps, gender, theme, imperial }: StrengthPostHeroProps) {
  const [showAll, setShowAll] = useState(false);
  const dark = theme === 'dark';
  const accent = dark ? '#c0785a' : '#c24e2c';
  const weightUnit = imperial ? 'lb' : 'kg';
  const toUnit = (kg: number) => (imperial ? kg * 2.20462 : kg);

  const logs = (Array.isArray(details.exerciseLogs) ? details.exerciseLogs : [])
    .filter((l: any) => l?.name && !isWarmupOrCooldown(l.name, l.section))
    .map((l: any) => ({ name: String(l.name), sets: ((l.sets || []) as LoggedSet[]).filter(isCountedSet) }))
    .filter((l: { sets: LoggedSet[] }) => l.sets.length > 0) as { name: string; sets: LoggedSet[] }[];
  const names = ((details.exercises || []) as string[]).filter(n => !isWarmupOrCooldown(n));
  const exercises = logs.length > 0 ? logs : names.map(name => ({ name, sets: [] as LoggedSet[] }));

  const totalSets = logs.reduce((n, l) => n + l.sets.length, 0);
  const totalReps = logs.reduce((n, l) => n + l.sets.reduce((r, s) => r + (Number(s.reps) || 0), 0), 0);
  const topLift = Math.max(0, ...logs.flatMap(l => l.sets.map(s => Number(s.weight) || 0)));
  const prCount = Number(details.prCount) || 0;
  const focus = muscleFocus(activeMuscles, 3);

  const when = createdAtSec ? new Date(createdAtSec * 1000) : null;
  const dateLabel = when
    ? `${when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : null;

  const volumeValue = volumeKg > 0 ? Math.round(toUnit(volumeKg)).toLocaleString() : bodyweightReps > 0 ? bodyweightReps.toLocaleString() : String(totalReps || 0);
  const primary: { label: string; value: string; unit?: string }[] = [
    { label: 'Duration', value: String(details.durationMin || 0), unit: 'min' },
    { label: volumeKg > 0 ? 'Volume' : 'Reps', value: volumeValue, unit: volumeKg > 0 ? weightUnit : bodyweightReps > 0 ? '@ BW' : undefined },
    { label: 'Sets', value: String(totalSets || details.sets || 0) },
  ];
  const secondary: { label: string; value: string; unit?: string; icon: typeof Flame }[] = [
    { label: 'Calories', value: String(Math.round(calories || 0)), unit: 'kcal', icon: Flame },
    { label: 'Exercises', value: String(exercises.length), icon: Dumbbell },
  ];

  const bestSet = (sets: LoggedSet[]) => {
    if (sets.length === 0) return '';
    const heaviest = sets.reduce((best, s) => ((Number(s.weight) || 0) > (Number(best.weight) || 0) ? s : best), sets[0]);
    const maxReps = Math.max(0, ...sets.map(s => Number(s.reps) || 0));
    const maxSec = Math.max(0, ...sets.map(s => Number(s.seconds) || 0));
    const w = Number(heaviest.weight) || 0;
    if (w > 0) return `${sets.length} × ${heaviest.reps || maxReps} · ${Math.round(toUnit(w) * 10) / 10} ${weightUnit}`;
    if (maxReps > 0) return `${sets.length} × ${maxReps}`;
    if (maxSec > 0) return `${sets.length} × ${maxSec}s`;
    return `${sets.length} sets`;
  };

  const visible = showAll ? exercises : exercises.slice(0, 1);
  const inactive = dark ? { fill: '#18181b', stroke: '#26262b' } : { fill: '#e2dbd3', stroke: '#b9aea3' };

  return (
    <div className="mb-4">
      <div className="mb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="strength-post-eyebrow text-[10px] font-mono font-bold uppercase tracking-[0.14em] truncate">
            {details.planTitle || 'Strength session'}{details.skill ? ` · ${details.skill}` : ''}
          </span>
          {prCount > 0 && (
            <span className="strength-post-pr shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider">
              <Trophy size={10} /> {prCount} PR{prCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <h3 className="font-serif font-normal text-[22px] leading-tight text-[#17191c] truncate mt-1">{title}</h3>
        {dateLabel && <p className="text-[11px] font-mono text-[#777b86] mt-1 truncate">{dateLabel}</p>}
      </div>

      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3 items-stretch">
        <div className="cardio-post-map relative w-full min-h-[184px] overflow-hidden rounded-[18px] flex items-end justify-center gap-2 px-3 pt-8 pb-3">
          {activeMuscles.length > 0 ? (
            (['front', 'back'] as const).map(view => (
              <AnatomyFigureSVG
                key={view}
                view={view}
                activeMuscles={activeMuscles}
                gender={gender}
                color={accent}
                inactiveFill={inactive.fill}
                inactiveStroke={inactive.stroke}
                glow={dark}
                className="h-[150px] w-auto max-w-[48%]"
              />
            ))
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="cardio-post-badge w-14 h-14 rounded-full flex items-center justify-center">
                <Dumbbell size={24} />
              </div>
            </div>
          )}
          <span className="cardio-post-chip absolute left-2.5 top-2.5 z-[5] inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider">
            <Dumbbell size={11} /> Strength
          </span>
        </div>

        <div className="flex flex-col gap-2.5 min-w-0">
          {primary.map(s => (
            <div key={s.label} className="cardio-post-stat flex-1 flex flex-col justify-center px-3 py-2 min-w-0 min-h-[56px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#777b86] leading-none truncate">{s.label}</div>
              <div className="mt-1.5 flex items-baseline gap-1 min-w-0">
                <span className="font-mono font-bold text-[#17191c] text-[17px] leading-none tabular-nums truncate">{s.value}</span>
                {s.unit && <span className="text-[10px] font-mono text-[#777b86] leading-none shrink-0">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {secondary.map(s => (
          <div key={s.label} className="cardio-post-stat flex items-center gap-2.5 px-2.5 py-2.5 min-w-0 min-h-[52px]">
            <span className="cardio-post-badge w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0">
              <s.icon size={13} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-0.5 min-w-0">
                <span className="font-mono font-bold text-[#17191c] text-[13px] leading-none tabular-nums truncate">{s.value}</span>
                {s.unit && <span className="text-[9px] font-mono text-[#777b86] leading-none shrink-0">{s.unit}</span>}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-normal text-[#777b86] leading-tight mt-1 whitespace-nowrap">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {focus.length > 0 && (
        <div className="cardio-post-stat mt-3 px-3.5 py-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#777b86] mb-2.5">Muscle focus</div>
          <div className="space-y-2">
            {focus.map(f => (
              <div key={f.muscle} className="flex items-center gap-3">
                <span className="w-[84px] shrink-0 text-[12px] font-semibold text-[#17191c] truncate">{f.label}</span>
                <span className="strength-post-track flex-1 h-2 rounded-full overflow-hidden">
                  <span className="strength-post-fill block h-full rounded-full" style={{ width: `${Math.max(8, f.pct)}%` }} />
                </span>
                <span className="w-9 text-right text-[11px] font-mono text-[#777b86] tabular-nums">{f.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div className="cardio-post-stat mt-3 px-1.5 py-1.5">
          {visible.map((ex, i) => (
            <div key={`${ex.name}-${i}`} className="strength-post-row flex items-center gap-3 px-2 py-2.5 min-w-0">
              <span className="cardio-post-badge w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 text-[10px] font-mono font-bold">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-[#17191c]">{ex.name}</span>
              <span className="shrink-0 text-[11px] font-mono text-[#777b86] tabular-nums">{bestSet(ex.sets)}</span>
            </div>
          ))}
          {exercises.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="w-full py-2 text-center text-[12px] font-semibold text-[#17191c] flex items-center justify-center gap-1"
            >
              {showAll ? <>Show less <ChevronUp size={14} /></> : <>Show all {exercises.length} exercises <ChevronDown size={14} /></>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ActivityPostCardProps {
  activity: Activity;
  onShare?: (activity: Activity) => void;
  onDelete?: (activityId: string) => void;
  onCommentClick?: () => void;
  hideCommentsToggle?: boolean;
  isEmbedded?: boolean;
}

export function ActivityPostCard({ activity, onShare, onDelete, onCommentClick, hideCommentsToggle, isEmbedded }: ActivityPostCardProps) {
  const { user, profile } = useAuthStore();
  const { showToast, confirm, units, theme, hiddenPosts, hidePost, unhidePost } = useUIStore();
  const queryClient = useQueryClient();

  const [isDeleted, setIsDeleted] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const bookmarks = profile?.bookmarks || [];
  const isSaved = activity.id ? bookmarks.includes(activity.id) : false;

  const details = (activity.details || {}) as Record<string, any>;
  const exerciseNames = (details.exercises || []) as string[];
  const isOwnActivity = activity.userId === user?.uid;
  const activityWeight = details.bodyweight || (isOwnActivity ? profile?.weight : undefined);
  // Resolve the author's current name/photo live instead of trusting the copy stored on
  // the activity at post time, so a later name/photo change shows up immediately here.
  const { displayName: liveUserName, photoURL: liveUserPhoto } = useLiveDisplayName(activity.userId, activity.userName, activity.userPhoto);

  // Detect competition celebration post
  const isCelebration =
    activity.type === 'achievement' ||
    Boolean(details.challengeId) ||
    Boolean(details.eventId) ||
    Boolean(activity.summary?.includes('Concluded')) ||
    (typeof details.text === 'string' && (details.text.includes('🥇') || details.text.includes('🏆')));

  // Stats calculation
  const displayVolume = Array.isArray(details.exerciseLogs)
    ? calculateShareVolume(details.exerciseLogs, activityWeight || 70)
    : Number(details.volume || 0);
  const displayBodyweightReps = Array.isArray(details.exerciseLogs) ? calculateBodyweightReps(details.exerciseLogs) : 0;
  const repsLabel = activityWeight ? `reps @ BW` : 'BW reps';

  const displayCalories = Array.isArray(details.exerciseLogs) && details.exerciseLogs.length > 0
    ? calculateWorkoutCalories(details.exerciseLogs as any, activityWeight, details.durationMin)
    : Number(details.calories || 0);

  // Active muscle heatmap regions
  const activeMuscles = Array.isArray(details.exerciseLogs) && details.exerciseLogs.length > 0
    ? getActiveMusclesFromLogs(details.exerciseLogs as any)
    : getActiveMuscleScores(exerciseNames);
  // The author's body type: stored on newer posts, otherwise known only for your own posts.
  const authorGender = String(details.gender || (isOwnActivity ? profile?.gender : '') || '').toLowerCase();
  const postGender: 'male' | 'female' = authorGender === 'female' ? 'female' : 'male';
  
  const isCardio = activity.type === 'walk' || activity.type === 'run' || activity.type === 'cycle' || ['walk', 'run', 'cycle'].includes(details.activityType) || (details.distanceKm !== undefined && !details.exercises && !details.exerciseLogs);

  // React Query for Likes & Comments
  const { data: liked = false } = useQuery({
    queryKey: ['liked', activity.id, user?.uid],
    queryFn: () => hasLiked(activity.id!, user!.uid),
    enabled: !!activity.id && !!user,
  });

  // Like Mutation with optimistic update
  const likeMutation = useMutation({
    mutationFn: () => toggleLike(activity.id!, user!.uid),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['liked', activity.id, user?.uid] });
      const previousLiked = queryClient.getQueryData(['liked', activity.id, user?.uid]);
      queryClient.setQueryData(['liked', activity.id, user?.uid], (old: boolean) => !old);
      return { previousLiked };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liked', activity.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (_err, _newVal, context) => {
      queryClient.setQueryData(['liked', activity.id, user?.uid], context?.previousLiked);
      showToast('Could not update like', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteActivity(activity.id!),
    onSuccess: () => {
      setIsDeleted(true);
      showToast('Post deleted', 'success');
      if (activity.id) onDelete?.(activity.id);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['userWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
    onError: () => showToast('Could not delete post', 'error'),
  });

  if (isDeleted) {
    return null;
  }

  if (activity.id && hiddenPosts?.includes(activity.id)) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-center justify-between p-4 mb-4 sm:mb-6 rounded-[24px] bg-[#fdfbfb] border border-[#ececec] text-sm shadow-sm"
      >
        <span className="text-[#777b86] font-medium font-sans">Post hidden</span>
        <button onClick={() => unhidePost(activity.id!)} className="text-[#5d2a1a] font-bold font-sans hover:underline">Undo</button>
      </motion.div>
    );
  }

  return (
    <motion.article
      initial={isEmbedded ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={isEmbedded ? undefined : { y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="activity-post-card relative text-[#17191c] border border-[#ececec] rounded-[24px] bg-[#fdfbfb] shadow-[8px_8px_20px_rgba(0,0,0,0.06),-8px_-8px_20px_rgba(255,255,255,0.8)] p-3.5 sm:p-5 md:p-6 mb-4 sm:mb-6"
    >
      {/* ─── SECTION 1: HEADER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5 relative z-20">
        <div className="flex items-start md:items-center gap-2.5 sm:gap-3 min-w-0">
          <Link to={`/profile/${activity.username || activity.userId}`} className="shrink-0 mt-0.5 md:mt-0">
            <img
              src={liveUserPhoto || getAvatarUrl(liveUserName, theme)}
              alt={liveUserName}
              className="w-10 h-10 md:w-11 md:h-11 rounded-full shadow-[3px_3px_6px_rgba(0,0,0,0.1),-3px_-3px_6px_rgba(255,255,255,1)] object-cover"
              referrerPolicy="no-referrer"
            />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <Link
                to={`/profile/${activity.username || activity.userId}`}
                className="font-bold text-sm hover:text-[#5d2a1a] transition-colors text-[#17191c] truncate max-w-[120px] sm:max-w-[180px]"
              >
                {liveUserName}
              </Link>
              {activity.username && (
                <span className="text-[11px] font-mono text-[#777b86] hidden sm:inline truncate max-w-[80px]">@{activity.username}</span>
              )}
              {isCelebration ? (
                <span className="text-[9px] md:text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30 shrink-0">
                  Arena Official
                </span>
              ) : (profile?.athleteRank?.tier || profile?.experienceLevel) && isOwnActivity ? (
                <span className="text-[9px] md:text-[10px] font-mono font-medium uppercase px-2 py-0.5 rounded-full bg-[#fdfbfb] text-[#777b86] shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,1)] shrink-0">
                  {profile?.athleteRank?.tier || profile?.experienceLevel}
                </span>
              ) : null}
            </div>
            <div className="text-[10px] md:text-[11px] font-sans font-semibold text-[#777b86] tracking-wider uppercase mt-0.5 md:mt-1 leading-snug flex items-center gap-1">
              {isCelebration ? (
                <>
                  <Trophy size={11} className="text-amber-600 shrink-0" />
                  <span>{details.eventId ? 'EVENT PODIUM' : 'CHALLENGE PODIUM'}</span>
                </>
              ) : activity.type === 'event_join' ? (
                'REGISTERED FOR AN EVENT'
              ) : isCardio ? (
                'COMPLETED A CARDIO SESSION'
              ) : (
                'COMPLETED A WORKOUT'
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <span className="text-[9px] md:text-xs font-mono text-[#777b86] whitespace-nowrap">
            {timeAgo(activity.createdAt?.seconds)}
          </span>
          <div className="relative">
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="p-1.5 text-[#777b86] hover:text-[#17191c] transition-colors rounded-full hover:bg-gray-100" 
              title="Post options"
            >
              <MoreHorizontal size={18} />
            </button>

            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden"
                >
                  <button 
                    onClick={async () => {
                      const res = await shareContent({
                        title: activity.summary || `${BRAND.name} Activity Post`,
                        url: getAppShareUrl(`/post/${activity.id}`),
                        dialogTitle: 'Share Activity Post'
                      });
                      if (res.method === 'clipboard') {
                        showToast('Link copied to clipboard', 'success');
                      }
                      setShowOptions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-[#17191c] hover:bg-gray-50 flex items-center gap-2"
                  >
                    Copy Link
                  </button>
                  {isOwnActivity ? (
                    <button 
                      onClick={async () => {
                        setShowOptions(false);
                        const ok = await confirm({
                          title: 'Delete Workout Post',
                          message: 'Are you sure you want to delete this workout post? This cannot be undone.',
                          confirmText: 'Delete',
                          type: 'danger',
                          icon: 'trash',
                        });
                        if (ok) {
                          deleteMutation.mutate();
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete Post'}
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => {
                          if (activity.id) hidePost(activity.id);
                          showToast('Post hidden');
                          setShowOptions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-[#17191c] hover:bg-gray-50 flex items-center gap-2"
                      >
                        Hide Post
                      </button>
                      <button 
                        onClick={() => {
                          showToast('Post reported to moderators');
                          setShowOptions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-[13px] font-sans text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        Report
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: WORKOUT / ACHIEVEMENT HERO ─────────────────────── */}
      {isCelebration ? (
        <div className="mb-4 sm:mb-5">
          <CelebrationPodiumCard
            title={activity.summary || (details.title as string) || (details.challengeTitle as string)}
            rawText={(details.text as string) || activity.summary}
            winners={(details.winners as any)}
            sourceType={details.eventId ? 'event' : 'challenge'}
          />
        </div>
      ) : isCardio && activity.type !== 'event_join' ? (
        <CardioPostHero details={details} activityType={activity.type} createdAtSec={activity.createdAt?.seconds} theme={theme} />
      ) : activity.type === 'event_join' ? (
        <div className="relative overflow-hidden rounded-[20px] p-4 sm:p-6 mb-4 sm:mb-5 bg-[#fdfbfb] shadow-[inset_3px_3px_8px_rgba(0,0,0,0.05),inset_-3px_-3px_8px_rgba(255,255,255,1)]">
          <h2 className="font-serif text-2xl text-[#17191c] mb-1">{activity.summary}</h2>
          <p className="text-sm text-[#777b86] font-sans flex items-center gap-1 mt-2">
            <CalendarIcon size={14} className="text-[#5d2a1a]" />
            Going to {details.eventTitle || 'an event'}
          </p>
        </div>
      ) : (
        <StrengthPostHero
          details={details}
          title={details.dayTitle || activity.summary || 'Workout'}
          createdAtSec={activity.createdAt?.seconds}
          activeMuscles={activeMuscles}
          calories={displayCalories}
          volumeKg={displayVolume}
          bodyweightReps={displayBodyweightReps}
          gender={postGender}
          theme={theme}
          imperial={units === 'imperial'}
        />
      )}

      {/* ─── SECTION 5: SOCIAL ACTIONS ─────────────────────────────────── */}
      <div className="flex items-center justify-between mt-4 pt-4 text-xs font-sans">
        <div className="flex items-center gap-4">
          {/* Like */}
          <motion.button
            whileTap={{ scale: 1.25 }}
            onClick={() => !likeMutation.isPending && likeMutation.mutate()}
            disabled={likeMutation.isPending}
            className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-red-500 font-bold' : 'text-[#777b86] hover:text-red-500'} ${likeMutation.isPending ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <AnimatedHeart isLiked={liked} size={18} />
            <span>{activity.likesCount || 0}</span>
          </motion.button>

          {/* Comment */}
          {!hideCommentsToggle && (
            <button
              onClick={() => {
                if (onCommentClick) {
                  onCommentClick();
                }
              }}
              className="flex items-center gap-1.5 text-[#777b86] hover:text-[#17191c] transition-colors"
            >
              <MessageSquare size={16} />
              <span>{activity.commentsCount || 0}</span>
            </button>
          )}

          {/* Share */}
          <button
            onClick={async () => {
              if (isCelebration) {
                const res = await shareContent({
                  title: activity.summary || `Competition Podium - ${BRAND.name}`,
                  text: details.text || `Check out the competition champions on ${BRAND.name}!`,
                  url: getAppShareUrl(`/post/${activity.id}`),
                  dialogTitle: 'Share Podium Results'
                });
                if (res.method === 'clipboard') {
                  showToast('Podium link copied to clipboard!', 'success');
                }
              } else if (onShare) {
                onShare(activity);
              } else {
                const res = await shareContent({
                  title: activity.summary || `Workout on ${BRAND.name}`,
                  url: getAppShareUrl(`/post/${activity.id}`),
                });
                if (res.method === 'clipboard') {
                  showToast('Post link copied to clipboard!', 'success');
                }
              }
            }}
            className="flex items-center gap-1.5 text-[#777b86] hover:text-[#17191c] transition-colors"
          >
            <Share2 size={15} />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>

        {/* Save Bookmark */}
        <button
          onClick={async () => {
            if (!profile || !activity.id) return;
            try {
              const isCurrentlySaved = bookmarks.includes(activity.id);
              const newBookmarks = isCurrentlySaved
                ? bookmarks.filter((id: string) => id !== activity.id)
                : [...bookmarks, activity.id];

              await useAuthStore.getState().updateProfile({ bookmarks: newBookmarks });
              showToast(isCurrentlySaved ? 'Removed from bookmarks' : 'Saved to bookmarks', 'info');
              queryClient.invalidateQueries({ queryKey: ['feed'] });
            } catch (err) {
              showToast('Could not save bookmark', 'error');
            }
          }}
          className={`p-1.5 rounded-lg transition-colors ${isSaved ? 'text-[#5d2a1a] bg-[#fbe1d1]/30' : 'text-[#777b86] hover:text-[#17191c]'
            }`}
          title="Save post"
        >
          <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </motion.article>
  );
}

/** Skeleton Loader Component */
export function ActivityPostCardSkeleton() {
  return (
    <div className="rounded-[24px] border border-[#ececec] bg-[#fdfbfb] shadow-[8px_8px_20px_rgba(0,0,0,0.06),-8px_-8px_20px_rgba(255,255,255,0.8)] p-5 mb-4 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-[#f2f2f3]" />
        <div className="space-y-2 flex-1">
          <div className="w-32 h-3 bg-[#f2f2f3] rounded" />
          <div className="w-20 h-2 bg-[#f2f2f3] rounded" />
        </div>
      </div>
      <div className="h-28 rounded-xl bg-[#f2f2f3] mb-4" />
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
        <div className="h-10 rounded-xl bg-[#f2f2f3]" />
      </div>
    </div>
  );
}
