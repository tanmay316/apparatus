import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { doc, getDoc, query, collection, where, limit, getDocs } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Grid, BarChart3, Settings, Edit3, Heart, Target, TrendingUp, Flame, Droplets, MapPin, Search, Calendar, UserPlus, Users, Link as LinkIcon, Camera, Key, MessageSquare, X, Shield, Lock, Unlock, LogOut, Check, Share2, Save, Flag, Activity, Dumbbell, Scale, Award, UserMinus, Clock, Loader2, ImagePlus, Trophy, Crown } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { getAvatarUrl } from '@/lib/avatar';
import { useUserWeight } from '@/hooks/use-user-weight';
import { followUser, unfollowUser, isFollowing, hasRequestedFollow, removeFollower, acceptFollowRequest, declineFollowRequest, subscribeFollowRequests, getFollowCounts, getFollowers, getFollowing, getUsersByUids, getBookmarkedActivities, getUserFeedActivities } from '@/services/social';
import type { Activity as ActivityType, UserProfile, UserStats } from '@/types';
import { createReport } from '@/services/admin';
import { getPublicWorkoutsForUser, getUserWorkouts } from '@/services/workouts';
import { getUserCardioActivities, getVisibleCardioActivitiesForUser } from '@/services/cardio';
import { BADGES, evaluateBadges, knownBadgeIds } from '@/lib/badges';
import { badgeContextFromStats, effectiveStreak } from '@/lib/stats';
import { computeAthleteRank } from '@/lib/rank';
import { getProfileVisibility } from '@/lib/privacy';
import { clonePlan, getPublicPlansForUser, getPlanDays, getPlan } from '@/services/plans';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { CardioShareModal, type CardioShareData } from '@/components/ui/CardioShareModal';
import { calculateWorkoutCalories } from '@/lib/calories';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';
import { getUserSkills } from '@/services/skills';
import { getUserEventRegistrations, getEventsByIds } from '@/services/events';
import { getAppShareUrl, shareContent } from '@/lib/share';
import { getUserClans, getUserCommunityBadges } from '@/services/community';
import { CommunityBadgeCard } from '@/components/community/CommunityBadgeCard';
import { MedalShareModal } from '@/components/community/MedalShareModal';
import { uploadAvatar, uploadProfileCover } from '@/services/account';
import { BRAND } from '@/lib/brand';
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
  const queryClient = useQueryClient();

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
  const [selectedMedalToShare, setSelectedMedalToShare] = useState<any | null>(null);
  const [feedTab, setFeedTab] = useState<'activity' | 'communities' | 'posts' | 'bookmarks' | 'events'>('activity');
  const [mobileSection, setMobileSection] = useState<'posts' | 'journey' | 'awards' | 'community'>('posts');
  const [mediaTarget, setMediaTarget] = useState<'avatar' | 'cover' | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const ACTIVITIES_PAGE_SIZE = 10;
  const [visibleActivitiesCount, setVisibleActivitiesCount] = useState(ACTIVITIES_PAGE_SIZE);
  const [visibleTimelineCount, setVisibleTimelineCount] = useState(ACTIVITIES_PAGE_SIZE);

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
    enabled: !!viewProfile?.uid,
  });

  const { data: userClans = [] } = useQuery({
    queryKey: ['userClans', viewProfile?.uid],
    queryFn: () => getUserClans(viewProfile!.uid),
    enabled: !!viewProfile?.uid,
  });

  const targetUid = viewProfile?.uid;
  const { data: userCommunityBadges } = useQuery({
    queryKey: ['userCommunityBadges', targetUid],
    queryFn: () => getUserCommunityBadges(targetUid!),
    enabled: !!targetUid,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Theme support local properties mapping
  const themeStyles = theme === 'dark' ? {
    '--bg': '#050505',
    '--card': '#0e0e10',
    '--border': '#222226',
    '--text': '#f4f4f6',
    '--muted': '#9a9aa5',
    '--teal': '#b07458',
    '--amber': '#fbbf24',
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

  const { data: isFollowingProfile = false } = useQuery({
    queryKey: ['isFollowing', myProfile?.uid, viewProfile?.uid],
    queryFn: () => isFollowing(myProfile!.uid, viewProfile!.uid),
    enabled: !!myProfile?.uid && !!viewProfile?.uid && !isOwnProfile,
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
          // 1. Try to fetch from the usernames collection (handle case insensitivity by trying lowercase too)
          let usernameDoc = await getDoc(doc(db, 'usernames', username));
          if (!usernameDoc.exists()) {
            usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase()));
          }
          
          let uid = username; // Default to assuming the param IS the uid
          if (usernameDoc.exists()) {
            uid = usernameDoc.data().uid;
          }
          
          let profileDoc = await getDoc(doc(db, 'users', uid));
          
          // 2. If we still don't have a profile, fallback to querying the users collection directly
          if (!profileDoc.exists()) {
            const fallbackQ = query(collection(db, 'users'), where('username', '==', username), limit(1));
            const fallbackSnap = await getDocs(fallbackQ);
            if (!fallbackSnap.empty) {
              profileDoc = fallbackSnap.docs[0] as any;
              uid = profileDoc.id;
            } else {
              const lowerQ = query(collection(db, 'users'), where('usernameLower', '==', username.toLowerCase()), limit(1));
              const lowerSnap = await getDocs(lowerQ);
              if (!lowerSnap.empty) {
                profileDoc = lowerSnap.docs[0] as any;
                uid = profileDoc.id;
              }
            }
          }

          if (profileDoc.exists()) {
            let statsData = null;
            try {
              const statsDoc = await getDoc(doc(db, 'users', uid, 'stats', 'current'));
              if (statsDoc.exists()) statsData = statsDoc.data() as UserStats;
            } catch (err) {
              console.warn('Could not fetch stats, possibly due to privacy rules', err);
            }
            
            setViewProfile({ uid, ...profileDoc.data() } as UserProfile);
            setViewStats(statsData);
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
        let gymWorkouts: any[] = [];
        let cardioLogs: any[] = [];
        let plans: any[] = [];
        let feedActivities: ActivityType[] = [];

        if (isOwnProfile) {
          [gymWorkouts, cardioLogs, feedActivities] = await Promise.all([
            getUserWorkouts(viewProfile.uid, 50).catch(() => []),
            getUserCardioActivities(viewProfile.uid, 50).catch(() => []),
            getUserFeedActivities(viewProfile.uid, true, false).catch(() => [])
          ]);
        } else {
          // Each source is independent so one denied query can't blank the whole profile.
          [gymWorkouts, plans, cardioLogs, feedActivities] = await Promise.all([
            getPublicWorkoutsForUser(viewProfile.uid, myProfile?.uid, 50).catch(() => []),
            getPublicPlansForUser(viewProfile.uid).catch(() => []),
            getVisibleCardioActivitiesForUser(viewProfile.uid, myProfile?.uid, 50).catch(() => []),
            getUserFeedActivities(viewProfile.uid, false, isFollowingProfile).catch(() => [])
          ]);
          setPublicPlans(plans);
        }

        // Build merged list prioritizing authentic social activities from feed
        const mergedMap = new Map<string, any>();
        
        // 1. Add all feed activities (which contain the exact, authentic feed map route)
        feedActivities.forEach(act => {
          if (act.id) mergedMap.set(act.id, act);
        });

        // 2. Add cardio logs or merge route & telemetry into feed activities if matched
        cardioLogs.forEach((c: any) => {
          const matchInFeed = feedActivities.find((f: any) => {
            if (f.id === c.id || f.workoutId === c.id) return true;
            if (f.type !== c.type && f.details?.activityType !== c.type) return false;
            
            const distF = Number(f.details?.distanceKm || 0);
            const distC = Number(c.distanceKm || 0);
            if (Math.abs(distF - distC) > 0.1) return false;
            
            const fTime = f.createdAt?.seconds || (f.createdAt?.toMillis ? f.createdAt.toMillis() / 1000 : 0);
            const cTime = c.startedAt?.seconds || (c.createdAt?.seconds) || 0;
            if (fTime && cTime && Math.abs(fTime - cTime) < 14400) return true;
            if (c.date && f.details?.date && c.date === f.details.date) return true;
            return false;
          });

          if (matchInFeed) {
            // Merge cardio log details (route, speeds, elevation) to ensure high-fidelity map and KPIs
            const fRoute = matchInFeed.details?.route;
            const hasFRoute = Array.isArray(fRoute) ? fRoute.length > 0 : Boolean(fRoute);
            const cRoute = c.route;
            const hasCRoute = Array.isArray(cRoute) ? cRoute.length > 0 : Boolean(cRoute);

            matchInFeed.details = {
              ...c,
              ...matchInFeed.details,
              route: hasFRoute ? fRoute : (hasCRoute ? cRoute : []),
              avgSpeedKmh: matchInFeed.details?.avgSpeedKmh ?? c.avgSpeedKmh,
              maxSpeedKmh: matchInFeed.details?.maxSpeedKmh ?? c.maxSpeedKmh,
              elevationGainM: matchInFeed.details?.elevationGainM ?? c.elevationGainM,
              steps: matchInFeed.details?.steps ?? c.steps,
            };
          } else {
            mergedMap.set(`cardio_${c.id}`, c);
          }
        });

        // 3. Add gym workouts if not already present in feed
        gymWorkouts.forEach((w: any) => {
          const matchInFeed = feedActivities.find((f: any) => f.workoutId === w.id || f.id === w.id);
          if (!matchInFeed) {
            mergedMap.set(`workout_${w.id}`, w);
          }
        });

        // Sort by timestamp descending
        const merged = Array.from(mergedMap.values()).sort((a: any, b: any) => {
          const timeA = Number(a.createdAt?.seconds || a.startedAt?.seconds || (a.date ? Math.floor(new Date(a.date).getTime() / 1000) : 0));
          const timeB = Number(b.createdAt?.seconds || b.startedAt?.seconds || (b.date ? Math.floor(new Date(b.date).getTime() / 1000) : 0));
          return timeB - timeA;
        });

        setPublicWorkouts(merged);
      } catch (error) {
        console.error('Failed to load training data', error);
      }
    };

    fetchAllActivities();
  }, [viewProfile, isOwnProfile, myProfile?.uid, isFollowingProfile]);

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

  const handleProfileMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser || !isOwnProfile || !mediaTarget) return;
    setUploadingMedia(true);
    try {
      if (mediaTarget === 'avatar') {
        const url = await uploadAvatar(currentUser.uid, file);
        await updateProfile({ photoURL: url });
        showToast('Profile photo updated');
      } else {
        const url = await uploadProfileCover(currentUser.uid, file);
        await updateProfile({ coverPhotoURL: url });
        showToast('Header photo updated');
      }
      setMediaTarget(null);
    } catch (error: any) {
      showToast(error?.message || 'Could not upload image', 'error');
    } finally {
      setUploadingMedia(false);
      event.target.value = '';
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
      <div className="dx dx-profile max-w-6xl mx-auto sm:px-2 lg:px-0 pt-1 sm:pt-4 space-y-4 animate-pulse">
        <div className="dx-card h-72" />
        <div className="dx-inset h-11" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 dx-card h-96" />
          <div className="dx-card h-96 hidden lg:block" />
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
  const athleteRank = stats ? computeAthleteRank(stats, p.weight, { gender: p.gender }) : null;

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
  const bmi = heightInMeters > 0 && p.weight ? (p.weight / (heightInMeters * heightInMeters)).toFixed(1) : '-';

  // Dynamic calories calculation
  let displayTotalCalories = stats?.totalCalories || 0;
  publicWorkouts.forEach((workout: any) => {
    const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
    if (rawExLogs.length > 0) {
      const dynamicCals = calculateWorkoutCalories(rawExLogs, workout.bodyweight || viewProfile?.weight, workout.durationMin);
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

  const handleShareActivity = (act: any, sourceWorkout?: any) => {
    const details = (act.details as Record<string, any>) || (sourceWorkout?.details as Record<string, any>) || {};
    const isCardio = act.type === 'walk' || act.type === 'run' || act.type === 'cycle' || 
      ['walk', 'run', 'cycle'].includes(details.activityType) || 
      ['walk', 'run', 'cycle'].includes(sourceWorkout?.type) ||
      ((details.distanceKm !== undefined || sourceWorkout?.distanceKm !== undefined) && !details.exercises && !details.exerciseLogs && !sourceWorkout?.exercises);

    const createdDate = act.createdAt?.seconds
      ? new Date(act.createdAt.seconds * 1000)
      : (act.createdAt?.toMillis
      ? new Date(act.createdAt.toMillis())
      : (sourceWorkout?.startedAt?.seconds
      ? new Date(sourceWorkout.startedAt.seconds * 1000)
      : (sourceWorkout?.date
      ? new Date(sourceWorkout.date)
      : (act.date ? new Date(act.date) : new Date()))));

    if (isCardio) {
      const dist = Number(details.distanceKm ?? sourceWorkout?.distanceKm ?? act.distanceKm ?? 0);
      const dur = Number(details.durationSec ?? sourceWorkout?.durationSec ?? act.durationSec ?? 0);
      const avgSpd = details.avgSpeedKmh ?? sourceWorkout?.avgSpeedKmh ?? act.avgSpeedKmh ?? (dur > 0 && dist > 0 ? Math.round((dist / (dur / 3600)) * 10) / 10 : undefined);
      const maxSpd = details.maxSpeedKmh ?? sourceWorkout?.maxSpeedKmh ?? act.maxSpeedKmh ?? undefined;
      const elevation = details.elevationGainM ?? sourceWorkout?.elevationGainM ?? act.elevationGainM ?? undefined;
      const steps = details.steps ?? sourceWorkout?.steps ?? act.steps ?? undefined;
      
      const rawRoute = details.route || act.route || sourceWorkout?.route || sourceWorkout?.details?.route || [];
      const route = typeof rawRoute === 'string' ? (() => { try { return JSON.parse(rawRoute); } catch { return []; } })() : (Array.isArray(rawRoute) ? rawRoute : []);

      setCardioShareData({
        type: details.activityType || act.type || sourceWorkout?.type || 'walk',
        date: createdDate.toISOString(),
        distanceKm: dist,
        durationSec: dur,
        calories: Number(details.calories ?? sourceWorkout?.calories ?? act.calories ?? 0),
        avgPace: details.avgPace || sourceWorkout?.avgPace || act.avgPace || '0:00 /km',
        route,
        avgSpeedKmh: avgSpd,
        maxSpeedKmh: maxSpd,
        elevationGainM: elevation,
        steps,
      });
    } else {
      const rawExLogs = (details.exerciseLogs || sourceWorkout?.exerciseLogs || act.exerciseLogs || []) as any[];
      const exerciseNamesList = (details.exercises || sourceWorkout?.exercises || act.exercises || []).map((e: any) => typeof e === 'string' ? e : e.name);

      setProfileShareData({
        dayTitle: details.dayTitle || sourceWorkout?.dayTitle || act.summary || 'Workout',
        planTitle: details.planTitle || sourceWorkout?.planTitle || 'Personal Session',
        date: createdDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        durationMin: Number(details.durationMin ?? sourceWorkout?.durationMin ?? act.durationMin ?? 0),
        calories: Number(details.calories ?? sourceWorkout?.calories ?? act.calories ?? 0),
        volume: Number(details.volume ?? sourceWorkout?.volume ?? act.volume ?? 0),
        exerciseNames: exerciseNamesList,
        exerciseLogs: rawExLogs,
        bodyweight: details.bodyweight || sourceWorkout?.bodyweight,
      });
    }
  };

  const isPrivateAccount = getProfileVisibility(viewProfile) !== 'public';
  const isLocked = !isOwnProfile && isPrivateAccount && !isFollowingProfile;
  const showClans = (isOwnProfile || viewProfile.privacySettings?.showClansToFollowers !== false) && userClans.length > 0;
  const showEvents = (isOwnProfile || viewProfile.privacySettings?.showEventsToFollowers !== false) && userEvents.length > 0;
  const mobileSections = [
    { id: 'posts', label: 'Posts' },
    { id: 'journey', label: 'Journey' },
    { id: 'awards', label: 'Awards' },
    { id: 'community', label: 'Community' },
  ] as const;
  const sectionClass = (id: typeof mobileSection) => (mobileSection === id ? '' : 'hidden lg:block');

  return (
    <div className="dx dx-profile pro-scope max-w-6xl mx-auto sm:px-2 lg:px-0 pt-1 sm:pt-4">
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 sm:space-y-5">
        
        {/* HEADER */}
        <motion.section variants={item} className="dx-card overflow-hidden">
          <div
            className={`dx-hero !rounded-none h-24 sm:h-32 relative ${isOwnProfile ? 'cursor-pointer' : ''}`}
            onClick={() => isOwnProfile && setMediaTarget('cover')}
            onKeyDown={(e) => {
              if (isOwnProfile && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setMediaTarget('cover');
              }
            }}
            role={isOwnProfile ? 'button' : undefined}
            tabIndex={isOwnProfile ? 0 : undefined}
            aria-label={isOwnProfile ? 'View or change header photo' : undefined}
          >
            {p.coverPhotoURL && (
              <img src={p.coverPhotoURL} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            {isOwnProfile && (
              <span className="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center border border-white/15">
                <Camera size={15} />
              </span>
            )}
            {isOwnProfile && !editing && (
              <button
                onClick={async (event) => {
                  event.stopPropagation();
                  const profileUrl = getAppShareUrl(`/profile/${p.username}`);
                  const res = await shareContent({
                    title: `${p.displayName} on ${BRAND.name}`,
                    url: profileUrl,
                    dialogTitle: 'Share Athlete Profile',
                  });
                  if (res.method === 'clipboard') {
                    useUIStore.getState().showToast('Profile link copied!', 'success');
                  }
                }}
                className="dx-hero-icon !w-9 !h-9 !rounded-full absolute top-3 right-3"
                title="Share Profile"
                aria-label="Share profile"
              >
                <Share2 size={16} />
              </button>
            )}
          </div>

          <div className="px-4 sm:px-6 pb-5">
            <div className="flex items-end justify-between gap-3 -mt-12 sm:-mt-14">
              {/* Avatar with profile-completion ring & level badge */}
              <button
                type="button"
                onClick={() => setMediaTarget('avatar')}
                className="relative w-[104px] h-[104px] shrink-0 rounded-full text-left"
                style={{ background: 'var(--dx-card)' }}
                title={isOwnProfile ? 'View or change profile photo' : 'View profile photo'}
                aria-label={isOwnProfile ? 'View or change profile photo' : 'View profile photo'}
              >
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 104 104">
                  <circle cx="52" cy="52" r={radius + 10} strokeWidth="3" fill="transparent" style={{ stroke: 'var(--dx-card-2)' }} />
                  <motion.circle
                    cx="52" cy="52" r={radius + 10}
                    strokeWidth="3.5" fill="transparent" strokeLinecap="round"
                    style={{ stroke: 'var(--dx-accent)' }}
                    strokeDasharray={2 * Math.PI * (radius + 10)}
                    initial={{ strokeDashoffset: 2 * Math.PI * (radius + 10) }}
                    animate={{ strokeDashoffset: 2 * Math.PI * (radius + 10) * (1 - completionPercent / 100) }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </svg>
                <img
                  src={p.photoURL || (isOwnProfile ? currentUser?.photoURL : '') || getAvatarUrl(p.displayName, theme, 96)}
                  alt={p.displayName}
                  className="absolute inset-[9px] w-[86px] h-[86px] rounded-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getAvatarUrl(p.displayName, theme, 96);
                  }}
                />
                <span
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 dx-pill !h-6 !px-2.5 tabular"
                  style={{ background: 'var(--dx-accent)', color: 'var(--dx-on-accent)', boxShadow: '0 0 0 3px var(--dx-card)' }}
                >
                  LV {calculatedLevel}
                </span>
              </button>

              {/* Actions (right of avatar) */}
              <div className="flex gap-2 pb-1">
                {isOwnProfile ? (
                  editing ? (
                    <>
                      <button onClick={() => setEditing(false)} className="dx-btn-secondary !h-10 !px-3.5 !text-[13px]">
                        <X size={15} /> Cancel
                      </button>
                      <button onClick={saveEdit} className="dx-btn !h-10 !px-4 !text-[13px]">
                        <Save size={15} /> Save
                      </button>
                    </>
                  ) : null
                ) : (
                  <>
                    <div className="w-[128px]">
                      <FollowButton myUid={myProfile!.uid} targetUid={viewProfile.uid} />
                    </div>
                    <button
                      onClick={() => setReportOpen(true)}
                      className="dx-icon-btn !w-10 !h-10 !rounded-xl text-red-500"
                      title="Report"
                      aria-label="Report user"
                    >
                      <Flag size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Identity */}
            <div className="mt-3.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight break-words">{p.displayName}</h1>
                <Link
                  to="/ranks"
                  className="dx-pill dx-pill--accent hover:opacity-85 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1 group"
                  title={athleteRank ? `Rank score ${athleteRank.score}/1000 · Tap to view all ranks` : 'Tap to view all ranks'}
                >
                  <span>{athleteRank?.label || p.athleteRank?.label || 'Beginner'}</span>
                  <ChevronRight size={11} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                {p.proBadge && (
                  <span className="dx-pill" style={{ background: 'rgba(245, 179, 1, 0.14)', color: '#c98a1f' }} title={`${BRAND.name} Pro member`}>
                    <Crown size={11} /> Pro
                  </span>
                )}
              </div>
              <div className="text-[13.5px] dx-muted mt-0.5">@{p.username}</div>

              {editing ? (
                <textarea
                  className="mt-3 w-full rounded-2xl p-3 text-[14px] outline-none min-h-[88px] resize-none"
                  style={{ background: 'var(--dx-card-2)', border: '1px solid var(--dx-border)', color: 'var(--dx-text)' }}
                  placeholder="Write an athletic bio..."
                  value={editData.bio || ''}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                />
              ) : (
                p.bio && <p className="mt-2.5 text-[14px] leading-relaxed max-w-xl" style={{ color: 'var(--dx-text)' }}>{p.bio}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] dx-muted">
                <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> Joined {joinDate}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{(stats?.xp || 0).toLocaleString()} XP</span>
              </div>
            </div>

            {/* Social + core stats */}
            <div
              className={`mt-5 grid ${isLocked ? 'grid-cols-2' : 'grid-cols-4'} rounded-2xl overflow-hidden`}
              style={{ background: 'var(--dx-card-2)' }}
            >
              <FollowCountDisplay uid={viewProfile.uid} />
              {!isLocked && (
                <>
                  <div className="py-3 text-center border-l" style={{ borderColor: 'var(--dx-border)' }}>
                    <div className="text-[18px] font-semibold tabular leading-none">{stats?.totalWorkouts || 0}</div>
                    <div className="text-[11px] dx-muted mt-1">Workouts</div>
                  </div>
                  <div className="py-3 text-center border-l" style={{ borderColor: 'var(--dx-border)' }}>
                    <div className="text-[18px] font-semibold tabular leading-none">{effectiveStreak(stats)}d</div>
                    <div className="text-[11px] dx-muted mt-1">Streak</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.section>

        {/* PROFILE DETAIL EDITING EXPANSION */}
        {editing && (
          <motion.section variants={item} className="dx-card p-4 sm:p-6">
            <h3 className="dx-section-title mb-4">Personal metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                  options={GENDERS.map(g => ({ value: g, label: g || '-' }))}
                />
              </div>
              <div>
                <label className="label">Fitness Goal</label>
                <CustomSelect
                  className="w-full"
                  value={editData.fitnessGoal || ''}
                  onChange={(val) => setEditData({ ...editData, fitnessGoal: val })}
                  options={FITNESS_GOALS.map(g => ({ value: g, label: g || '-' }))}
                />
              </div>
              <div>
                <label className="label">Preferred Workout</label>
                <CustomSelect
                  className="w-full"
                  value={editData.preferredWorkoutType || ''}
                  onChange={(val) => setEditData({ ...editData, preferredWorkoutType: val })}
                  options={WORKOUT_TYPES.map(t => ({ value: t, label: t || '-' }))}
                />
              </div>
            </div>
          </motion.section>
        )}

        {isLocked ? (
          <motion.section variants={item} className="dx-card flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--dx-card-2)' }}>
              <Lock size={24} className="dx-muted" />
            </div>
            <h2 className="text-[18px] font-semibold">This account is private</h2>
            <p className="dx-muted max-w-sm text-[13.5px] leading-relaxed mt-1.5">
              Follow {viewProfile.displayName} to see their workouts, plans, events, and clan affiliations.
            </p>
          </motion.section>
        ) : (
          <>
          {/* Phones show one section at a time; desktop shows everything in two columns. */}
          <div className="lg:hidden sticky top-0 z-20 -mx-4 px-4 py-2" style={{ background: 'var(--dx-canvas)' }}>
            <div className="dx-segment" role="tablist" aria-label="Profile sections">
              {mobileSections.map(s => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={mobileSection === s.id}
                  onClick={() => setMobileSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
          
          {/* LEFT PANEL: TIMELINE & PROGRESS POSTS */}
          <div className="lg:col-span-8 space-y-4 lg:space-y-6">
            
            {/* SECTION 7: ACTIVITY TIMELINE */}
            <motion.section variants={item} className={`dx-card p-4 sm:p-6 ${sectionClass('journey')}`}>
              <div className="flex items-center gap-2 mb-5">
                <Activity className="dx-accent" size={18} />
                <h3 className="dx-section-title">Training journey</h3>
              </div>

              {publicWorkouts.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-2xl">
                  <Dumbbell className="mx-auto text-[var(--muted)] mb-3 opacity-40" size={32} />
                  <p className="text-sm text-[var(--muted)]">No workouts logged yet. Start training to kick off your timeline!</p>
                </div>
              ) : (
                <div className="relative pl-6 border-l border-[var(--border)] space-y-8">
                  {publicWorkouts.slice(0, visibleTimelineCount).map((workout, idx) => {
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
                  {publicWorkouts.length > visibleTimelineCount && (
                    <button
                      onClick={() => setVisibleTimelineCount(count => Math.min(count + ACTIVITIES_PAGE_SIZE, publicWorkouts.length))}
                      className="w-full py-2.5 mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors text-xs font-semibold uppercase tracking-wider"
                    >
                      {`Show ${Math.min(ACTIVITIES_PAGE_SIZE, publicWorkouts.length - visibleTimelineCount)} More Timeline Events`}
                    </button>
                  )}
                  {visibleTimelineCount > ACTIVITIES_PAGE_SIZE && visibleTimelineCount >= publicWorkouts.length && (
                    <button
                      onClick={() => setVisibleTimelineCount(ACTIVITIES_PAGE_SIZE)}
                      className="w-full py-2.5 mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors text-xs font-semibold uppercase tracking-wider"
                    >
                      Show Less
                    </button>
                  )}
                </div>
              )}
            </motion.section>

            {/* EXPANDED FEED POSTS */}
            <motion.section variants={item} className={`dx-card p-4 sm:p-6 ${sectionClass('posts')}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="dx-eyebrow">
                    {isOwnProfile ? 'Your library' : 'Public training'}
                  </div>
                  <h3 className="dx-section-title mt-0.5">
                    {isOwnProfile ? 'Activity & bookmarks' : 'Workout posts'}
                  </h3>
                </div>
              </div>

              {isOwnProfile && (
                <div className="dx-segment mb-4 sm:max-w-xs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={feedTab !== 'bookmarks'}
                    onClick={() => setFeedTab('posts')}
                  >
                    Your posts
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={feedTab === 'bookmarks'}
                    onClick={() => setFeedTab('bookmarks')}
                  >
                    Saved
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
                        onDelete={() => {
                          queryClient.invalidateQueries({ queryKey: ['bookmarkedPosts'] });
                        }}
                        onShare={(act) => handleShareActivity(act)}
                      />
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
                  {publicWorkouts.slice(0, visibleActivitiesCount).map(workout => {
                    const isFeedActivity = Boolean(workout.details && workout.userId && (workout.summary || workout.details.activityType));
                    
                    let activityItem: ActivityType;
                    if (isFeedActivity) {
                      activityItem = workout as ActivityType;
                    } else {
                      const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                      const exerciseNamesList = rawExLogs.map((e: any) => typeof e === 'string' ? e : e.name);

                      const isCardio = workout.type === 'walk' || workout.type === 'run' || workout.type === 'cycle' || 
                        ['walk', 'run', 'cycle'].includes((workout.details as any)?.activityType) || 
                        (workout.distanceKm !== undefined && !workout.exercises && !workout.exerciseLogs);
                      
                      const dist = Number(workout.distanceKm ?? workout.details?.distanceKm ?? 0);
                      const dur = Number(workout.durationSec ?? workout.details?.durationSec ?? 0);
                      const avgSpd = workout.avgSpeedKmh ?? workout.details?.avgSpeedKmh ?? (dur > 0 && dist > 0 ? Math.round((dist / (dur / 3600)) * 10) / 10 : undefined);
                      const actRoute = workout.route || workout.details?.route || [];

                      activityItem = isCardio ? {
                        id: workout.id,
                        userId: viewProfile.uid,
                        userName: viewProfile.displayName,
                        userPhoto: viewProfile.photoURL,
                        username: viewProfile.username,
                        type: workout.type || workout.details?.activityType || 'walk',
                        workoutId: null,
                        visibility: workout.visibility || 'followers',
                        likesCount: workout.likesCount || 0,
                        commentsCount: workout.commentsCount || 0,
                        summary: `Completed a ${dist.toFixed(2)} km ${workout.type || 'Cardio'}`,
                        details: {
                          activityType: workout.type || workout.details?.activityType || 'walk',
                          distanceKm: dist,
                          durationSec: dur,
                          calories: workout.calories ?? workout.details?.calories ?? 0,
                          avgPace: workout.avgPace || workout.details?.avgPace || '0:00 /km',
                          route: actRoute,
                          avgSpeedKmh: avgSpd,
                          maxSpeedKmh: workout.maxSpeedKmh ?? workout.details?.maxSpeedKmh,
                          elevationGainM: workout.elevationGainM ?? workout.details?.elevationGainM,
                          steps: workout.steps ?? workout.details?.steps,
                          date: workout.date || workout.details?.date,
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
                    }

                    return (
                      <ActivityPostCard
                        key={workout.id}
                        activity={activityItem}
                        onDelete={(deletedId) => {
                          setPublicWorkouts(prev => prev.filter(w => w.id !== deletedId));
                        }}
                        onShare={(act) => handleShareActivity(act, workout)}
                      />
                    );
                  })}
                  {publicWorkouts.length > visibleActivitiesCount && (
                    <button
                      onClick={() => setVisibleActivitiesCount(count => Math.min(count + ACTIVITIES_PAGE_SIZE, publicWorkouts.length))}
                      className="w-full py-3 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors text-xs font-semibold uppercase tracking-wider"
                    >
                      {`Show ${Math.min(ACTIVITIES_PAGE_SIZE, publicWorkouts.length - visibleActivitiesCount)} More Activities`}
                    </button>
                  )}
                  {visibleActivitiesCount > ACTIVITIES_PAGE_SIZE && visibleActivitiesCount >= publicWorkouts.length && (
                    <button
                      onClick={() => setVisibleActivitiesCount(ACTIVITIES_PAGE_SIZE)}
                      className="w-full py-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)] transition-colors text-xs font-semibold uppercase tracking-wider"
                    >
                      Show Less
                    </button>
                  )}
                </div>
              )}
                </>
              )}
            </motion.section>
          </div>

            {/* RIGHT PANEL: PERFORMANCE & METRICS */}
          <div className="lg:col-span-4 space-y-4 lg:space-y-6">

            {/* SECTION: CLAN AFFILIATIONS */}
            {showClans && (
              <motion.section variants={item} className={`dx-card p-4 sm:p-5 ${sectionClass('community')}`}>
                <div className="flex items-center gap-2 mb-3.5">
                  <Shield className="dx-accent" size={17} />
                  <h3 className="dx-section-title">Clans</h3>
                </div>
                <div className="space-y-2.5">
                  {userClans.map((clan: any) => (
                    <Link to={`/clan/${clan.id}`} key={clan.id} className="flex items-center gap-3 p-2.5 -mx-1 rounded-2xl active:opacity-70 transition-opacity" style={{ background: 'var(--dx-card-2)' }}>
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">
                        <img src={clan.avatarUrl || clan.coverUrl || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop'} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-[14px] truncate leading-tight">{clan.name}</h4>
                        <p className="text-[12px] dx-muted mt-0.5 tabular">{clan.memberCount} athletes</p>
                      </div>
                      <ChevronLeft size={16} className="dx-muted rotate-180 shrink-0" />
                    </Link>
                  ))}
                </div>
              </motion.section>
            )}

            {/* SECTION: EVENTS & COMPETITIONS */}
            {showEvents && (
              <motion.section variants={item} className={`dx-card p-4 sm:p-5 ${sectionClass('community')}`}>
                <div className="flex items-center gap-2 mb-3.5">
                  <Calendar className="dx-accent" size={17} />
                  <h3 className="dx-section-title">Events & competitions</h3>
                </div>
                <div className="space-y-2.5">
                  {userEvents.map((event: any) => (
                    <div key={event.id} className="flex items-center gap-3 p-2.5 -mx-1 rounded-2xl" style={{ background: 'var(--dx-card-2)' }}>
                      <img src={event.banner || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1470&auto=format&fit=crop'} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      <div className="min-w-0">
                        <h4 className="font-semibold text-[14px] leading-tight line-clamp-1">{event.title}</h4>
                        <div className="flex items-center gap-1 text-[12px] dx-muted mt-0.5">
                          <MapPin size={11} /> {event.location || 'Virtual'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {!showClans && !showEvents && (
              <section className={`dx-card p-6 text-center lg:hidden ${mobileSection === 'community' ? '' : 'hidden'}`}>
                <Users size={22} className="dx-muted mx-auto mb-2" />
                <p className="text-[14px] font-semibold">No clans or events yet</p>
                <p className="text-[12.5px] dx-muted mt-1">Clans joined and events registered will show here.</p>
              </section>
            )}

            {/* SECTION: COMMUNITY TROPHIES (PODIUM TROPHIES) */}
            {((isOwnProfile || viewProfile.privacySettings?.showBadgesToFollowers !== false)) && (() => {
              const cBadges = userCommunityBadges ?? viewProfile.communityBadges ?? [];
              return (
                <motion.section variants={item} className={`dx-card p-4 sm:p-5 ${sectionClass('awards')}`}>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2">
                      <Award className="text-amber-500" size={17} />
                      <h3 className="dx-section-title">Podium trophies</h3>
                    </div>
                    {cBadges.length > 0 && (
                      <span className="dx-pill" style={{ background: 'rgba(217, 119, 6, 0.12)', color: '#b45309' }}>
                        {cBadges.length} won
                      </span>
                    )}
                  </div>

                  {cBadges.length === 0 ? (
                    <div className="dx-inset p-4 text-center">
                      <p className="text-[13px] font-semibold">No trophies yet</p>
                      <p className="text-[12px] dx-muted mt-1 leading-relaxed">
                        Finish top 3 in clan and community challenges to earn gold, silver, and bronze trophies.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cBadges.map((b: any) => (
                        <CommunityBadgeCard
                          key={b.id}
                          badge={b}
                          onShare={(badge) => setSelectedMedalToShare(badge)}
                        />
                      ))}
                    </div>
                  )}
                </motion.section>
              );
            })()}

            {/* SECTION 5b: ATHLETE RANK */}
            {athleteRank && (
              <motion.section variants={item} className={`dx-card p-4 sm:p-5 ${sectionClass('awards')}`}>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="dx-accent" size={17} />
                  <h3 className="dx-section-title flex-1">Athlete rank</h3>
                  <Link
                    to="/ranks"
                    className="dx-pill dx-pill--accent hover:opacity-85 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1 group"
                    title="Click to view all ranks and score requirements"
                  >
                    <span>{athleteRank.label}</span>
                    <ChevronRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="dx-muted">Rank score</span>
                  <span className="tabular">
                    <span className="font-semibold" style={{ color: 'var(--dx-text)' }}>{athleteRank.score}</span>
                    {athleteRank.nextStep ? ` / ${athleteRank.nextStep.min} for ${athleteRank.nextStep.label}` : ' · top rank'}
                  </span>
                </div>
                <div className="dx-progress mt-1.5">
                  <span style={{ width: `${athleteRank.nextStep ? Math.min(100, Math.max(0, ((athleteRank.score - athleteRank.currentStep.min) / (athleteRank.nextStep.min - athleteRank.currentStep.min)) * 100)) : 100}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Strength', value: athleteRank.strengthScore },
                    { label: 'Endurance', value: athleteRank.enduranceScore },
                    { label: 'Skill', value: athleteRank.skillScore },
                    { label: 'Consistency', value: athleteRank.consistencyScore },
                  ].map(row => (
                    <div key={row.label} className="dx-inset p-2.5">
                      <div className="text-[11px] dx-muted">{row.label}</div>
                      <div className="text-[15px] font-semibold tabular leading-tight">{row.value}<span className="text-[10px] font-medium dx-muted">/1000</span></div>
                      <div className="dx-progress !h-1 mt-1.5"><span style={{ width: `${(row.value / 1000) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* SECTION 6: ACHIEVEMENTS / BADGES */}
            {(() => {
              const earnedIds = new Set([
                ...knownBadgeIds(stats?.badges),
                ...(stats ? evaluateBadges(badgeContextFromStats(stats)) : []),
              ]);
              const ordered = [...BADGES.filter(b => earnedIds.has(b.id)), ...BADGES.filter(b => !earnedIds.has(b.id))].slice(0, 6);
              return (
                <motion.section variants={item} className={`dx-card p-4 sm:p-5 ${sectionClass('awards')}`}>
                  <div className="flex items-center gap-2 mb-3.5">
                    <Award className="dx-accent" size={17} />
                    <h3 className="dx-section-title flex-1">Achievements</h3>
                    <span className="dx-pill dx-pill--neutral">{earnedIds.size}/{BADGES.length}</span>
                    {isOwnProfile && <Link to="/achievements" className="dx-link ml-1">View all</Link>}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {ordered.map(badge => {
                      const active = earnedIds.has(badge.id);
                      return (
                        <div
                          key={badge.id}
                          className={`dx-inset p-3 flex items-center gap-2.5 min-w-0 ${active ? '' : 'opacity-45'}`}
                        >
                          <span
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[18px] ${active ? '' : 'grayscale'}`}
                            style={active ? { background: 'var(--dx-accent-soft)' } : { background: 'var(--dx-card)' }}
                          >
                            {badge.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-semibold leading-tight truncate">{badge.name}</div>
                            <div className="text-[11px] dx-muted truncate mt-0.5">{active ? badge.desc : 'Locked'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>
              );
            })()}
          </div>

        </div>
          </>
        )}
      </motion.div>

      {/* Profile media preview / owner actions */}
      {mediaTarget && createPortal(
        <div className="dx dx-profile pro-scope fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4" onClick={() => !uploadingMedia && setMediaTarget(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={mediaTarget === 'avatar' ? 'Profile photo' : 'Header photo'}
            className="relative w-full sm:max-w-md dx-card !rounded-b-none sm:!rounded-b-[20px] overflow-hidden"
          >
            <div className="h-1 w-10 rounded-full mx-auto mt-2.5 sm:hidden" style={{ background: 'var(--dx-border)' }} />
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--dx-border)' }}>
              <h2 className="text-[16px] font-semibold">{mediaTarget === 'avatar' ? 'Profile photo' : 'Header photo'}</h2>
              <button type="button" onClick={() => setMediaTarget(null)} disabled={uploadingMedia} className="dx-icon-btn dx-icon-btn--sm !rounded-full" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="p-4">
              {mediaTarget === 'avatar' ? (
                <img
                  src={p.photoURL || (isOwnProfile ? currentUser?.photoURL : '') || getAvatarUrl(p.displayName, theme, 320)}
                  alt={p.displayName}
                  className="w-full max-w-[280px] aspect-square object-cover rounded-full mx-auto"
                />
              ) : p.coverPhotoURL ? (
                <img src={p.coverPhotoURL} alt="" className="w-full aspect-[16/7] object-cover rounded-2xl" />
              ) : (
                <div className="dx-hero w-full aspect-[16/7] flex items-center justify-center">
                  <ImagePlus size={28} className="opacity-75" />
                </div>
              )}
            </div>

            {isOwnProfile && (
              <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] flex gap-2.5">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleProfileMediaUpload}
                />
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={uploadingMedia}
                  className="dx-btn flex-1"
                >
                  {uploadingMedia ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
                  {uploadingMedia ? 'Uploading…' : (mediaTarget === 'avatar' ? 'Change photo' : 'Change header')}
                </button>
                {mediaTarget === 'avatar' && (
                  <Link to="/settings" onClick={() => setMediaTarget(null)} className="dx-btn-secondary flex-1">
                    <Settings size={17} /> Complete profile
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </div>,
        document.body
      )}

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
                <textarea maxLength={2000} value={reportDetails} onChange={event => setReportDetails(event.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--teal)] text-[var(--text)] min-h-24 resize-none" placeholder="What should an admin review?" />
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

      {selectedMedalToShare && (
        <MedalShareModal
          badge={selectedMedalToShare}
          onClose={() => setSelectedMedalToShare(null)}
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

  const { data: requested = false } = useQuery({
    queryKey: ['hasRequestedFollow', myUid, targetUid],
    queryFn: () => hasRequestedFollow(myUid, targetUid),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (following) { await unfollowUser(myUid, targetUid); return 'unfollowed'; }
      if (requested) { await declineFollowRequest(targetUid, myUid); return 'withdrawn'; }
      return followUser(myUid, targetUid);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['isFollowing', myUid, targetUid] });
      queryClient.invalidateQueries({ queryKey: ['hasRequestedFollow', myUid, targetUid] });
      queryClient.invalidateQueries({ queryKey: ['followCounts', targetUid] });
      queryClient.invalidateQueries({ queryKey: ['followCounts', myUid] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      queryClient.invalidateQueries({ queryKey: ['followList'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      showToast({ unfollowed: 'Unfollowed', withdrawn: 'Request withdrawn', requested: 'Follow request sent', followed: 'Following' }[result]);
    },
    onError: (err: any) => showToast(err?.message || 'Could not update follow', 'error'),
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className={`w-full !h-10 !text-[13px] ${
        following || requested ? 'dx-btn-secondary' : 'dx-btn'
      } ${requested ? 'dx-muted' : ''}`}
    >
      {following ? <><UserMinus size={15} /> Following</> : requested ? <><Clock size={15} /> Requested</> : <><UserPlus size={15} /> Follow</>}
    </button>
  );
}

// ─── Follow Counts ──────────────────────────────────────
/** Pending follow requests, kept live so new requests and accepts show instantly. */
function useLiveFollowRequests(uid?: string): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds([]);
    if (!uid) return;
    return subscribeFollowRequests(uid, setIds);
  }, [uid]);
  return ids;
}

function FollowCountDisplay({ uid }: { uid: string }) {
  const [modalType, setModalType] = useState<'followers' | 'following' | null>(null);
  const { user } = useAuthStore();
  const { search } = useLocation();
  const queryClient = useQueryClient();
  const isOwnProfile = user?.uid === uid;

  const { data: counts } = useQuery({
    queryKey: ['followCounts', uid],
    queryFn: () => getFollowCounts(uid),
  });

  const requests = useLiveFollowRequests(isOwnProfile ? uid : undefined);
  const hasRequests = requests.length > 0;

  const requestKey = requests.join(',');
  useEffect(() => {
    if (isOwnProfile) queryClient.invalidateQueries({ queryKey: ['followCounts', uid] });
  }, [requestKey, isOwnProfile, uid, queryClient]);

  useEffect(() => {
    if (new URLSearchParams(search).get('modal') === 'followers' && isOwnProfile) {
      setModalType('followers');
    }
  }, [isOwnProfile, search]);

  return (
    <>
      <button 
        onClick={() => setModalType('followers')} 
        className="relative py-3 text-center active:opacity-70 transition-opacity"
      >
        <div className="text-[18px] font-semibold tabular leading-none">{counts?.followers || 0}</div>
        <div className="text-[11px] dx-muted mt-1">Followers</div>
        {hasRequests && (
          <span className="absolute top-2 right-3 w-2 h-2 rounded-full" style={{ background: 'var(--dx-accent)' }} aria-label="Pending follow requests" />
        )}
      </button>
      <button onClick={() => setModalType('following')} className="py-3 text-center border-l active:opacity-70 transition-opacity" style={{ borderColor: 'var(--dx-border)' }}>
        <div className="text-[18px] font-semibold tabular leading-none">{counts?.following || 0}</div>
        <div className="text-[11px] dx-muted mt-1">Following</div>
      </button>

      <FollowListModal
        uid={uid}
        requestIds={requests}
        type={modalType}
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
      />
    </>
  );
}

// ─── Follow List Modal ──────────────────────────────────
function FollowListModal({ uid, requestIds, type, isOpen, onClose }: { uid: string, requestIds: string[], type: 'followers' | 'following' | null, isOpen: boolean, onClose: () => void }) {
  const { theme } = useUIStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isOwnList = user?.uid === uid;
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

  const { data: requestProfiles = [] } = useQuery({
    queryKey: ['followRequestsList', uid, requestIds],
    queryFn: () => getUsersByUids(requestIds),
    enabled: isOpen && type === 'followers' && isOwnList && requestIds.length > 0,
    placeholderData: prev => prev,
  });
  const requestUsers = requestIds.length ? requestProfiles.filter((u: any) => requestIds.includes(u.uid)) : [];

  const removeMutation = useMutation({
    mutationFn: (followerId: string) => removeFollower(uid, followerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followList', uid, type] });
      queryClient.invalidateQueries({ queryKey: ['followCounts', uid] });
    }
  });

  const acceptMutation = useMutation({
    mutationFn: (requesterId: string) => acceptFollowRequest(uid, requesterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followList', uid, type] });
      queryClient.invalidateQueries({ queryKey: ['followCounts', uid] });
    }
  });

  const declineMutation = useMutation({
    mutationFn: (requesterId: string) => declineFollowRequest(uid, requesterId),
  });

  const themeStyles = theme === 'dark' ? {
    '--bg': '#050505',
    '--card': '#0e0e10',
    '--border': '#222226',
    '--text': '#f4f4f6',
    '--muted': '#9a9aa5',
    '--teal': '#b07458',
    '--amber': '#fbbf24',
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
          ) : users.length === 0 && requestUsers.length === 0 ? (
            <div className="text-center py-16 text-[var(--muted)] text-sm font-mono">
              No {type} yet.
            </div>
          ) : (
            <div className="space-y-6 pb-4">
              {requestUsers.length > 0 && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Follow Requests</h3>
                    <span className="bg-[var(--teal)]/10 text-[var(--teal)] text-[10px] font-bold px-2 py-0.5 rounded-full">{requestUsers.length}</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {requestUsers.map(u => (
                      <div key={u.uid} className="flex items-center gap-3 p-4 hover:bg-[var(--bg)] transition-colors">
                        <Link to={`/profile/${u.username || u.uid}`} onClick={onClose}>
                          <img
                            src={u.photoURL || getAvatarUrl(u.displayName, theme)}
                            alt={u.displayName}
                            className="w-12 h-12 rounded-full object-cover border border-[var(--border)] shadow-sm"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getAvatarUrl(u.displayName, theme);
                            }}
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/profile/${u.username || u.uid}`} onClick={onClose} className="font-bold text-[14px] truncate text-[var(--text)] hover:underline block">{u.displayName}</Link>
                          <div className="text-xs text-[var(--muted)] font-mono truncate">@{u.username}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => acceptMutation.mutate(u.uid)} disabled={acceptMutation.isPending} className="px-4 py-1.5 bg-[var(--teal)] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity">
                            Confirm
                          </button>
                          <button onClick={() => declineMutation.mutate(u.uid)} disabled={declineMutation.isPending} className="px-4 py-1.5 bg-[var(--border)] text-[var(--text)] text-xs font-bold rounded-xl hover:bg-[var(--muted)]/20 transition-colors">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {users.length > 0 && (
                <div className="space-y-2">
                  {requestUsers.length > 0 && <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] px-2 py-1 mb-2">All {type}</h3>}
                  {users.map(u => (
                    <div key={u.uid} className="flex items-center justify-between p-2 rounded-2xl hover:bg-[var(--card)] transition-colors group">
                      <Link to={`/profile/${u.username || u.uid}`} onClick={onClose} className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                        <img
                          src={u.photoURL || getAvatarUrl(u.displayName, theme)}
                          alt={u.displayName}
                          className="w-12 h-12 rounded-full object-cover border border-[var(--border)] shadow-sm"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getAvatarUrl(u.displayName, theme);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[14px] truncate text-[var(--text)] group-hover:underline">{u.displayName}</div>
                          <div className="text-xs text-[var(--muted)] font-mono truncate">@{u.username}</div>
                        </div>
                      </Link>
                      {isOwnList && type === 'followers' && (
                        <button 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMutation.mutate(u.uid); }}
                          disabled={removeMutation.isPending}
                          className="px-4 py-1.5 text-xs font-bold rounded-xl bg-[var(--border)] text-[var(--text)] hover:bg-red-500 hover:text-white transition-colors whitespace-nowrap"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
