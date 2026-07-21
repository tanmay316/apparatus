import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { getPlan, getPlanDays } from '@/services/plans';
import { getWorkoutsByDateRange } from '@/services/workouts';
import { getFollowing, getFeed } from '@/services/social';
import { calculateWorkoutCalories } from '@/lib/calories';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';

import { HeroDashboard } from '@/components/dashboard/HeroDashboard';
import { TodayFocusCard } from '@/components/dashboard/TodayFocusCard';
import { StatsPills } from '@/components/dashboard/StatsPills';
import { WeeklyTimeline } from '@/components/dashboard/WeeklyTimeline';
import { XPPanel } from '@/components/dashboard/XPPanel';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import type { PlanDay, Activity } from '@/types';

// ─── Constants ───────────────────────────────────────────────

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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay() || 7; // Sunday is 0, make it 7
  date.setDate(date.getDate() - (day - 1));
  return date;
}

// ─── Dashboard ───────────────────────────────────────────────

export function Dashboard() {
  const { profile, stats } = useAuthStore();
  const userWeight = useUserWeight();
  const store = useWorkoutStore();
  const [dashboardShareData, setDashboardShareData] = useState<ShareCardData | null>(null);

  if (!profile) return null;

  // ─── Data ────────────────────────────────────────────────
  const xp = stats?.xp || 0;
  const streak = stats?.currentStreak || 0;
  const totalWorkouts = stats?.totalWorkouts || 0;
  const totalHours = Math.round((stats?.totalDurationMin || 0) / 60);
  const badges = stats?.badges || [];

  const { data: activePlan } = useQuery({
    queryKey: ['plan', profile.activePlanId],
    queryFn: () => getPlan(profile.activePlanId!),
    enabled: !!profile.activePlanId,
  });

  const { data: activeDays = [] } = useQuery({
    queryKey: ['planDays', profile.activePlanId],
    queryFn: () => getPlanDays(profile.activePlanId!),
    enabled: !!profile.activePlanId,
  });

  const todayKey = localDateKey(new Date());
  const { data: todayWorkouts = [] } = useQuery({
    queryKey: ['todayWorkouts', profile.uid, todayKey],
    queryFn: () => getWorkoutsByDateRange(profile.uid, todayKey, todayKey),
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

  // Calorie calculation
  let totalCalories = stats?.totalCalories || 0;
  recentWorkouts.forEach((workout: any) => {
    const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
    if (rawExLogs.length > 0) {
      const dynamicCals = calculateWorkoutCalories(null, rawExLogs, workout.bodyweight || userWeight || 70, workout.durationMin);
      const savedCals = workout.calories || 0;
      totalCalories = totalCalories - savedCals + dynamicCals;
    }
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

  // ─── Computed values ─────────────────────────────────────
  const streakDays: { label: string; done: boolean }[] = [];
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

  const currentWeekStart = localDateKey(getMonday(new Date()));
  const currentWeekWorkouts = recentWorkouts.filter((w: any) => w.date >= currentWeekStart);

  const completedCount = activePlan
    ? new Set(currentWeekWorkouts.filter((w: any) => w.planId === activePlan.id || activeDays.some(d => d.id === w.dayId)).map((w: any) => w.dayId)).size
    : currentWeekWorkouts.length;
  const targetDays = activePlan?.daysPerWeek || 6;
  const followersActivity = feed.filter((act: any) => act.userId !== profile.uid);

  // Session progress for TodayFocusCard
  let sessionProgress = 0;
  if (store.isActive) {
    const completedEx = Object.values(store.logs).filter(ex => ex.sets.some(s => s.completed)).length;
    const totalEx = [...store.warmup, ...store.skillWork, ...store.strength, ...store.cooldown].length;
    sessionProgress = totalEx ? Math.round((completedEx / totalEx) * 100) : 0;
  }

  // Determine current day index based on active session, today's logged workout, or next queued day
  const findDayIndex = (dayId: string) => {
    return activeDays.findIndex(d => d.id === dayId || String(d.dayNumber) === String(dayId));
  };

  let currentDayIndex = 0;
  if (store.isActive && store.dayId) {
    const activeIdx = findDayIndex(store.dayId);
    if (activeIdx !== -1) currentDayIndex = activeIdx;
  } else {
    const todayPlanWorkout = todayWorkouts.find((w: any) =>
      w.planId === activePlan?.id || activeDays.some(d => d.id === w.dayId || String(d.dayNumber) === String(w.dayId))
    );
    if (todayPlanWorkout) {
      const todayIdx = findDayIndex(todayPlanWorkout.dayId);
      if (todayIdx !== -1) currentDayIndex = todayIdx;
    } else {
      const lastPlanWorkout = recentWorkouts.find((w: any) =>
        w.planId === activePlan?.id || activeDays.some(d => d.id === w.dayId || String(d.dayNumber) === String(w.dayId))
      );
      const lastDayIndex = lastPlanWorkout ? findDayIndex(lastPlanWorkout.dayId) : -1;
      if (lastDayIndex !== -1 && activeDays.length > 0) {
        currentDayIndex = (lastDayIndex + 1) % activeDays.length;
      }
    }
  }

  // Handle Share button click on a completed workout day
  const handleShareDay = (day: PlanDay) => {
    const todayWorkout = todayWorkouts.find((w: any) => w.dayId === day.id)
      || recentWorkouts.find((w: any) => w.dayId === day.id);
    const warmupNames = new Set((day.warmup || []).map((e: any) => e.name.toLowerCase()));
    const cooldownNames = new Set((day.cooldown || []).map((e: any) => e.name.toLowerCase()));
    const rawExLogs = (todayWorkout?.exercises || (todayWorkout as any)?.details?.exerciseLogs || []) as any[];
    const filteredExLogs = rawExLogs.filter(e => !warmupNames.has(e.name.toLowerCase()) && !cooldownNames.has(e.name.toLowerCase()));

    const workoutWeight = todayWorkout?.bodyweight || userWeight;
    const calculatedCalories = rawExLogs.length > 0
      ? calculateWorkoutCalories(null, rawExLogs, workoutWeight || 70, todayWorkout?.durationMin)
      : todayWorkout?.calories || 0;

    setDashboardShareData({
      dayTitle: day.title,
      planTitle: activePlan?.title || 'Training Plan',
      date: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      durationMin: todayWorkout?.durationMin || 0,
      volume: todayWorkout?.volume || 0,
      calories: calculatedCalories,
      exerciseNames: filteredExLogs.map((ex: any) => ex.name),
      exerciseLogs: filteredExLogs.map((ex: any) => ({ name: ex.name, sets: ex.sets || [], section: ex.section, muscleGroup: ex.muscleGroup })),
      bodyweight: workoutWeight || undefined,
    });
  };

  const handleShareActivity = (activity: Activity) => {
    const details = (activity.details as Record<string, any>) || {};
    const createdDate = activity.createdAt?.seconds
      ? new Date(activity.createdAt.seconds * 1000)
      : new Date();

    setDashboardShareData({
      dayTitle: details.dayTitle || activity.summary,
      planTitle: details.planTitle || 'Workout',
      date: createdDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      durationMin: details.durationMin || 0,
      volume: details.volume || 0,
      calories: details.calories || 0,
      exerciseNames: details.exercises || [],
      exerciseLogs: details.exerciseLogs || undefined,
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full">
      {/* 1. Hero */}
      <HeroDashboard
        displayName={profile.displayName}
        streak={streak}
        xp={xp}
        completedCount={completedCount}
        targetDays={targetDays}
        quote={getTodayQuote()}
      />

      {/* 2. Today's Focus */}
      <TodayFocusCard
        activePlan={activePlan}
        activeDays={activeDays}
        todayWorkouts={todayWorkouts}
        currentDayIndex={currentDayIndex}
        isActive={store.isActive}
        sessionProgress={sessionProgress}
      />

      {/* 3. Compact Stats */}
      <StatsPills
        totalWorkouts={totalWorkouts}
        totalCalories={totalCalories}
        totalHours={totalHours}
      />

      {/* 4. Weekly Timeline with Share Option */}
      <WeeklyTimeline
        activePlan={activePlan}
        activeDays={activeDays}
        todayWorkouts={todayWorkouts}
        recentWorkouts={currentWeekWorkouts}
        onShareDay={handleShareDay}
        isActive={store.isActive}
        sessionProgress={sessionProgress}
        activeSessionDayId={store.dayId}
      />

      {/* 5. XP & Achievements */}
      <XPPanel xp={xp} streak={streak} badges={badges} />

      {/* 6. Activity Feed */}
      <ActivityFeed activities={followersActivity} onShare={handleShareActivity} />

      {/* Share modal */}
      {dashboardShareData && (
        <ShareCardModal
          data={dashboardShareData}
          onClose={() => setDashboardShareData(null)}
        />
      )}
    </div>
  );
}
