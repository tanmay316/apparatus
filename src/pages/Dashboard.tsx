import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Flame, TrendingUp, Zap, Calendar, Compass, Plus, Play, ChevronRight,
  Users, Clock, Heart, MessageCircle, Share2
} from 'lucide-react';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { FollowerActivityCard } from '@/components/ui/FollowerActivityCard';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { getPlan, getPlanDays } from '@/services/plans';
import { getWorkoutsByDateRange } from '@/services/workouts';
import { getFollowing, getFeed } from '@/services/social';

const QUOTES = [
  "Nobody sees the reps you did alone — your body will.",
  "Consistency beats intensity. Show up again tomorrow.",
  "The bar doesn't care how you feel. Grab it anyway.",
  "Every skill hold you've ever nailed started as a failed attempt.",
  "Strength is a habit before it's a look.",
  "You don't need a perfect session. You need a logged one.",
  "Discipline is remembering what you want, five minutes from now.",
  "A rest day well spent is still training.",
  "Your future self is trained by today's decision to show up.",
  "Progress hides in the sets you almost skipped.",
];

function getTodayQuote() {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

function timeAgo(seconds: number): string {
  const now = Date.now() / 1000;
  const diff = now - seconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function Dashboard() {
  const { profile, stats } = useAuthStore();

  if (!profile) return null;

  const xp = stats?.xp || 0;
  const streak = stats?.currentStreak || 0;
  const totalWorkouts = stats?.totalWorkouts || 0;
  const totalCalories = stats?.totalCalories || 0;
  const totalHours = Math.round((stats?.totalDurationMin || 0) / 60);

  const { data: activePlan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', profile.activePlanId],
    queryFn: () => getPlan(profile.activePlanId!),
    enabled: !!profile.activePlanId,
  });

  const { data: activeDays = [], isLoading: daysLoading } = useQuery({
    queryKey: ['planDays', profile.activePlanId],
    queryFn: () => getPlanDays(profile.activePlanId!),
    enabled: !!profile.activePlanId,
  });

  const { data: todayWorkouts = [] } = useQuery({
    queryKey: ['todayWorkouts', profile.uid],
    queryFn: () => {
      const todayStr = localDateKey(new Date());
      return getWorkoutsByDateRange(profile.uid, todayStr, todayStr);
    },
    enabled: !!profile.uid,
  });

  const { data: recentWorkouts = [] } = useQuery({
    queryKey: ['recentWorkouts', profile.uid],
    queryFn: () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const startDate = localDateKey(sevenDaysAgo);
      const endDate = localDateKey(new Date());
      return getWorkoutsByDateRange(profile.uid, startDate, endDate);
    },
    enabled: !!profile.uid,
  });

  const { data: following = [] } = useQuery({
    queryKey: ['following', profile.uid],
    queryFn: () => getFollowing(profile.uid),
    enabled: !!profile.uid,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: feed = [] } = useQuery({
    queryKey: ['feed', profile.uid, following],
    queryFn: () => getFeed(profile.uid, following),
    enabled: !!profile.uid,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const store = useWorkoutStore();
  const { showToast } = useUIStore();

  const streakDays = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateKey = localDateKey(d);
    const done = recentWorkouts.some((w: any) => w.date === dateKey);
    streakDays.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' })[0].toUpperCase(),
      done,
    });
  }

  const completedCount = streakDays.filter(s => s.done).length;
  const targetDays = activePlan?.daysPerWeek || 6;
  const progressPct = targetDays ? Math.min(Math.round((completedCount / targetDays) * 100), 100) : 0;

  const followersActivity = feed.filter((act: any) => act.userId !== profile.uid).slice(0, 3);
  const [expandedActivity, setExpandedActivity] = useState<Record<string, boolean>>({});
  const [dashboardShareData, setDashboardShareData] = useState<ShareCardData | null>(null);

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {/* Hero */}
      <motion.div variants={item} className="pb-5 border-b border-line mb-5">
        <div className="font-mono text-amber text-xs tracking-widest mb-2">
          WELCOME BACK, {profile.displayName.toUpperCase()}
        </div>
        <h1 className="font-display text-3xl mb-2">Your training hub.</h1>
        <p className="text-bone-dim text-sm max-w-xl leading-relaxed">
          Track workouts, log progress, explore plans, and connect with other athletes.
          Tap any section in the sidebar to get started.
        </p>

        {/* Streak strip */}
        <div className="flex gap-1.5 mt-4">
          {streakDays.map((s, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded flex items-center justify-center font-mono text-[11px] font-bold ${
                s.done
                  ? 'bg-ink-2 text-teal border border-teal/20'
                  : 'bg-ink-3 text-bone-dim'
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Stats overview */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">STREAK</div>
          <div className="flex items-center gap-2 mt-1">
            <Flame size={18} className="text-amber" />
            <span className="text-xl font-bold font-mono">{streak}</span>
            <span className="text-xs text-bone-dim">days</span>
          </div>
        </div>
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">WORKOUTS</div>
          <div className="flex items-center gap-2 mt-1">
            <Zap size={18} className="text-teal" />
            <span className="text-xl font-bold font-mono">{totalWorkouts}</span>
          </div>
        </div>
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">CALORIES</div>
          <div className="flex items-center gap-2 mt-1">
            <TrendingUp size={18} className="text-amber" />
            <span className="text-xl font-bold font-mono">{totalCalories.toLocaleString()}</span>
          </div>
        </div>
        <div className="stat-pill">
          <div className="font-mono text-[10.5px] text-bone-dim tracking-wider">HOURS</div>
          <div className="flex items-center gap-2 mt-1">
            <Calendar size={18} className="text-teal" />
            <span className="text-xl font-bold font-mono">{totalHours}</span>
          </div>
        </div>
      </motion.div>

      {/* Quote */}
      <motion.div variants={item} className="border-l-[3px] border-amber bg-ink-2 rounded-r px-4 py-3 mb-6">
        <p className="text-sm italic text-bone-dim leading-relaxed">{getTodayQuote()}</p>
      </motion.div>

      {/* Active Program Grid */}
      <motion.div variants={item} className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[11px] text-bone-dim tracking-wider uppercase">
            THIS WEEK — {completedCount} / {targetDays} TRAINING DAYS
          </div>
          {profile.activePlanId && (
            <Link to={`/plans/${profile.activePlanId}`} className="text-[10px] text-teal font-mono hover:underline">
              VIEW FULL PLAN
            </Link>
          )}
        </div>
        <div className="h-1 w-full bg-ink-2 mb-6 rounded-full overflow-hidden">
          <div className="h-full bg-teal transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
        </div>
        
        {!profile.activePlanId ? (
          <div className="card p-5 border-dashed border-line flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div>
              <h3 className="font-display text-lg mb-1">No Active Program</h3>
              <p className="text-xs text-bone-dim">Set a plan as active to easily start workouts here.</p>
            </div>
            <Link to="/plans" className="btn-primary shrink-0">Select a Plan</Link>
          </div>
        ) : planLoading || daysLoading ? (
          <div className="card p-5 flex justify-center">
            <div className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activePlan && activeDays.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeDays.map((day) => {
              const wasCompletedToday = todayWorkouts.some((w: any) => w.dayId === day.id);
              
              // Calculate progress line percentage
              let pct = 0;
              if (store.isActive && store.dayId === day.id) {
                const completedCount = Object.values(store.logs).filter(ex => ex.sets.some(s => s.completed)).length;
                const totalCount = [...store.warmup, ...store.skillWork, ...store.strength, ...store.cooldown].length;
                pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
              } else if (wasCompletedToday) {
                pct = 100;
              }

              const CardContent = (
                <div className="p-5 flex flex-col h-full relative">
                  <div className="flex justify-between items-start mb-2 font-mono text-[11px] tracking-widest text-bone-dim">
                    <span>DAY {day.dayNumber.toString().padStart(2, '0')} / {activeDays.length.toString().padStart(2, '0')}</span>
                    <span>~{day.time}</span>
                  </div>
                  <h3 className="font-display text-xl mb-4 uppercase text-bone">{day.title}</h3>
                  
                  {/* Progress Line */}
                  <div className="h-1 w-full bg-ink mb-3 rounded-full overflow-hidden">
                    <div className="h-full bg-teal transition-all duration-300" style={{ width: `${pct}%` }}></div>
                  </div>
                  
                  {wasCompletedToday && (
                    <div className="text-[10px] text-teal font-mono flex items-center gap-1.5 mt-1 font-bold">
                      ✓ LOGGED TODAY
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-4">
                    <div className="text-xs font-mono text-amber tracking-wider uppercase">
                      {day.type === 'yoga' || day.title.toLowerCase().includes('yoga') ? 'RECOVERY — MOBILITY' : `SKILL — ${day.skill || 'NONE'}`}
                    </div>
                    {wasCompletedToday && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const todayWorkout = todayWorkouts.find((w: any) => w.dayId === day.id) as any;
                          setDashboardShareData({
                            dayTitle: day.title,
                            planTitle: activePlan!.title,
                            date: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                            durationMin: todayWorkout?.durationMin || 0,
                            volume: todayWorkout?.volume || 0,
                            calories: todayWorkout?.calories || 0,
                            exerciseNames: todayWorkout?.exercises?.map((ex: any) => ex.name) || [],
                            exerciseLogs: todayWorkout?.exercises?.map((ex: any) => ({ name: ex.name, sets: ex.sets || [] })) || [],
                            bodyweight: profile.weight || 70,
                          });
                        }}
                        className="w-8 h-8 rounded-full bg-teal/10 border border-teal/30 flex items-center justify-center text-teal hover:bg-teal/20 transition-colors"
                        title="Share this workout"
                      >
                        <Share2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );

              return (
                <Link 
                  key={day.id} 
                  to={`/workout/${activePlan.id}/day/${day.id}`} 
                  className="card-hover block h-full group"
                >
                  {CardContent}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="card p-5 border-dashed border-line text-center text-sm text-bone-dim">
            Active plan not found or has no days.
          </div>
        )}
      </motion.div>

      {/* Quick actions */}
      <motion.div variants={item}>
        <div className="font-mono text-[11px] text-bone-dim tracking-wider mb-3">QUICK ACTIONS</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to="/plans" className="card-hover p-5 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center group-hover:bg-teal/20 transition-colors">
                <Plus size={20} className="text-teal" />
              </div>
              <div>
                <div className="font-semibold text-sm">Create a Plan</div>
                <div className="text-xs text-bone-dim">Build your own workout program</div>
              </div>
            </div>
          </Link>

          <Link to="/explore" className="card-hover p-5 group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-amber/10 flex items-center justify-center group-hover:bg-amber/20 transition-colors">
                <Compass size={20} className="text-amber" />
              </div>
              <div>
                <div className="font-semibold text-sm">Explore Plans</div>
                <div className="text-xs text-bone-dim">Browse sample plans & community</div>
              </div>
            </div>
          </Link>
        </div>
      </motion.div>

      {/* XP card */}
      <motion.div variants={item} className="card p-5 mt-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-teal flex items-center justify-center font-display font-bold text-xl text-ink flex-none">
            {Math.min(10, Math.floor(xp / 500) + 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1.5">
              <h4 className="font-display text-base">{xp < 100 ? 'Ground Zero' : xp < 500 ? 'Bar Novice' : xp < 1400 ? 'Skill Seeker' : 'Apparatus Master'}</h4>
              <span className="font-mono text-[11px] text-bone-dim">{xp} XP</span>
            </div>
            <div className="h-2 bg-line rounded-full overflow-hidden">
              <div
                className="h-full bg-amber rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (xp % 500) / 5)}%` }}
              />
            </div>
          </div>
          <div className="text-center px-2 flex-none">
            <div className="text-2xl">🔥</div>
            <div className="font-mono text-lg font-bold">{streak}</div>
            <div className="font-mono text-[10px] text-bone-dim tracking-wider">STREAK</div>
          </div>
        </div>
      </motion.div>

      {/* Followers Activity Feed */}
      <motion.div variants={item} className="card p-5 mt-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-line/30">
          <Users size={16} className="text-teal" />
          <h3 className="font-display text-base">Followers Activity</h3>
        </div>

        {followersActivity.length > 0 ? (
          <div className="space-y-4">
            {followersActivity.map((activity: any) => {
              const details = activity.details;
              const exercises = details?.exercises as string[] | undefined;

              return (
                <>
                  <FollowerActivityCard activity={activity} />
                  <div key={activity.id} className="hidden p-3 bg-ink-2 rounded border border-line/20 hover:border-teal/20 transition-all">
                  <div className="flex items-start gap-3">
                    <img
                      src={activity.userPhoto || `https://ui-avatars.com/api/?name=${activity.userName}&background=4F9E8D&color=14151A&bold=true`}
                      alt={activity.userName}
                      className="w-9 h-9 rounded-full border border-teal/20 object-cover flex-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <Link to={activity.username ? `/profile/${activity.username}` : `/profile/${activity.userId}`} className="font-bold text-xs hover:text-teal transition-colors">
                          {activity.userName}
                        </Link>
                        <span className="font-mono text-[9px] text-bone-dim">
                          {activity.createdAt?.seconds ? timeAgo(activity.createdAt.seconds) : 'Just now'}
                        </span>
                      </div>
                      <div className="text-[10px] text-teal font-mono">@{activity.username || 'athlete'}</div>
                      
                      <div className="text-xs text-bone mt-2 font-semibold">
                        {activity.summary}
                      </div>

                      {/* Stats row */}
                      {details && (
                        <div className="flex flex-wrap gap-3 mt-2 p-1.5 bg-ink-3 rounded border border-line/10">
                          <span className="flex items-center gap-1 text-[10px] font-mono text-bone-dim">
                            <Clock size={10} className="text-teal" />
                            {details.durationMin || 0} min
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-mono text-bone-dim">
                            <TrendingUp size={10} className="text-amber" />
                            {(details.volume || 0).toLocaleString()} kg·r
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-mono text-bone-dim">
                            <Flame size={10} className="text-danger" />
                            {details.calories || 0} kcal
                          </span>
                        </div>
                      )}

                      {/* Exercises done dropdown */}
                      {exercises && exercises.length > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => setExpandedActivity(prev => ({ ...prev, [activity.id]: !prev[activity.id] }))}
                            className="flex items-center gap-1 text-[10px] text-teal font-mono uppercase font-bold hover:underline"
                          >
                            <span>{expandedActivity[activity.id] ? 'Hide Exercises' : `Show Exercises (${exercises.length})`}</span>
                            <span>{expandedActivity[activity.id] ? '▲' : '▼'}</span>
                          </button>

                          {expandedActivity[activity.id] && (
                            <div className="flex flex-wrap gap-1 mt-2 p-2 bg-ink-3 rounded border border-line/10">
                              {exercises.map((exName, idx) => (
                                <span key={idx} className="text-[9px] py-0.5 px-1.5 bg-teal/5 border border-teal/10 rounded text-teal font-mono">
                                  {exName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-xs text-bone-dim py-4">
            No recent activity from followed athletes. Find people to follow in the Explore tab!
          </div>
        )}
      </motion.div>

      {dashboardShareData && (
        <ShareCardModal
          data={dashboardShareData}
          onClose={() => setDashboardShareData(null)}
        />
      )}
    </motion.div>
  );
}
