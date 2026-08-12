import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
  serverTimestamp,
  increment,
  updateDoc,
  limit,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage, ADMIN_EMAIL } from '@/lib/firebase';

// ─── Helpers ──────────────────────────────────────────────────

/** Delete an array of doc refs in small batches with per-doc retry fallback */
async function safeDeleteRefs(
  refs: ReturnType<typeof doc>[],
  onProgress?: (msg: string, pct: number) => void,
  basePct = 0,
  pctRange = 100,
  label = 'Deleting'
) {
  if (refs.length === 0) return;
  const BATCH_SIZE = 100; // small enough to never time out
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    try {
      const batch = writeBatch(db);
      chunk.forEach(r => batch.delete(r));
      await batch.commit();
    } catch {
      // If batch fails, fall back to individual deletes (slower but reliable)
      for (const r of chunk) {
        try { await deleteDoc(r); } catch { /* skip already-deleted docs */ }
      }
    }
    if (onProgress) {
      const done = Math.min(i + BATCH_SIZE, refs.length);
      const pct = basePct + Math.round((done / refs.length) * pctRange);
      onProgress(`${label} (${done}/${refs.length})...`, Math.min(pct, basePct + pctRange));
    }
  }
}

/** Safely fetch a query, returning empty array on permission errors */
async function safeFetch(q: ReturnType<typeof query>) {
  try { return (await getDocs(q)).docs; } catch { return []; }
}

/** Safely fetch a collection */
async function safeCollFetch(path: string) {
  try { return (await getDocs(collection(db, path))).docs; } catch { return []; }
}

// ─── Plan data ────────────────────────────────────────────────

async function getUserPlanData(uid: string) {
  const plansSnap = await getDocs(query(collection(db, 'plans'), where('ownerId', '==', uid)));
  const plans = [] as Record<string, unknown>[];
  const refs: ReturnType<typeof doc>[] = [];
  for (const planDoc of plansSnap.docs) {
    const daysSnap = await getDocs(collection(db, `plans/${planDoc.id}/days`));
    plans.push({ id: planDoc.id, ...planDoc.data(), days: daysSnap.docs.map(day => ({ id: day.id, ...day.data() })) });
    daysSnap.docs.forEach(day => refs.push(day.ref));
    refs.push(planDoc.ref);
  }
  return { plans, refs };
}

// ─── Export ───────────────────────────────────────────────────

export async function exportAccountData(uid: string) {
  const [profileSnap, statsSnap, plansData, workoutsSnap, measurementsSnap, skillsSnap, activitiesSnap, followingSnap, followersSnap, notificationsSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'users', uid, 'stats', 'current')),
    getUserPlanData(uid),
    getDocs(query(collection(db, 'workouts'), where('userId', '==', uid))),
    getDocs(collection(db, `users/${uid}/measurements`)),
    getDocs(collection(db, `users/${uid}/skills`)),
    getDocs(query(collection(db, 'activities'), where('userId', '==', uid))),
    getDocs(collection(db, `followers/${uid}/following`)),
    getDocs(collection(db, `followers/${uid}/followers`)),
    getDocs(query(collection(db, 'notifications'), where('receiverId', '==', uid))),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : null,
    stats: statsSnap.exists() ? statsSnap.data() : null,
    plans: plansData.plans,
    workouts: workoutsSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    measurements: measurementsSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    skills: skillsSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    activities: activitiesSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    following: followingSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    followers: followersSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    notifications: notificationsSnap.docs.map(item => ({ id: item.id, ...item.data() })),
  };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── Gather ALL user doc refs ─────────────────────────────────
// This is used by both delete and reset so we only write the logic once.

interface GatherResult {
  refs: any[];
  clanMembershipDocs: any[];
}

