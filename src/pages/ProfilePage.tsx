import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import {
  Calendar as CalendarIcon, Edit3, Save, X,
  Users as UsersIcon, UserPlus, UserMinus, Flag, Dumbbell, Flame, Clock, Trophy, Target,
  Scale, Award, Plus, Compass, Play, MessageSquare, Share2, Activity, ShieldAlert
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { useUserWeight } from '@/hooks/use-user-weight';
import { followUser, unfollowUser, isFollowing, getFollowCounts, getFollowers, getFollowing, getUsersByUids } from '@/services/social';
import type { Activity as ActivityType, UserProfile, UserStats } from '@/types';
import { createReport } from '@/services/admin';
import { getPublicWorkoutsForUser, getUserWorkouts } from '@/services/workouts';
import { clonePlan, getPublicPlansForUser, getPlanDays, getPlan } from '@/services/plans';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { calculateWorkoutCalories } from '@/lib/calories';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import { getUserSkills } from '@/services/skills';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const GENDERS = ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'];
const FITNESS_GOALS = ['', 'Build Muscle', 'Lose Fat', 'Get Stronger', 'Improve Endurance', 'Learn Skills', 'General Fitness'];
const WORKOUT_TYPES = ['', 'Calisthenics', 'Gym/Weights', 'Bodyweight', 'Mixed', 'Yoga', 'Running'];

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplayed(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  return <span>{displayed.toLocaleString()}{suffix}</span>;
}

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser, profile: myProfile, stats: myStats, updateProfile } = useAuthStore();
  const { showToast, units, theme } = useUIStore();

  const [viewProfile, setViewProfile] = useState<UserProfile | null>(null);
  const [viewStats, setViewStats] = useState<UserStats | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const latestWeight = useUserWeight(isOwnProfile ? currentUser?.uid : undefined, viewProfile?.weight || undefined);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<UserProfile & { bodyFat?: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [publicWorkouts, setPublicWorkouts] = useState<any[]>([]);
  const [publicPlans, setPublicPlans] = useState<any[]>([]);
  const [importingPlan, setImportingPlan] = useState<string | null>(null);
  const [profileShareData, setProfileShareData] = useState<ShareCardData | null>(null);

  // Theme support local properties mapping
  const themeStyles = theme === 'dark' ? {
    '--bg': '#090b12',
    '--card': '#121826',
    '--border': 'rgba(255,255,255,0.06)',
    '--text': '#f5f1e8',
    '--muted': '#8b92a5',
    '--teal': '#d7b29d',
    '--amber': '#d9a441',
  } as React.CSSProperties : {
    '--bg': '#f7f8fb',
    '--card': '#ffffff',
    '--border': '#e5e7eb',
    '--text': '#111827',
    '--muted': '#6b7280',
    '--teal': '#2f7a6d',
    '--amber': '#c98a1f',
  } as React.CSSProperties;

  // React Queries for Skills and Active Plan
  const { data: userSkills = [] } = useQuery({
    queryKey: ['userSkills', viewProfile?.uid],
    queryFn: () => getUserSkills(viewProfile!.uid),
    enabled: !!viewProfile?.uid,
  });

  const { data: activePlan } = useQuery({
    queryKey: ['plan', viewProfile?.activePlanId],
    queryFn: () => getPlan(viewProfile!.activePlanId!),
    enabled: !!viewProfile?.activePlanId,
  });

  const { data: planDays = [] } = useQuery({
    queryKey: ['planDays', viewProfile?.activePlanId],
    queryFn: () => getPlanDays(viewProfile!.activePlanId!),
    enabled: !!viewProfile?.activePlanId,
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (!username || (myProfile && username === myProfile.username)) {
        setViewProfile(myProfile);
        setViewStats(myStats);
        setIsOwnProfile(true);
      } else {
        try {
          const usernameDoc = await getDoc(doc(db, 'usernames', username));
          let uid = '';
          if (usernameDoc.exists()) {
            uid = usernameDoc.data().uid;
          } else {
            uid = username;
          }
          const profileDoc = await getDoc(doc(db, 'users', uid));
          const statsDoc = await getDoc(doc(db, 'users', uid, 'stats', 'current'));
          if (profileDoc.exists()) {
            setViewProfile({ uid, ...profileDoc.data() } as UserProfile);
            setViewStats(statsDoc.exists() ? statsDoc.data() as UserStats : null);
          }
          setIsOwnProfile(false);
        } catch (e) {
          console.error('Failed to load profile', e);
        }
      }
      setLoading(false);
    }
    load();
  }, [username, myProfile, myStats]);

  useEffect(() => {
    if (!viewProfile) return;
    if (isOwnProfile) {
      getUserWorkouts(viewProfile.uid, 20)
        .then((workouts) => setPublicWorkouts(workouts))
        .catch(error => console.error('Failed to load logged workouts', error));
    } else {
      Promise.all([getPublicWorkoutsForUser(viewProfile.uid, myProfile?.uid), getPublicPlansForUser(viewProfile.uid)])
        .then(([workouts, plans]) => { setPublicWorkouts(workouts); setPublicPlans(plans); })
        .catch(error => console.error('Failed to load public training data', error));
    }
  }, [viewProfile, isOwnProfile, myProfile?.uid]);

  const importPublicPlan = async (planId: string) => {
    if (!myProfile) return;
    setImportingPlan(planId);
    try {
      await clonePlan(planId, 'plans', myProfile.uid, myProfile.username);
      showToast('Plan imported into your plans');
    } catch (error: any) {
      showToast(error?.message || 'Could not import plan', 'error');
    } finally {
      setImportingPlan(null);
    }
  };

  const startEditing = () => {
    if (!viewProfile) return;
    setEditData({
      displayName: viewProfile.displayName,
      bio: viewProfile.bio,
      height: viewProfile.height,
      weight: viewProfile.weight,
      age: viewProfile.age,
      gender: viewProfile.gender,
      fitnessGoal: viewProfile.fitnessGoal,
      experienceLevel: viewProfile.experienceLevel,
      preferredWorkoutType: viewProfile.preferredWorkoutType,
      bodyFat: (viewProfile as any).bodyFat || null,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await updateProfile(editData);
      setEditing(false);
      showToast('Profile updated');
    } catch (e) {
      showToast('Failed to update profile', 'error');
    }
  };

  const submitReport = async () => {
    if (!myProfile || !viewProfile) return;
    setReporting(true);
    try {
      await createReport({ reporterId: myProfile.uid, reportedUserId: viewProfile.uid, reason: reportReason, details: reportDetails });
      setReportOpen(false);
      setReportDetails('');
      showToast('Report submitted for review');
    } catch (error: any) {
      showToast(error?.message || 'Could not submit report', 'error');
    } finally {
      setReporting(false);
    }
  };

  const handleShareWorkout = (activity: ActivityType) => {
    const details = (activity.details as Record<string, any>) || {};
    setProfileShareData({
      dayTitle: details.dayTitle || activity.summary,
      planTitle: details.planTitle || 'Training Plan',
      date: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      durationMin: details.durationMin || 0,
      volume: details.volume || 0,
      calories: details.calories || 0,
      exerciseNames: details.exercises || [],
      exerciseLogs: details.exerciseLogs || undefined,
    });
  };

  // Loading skeleton state
  if (loading) {
    return (
      <div style={themeStyles} className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-pulse bg-[var(--bg)] min-h-screen rounded-3xl">
        <div className="h-72 bg-slate-800/10 dark:bg-white/5 rounded-3xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-800/10 dark:bg-white/5 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-slate-800/10 dark:bg-white/5 rounded-3xl" />
          <div className="h-96 bg-slate-800/10 dark:bg-white/5 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!viewProfile) {
    return <div className="text-center py-20 text-bone-dim font-mono">User not found.</div>;
  }

  const p = editing ? { ...viewProfile, ...editData } as UserProfile : viewProfile;
  const stats = viewStats;

  const joinDate = viewProfile.createdAt?.toDate
    ? new Date(viewProfile.createdAt.toDate()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : 'Recently';

  // Completion score calculation
  const fields = [
    p.displayName,
    p.bio,
    p.height,
    p.weight,
    p.fitnessGoal,
    p.experienceLevel,
    p.preferredWorkoutType
  ];
  const filledCount = fields.filter(Boolean).length;
  const completionPercent = Math.round((filledCount / fields.length) * 100);

  // SVG Ring calculation
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionPercent / 100) * circumference;

  // Active plan stats
  const completedDaysCount = publicWorkouts.filter(w => w.planId === activePlan?.id).length;
  const totalDaysCount = planDays.length;

  // Skill progress mapping helper
  const getSkillProgress = (skillName: 'Handstand' | 'Front Lever' | 'L-Sit' | 'Planche') => {
    const skillsSet = new Set(userSkills);
    if (skillName === 'Handstand') {
      if (skillsSet.has('free_hs')) return 100;
      if (skillsSet.has('wall_hs')) return 50;
      return 15;
    }
    if (skillName === 'Front Lever') {
      if (skillsSet.has('full_fl')) return 100;
      if (skillsSet.has('adv_tuck_fl')) return 66;
      if (skillsSet.has('tuck_fl')) return 33;
      return 10;
    }
    if (skillName === 'L-Sit') {
      if (skillsSet.has('straddle_lsit')) return 100;
      if (skillsSet.has('tuck_lsit')) return 50;
      return 20;
    }
    if (skillName === 'Planche') {
      if (skillsSet.has('full_planche')) return 100;
      if (skillsSet.has('tuck_planche')) return 50;
      return 5;
    }
    return 0;
  };

  // BMI calculations
  const heightInMeters = (p.height || 0) / 100;
  const bmi = heightInMeters > 0 && p.weight ? (p.weight / (heightInMeters * heightInMeters)).toFixed(1) : '—';

  // Dynamic calories calculation
  let displayTotalCalories = stats?.totalCalories || 0;
  publicWorkouts.forEach((workout: any) => {
    const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
    if (rawExLogs.length > 0) {
      const dynamicCals = calculateWorkoutCalories(null, rawExLogs, workout.bodyweight || viewProfile?.weight || 70, workout.durationMin);
      const savedCals = workout.calories || 0;
      displayTotalCalories = displayTotalCalories - savedCals + dynamicCals;
    }
  });

  const calculatedLevel = stats ? Math.min(10, Math.floor((stats.xp || 0) / 500) + 1) : 1;

  return (
    <div style={themeStyles} className="bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 min-h-screen rounded-3xl border border-[var(--border)] p-4 sm:p-6 lg:p-8">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto space-y-6">
        
        {/* SECTION 1: ATHLETE HERO (WHOOP & Nike Run style) */}
        <motion.div variants={item} className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]/60 backdrop-blur-md p-6 sm:p-8 shadow-xl min-h-[280px] flex flex-col justify-between">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[var(--teal)]/10 blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-[var(--amber)]/10 blur-[100px] pointer-events-none" />
          
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-6 relative z-10 w-full">
            {/* Left: Avatar with completion ring & level badge */}
            <div className="relative w-28 h-28 mx-auto md:mx-0 flex items-center justify-center">
              <svg className="absolute w-full h-full -rotate-90">
                <circle cx="56" cy="56" r={radius} stroke="var(--border)" strokeWidth="3" fill="transparent" />
                <motion.circle 
                  cx="56" cy="56" r={radius} 
                  stroke="var(--teal)" strokeWidth="3.5" fill="transparent"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </svg>
              <img
                src={p.photoURL || getAvatarUrl(p.displayName, theme, 96)}
                alt={p.displayName}
                className="w-20 h-20 rounded-full object-cover relative z-10 border-2 border-[var(--card)]"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-1 right-3 w-4.5 h-4.5 rounded-full bg-emerald-500 border-2 border-[var(--card)] z-20" title="Online" />
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[var(--amber)] text-ink text-[10px] font-bold px-2 py-0.5 rounded-full z-20 shadow">
                LV {calculatedLevel}
              </div>
            </div>

            {/* Center: Info */}
            <div className="text-center md:text-left flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1 justify-center md:justify-start">
                <h1 className="font-serif text-3xl font-normal leading-tight">{p.displayName}</h1>
                {p.experienceLevel && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[var(--teal)]/10 text-[var(--teal)] border border-[var(--teal)]/20 mt-1 sm:mt-0 self-center">
                    {p.experienceLevel}
                  </span>
                )}
              </div>
              <div className="text-sm font-mono text-[var(--teal)] mb-3">@{p.username}</div>
              
              {editing ? (
                <textarea
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)] placeholder-slate-500 mb-3"
                  placeholder="Write an athletic bio..."
                  value={editData.bio || ''}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                />
              ) : (
                p.bio && <p className="text-sm text-[var(--muted)] leading-relaxed mb-3 max-w-xl">{p.bio}</p>
              )}

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-mono text-[var(--muted)]">
                <span className="flex items-center gap-1"><CalendarIcon size={12} /> Joined {joinDate}</span>
                <span>•</span>
                <span>Level {calculatedLevel}</span>
                <span>•</span>
                <span>{stats?.xp || 0} XP</span>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex flex-row md:flex-col gap-2 flex-none justify-center w-full md:w-auto">
              {isOwnProfile ? (
                editing ? (
                  <>
                    <button onClick={saveEdit} className="btn-primary py-2.5 px-5 flex items-center justify-center gap-1.5 text-xs w-full">
                      <Save size={14} /> Save
                    </button>
                    <button onClick={() => setEditing(false)} className="btn-secondary py-2.5 px-5 flex items-center justify-center gap-1.5 text-xs w-full">
                      <X size={14} /> Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setProfileShareData({
                      dayTitle: `${p.displayName}'s Profile`,
                      planTitle: 'Apparatus Athlete',
                      date: new Date().toLocaleDateString(),
                      durationMin: Math.round((stats?.totalDurationMin || 0) / 60),
                      volume: stats?.totalVolume || 0,
                      calories: displayTotalCalories,
                      exerciseNames: ['Total Workouts: ' + (stats?.totalWorkouts || 0)],
                    })} className="btn-primary py-2.5 px-5 flex items-center justify-center gap-1.5 text-xs w-full">
                      <Share2 size={14} /> Share Profile
                    </button>
                  </>
                )
              ) : (
                <>
                  <FollowButton myUid={myProfile!.uid} targetUid={viewProfile.uid} />
                  <button onClick={() => setReportOpen(true)} className="btn-secondary py-2.5 px-5 flex items-center justify-center gap-1.5 text-xs w-full text-red-500 hover:text-red-600">
                    <Flag size={14} /> Report
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bottom: Follow metrics & core stats inside Hero */}
          <div className="mt-8 border-t border-[var(--border)] pt-4 flex flex-wrap justify-between items-center gap-4 relative z-10 w-full">
            <div className="flex gap-6">
              <FollowCountDisplay uid={viewProfile.uid} />
            </div>
            <div className="flex gap-5 text-xs font-mono text-[var(--muted)]">
              <div>
                <span className="text-[var(--text)] font-bold text-sm block">{stats?.totalWorkouts || 0}</span> workouts
              </div>
              <div className="w-[1px] h-6 bg-[var(--border)] self-center" />
              <div>
                <span className="text-[var(--text)] font-bold text-sm block">{stats?.currentStreak || 0}d</span> streak
              </div>
              <div className="w-[1px] h-6 bg-[var(--border)] self-center" />
              <div>
                <span className="text-[var(--text)] font-bold text-sm block">{completionPercent}%</span> completion
              </div>
            </div>
          </div>
        </motion.div>

        {/* SECTION 2: STATS ROW */}
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Workouts', value: stats?.totalWorkouts || 0, emoji: '🔥', color: 'from-[#ff6b6b]/10 to-transparent' },
            { label: 'Calories', value: Math.round(displayTotalCalories), emoji: '⚡', color: 'from-[#ffbe0b]/10 to-transparent' },
            { label: 'Hours', value: Math.round((stats?.totalDurationMin || 0) / 60), emoji: '⏱', color: 'from-[#4ea8de]/10 to-transparent', suffix: 'h' },
            { label: 'Level', value: calculatedLevel, emoji: '🏆', color: 'from-[#ffd166]/10 to-transparent' },
          ].map(card => (
            <motion.div
              key={card.label}
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex items-center justify-between shadow-md relative overflow-hidden bg-gradient-to-br ${card.color}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl w-10 h-10 rounded-xl bg-[var(--bg)] flex items-center justify-center shadow-inner">
                  {card.emoji}
                </span>
                <div>
                  <div className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">{card.label}</div>
                  <div className="text-xl font-bold font-mono text-[var(--text)] mt-0.5">
                    <AnimatedCounter value={card.value} suffix={card.suffix} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* PROFILE DETAIL EDITING EXPANSION */}
        {editing && (
          <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg">
            <h3 className="font-serif text-lg text-[var(--text)] mb-4">Edit Personal Metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Height (cm)</label>
                <input
                  type="number"
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.height ?? ''}
                  onChange={(e) => setEditData({ ...editData, height: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <input
                  type="number"
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.weight ?? ''}
                  onChange={(e) => setEditData({ ...editData, weight: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Body Fat (%)</label>
                <input
                  type="number"
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.bodyFat ?? ''}
                  onChange={(e) => setEditData({ ...editData, bodyFat: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Age</label>
                <input
                  type="number"
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.age ?? ''}
                  onChange={(e) => setEditData({ ...editData, age: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Gender</label>
                <select
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.gender || ''}
                  onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
                >
                  {GENDERS.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fitness Goal</label>
                <select
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.fitnessGoal || ''}
                  onChange={(e) => setEditData({ ...editData, fitnessGoal: e.target.value })}
                >
                  {FITNESS_GOALS.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Preferred Workout</label>
                <select
                  className="input-field bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                  value={editData.preferredWorkoutType || ''}
                  onChange={(e) => setEditData({ ...editData, preferredWorkoutType: e.target.value })}
                >
                  {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        )}

        {/* TWO COLUMN GRID FOR CONTENT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANEL: TIMELINE & PROGRESS POSTS */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* SECTION 7: ACTIVITY TIMELINE */}
            <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="text-[var(--teal)]" size={18} />
                <h3 className="font-serif text-lg tracking-tight">Athlete Journey Timeline</h3>
              </div>

              {publicWorkouts.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-2xl">
                  <Dumbbell className="mx-auto text-[var(--muted)] mb-3 opacity-40" size={32} />
                  <p className="text-sm text-[var(--muted)]">No workouts logged yet. Start training to kick off your timeline!</p>
                </div>
              ) : (
                <div className="relative pl-6 border-l border-[var(--border)] space-y-8">
                  {publicWorkouts.slice(0, 5).map((workout, idx) => {
                    const relativeTime = getRelativeTime(workout.date || new Date().toISOString());
                    return (
                      <div key={workout.id || idx} className="relative">
                        {/* Timeline node dot */}
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-[var(--card)] border-2 border-[var(--teal)] flex items-center justify-center z-10">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] animate-pulse" />
                        </div>

                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-[var(--muted)] font-bold">{relativeTime}</span>
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--teal)]/10 text-[var(--teal)]">Logged</span>
                          </div>
                          <h4 className="font-semibold text-sm text-[var(--text)] mt-1">{workout.dayTitle || 'Workout Day Completed'}</h4>
                          {workout.planTitle && (
                            <p className="text-xs text-[var(--muted)] mt-0.5">Part of the <span className="font-medium text-[var(--text)]">{workout.planTitle}</span> plan</p>
                          )}
                          {workout.exercises && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {workout.exercises.map((ex: any, i: number) => (
                                <span key={i} className="text-[10px] font-mono bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded text-[var(--muted)]">
                                  {typeof ex === 'string' ? ex : ex.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* EXPANDED FEED POSTS */}
            <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-mono text-[10px] text-[var(--teal)] tracking-widest uppercase">
                    {isOwnProfile ? 'TRAINING HISTORY' : 'PUBLIC TRAINING'}
                  </div>
                  <h3 className="font-serif text-lg tracking-tight mt-1">
                    {isOwnProfile ? 'Your Logged Workouts' : 'Public Workout Posts'}
                  </h3>
                </div>
              </div>

              {!isOwnProfile && publicPlans.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Public templates</h4>
                  <div className="space-y-2">
                    {publicPlans.map(plan => (
                      <div key={plan.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                        <div>
                          <div className="font-semibold text-sm text-[var(--text)]">{plan.title}</div>
                          <div className="text-xs text-[var(--muted)] mt-0.5">{plan.daysPerWeek || 0} days/week · {plan.description || 'Training plan'}</div>
                        </div>
                        <button className="btn-secondary text-xs" disabled={importingPlan === plan.id} onClick={() => importPublicPlan(plan.id)}>
                          {importingPlan === plan.id ? 'Importing...' : 'Import plan'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {publicWorkouts.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No workouts logged yet.</p>
              ) : (
                <div className="space-y-4">
                  {publicWorkouts.slice(0, 10).map(workout => {
                    const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                    const exerciseNamesList = rawExLogs.map((e: any) => typeof e === 'string' ? e : e.name);

                    const activityItem: ActivityType = {
                      id: workout.id,
                      userId: viewProfile.uid,
                      userName: viewProfile.displayName,
                      userPhoto: viewProfile.photoURL,
                      username: viewProfile.username,
                      type: 'workout',
                      workoutId: workout.id,
                      visibility: 'public',
                      likesCount: workout.likesCount || 0,
                      commentsCount: workout.commentsCount || 0,
                      summary: workout.dayTitle || 'Workout',
                      details: {
                        dayTitle: workout.dayTitle || 'Workout',
                        planTitle: workout.planTitle || 'Personal Session',
                        durationMin: workout.durationMin || 0,
                        volume: workout.volume || 0,
                        calories: workout.calories || 0,
                        exercises: exerciseNamesList,
                        exerciseLogs: rawExLogs,
                        bodyweight: workout.bodyweight || viewProfile.weight,
                        skill: workout.skill,
                      },
                      createdAt: workout.createdAt || { seconds: workout.date ? Math.floor(new Date(workout.date).getTime() / 1000) : Math.floor(Date.now() / 1000) },
                    };

                    return (
                      <ActivityPostCard
                        key={workout.id}
                        activity={activityItem}
                        onShare={handleShareWorkout}
                      />
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>

          {/* RIGHT PANEL: PERFORMANCE & METRICS */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* SECTION 3: CURRENT PLAN CARD */}
            {activePlan ? (
              <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md relative overflow-hidden bg-gradient-to-br from-[var(--teal)]/5 to-transparent">
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[var(--teal)]/10 blur-[40px] pointer-events-none" />
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--teal)] mb-1">Active Plan</div>
                <h3 className="font-serif text-lg tracking-tight text-[var(--text)] mb-3">{activePlan.title}</h3>
                
                <div className="flex justify-between items-center text-xs text-[var(--muted)] font-mono mb-2">
                  <span>Progress</span>
                  <span className="font-semibold text-[var(--text)]">{completedDaysCount} / {totalDaysCount || 6} days completed</span>
                </div>
                
                <div className="w-full h-2 bg-[var(--bg)] rounded-full overflow-hidden mb-5 border border-[var(--border)]">
                  <div 
                    className="h-full bg-[var(--teal)] rounded-full" 
                    style={{ width: `${Math.min(100, (completedDaysCount / (totalDaysCount || 6)) * 100)}%` }} 
                  />
                </div>

                {isOwnProfile && (
                  <Link
                    to={`/workout/${activePlan.id}/day/${planDays[completedDaysCount % (planDays.length || 1)]?.id || ''}`}
                    className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <Play size={14} fill="currentColor" /> Continue Workout
                  </Link>
                )}
              </motion.div>
            ) : (
              <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md text-center">
                <ShieldAlert size={28} className="mx-auto text-[var(--muted)] mb-2" />
                <h3 className="font-semibold text-sm text-[var(--text)]">No Active Program</h3>
                <p className="text-xs text-[var(--muted)] mt-1 mb-4">Jump into the explorer and load a calisthenics target plan.</p>
                {isOwnProfile && (
                  <Link to="/explore" className="btn-secondary w-full py-2 text-xs">
                    Find Programs
                  </Link>
                )}
              </motion.div>
            )}

            {/* SECTION 4: SKILLS CARD (WHOOP-style roadmap) */}
            <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md">
              <div className="flex items-center gap-2 mb-4">
                <Target className="text-[var(--amber)]" size={16} />
                <h3 className="font-serif text-base tracking-tight">Performance Progressions</h3>
              </div>
              <div className="space-y-4">
                {[
                  { name: 'Handstand', val: getSkillProgress('Handstand'), color: 'bg-indigo-500' },
                  { name: 'Front Lever', val: getSkillProgress('Front Lever'), color: 'bg-emerald-500' },
                  { name: 'L-Sit', val: getSkillProgress('L-Sit'), color: 'bg-amber-500' },
                  { name: 'Planche', val: getSkillProgress('Planche'), color: 'bg-rose-500' },
                ].map(skill => (
                  <div key={skill.name}>
                    <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                      <span className="font-medium text-[var(--text)]">{skill.name}</span>
                      <span className="text-[var(--muted)]">{skill.val}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--bg)] rounded-full overflow-hidden border border-[var(--border)]">
                      <motion.div 
                        className={`h-full ${skill.color} rounded-full`}
                        initial={{ width: 0 }}
                        animate={{ width: `${skill.val}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* SECTION 5: BODY METRICS */}
            <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="text-[var(--teal)]" size={16} />
                <h3 className="font-serif text-base tracking-tight">Athlete Biometrics</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Weight', value: p.weight ? `${p.weight} kg` : '—' },
                  { label: 'Height', value: p.height ? `${p.height} cm` : '—' },
                  { label: 'BMI', value: bmi },
                  { label: 'Body Fat', value: (p as any).bodyFat ? `${(p as any).bodyFat}%` : '—' },
                ].map(metric => (
                  <div key={metric.label} className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-wider">{metric.label}</div>
                    <div className="text-base font-bold font-mono text-[var(--text)] mt-1">{metric.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* SECTION 6: ACHIEVEMENTS / BADGES */}
            <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md">
              <div className="flex items-center gap-2 mb-4">
                <Award className="text-[var(--amber)]" size={16} />
                <h3 className="font-serif text-base tracking-tight">Achievements Unlocked</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: `${stats?.currentStreak || 0} day streak`, desc: 'Streak Badge', emoji: '🔥', active: (stats?.currentStreak || 0) >= 3 },
                  { title: 'First Workout', desc: 'Arrived Ready', emoji: '🏋', active: (stats?.totalWorkouts || 0) >= 1 },
                  { title: '100 Pullups', desc: 'Iron Pulls', emoji: '💪', active: (stats?.totalVolume || 0) >= 1000 },
                  { title: `${p.experienceLevel || 'Beginner'} Badge`, desc: 'Experience Award', emoji: '🏆', active: true },
                ].map(item => (
                  <div 
                    key={item.title} 
                    className={`border rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[96px] transition-all duration-200 ${
                      item.active 
                        ? 'bg-[var(--bg)] border-[var(--teal)]/30 text-[var(--text)]' 
                        : 'bg-[var(--bg)]/40 border-[var(--border)] text-[var(--muted)] opacity-50'
                    }`}
                  >
                    <span className="text-xl">{item.emoji}</span>
                    <div className="mt-2">
                      <div className="text-xs font-bold truncate max-w-full leading-tight">{item.title}</div>
                      <div className="text-[9px] font-mono text-[var(--muted)] truncate max-w-full leading-none mt-1">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

        </div>

      </motion.div>

      {/* REPORT CONSOLE */}
      {reportOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 w-full max-w-md z-10 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <div className="font-mono text-[10px] text-red-500 tracking-widest">COMMUNITY SAFETY</div>
                <h2 className="font-serif text-xl text-[var(--text)] mt-1">Report @{viewProfile.username}</h2>
              </div>
              <button onClick={() => setReportOpen(false)} className="p-1.5 hover:bg-[var(--bg)] rounded-lg transition-colors text-[var(--muted)] hover:text-[var(--text)]"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Reason</label>
                <select value={reportReason} onChange={event => setReportReason(event.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)] text-[var(--text)]">
                  <option value="spam">Spam or scam</option>
                  <option value="harassment">Harassment</option>
                  <option value="unsafe">Unsafe content</option>
                  <option value="impersonation">Impersonation</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Details</label>
                <textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)] text-[var(--text)] min-h-24 resize-none" placeholder="What should an admin review?" />
              </div>
              <button onClick={submitReport} disabled={reporting} className="btn-danger w-full py-2.5 font-bold uppercase tracking-wider text-xs bg-red-600 hover:bg-red-700 text-white rounded-xl">
                {reporting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileShareData && (
        <ShareCardModal
          data={profileShareData}
          onClose={() => setProfileShareData(null)}
        />
      )}
    </div>
  );
}

// ─── Follow Button ──────────────────────────────────────
function FollowButton({ myUid, targetUid }: { myUid: string; targetUid: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();

  const { data: following = false } = useQuery({
    queryKey: ['isFollowing', myUid, targetUid],
    queryFn: () => isFollowing(myUid, targetUid),
  });

  const mutation = useMutation({
    mutationFn: () => following ? unfollowUser(myUid, targetUid) : followUser(myUid, targetUid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', myUid, targetUid] });
      queryClient.invalidateQueries({ queryKey: ['followCounts', targetUid] });
      queryClient.invalidateQueries({ queryKey: ['followCounts', myUid] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      queryClient.invalidateQueries({ queryKey: ['followList'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast(following ? 'Unfollowed' : 'Following!');
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className={`flex items-center justify-center gap-1.5 text-xs py-2.5 px-5 rounded-xl font-mono transition-all w-full ${
        following ? 'bg-[var(--border)] border border-[var(--border)] hover:bg-red-600/10 hover:text-red-500 text-[var(--text)]' : 'btn-primary'
      }`}
    >
      {following ? <><UserMinus size={14} /> Unfollow</> : <><UserPlus size={14} /> Follow</>}
    </button>
  );
}

// ─── Follow Counts ──────────────────────────────────────
function FollowCountDisplay({ uid }: { uid: string }) {
  const [modalType, setModalType] = useState<'followers' | 'following' | null>(null);

  const { data: counts } = useQuery({
    queryKey: ['followCounts', uid],
    queryFn: () => getFollowCounts(uid),
  });

  return (
    <div className="flex gap-6">
      <button onClick={() => setModalType('followers')} className="hover:opacity-75 transition-opacity flex gap-1.5 items-baseline">
        <span className="font-bold font-mono text-[var(--text)] text-base">{counts?.followers || 0}</span>
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-mono">Followers</span>
      </button>
      <button onClick={() => setModalType('following')} className="hover:opacity-75 transition-opacity flex gap-1.5 items-baseline">
        <span className="font-bold font-mono text-[var(--text)] text-base">{counts?.following || 0}</span>
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-mono">Following</span>
      </button>

      <FollowListModal
        uid={uid}
        type={modalType}
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
      />
    </div>
  );
}

// ─── Follow List Modal ──────────────────────────────────
function FollowListModal({ uid, type, isOpen, onClose }: { uid: string, type: 'followers' | 'following' | null, isOpen: boolean, onClose: () => void }) {
  const { theme } = useUIStore();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['followList', uid, type],
    queryFn: async () => {
      if (!type) return [];
      const uids = type === 'followers' ? await getFollowers(uid) : await getFollowing(uid);
      if (uids.length === 0) return [];
      return getUsersByUids(uids);
    },
    enabled: isOpen && !!type,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden text-[var(--text)]">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="font-serif text-lg capitalize">{type}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg)] rounded-lg transition-colors text-[var(--muted)] hover:text-[var(--text)]">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-[var(--muted)] text-sm">
              No {type} yet.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.uid} className="flex items-center gap-3">
                  <Link to={`/profile/${u.username}`} onClick={onClose}>
                    <img
                      src={u.photoURL || getAvatarUrl(u.displayName, theme)}
                      alt={u.displayName}
                      className="w-10 h-10 rounded-full object-cover border border-[var(--teal)]/40"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/profile/${u.username}`} onClick={onClose} className="font-bold text-sm block truncate hover:text-[var(--teal)] transition-colors">
                      {u.displayName}
                    </Link>
                    <div className="text-xs text-[var(--muted)] font-mono truncate">@{u.username}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  
  // Set times to midnight to calculate pure days difference
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffTime = nowMidnight.getTime() - dateMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
