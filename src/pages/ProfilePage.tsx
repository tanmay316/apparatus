import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import {
  Calendar as CalendarIcon, Edit3, Save, X,
  Users as UsersIcon, UserPlus, UserMinus, Flag, Dumbbell, Flame, Clock, Trophy, Target
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { followUser, unfollowUser, isFollowing, getFollowCounts, getFollowers, getFollowing, getUsersByUids } from '@/services/social';
import type { Activity, UserProfile, UserStats } from '@/types';
import { createReport } from '@/services/admin';
import { getPublicWorkoutsForUser, getUserWorkouts } from '@/services/workouts';
import { clonePlan, getPublicPlansForUser, getPlanDays } from '@/services/plans';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { calculateShareVolume } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';
import { summarizeProgressiveOverload } from '@/lib/progressive-overload';
import { ActivityPostCard } from '@/components/social/ActivityPostCard';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const GENDERS = ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'];
const FITNESS_GOALS = ['', 'Build Muscle', 'Lose Fat', 'Get Stronger', 'Improve Endurance', 'Learn Skills', 'General Fitness'];
const WORKOUT_TYPES = ['', 'Calisthenics', 'Gym/Weights', 'Bodyweight', 'Mixed', 'Yoga', 'Running'];

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser, profile: myProfile, stats: myStats, updateProfile } = useAuthStore();
  const { showToast, units } = useUIStore();

  const [viewProfile, setViewProfile] = useState<UserProfile | null>(null);
  const [viewStats, setViewStats] = useState<UserStats | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const latestWeight = useUserWeight(isOwnProfile ? currentUser?.uid : undefined, viewProfile?.weight || undefined);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [publicWorkouts, setPublicWorkouts] = useState<any[]>([]);
  const [publicPlans, setPublicPlans] = useState<any[]>([]);
  const [importingPlan, setImportingPlan] = useState<string | null>(null);
  const [profileShareData, setProfileShareData] = useState<ShareCardData | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
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

  const handleShareWorkout = (activity: Activity) => {
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

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl mx-auto">
      {/* Profile header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#121826] p-6 mb-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <img
            src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}&background=4F9E8D&color=14151A&bold=true&size=96`}
            alt={p.displayName}
            className="w-20 h-20 rounded-full border-2 border-teal flex-none object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                className="input-field text-lg font-display mb-1"
                value={editData.displayName || ''}
                onChange={(e) => setEditData({ ...editData, displayName: e.target.value })}
              />
            ) : (
              <h2 className="font-display text-2xl text-bone">{p.displayName}</h2>
            )}
            <div className="text-sm text-teal font-mono">@{p.username}</div>

            <div className="flex items-center gap-4 mt-2 text-xs text-bone-dim font-mono">
              <span className="flex items-center gap-1"><CalendarIcon size={12} /> Joined {joinDate}</span>
              {p.experienceLevel && (
                <span className="px-2 py-0.5 rounded-full bg-teal/10 border border-teal/20 text-teal text-[10px] font-bold uppercase">{p.experienceLevel}</span>
              )}
            </div>
          </div>

          {isOwnProfile && (
            <div className="flex gap-2 flex-none">
              {editing ? (
                <>
                  <button onClick={saveEdit} className="btn-primary flex items-center gap-1.5 text-xs py-2">
                    <Save size={14} /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-secondary flex items-center gap-1.5">
                    <X size={14} /> Cancel
                  </button>
                </>
              ) : (
                <button onClick={startEditing} className="btn-secondary flex items-center gap-1.5">
                  <Edit3 size={14} /> Edit Profile
                </button>
              )}
            </div>
          )}

          {!isOwnProfile && viewProfile && (
            <div className="flex gap-2 flex-none">
              <FollowButton myUid={myProfile!.uid} targetUid={viewProfile.uid} />
              <button onClick={() => setReportOpen(true)} className="btn-secondary flex items-center gap-1.5" title="Report profile"><Flag size={14} /> Report</button>
            </div>
          )}
        </div>

        {/* Bio */}
        {editing ? (
          <textarea
            className="input-field mt-4 min-h-[60px] text-sm"
            placeholder="Write a short bio…"
            value={editData.bio || ''}
            onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
          />
        ) : (
          p.bio && <p className="mt-4 text-sm text-bone-dim leading-relaxed">{p.bio}</p>
        )}
      </motion.div>

      {/* Stats strip */}
      {(() => {
        let displayTotalCalories = stats?.totalCalories || 0;
        publicWorkouts.forEach((workout: any) => {
          const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
          if (rawExLogs.length > 0) {
            const dynamicCals = calculateWorkoutCalories(null, rawExLogs, workout.bodyweight || viewProfile?.weight || 70, workout.durationMin);
            const savedCals = workout.calories || 0;
            displayTotalCalories = displayTotalCalories - savedCals + dynamicCals;
          }
        });

        return (
          <motion.div variants={item} className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
            <div className="rounded-2xl border border-white/[0.06] bg-[#121826] p-3 text-center">
              <div className="text-xl font-bold font-mono text-bone">{stats?.totalWorkouts || 0}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider">WORKOUTS</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-[#121826] p-3 text-center">
              <div className="text-xl font-bold font-mono text-bone">{displayTotalCalories.toLocaleString()}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider">CALORIES</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-[#121826] p-3 text-center">
              <div className="text-xl font-bold font-mono text-bone">{Math.round((stats?.totalDurationMin || 0) / 60)}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider">HOURS</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-[#121826] p-3 text-center">
              <div className="text-xl font-bold font-mono text-bone">{stats?.currentStreak || 0}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider">STREAK</div>
            </div>
            {viewProfile && <FollowCountDisplay uid={viewProfile.uid} />}
          </motion.div>
        );
      })()}

      {/* Progressive Overload Signal */}
      {isOwnProfile && publicWorkouts.length > 0 && (() => {
        const latest = publicWorkouts[0];
        const previous = publicWorkouts.find(workout => workout.dayId === latest.dayId && workout.date !== latest.date);
        const progress = latest.progressiveOverload || summarizeProgressiveOverload(latest, previous);
        const volumeUnit = units === 'imperial' ? 'lb·reps' : 'kg·reps';
        const latestExercises = (latest.exercises || []).filter((exercise: any) => exercise.sets?.some((set: any) => set.completed !== false));
        const formatSet = (set: any) => {
          const reps = Number(set.reps) || Number(set.seconds) || 0;
          if (set.seconds) return `${reps}s`;
          const weight = Number(set.weight) || 0;
          const displayWeight = weight && units === 'imperial' ? Math.round(weight * 2.20462) : weight;
          return `${reps} reps${displayWeight ? ` @ ${displayWeight}${units === 'imperial' ? ' lb' : ' kg'}` : ' @ BW'}`;
        };
        return (
          <motion.div variants={item} className="rounded-2xl border border-teal/30 bg-[#121826] p-5 mb-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-teal">Progressive Overload</div>
                <h3 className="font-display text-lg text-bone mt-1">Your Latest Training Signal</h3>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-mono font-bold uppercase ${progress.status === 'progressed' ? 'bg-teal text-ink' : 'bg-amber/20 text-amber'}`}>{progress.status.replace('_', ' ')}</span>
            </div>
            <p className="mt-3 text-sm text-bone-dim">{progress.message}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><span className="text-bone-dim">LAST SESSION</span><b className="mt-1 block text-bone">{latest.date}</b></div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><span className="text-bone-dim">TOTAL TRAINING VOLUME</span><b className="mt-1 block text-bone">{progress.currentVolume.toLocaleString()} {volumeUnit}</b></div>
            </div>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-bone-dim">LATEST SET BREAKDOWN</div>
              <div className="mt-2 space-y-2">
                {latestExercises.length > 0 ? latestExercises.map((exercise: any) => (
                  <div key={exercise.name} className="flex items-start justify-between gap-3 text-xs">
                    <span className="font-semibold text-bone">{exercise.name}</span>
                    <span className="text-right font-mono text-bone-dim">{exercise.sets.filter((set: any) => set.completed !== false).map(formatSet).join(' · ')}</span>
                  </div>
                )) : <span className="text-xs text-bone-dim">No completed set details recorded.</span>}
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* Profile details (editing mode) */}
      {editing && (
        <motion.div variants={item} className="rounded-2xl border border-white/[0.06] bg-[#121826] p-5 mb-5">
          <h3 className="font-display text-base text-bone mb-4">PERSONAL DETAILS</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Height (cm)</label>
              <input
                type="number"
                className="input-field"
                value={editData.height ?? ''}
                onChange={(e) => setEditData({ ...editData, height: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <input
                type="number"
                className="input-field"
                value={editData.weight ?? ''}
                onChange={(e) => setEditData({ ...editData, weight: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="label">Age</label>
              <input
                type="number"
                className="input-field"
                value={editData.age ?? ''}
                onChange={(e) => setEditData({ ...editData, age: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <select
                className="input-field"
                value={editData.gender || ''}
                onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
              >
                {GENDERS.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fitness Goal</label>
              <select
                className="input-field"
                value={editData.fitnessGoal || ''}
                onChange={(e) => setEditData({ ...editData, fitnessGoal: e.target.value })}
              >
                {FITNESS_GOALS.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Experience</label>
              <select
                className="input-field"
                value={editData.experienceLevel || 'beginner'}
                onChange={(e) => setEditData({ ...editData, experienceLevel: e.target.value as any })}
              >
                {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Preferred Workout</label>
              <select
                className="input-field"
                value={editData.preferredWorkoutType || ''}
                onChange={(e) => setEditData({ ...editData, preferredWorkoutType: e.target.value })}
              >
                {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
              </select>
            </div>
          </div>
        </motion.div>
      )}

      {/* Profile details (view mode) */}
      {!editing && (
        <motion.div variants={item} className="rounded-2xl border border-white/[0.06] bg-[#121826] p-5 mb-5">
          <h3 className="font-display text-base text-bone mb-4">ATHLETE DETAILS</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
            {[
              { label: 'Height', value: p.height ? `${p.height} cm` : '—' },
              { label: 'Weight', value: p.weight ? `${p.weight} kg` : '—' },
              { label: 'Age', value: p.age ? `${p.age}` : '—' },
              { label: 'Gender', value: p.gender || '—' },
              { label: 'Goal', value: p.fitnessGoal || '—' },
              { label: 'Experience', value: p.experienceLevel ? p.experienceLevel.charAt(0).toUpperCase() + p.experienceLevel.slice(1) : '—' },
              { label: 'Workout Type', value: p.preferredWorkoutType || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="font-mono text-[10px] text-bone-dim tracking-wider">{label.toUpperCase()}</div>
                <div className="text-sm font-semibold text-bone mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Training History & Activity Posts */}
      {viewProfile && (
        <motion.div variants={item} className="rounded-2xl border border-white/[0.06] bg-[#121826] p-5 mt-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="font-mono text-[10px] text-teal tracking-widest uppercase">
                {isOwnProfile ? 'TRAINING HISTORY' : 'PUBLIC TRAINING'}
              </div>
              <h3 className="font-display text-xl text-bone mt-1">
                {isOwnProfile ? 'YOUR LOGGED WORKOUTS' : 'PUBLIC WORKOUT POSTS'}
              </h3>
            </div>
            <UsersIcon size={20} className="text-teal" />
          </div>

          {!isOwnProfile && publicPlans.length > 0 && (
            <div className="mb-5">
              <h4 className="font-display text-base text-bone mb-3">Public plans</h4>
              <div className="space-y-2">
                {publicPlans.map(plan => (
                  <div key={plan.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div>
                      <div className="font-semibold text-sm text-bone">{plan.title}</div>
                      <div className="text-xs text-bone-dim">{plan.daysPerWeek || 0} days/week · {plan.description || 'Training plan'}</div>
                    </div>
                    <button className="btn-secondary text-xs" disabled={importingPlan === plan.id} onClick={() => importPublicPlan(plan.id)}>
                      {importingPlan === plan.id ? 'Importing...' : 'Import plan'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h4 className="font-display text-base text-bone mb-4">Recent Activity Posts</h4>
          {publicWorkouts.length === 0 ? (
            <p className="text-sm text-bone-dim">No workouts logged yet.</p>
          ) : (
            <div className="space-y-4">
              {publicWorkouts.slice(0, 12).map(workout => {
                const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                const exerciseNamesList = rawExLogs.map((e: any) => typeof e === 'string' ? e : e.name);

                const activityItem: Activity = {
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
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative rounded-2xl border border-white/[0.06] bg-[#121826] p-6 w-full max-w-md z-10 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <div className="font-mono text-[10px] text-danger tracking-widest">COMMUNITY SAFETY</div>
                <h2 className="font-display text-xl text-bone mt-1">Report @{viewProfile.username}</h2>
              </div>
              <button onClick={() => setReportOpen(false)} className="btn-ghost"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Reason</label>
                <select value={reportReason} onChange={event => setReportReason(event.target.value)} className="input-field">
                  <option value="spam">Spam or scam</option>
                  <option value="harassment">Harassment</option>
                  <option value="unsafe">Unsafe content</option>
                  <option value="impersonation">Impersonation</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Details</label>
                <textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} className="input-field min-h-24 resize-none" placeholder="What should an admin review?" />
              </div>
              <button onClick={submitReport} disabled={reporting} className="btn-danger w-full">
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
    </motion.div>
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
      className={`flex items-center gap-1.5 text-xs py-2 px-4 rounded-xl font-mono transition-all ${
        following ? 'btn-secondary hover:text-danger hover:border-danger' : 'btn-primary'
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
    <>
      <button onClick={() => setModalType('followers')} className="rounded-2xl border border-white/[0.06] bg-[#121826] p-3 text-center hover:bg-white/[0.04] transition-colors">
        <div className="text-xl font-bold font-mono text-bone">{counts?.followers || 0}</div>
        <div className="font-mono text-[10px] text-bone-dim tracking-wider">FOLLOWERS</div>
      </button>
      <button onClick={() => setModalType('following')} className="rounded-2xl border border-white/[0.06] bg-[#121826] p-3 text-center hover:bg-white/[0.04] transition-colors">
        <div className="text-xl font-bold font-mono text-bone">{counts?.following || 0}</div>
        <div className="font-mono text-[10px] text-bone-dim tracking-wider">FOLLOWING</div>
      </button>

      <FollowListModal
        uid={uid}
        type={modalType}
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
      />
    </>
  );
}

// ─── Follow List Modal ──────────────────────────────────
function FollowListModal({ uid, type, isOpen, onClose }: { uid: string, type: 'followers' | 'following' | null, isOpen: boolean, onClose: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm">
      <div className="rounded-2xl border border-white/[0.06] bg-[#121826] w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h2 className="font-display text-lg text-bone capitalize">{type}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/[0.04] rounded-lg transition-colors text-bone-dim hover:text-bone">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-bone-dim text-sm">
              No {type} yet.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.uid} className="flex items-center gap-3">
                  <Link to={`/profile/${u.username}`} onClick={onClose}>
                    <img
                      src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName}&background=4F9E8D&color=14151A&bold=true`}
                      alt={u.displayName}
                      className="w-10 h-10 rounded-full object-cover border border-teal/40"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/profile/${u.username}`} onClick={onClose} className="font-bold text-sm block truncate text-bone hover:text-teal transition-colors">
                      {u.displayName}
                    </Link>
                    <div className="text-xs text-bone-dim font-mono truncate">@{u.username}</div>
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