async function gatherUserRefs(uid: string, onProgress?: (msg: string, pct: number) => void): Promise<GatherResult> {
  const refs: any[] = [];

  // Phase 1: Core data (0-10%)
  onProgress?.('Fetching plans...', 2);
  const plansData = await getUserPlanData(uid);
  refs.push(...plansData.refs);

  onProgress?.('Fetching workouts...', 4);
  const workoutDocs = await safeFetch(query(collection(db, 'workouts'), where('userId', '==', uid)));
  refs.push(...workoutDocs.map(d => d.ref));

  onProgress?.('Fetching measurements & skills...', 6);
  const [measurementDocs, skillDocs] = await Promise.all([
    safeCollFetch(`users/${uid}/measurements`),
    safeCollFetch(`users/${uid}/skills`),
  ]);
  refs.push(...measurementDocs.map(d => d.ref));
  refs.push(...skillDocs.map(d => d.ref));

  // Phase 2: Social & activities (10-20%)
  onProgress?.('Fetching activities...', 10);
  const activityDocs = await safeFetch(query(collection(db, 'activities'), where('userId', '==', uid)));
  for (let i = 0; i < activityDocs.length; i++) {
    const act = activityDocs[i];
    refs.push(act.ref);
    const [likesDocs, commentsDocs] = await Promise.all([
      safeCollFetch(`activities/${act.id}/likes`),
      safeCollFetch(`activities/${act.id}/comments`),
    ]);
    refs.push(...likesDocs.map(d => d.ref));
    refs.push(...commentsDocs.map(d => d.ref));
    if (onProgress && i % 3 === 0) {
      onProgress(`Fetching activity data (${i + 1}/${activityDocs.length})...`, 10 + Math.round((i / activityDocs.length) * 5));
    }
  }

  // Phase 3: Cardio activities (15-18%)
  onProgress?.('Fetching cardio activities...', 16);
  const cardioDocs = await safeFetch(query(collection(db, 'cardioActivities'), where('userId', '==', uid)));
  refs.push(...cardioDocs.map(d => d.ref));

  // Phase 4: Social graph (18-22%)
  onProgress?.('Fetching social graph...', 18);
  const [followingDocs, followersDocs, requestsDocs] = await Promise.all([
    safeCollFetch(`followers/${uid}/following`),
    safeCollFetch(`followers/${uid}/followers`),
    safeCollFetch(`followers/${uid}/requests`),
  ]);
  refs.push(...followingDocs.map(d => d.ref));
  refs.push(...followersDocs.map(d => d.ref));
  refs.push(...requestsDocs.map(d => d.ref));
  // Mirror refs: remove this user from other people's follower/following lists
  refs.push(...followingDocs.map(d => doc(db, `followers/${d.id}/followers`, uid)));
  refs.push(...followersDocs.map(d => doc(db, `followers/${d.id}/following`, uid)));

  // Phase 5: Notifications & reports (22-25%)
  onProgress?.('Fetching notifications...', 22);
  const [notifDocs, reportDocs, customExDocs, appNotifDocs] = await Promise.all([
    safeFetch(query(collection(db, 'notifications'), where('receiverId', '==', uid))),
    safeFetch(query(collection(db, 'reports'), where('reporterId', '==', uid))),
    safeFetch(query(collection(db, 'exerciseLibrary'), where('createdBy', '==', uid))),
    safeFetch(query(collection(db, 'app_notifications'), where('userId', '==', uid))),
  ]);
  refs.push(...notifDocs.map(d => d.ref));
  refs.push(...reportDocs.map(d => d.ref));
  refs.push(...customExDocs.map(d => d.ref));
  refs.push(...appNotifDocs.map(d => d.ref));

  // Phase 6: Clan memberships (25-28%)
  onProgress?.('Fetching clan memberships...', 25);
  const clanMembershipDocs = await safeFetch(query(collection(db, 'clan_memberships'), where('userId', '==', uid)));
  refs.push(...clanMembershipDocs.map(d => d.ref));

  // Phase 7: Challenge participations (28-30%)
  onProgress?.('Fetching challenge participations...', 28);
  const challengePartDocs = await safeFetch(query(collection(db, 'challenge_participants'), where('userId', '==', uid)));
  refs.push(...challengePartDocs.map(d => d.ref));

  // Phase 8: Event registrations & reviews (30-33%)
  onProgress?.('Fetching event registrations...', 30);
  const [eventRegDocs, eventReviewDocs] = await Promise.all([
    safeFetch(query(collection(db, 'event_registrations'), where('userId', '==', uid))),
    safeFetch(query(collection(db, 'event_reviews'), where('userId', '==', uid))),
  ]);
  refs.push(...eventRegDocs.map(d => d.ref));
  refs.push(...eventReviewDocs.map(d => d.ref));

  // Phase 9: Community memberships (33-35%)
  onProgress?.('Fetching community memberships...', 33);
  const communityMemberDocs = await safeFetch(query(collection(db, 'community_members'), where('userId', '==', uid)));
  refs.push(...communityMemberDocs.map(d => d.ref));

  // Phase 10: Simple event participations (35-36%)
  onProgress?.('Fetching event participations...', 35);
  const simpleEventPartDocs = await safeFetch(query(collection(db, 'simple_event_participants'), where('userId', '==', uid)));
  refs.push(...simpleEventPartDocs.map(d => d.ref));

  // Phase 11: Community posts by user (36-38%)
  onProgress?.('Fetching community posts...', 36);
  const communityPostDocs = await safeFetch(query(collection(db, 'community_posts'), where('userId', '==', uid)));
  refs.push(...communityPostDocs.map(d => d.ref));

  // Phase 12: Active sessions (38-39%)
  onProgress?.('Fetching active sessions...', 38);
  try {
    const sessionDoc = await getDoc(doc(db, 'activeSessions', uid));
    if (sessionDoc.exists()) {
      const chatDocs = await safeCollFetch(`activeSessions/${uid}/chat`);
      refs.push(...chatDocs.map(d => d.ref));
      refs.push(sessionDoc.ref);
    }
  } catch { /* skip if no active session */ }

  // Phase 13: User stats subcollection (39-40%)
  onProgress?.('Fetching user stats...', 39);
  refs.push(doc(db, 'users', uid, 'stats', 'current'));

  onProgress?.(`Compiled ${refs.length} documents to delete`, 40);
  return { refs, clanMembershipDocs };
}

