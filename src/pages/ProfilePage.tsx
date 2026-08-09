import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, Grid, BarChart3, Settings, Edit3, Heart, Target, TrendingUp, Flame, Droplets, MapPin, Search, Calendar, UserPlus, Users, Link as LinkIcon, Camera, Key, MessageSquare, X, Shield, Lock, Unlock, LogOut, Check, Share2, Save, Flag, Activity, Dumbbell, Scale, Award, UserMinus } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { useUserWeight } from '@/hooks/use-user-weight';
import { followUser, unfollowUser, isFollowing, getFollowCounts, getFollowers, getFollowing, getUsersByUids, getBookmarkedActivities } from '@/services/social';
import type { Activity as ActivityType, UserProfile, UserStats } from '@/types';
import { createReport } from '@/services/admin';
import { getPublicWorkoutsForUser, getUserWorkouts } from '@/services/workouts';
import { getUserCardioActivities } from '@/services/cardio';
import { clonePlan, getPublicPlansForUser, getPlanDays, getPlan } from '@/services/plans';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { calculateWorkoutCalories } from '@/lib/calories';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import { getUserSkills } from '@/services/skills';
import { getUserEventRegistrations, getEventsByIds, getUserCommunities } from '@/services/events';
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
  const [cardioShareData, setCardioShareData] = useState<CardioShareData | null>(null);
  const [feedTab, setFeedTab] = useState<'activity' | 'communities' | 'posts' | 'bookmarks' | 'events'>('activity');
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  const { data: bookmarkedPosts = [] } = useQuery({
    queryKey: ['bookmarkedPosts', viewProfile?.bookmarks],
    queryFn: () => getBookmarkedActivities(viewProfile?.bookmarks || []),
    enabled: isOwnProfile && !!viewProfile?.bookmarks?.length,
  });

  const { data: userEvents = [] } = useQuery({
    queryKey: ['userEvents', viewProfile?.uid],
    queryFn: async () => {
      if (!viewProfile?.uid) return [];
      const registrations = await getUserEventRegistrations(viewProfile.uid);
      if (!registrations.length) return [];
      const eventIds = registrations.map((r: any) => r.eventId);
      return await getEventsByIds(eventIds);
    },
    enabled: isOwnProfile && !!viewProfile?.uid && feedTab === 'events',
  });

  const { data: userCommunities = [] } = useQuery({
    queryKey: ['userCommunities', viewProfile?.uid],
    queryFn: () => getUserCommunities(viewProfile!.uid),
    enabled: isOwnProfile && !!viewProfile?.uid && feedTab === 'communities',
  });

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
    
    const fetchAllActivities = async () => {
      try {
        let gymWorkouts = [];
        let cardioLogs = [];
        let plans = [];

        if (isOwnProfile) {
          [gymWorkouts, cardioLogs] = await Promise.all([
            getUserWorkouts(viewProfile.uid, 20),
            getUserCardioActivities(viewProfile.uid, 10)
          ]);
        } else {
          [gymWorkouts, plans, cardioLogs] = await Promise.all([
            getPublicWorkoutsForUser(viewProfile.uid, myProfile?.uid),
            getPublicPlansForUser(viewProfile.uid),
            getUserCardioActivities(viewProfile.uid, 10)
          ]);
          setPublicPlans(plans);
        }

        // Merge and sort
        const merged = [...gymWorkouts, ...cardioLogs].sort((a: any, b: any) => {
          const timeA = a.createdAt?.seconds || (a.date ? Math.floor(new Date(a.date).getTime() / 1000) : 0);
          const timeB = b.createdAt?.seconds || (b.date ? Math.floor(new Date(b.date).getTime() / 1000) : 0);
          return timeB - timeA;
        });

        setPublicWorkouts(merged);
      } catch (error) {
        console.error('Failed to load training data', error);
      }
    };

    fetchAllActivities();
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

  function getRelativeTime(dateString: string) {
    const date = new Date(dateString);
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }

  return (
    <div style={themeStyles} className="bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 min-h-screen rounded-3xl border border-[var(--border)] p-4 sm:p-6 lg:p-8">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto space-y-6">
        
        {/* SECTION 1: ATHLETE HERO (WHOOP & Nike Run style) */}
        <motion.div variants={item} className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]/60 backdrop-blur-md p-6 sm:p-8 shadow-xl min-h-[280px] flex flex-col justify-between">
          {/* Share icon — top right */}
          {isOwnProfile && !editing && (
            <button
              onClick={async () => {
                const profileUrl = `${window.location.origin}/profile/${p.username}`;
                try {
                  if (navigator.share) {
                    await navigator.share({ title: `${p.displayName} on Apparatus`, url: profileUrl });
                  } else {
                    await navigator.clipboard.writeText(profileUrl);
                    useUIStore.getState().showToast('Profile link copied!', 'success');
                  }
                } catch {
                  // user cancelled share
                }
              }}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--bg)] transition-colors"
              title="Share Profile"
            >
              <Share2 size={18} className="text-[#5d2a1a] dark:text-[#d7b29d]" />
            </button>
          )}
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
                <span className="flex items-center gap-1"><Calendar size={12} /> Joined {joinDate}</span>
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
                ) : null
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
                <CustomSelect
                  className="w-full"
                  value={editData.gender || ''}
                  onChange={(val) => setEditData({ ...editData, gender: val })}
                  options={GENDERS.map(g => ({ value: g, label: g || '—' }))}
                />
              </div>
              <div>
                <label className="label">Fitness Goal</label>
                <CustomSelect
                  className="w-full"
                  value={editData.fitnessGoal || ''}
                  onChange={(val) => setEditData({ ...editData, fitnessGoal: val })}
                  options={FITNESS_GOALS.map(g => ({ value: g, label: g || '—' }))}
                />
              </div>
              <div>
                <label className="label">Preferred Workout</label>
                <CustomSelect
                  className="w-full"
                  value={editData.preferredWorkoutType || ''}
                  onChange={(val) => setEditData({ ...editData, preferredWorkoutType: val })}
                  options={WORKOUT_TYPES.map(t => ({ value: t, label: t || '—' }))}
                />
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
                  {publicWorkouts.slice(0, showAllTimeline ? publicWorkouts.length : 2).map((workout, idx) => {
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
                          <h4 className="font-semibold text-sm text-[var(--text)] mt-1">
                            {workout.type === 'run' ? 'Running Session' : 
                             workout.type === 'cycle' ? 'Cycling Session' : 
                             workout.type === 'walk' ? 'Walking Session' : 
                             workout.dayTitle || 'Workout Day Completed'}
                          </h4>
                          {workout.planTitle && (
                            <p className="text-xs text-[var(--muted)] mt-0.5">Part of the <span className="font-medium text-[var(--text)]">{workout.planTitle}</span> plan</p>
                          )}
                          
                          {workout.distanceKm !== undefined ? (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="flex items-center gap-1 text-[10px] font-mono bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded text-[var(--muted)]">
                                {workout.distanceKm.toFixed(2)} km
                              </span>
                              <span className="flex items-center gap-1 text-[10px] font-mono bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded text-[var(--muted)]">
                                {Math.floor((workout.durationSec || 0) / 60)} min
                              </span>
                              {workout.calories > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-mono bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded text-[var(--muted)]">
                                  {workout.calories} kcal
                                </span>
                              )}
                            </div>
                          ) : workout.exercises && (
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
                  {publicWorkouts.length > 2 && (
                    <button
                      onClick={() => setShowAllTimeline(!showAllTimeline)}
                      className="w-full py-2.5 mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors text-xs font-semibold uppercase tracking-wider"
                    >
                      {showAllTimeline ? 'Show Less' : `Show ${publicWorkouts.length - 2} More Timeline Events`}
                    </button>
                  )}
                </div>
              )}
            </motion.div>

            {/* EXPANDED FEED POSTS */}
            <motion.div variants={item} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-mono text-[10px] text-[var(--teal)] tracking-widest uppercase">
                    {isOwnProfile ? 'YOUR LIBRARY' : 'PUBLIC TRAINING'}
                  </div>
                  <h3 className="font-serif text-lg tracking-tight mt-1">
                    {isOwnProfile ? 'Activity & Bookmarks' : 'Public Workout Posts'}
                  </h3>
                </div>
              </div>

              {isOwnProfile && (
                <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-4 border-b border-[var(--border)] pb-2">
                  <button
                    onClick={() => setFeedTab('posts')}
                    className={`flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${feedTab === 'posts' ? 'bg-[var(--teal)] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
                  >
                    Your Posts
                  </button>
                  <button
                    onClick={() => setFeedTab('bookmarks')}
                    className={`flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${feedTab === 'bookmarks' ? 'bg-[var(--teal)] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
                  >
                    Saved Bookmarks
                  </button>
                  <button
                    onClick={() => setFeedTab('events')}
                    className={`flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${feedTab === 'events' ? 'bg-[var(--teal)] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
                  >
                    My Events
                  </button>
                  <button
                    onClick={() => setFeedTab('communities')}
                    className={`flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${feedTab === 'communities' ? 'bg-[var(--teal)] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
                  >
                    My Communities
                  </button>
                </div>
              )}

              {feedTab === 'bookmarks' && isOwnProfile ? (
                bookmarkedPosts.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No bookmarks saved yet. Save posts from the activity feed.</p>
                ) : (
                  <div className="space-y-4">
                    {bookmarkedPosts.map(activity => (
                      <ActivityPostCard
                        key={activity.id}
                        activity={activity}
                        onShare={(act) => {
                          const isCardio = act.type === 'walk' || act.type === 'run' || act.type === 'cycle' || ['walk', 'run', 'cycle'].includes((act.details as any)?.activityType);
                          if (isCardio) {
                            setCardioShareData({
                              type: (act.details as any)?.activityType || 'walk',
                              date: new Date().toISOString(),
                              distanceKm: (act.details as any)?.distanceKm || 0,
                              durationSec: (act.details as any)?.durationSec || 0,
                              calories: (act.details as any)?.calories || 0,
                              avgPace: (act.details as any)?.avgPace || '0:00 /km',
                              route: (act.details as any)?.route || [],
                            });
                          } else {
                            setProfileShareData({
                              dayTitle: (act.details as any)?.dayTitle || act.summary || 'Workout',
                              planTitle: (act.details as any)?.planTitle || 'Personal Session',
                              date: new Date().toISOString(),
                              durationMin: (act.details as any)?.durationMin || 0,
                              calories: (act.details as any)?.calories || 0,
                              volume: (act.details as any)?.volume || 0,
                              exerciseNames: (act.details as any)?.exercises || [],
                              exerciseLogs: (act.details as any)?.exerciseLogs || [],
                              bodyweight: (act.details as any)?.bodyweight,
                            });
                          }
                        }}
                      />
                    ))}
                  </div>
                )
              ) : feedTab === 'events' && isOwnProfile ? (
                userEvents.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No registered events yet. Find events in the Community section.</p>
                ) : (
                  <div className="space-y-4">
                    {userEvents.map((event: any) => (
                      <div key={event.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] flex items-start gap-4">
                        <img src={event.banner || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop'} alt="" className="w-16 h-16 rounded-xl object-cover" />
                        <div>
                          <h4 className="font-semibold text-[var(--text)]">{event.title}</h4>
                          <p className="text-xs text-[var(--muted)] line-clamp-2 mt-1">{event.description}</p>
                          <Link to="/events" className="text-[var(--teal)] text-xs font-semibold inline-block mt-2 hover:underline">View in Events</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : feedTab === 'communities' && isOwnProfile ? (
                userCommunities.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Not a member of any communities yet.</p>
                ) : (
                  <div className="space-y-4">
                    {userCommunities.map((community: any) => (
                      <div key={community.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] flex items-center gap-4">
                        <img src={community.avatarUrl || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop'} alt="" className="w-12 h-12 rounded-xl object-cover" />
                        <div>
                          <h4 className="font-semibold text-[var(--text)]">{community.name}</h4>
                          <p className="text-xs text-[var(--muted)]">{community.membersCount} Members</p>
                          <Link to="/communities" className="text-[var(--teal)] text-xs font-semibold inline-block mt-1 hover:underline">View in Communities</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <>
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
                  {publicWorkouts.slice(0, showAllActivities ? publicWorkouts.length : 1).map(workout => {
                    const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                    const exerciseNamesList = rawExLogs.map((e: any) => typeof e === 'string' ? e : e.name);

                      const isCardio = workout.type === 'walk' || workout.type === 'run' || workout.type === 'cycle' || ['walk', 'run', 'cycle'].includes((workout.details as any)?.activityType);
                      
                      const activityItem: ActivityType = isCardio ? {
                        id: workout.id,
                        userId: viewProfile.uid,
                        userName: viewProfile.displayName,
                        userPhoto: viewProfile.photoURL,
                        username: viewProfile.username,
                        type: workout.type,
                        workoutId: null,
                        visibility: workout.visibility,
                        likesCount: workout.likesCount || 0,
                        commentsCount: workout.commentsCount || 0,
                        summary: `Completed a ${workout.distanceKm?.toFixed(2)} km ${workout.type}`,
                        details: {
                          activityType: workout.type,
                          distanceKm: workout.distanceKm,
                          durationSec: workout.durationSec,
                          calories: workout.calories,
                          avgPace: workout.avgPace,
                          route: workout.route,
                        },
                        createdAt: workout.startedAt || workout.createdAt || { seconds: workout.date ? Math.floor(new Date(workout.date).getTime() / 1000) : Math.floor(Date.now() / 1000) },
                      } : {
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
                        onShare={(act) => {
                          const isCardioOnShare = act.type === 'walk' || act.type === 'run' || act.type === 'cycle' || ['walk', 'run', 'cycle'].includes((act.details as any)?.activityType);
                          if (isCardioOnShare) {
                            setCardioShareData({
                              type: (act.details as any)?.activityType || 'walk',
                              date: workout.date || new Date().toISOString(),
                              distanceKm: (act.details as any)?.distanceKm || 0,
                              durationSec: (act.details as any)?.durationSec || 0,
                              calories: (act.details as any)?.calories || 0,
                              avgPace: (act.details as any)?.avgPace || '0:00 /km',
                              route: (act.details as any)?.route || [],
                            });
                          } else {
                            setProfileShareData({
                              dayTitle: (act.details as any)?.dayTitle || act.summary || 'Workout',
                              planTitle: (act.details as any)?.planTitle || 'Personal Session',
                              date: workout.date || new Date().toISOString(),
                              durationMin: (act.details as any)?.durationMin || 0,
                              calories: (act.details as any)?.calories || 0,
                              volume: (act.details as any)?.volume || 0,
                              exerciseNames: (act.details as any)?.exercises || [],
                              exerciseLogs: (act.details as any)?.exerciseLogs || [],
                              bodyweight: (act.details as any)?.bodyweight,
                            });
                          }
                        }}
                      />
                    );
                  })}
                  {publicWorkouts.length > 1 && (
                    <button
                      onClick={() => setShowAllActivities(!showAllActivities)}
                      className="w-full py-3 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors text-xs font-semibold uppercase tracking-wider"
                    >
                      {showAllActivities ? 'Show Less' : `Show ${publicWorkouts.length - 1} More Activities`}
                    </button>
                  )}
                </div>
              )}
                </>
              )}
            </motion.div>
          </div>

            {/* RIGHT PANEL: PERFORMANCE & METRICS */}
          <div className="lg:col-span-4 space-y-6">

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
                <CustomSelect
                  className="w-full"
                  value={reportReason}
                  onChange={setReportReason}
                  options={[
                    { value: 'spam', label: 'Spam or scam' },
                    { value: 'harassment', label: 'Harassment' },
                    { value: 'unsafe', label: 'Unsafe content' },
                    { value: 'impersonation', label: 'Impersonation' },
                    { value: 'other', label: 'Other' }
                  ]}
                />
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

      {cardioShareData && (
        <CardioShareModal
          data={cardioShareData}
          onClose={() => setCardioShareData(null)}
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

  const themeStyles = theme === 'dark' ? {
    '--bg': '#0a0d14',
    '--card': '#141720',
    '--border': '#222736',
    '--text': '#f3f4f6',
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

  if (!isOpen) return null;

  return createPortal(
    <div style={themeStyles} className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="rounded-t-3xl sm:rounded-3xl border border-[var(--border)] bg-[var(--bg)] w-full sm:max-w-[420px] max-h-[85vh] sm:max-h-[70vh] flex flex-col shadow-2xl overflow-hidden text-[var(--text)] relative"
      >
        {/* Header - Solid background */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)] bg-[var(--bg)] sticky top-0 z-10">
          <h2 className="font-serif text-2xl font-medium capitalize text-[var(--text)]">{type}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--card)] transition-colors text-[var(--text)]">
            <X size={18} />
          </button>
        </div>

        {/* List - Added pb-safe for mobile */}
        <div className="flex-1 overflow-y-auto px-4 py-3 pb-8 sm:pb-3 [&::-webkit-scrollbar]:hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-[var(--muted)] text-sm font-mono">
              No {type} yet.
            </div>
          ) : (
            <div className="space-y-1 pb-4">
              {users.map(u => (
                <Link
                  key={u.uid}
                  to={`/profile/${u.username}`}
                  onClick={onClose}
                  className="flex items-center gap-4 p-3 rounded-2xl hover:bg-[var(--card)] transition-colors group"
                >
                  <img
                    src={u.photoURL || getAvatarUrl(u.displayName, theme)}
                    alt={u.displayName}
                    className="w-12 h-12 rounded-full object-cover border border-[var(--border)] shadow-sm group-hover:scale-105 transition-transform"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[15px] truncate text-[var(--text)]">{u.displayName}</div>
                    <div className="text-xs text-[var(--muted)] font-mono truncate mt-0.5">@{u.username}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
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
