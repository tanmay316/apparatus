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
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

async function deleteRefs(refs: ReturnType<typeof doc>[]) {
  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach(reference => batch.delete(reference));
    await batch.commit();
  }
}

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
  URL.revokeObjectURL(url);
}

export async function deleteAccountData(uid: string, username?: string) {
  const [plansData, workoutsSnap, measurementsSnap, skillsSnap, activitiesSnap, followingSnap, followersSnap, notificationsSnap] = await Promise.all([
    getUserPlanData(uid),
    getDocs(query(collection(db, 'workouts'), where('userId', '==', uid))),
    getDocs(collection(db, `users/${uid}/measurements`)),
    getDocs(collection(db, `users/${uid}/skills`)),
    getDocs(query(collection(db, 'activities'), where('userId', '==', uid))),
    getDocs(collection(db, `followers/${uid}/following`)),
    getDocs(collection(db, `followers/${uid}/followers`)),
    getDocs(query(collection(db, 'notifications'), where('receiverId', '==', uid))),
  ]);

  const refs: ReturnType<typeof doc>[] = [
    doc(db, 'users', uid),
    doc(db, 'users', uid, 'stats', 'current'),
  ];
  refs.push(...plansData.refs);
  refs.push(...workoutsSnap.docs.map(item => item.ref));
  refs.push(...measurementsSnap.docs.map(item => item.ref));
  refs.push(...skillsSnap.docs.map(item => item.ref));
  refs.push(...activitiesSnap.docs.map(item => item.ref));
  refs.push(...notificationsSnap.docs.map(item => item.ref));
  refs.push(...followingSnap.docs.map(item => item.ref));
  refs.push(...followersSnap.docs.map(item => item.ref));
  if (username) refs.push(doc(db, 'usernames', username));

  // Remove the mirrored relationship documents from the accounts this user follows.
  const mirroredFollowingRefs = followingSnap.docs.map(item => doc(db, `followers/${item.id}/followers`, uid));
  const mirroredFollowerRefs = followersSnap.docs.map(item => doc(db, `followers/${item.id}/following`, uid));
  refs.push(...mirroredFollowingRefs, ...mirroredFollowerRefs);
  await deleteRefs(refs);
}

/** Remove all user-owned application data while keeping the Firebase account and handle. */
export async function resetUserData(uid: string) {
  const [plansData, workoutsSnap, measurementsSnap, skillsSnap, activitiesSnap, followingSnap, followersSnap, notificationsSnap, reportsSnap, customExercisesSnap] = await Promise.all([
    getUserPlanData(uid),
    getDocs(query(collection(db, 'workouts'), where('userId', '==', uid))),
    getDocs(collection(db, `users/${uid}/measurements`)),
    getDocs(collection(db, `users/${uid}/skills`)),
    getDocs(query(collection(db, 'activities'), where('userId', '==', uid))),
    getDocs(collection(db, `followers/${uid}/following`)),
    getDocs(collection(db, `followers/${uid}/followers`)),
    getDocs(query(collection(db, 'notifications'), where('receiverId', '==', uid))),
    getDocs(query(collection(db, 'reports'), where('reporterId', '==', uid))),
    getDocs(query(collection(db, 'exerciseLibrary'), where('createdBy', '==', uid))),
  ]);

  const refs: ReturnType<typeof doc>[] = [
    ...plansData.refs,
    ...workoutsSnap.docs.map(item => item.ref),
    ...measurementsSnap.docs.map(item => item.ref),
    ...skillsSnap.docs.map(item => item.ref),
    ...activitiesSnap.docs.map(item => item.ref),
    ...notificationsSnap.docs.map(item => item.ref),
    ...followingSnap.docs.map(item => item.ref),
    ...followersSnap.docs.map(item => item.ref),
    ...reportsSnap.docs.map(item => item.ref),
    ...customExercisesSnap.docs.map(item => item.ref),
  ];
  for (const activity of activitiesSnap.docs) {
    const [likes, comments] = await Promise.all([
      getDocs(collection(db, `activities/${activity.id}/likes`)),
      getDocs(collection(db, `activities/${activity.id}/comments`)),
    ]);
    refs.push(...likes.docs.filter(item => item.id === uid).map(item => item.ref));
    refs.push(...comments.docs.filter(item => item.data().userId === uid).map(item => item.ref));
  }
  refs.push(...followingSnap.docs.map(item => doc(db, `followers/${item.id}/followers`, uid)));
  refs.push(...followersSnap.docs.map(item => doc(db, `followers/${item.id}/following`, uid)));
  await deleteRefs(refs);

  await setDoc(doc(db, 'users', uid, 'stats', 'current'), {
    totalWorkouts: 0, totalCalories: 0, totalDurationMin: 0, totalVolume: 0,
    currentStreak: 0, longestStreak: 0, lastWorkoutDate: null, xp: 0,
    prCount: 0, bestHold: 0, badges: [],
  });
  await setDoc(doc(db, 'users', uid), {
    bio: '', photoURL: '', height: null, weight: null, age: null, gender: '',
    fitnessGoal: '', experienceLevel: 'beginner', preferredWorkoutType: '',
    isPublic: true, activePlanId: null, updatedAt: serverTimestamp(),
  }, { merge: true });
}

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