// ─── Decrement community/clan member counts ───────────────────

async function decrementMemberCounts(clanMembershipDocs: any[]) {
  for (const d of clanMembershipDocs) {
    const data = d.data();
    if (data?.clanId) {
      try {
        await updateDoc(doc(db, 'clans_v2', data.clanId), { memberCount: increment(-1) });
      } catch { /* clan may already be deleted */ }
    }
  }
}

// ─── Transfer Ownership to Admin ──────────────────────────────

async function transferOwnershipToAdmin(uid: string) {
  if (!ADMIN_EMAIL) return;

  const adminQuery = await safeFetch(query(collection(db, 'users'), where('email', '==', ADMIN_EMAIL), limit(1)));
  if (adminQuery.length === 0) return;

  const adminDoc = adminQuery[0];
  const adminId = adminDoc.id;
  const adminData = adminDoc.data() as any;
  const adminName = adminData?.displayName || 'Admin';
  const adminPhoto = adminData?.photoURL || '';

  const clansQuery = await safeFetch(query(collection(db, 'clans_v2'), where('leaderId', '==', uid)));
  for (const clan of clansQuery) {
    const clanBatch = writeBatch(db);
    clanBatch.update(clan.ref, { leaderId: adminId, leaderName: adminName, updatedAt: serverTimestamp() });
    const memberId = `${clan.id}_${adminId}`;
    clanBatch.set(doc(db, 'clan_memberships', memberId), {
      clanId: clan.id, userId: adminId, userName: adminName, userPhoto: adminPhoto,
      role: 'leader', joinedAt: serverTimestamp(), status: 'active'
    }, { merge: true });
    try { await clanBatch.commit(); } catch {}
  }

  const challengesQuery = await safeFetch(query(collection(db, 'challenges_v2'), where('createdBy', '==', uid)));
  for (const challenge of challengesQuery) {
    try { await updateDoc(challenge.ref, { createdBy: adminId, creatorName: adminName, creatorPhoto: adminPhoto, updatedAt: serverTimestamp() }); } catch {}
  }

  const eventsQuery = await safeFetch(query(collection(db, 'simple_events'), where('createdBy', '==', uid)));
  for (const event of eventsQuery) {
    try { await updateDoc(event.ref, { createdBy: adminId, creatorName: adminName, creatorPhoto: adminPhoto, updatedAt: serverTimestamp() }); } catch {}
  }
}

