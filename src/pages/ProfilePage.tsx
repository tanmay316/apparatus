import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import {
  MapPin, Calendar as CalendarIcon, Edit3, Save, X,
  Users as UsersIcon, UserPlus, UserMinus, Flag, Share2
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useUserWeight } from '@/hooks/use-user-weight';
import { followUser, unfollowUser, isFollowing, getFollowCounts, getFollowers, getFollowing, getUsersByUids } from '@/services/social';
import type { UserProfile, UserStats } from '@/types';
import { createReport } from '@/services/admin';
import { getPublicWorkoutsForUser, getUserWorkouts } from '@/services/workouts';
import { clonePlan, getPublicPlansForUser, getPlanDays } from '@/services/plans';
import { ShareCardModal, type ShareCardData } from '@/components/ui/ShareCardModal';
import { calculateBodyweightReps, calculateShareVolume } from '@/lib/muscle-map';
import { calculateWorkoutCalories } from '@/lib/calories';

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
        // Fetch other user by username
        try {
          const usernameDoc = await getDoc(doc(db, 'usernames', username));
          let uid = '';
          if (usernameDoc.exists()) {
            uid = usernameDoc.data().uid;
          } else {
            uid = username; // Assume direct UID parameter
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

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {/* Profile header */}
      <motion.div variants={item} className="card p-6 mb-5">
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
              <h2 className="font-display text-2xl">{p.displayName}</h2>
            )}
            <div className="text-sm text-teal font-mono">@{p.username}</div>

            <div className="flex items-center gap-4 mt-2 text-xs text-bone-dim font-mono">
              <span className="flex items-center gap-1"><CalendarIcon size={12} /> Joined {joinDate}</span>
              {p.experienceLevel && (
                <span className="tag-teal text-[10px]">{p.experienceLevel}</span>
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
            <div className="stat-pill text-center">
              <div className="text-xl font-bold font-mono">{stats?.totalWorkouts || 0}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider">WORKOUTS</div>
            </div>
            <div className="stat-pill text-center">
              <div className="text-xl font-bold font-mono">{displayTotalCalories.toLocaleString()}</div>
              <div className="font-mono text-[10px] text-bone-dim tracking-wider">CALORIES</div>
            </div>
        <div className="stat-pill text-center">
          <div className="text-xl font-bold font-mono">{Math.round((stats?.totalDurationMin || 0) / 60)}</div>
          <div className="font-mono text-[10px] text-bone-dim tracking-wider">HOURS</div>
        </div>
        <div className="stat-pill text-center">
          <div className="text-xl font-bold font-mono">{stats?.currentStreak || 0}</div>
          <div className="font-mono text-[10px] text-bone-dim tracking-wider">STREAK</div>
        </div>
        {viewProfile && <FollowCountDisplay uid={viewProfile.uid} />}
          </motion.div>
        );
      })()}

      {/* Details (editing mode) */}
      {editing && (
        <motion.div variants={item} className="card p-5 mb-5">
          <h3 className="font-display text-base mb-4">PERSONAL DETAILS</h3>
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
      {!editing && isOwnProfile && (
        <motion.div variants={item} className="card p-5">
          <h3 className="font-display text-base mb-4">DETAILS</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
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
                <div className="text-sm mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {viewProfile && (
        <motion.div variants={item} className="card p-5 mt-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="font-mono text-[10px] text-teal tracking-widest uppercase">
                {isOwnProfile ? 'TRAINING HISTORY' : 'PUBLIC TRAINING'}
              </div>
              <h3 className="font-display text-xl mt-1">
                {isOwnProfile ? 'YOUR LOGGED WORKOUTS' : 'PROGRESS YOU CAN FOLLOW'}
              </h3>
            </div>
            <UsersIcon size={20} className="text-teal" />
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="stat-pill">
              <div className="font-mono text-lg">{publicWorkouts.length}</div>
              <div className="font-mono text-[10px] text-bone-dim">
                {isOwnProfile ? 'TOTAL SESSIONS' : 'PUBLIC SESSIONS'}
              </div>
            </div>
            <div className="stat-pill">
              <div className="font-mono text-lg">
                {publicWorkouts.reduce((sum, workout) => {
                  const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                  const c = rawExLogs.length > 0
                    ? calculateWorkoutCalories(null, rawExLogs, workout.bodyweight || viewProfile?.weight || 70, workout.durationMin)
                    : workout.calories || 0;
                  return sum + c;
                }, 0).toLocaleString()}
              </div>
              <div className="font-mono text-[10px] text-bone-dim">CALORIES</div>
            </div>
            <div className="stat-pill">
              <div className="font-mono text-lg">
                {publicWorkouts.reduce((sum, workout) => sum + (workout.exercises ? calculateShareVolume(workout.exercises, viewProfile.weight || 70) : (workout.volume || 0)), 0).toLocaleString()}
              </div>
              <div className="font-mono text-[10px] text-bone-dim">VOLUME</div>
            </div>
            <div className="stat-pill">
              <div className="font-mono text-lg">
                {publicWorkouts.reduce((sum, workout) => sum + (workout.durationMin || 0), 0)}m
              </div>
              <div className="font-mono text-[10px] text-bone-dim">DURATION</div>
            </div>
          </div>

          {!isOwnProfile && publicPlans.length > 0 && (
            <div className="mb-5">
              <h4 className="font-display text-base mb-3">Public plans</h4>
              <div className="space-y-2">
                {publicPlans.map(plan => (
                  <div key={plan.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink-2 p-3">
                    <div>
                      <div className="font-semibold text-sm">{plan.title}</div>
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

          <h4 className="font-display text-base mb-3">Recent completed workouts</h4>
          {publicWorkouts.length === 0 ? (
            <p className="text-sm text-bone-dim">No workouts logged yet.</p>
          ) : (
            <div className="space-y-3">
              {publicWorkouts.slice(0, 12).map(workout => (
                <div key={workout.id} className="relative overflow-hidden rounded-2xl border border-line/70 bg-gradient-to-br from-ink-2 via-ink-2 to-amber/5 p-5 shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-amber/40">
                  <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber/10 blur-3xl pointer-events-none" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="relative flex items-center gap-2"><span className="rounded-full bg-teal/10 px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-teal">Completed</span><span className="text-[10px] font-mono text-bone-dim">{workout.date}</span></div>
                      <div className="relative mt-3 text-lg font-semibold">{workout.dayTitle || 'Workout'}</div>
                      <div className="relative mt-1 text-xs text-amber">{workout.planTitle || 'Personal session'}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-bone-dim font-mono">
                      <button
                        type="button"
                        onClick={async (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          
                          const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                          let filteredExLogs = [...rawExLogs];
                          if (workout.planId) {
                            try {
                              const planDays = await getPlanDays(workout.planId);
                              const dayPlan = planDays.find((d: any) => d.id === workout.dayId);
                              if (dayPlan) {
                                const warmupNames = new Set((dayPlan.warmup || []).map((e: any) => e.name.toLowerCase()));
                                const cooldownNames = new Set((dayPlan.cooldown || []).map((e: any) => e.name.toLowerCase()));
                                filteredExLogs = filteredExLogs.filter((e: any) => !warmupNames.has(e.name.toLowerCase()) && !cooldownNames.has(e.name.toLowerCase()));
                              }
                            } catch (e) {
                              console.error('Failed to load plan days for filtering warmup/cooldown:', e);
                            }
                          }

                          const workoutWeight = workout.bodyweight || latestWeight;
                          const calculatedCalories = rawExLogs.length > 0
                            ? calculateWorkoutCalories(null, rawExLogs, workoutWeight || 70, workout.durationMin)
                            : workout.calories || 0;

                          setProfileShareData({
                            dayTitle: workout.dayTitle || 'Workout',
                            planTitle: workout.planTitle || 'Personal session',
                            date: workout.date,
                            durationMin: workout.durationMin || 0,
                            volume: workout.volume || 0,
                            calories: calculatedCalories,
                            exerciseNames: filteredExLogs.map((ex: any) => ex.name),
                            exerciseLogs: filteredExLogs.map((ex: any) => ({ name: ex.name, sets: ex.sets || [] })),
                            bodyweight: workoutWeight || undefined,
                          });
                        }}
                        className="w-7 h-7 rounded-full bg-ink flex items-center justify-center border border-line/80 text-bone-dim hover:text-amber hover:border-amber/40 transition-colors"
                        title="Share workout card"
                      >
                        <Share2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs text-bone-dim">
                    <span className="rounded-xl border border-line/50 bg-ink/50 px-3 py-2"><b className="block text-bone">{workout.durationMin || 0}</b>min</span>
                    {(() => {
                      const workoutWeight = workout.bodyweight || latestWeight;
                      const rawExLogs = (workout.exercises || workout.details?.exerciseLogs || []) as any[];
                      const calculatedCalories = rawExLogs.length > 0
                        ? calculateWorkoutCalories(null, rawExLogs, workoutWeight || 70, workout.durationMin)
                        : workout.calories || 0;
                      return (
                        <span className="rounded-xl border border-line/50 bg-ink/50 px-3 py-2">
                          <b className="block text-bone">{calculatedCalories}</b>kcal
                        </span>
                      );
                    })()}
                    {(() => {
                      const workoutWeight = workout.bodyweight || latestWeight;
                      const displayWeight = workoutWeight ? (units === 'imperial' ? Math.round(workoutWeight * 2.20462) : workoutWeight) : null;
                      const displayWeightUnit = units === 'imperial' ? 'lb' : 'kg';
                      const repsLabel = displayWeight ? 'reps @ BW' : 'BW reps';
                      const shareVolume = calculateShareVolume(workout.exercises || [], workoutWeight || 70);
                      const hasVolume = shareVolume > 0;
                      return (
                        <span className="rounded-xl border border-line/50 bg-ink/50 px-3 py-2">
                          <b className="block text-bone">
                            {hasVolume ? shareVolume.toLocaleString() : (calculateBodyweightReps(workout.exercises || []) || '0')}
                          </b>
                          {hasVolume ? 'kg·reps' : repsLabel}
                        </span>
                      );
                    })()}
                    <span className="rounded-xl border border-line/50 bg-ink/50 px-3 py-2"><b className="block text-bone">{workout.exercises?.length || 0}</b>exercises</span>
                  </div>
                  {workout.exercises?.length > 0 && (
                    <div className="relative mt-4 space-y-1.5 border-t border-line/60 pt-4">
                      {workout.exercises.map((exercise: any, exerciseIndex: number) => (
                        <div key={`${exercise.name}-${exerciseIndex}`} className="flex items-center gap-2 rounded-lg border border-line/40 bg-ink/45 px-2.5 py-2 text-xs">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber/10 font-mono text-[10px] text-amber">{String(exerciseIndex + 1).padStart(2, '0')}</span>
                          <span className="truncate text-bone">{exercise.name}</span>
                          <span className="ml-auto shrink-0 text-[10px] font-mono text-bone-dim">{exercise.sets?.filter((set: any) => set.completed).length || 0} sets</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative card p-6 w-full max-w-md z-10">
            <div className="flex items-start justify-between gap-4 mb-5"><div><div className="font-mono text-[10px] text-danger tracking-widest">COMMUNITY SAFETY</div><h2 className="font-display text-xl mt-1">Report @{viewProfile.username}</h2></div><button onClick={() => setReportOpen(false)} className="btn-ghost"><X size={16} /></button></div>
            <div className="space-y-4"><div><label className="label">Reason</label><select value={reportReason} onChange={event => setReportReason(event.target.value)} className="input-field"><option value="spam">Spam or scam</option><option value="harassment">Harassment</option><option value="unsafe">Unsafe content</option><option value="impersonation">Impersonation</option><option value="other">Other</option></select></div><div><label className="label">Details</label><textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} className="input-field min-h-24 resize-none" placeholder="What should an admin review?" /></div><button onClick={submitReport} disabled={reporting} className="btn-danger w-full">{reporting ? 'Submitting...' : 'Submit report'}</button></div>
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
      className={`flex items-center gap-1.5 text-xs py-2 px-4 rounded font-mono transition-all ${
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
      <button onClick={() => setModalType('followers')} className="stat-pill text-center hover:bg-line/30 transition-colors">
        <div className="text-xl font-bold font-mono">{counts?.followers || 0}</div>
        <div className="font-mono text-[10px] text-bone-dim tracking-wider">FOLLOWERS</div>
      </button>
      <button onClick={() => setModalType('following')} className="stat-pill text-center hover:bg-line/30 transition-colors">
        <div className="text-xl font-bold font-mono">{counts?.following || 0}</div>
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
      <div className="card w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h2 className="font-display text-lg capitalize">{type}</h2>
          <button onClick={onClose} className="p-1 hover:bg-line rounded transition-colors text-bone-dim hover:text-bone">
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
                      className="w-10 h-10 rounded-full object-cover border border-teal"
                      referrerPolicy="no-referrer"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/profile/${u.username}`} onClick={onClose} className="font-bold text-sm block truncate hover:text-teal transition-colors">
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