// ─── Delete Account ───────────────────────────────────────────

export async function deleteAccountData(uid: string, username?: string, onProgress?: (msg: string, pct: number) => void) {
  const gathered = await gatherUserRefs(uid, onProgress);
  const { refs, clanMembershipDocs } = gathered;

  // Also delete the user profile doc itself
  refs.push(doc(db, 'users', uid));
  if (username) refs.push(doc(db, 'usernames', username));

  // Decrement member counts before deleting
  onProgress?.('Updating clan memberships...', 41);
  await decrementMemberCounts(clanMembershipDocs);

  onProgress?.('Transferring ownership to admin...', 42);
  await transferOwnershipToAdmin(uid);

  // Delete everything
  onProgress?.('Deleting data...', 43);
  await safeDeleteRefs(refs, onProgress, 43, 58, 'Cleaning up');
}

// ─── Reset Account ────────────────────────────────────────────

export async function resetUserData(uid: string, onProgress?: (msg: string, pct: number) => void) {
  const gathered = await gatherUserRefs(uid, onProgress);
  const { refs, clanMembershipDocs } = gathered;

  // Decrement member counts before deleting
  onProgress?.('Updating clan memberships...', 41);
  await decrementMemberCounts(clanMembershipDocs);

  onProgress?.('Transferring ownership to admin...', 42);
  await transferOwnershipToAdmin(uid);

  // Delete everything
  onProgress?.('Deleting data...', 43);
  await safeDeleteRefs(refs, onProgress, 43, 48, 'Cleaning up');

  // Reset profile to defaults (keep account + username)
  onProgress?.('Resetting profile...', 92);
  try {
    await setDoc(doc(db, 'users', uid, 'stats', 'current'), {
      totalWorkouts: 0, totalCalories: 0, totalDurationMin: 0, totalVolume: 0,
      currentStreak: 0, longestStreak: 0, lastWorkoutDate: null, xp: 0,
      prCount: 0, bestHold: 0, badges: [],
    });
  } catch { /* stats doc may have been deleted above, create fresh */ }

  await setDoc(doc(db, 'users', uid), {
    bio: '', photoURL: '', height: null, weight: null, age: null, gender: '',
    fitnessGoal: '', experienceLevel: 'beginner', preferredWorkoutType: '',
    isPublic: true, activePlanId: null, updatedAt: serverTimestamp(),
  }, { merge: true });

  onProgress?.('Reset complete!', 100);
}

// ─── Avatar ───────────────────────────────────────────────────

export async function uploadAvatar(uid: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Profile images must be smaller than 5 MB.');
  const avatarRef = ref(storage, `avatars/${uid}/profile`);
  await uploadBytes(avatarRef, file, { contentType: file.type, cacheControl: 'public,max-age=3600' });
  return getDownloadURL(avatarRef);
}

export async function deleteAvatar(uid: string) {
  try {
    await deleteObject(ref(storage, `avatars/${uid}/profile`));
  } catch (error: any) {
    if (error?.code !== 'storage/object-not-found') throw error;
  }
}
