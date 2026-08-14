import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc, updateDoc, query, where, serverTimestamp, Timestamp, increment, limit, orderBy, runTransaction, writeBatch, onSnapshot, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { validateComment } from '@/lib/validation';
import type { Activity, Comment, Notification as AppNotification, UserProfile } from '@/types';

async function notify(receiverId: string, notification: Omit<AppNotification, 'id' | 'createdAt' | 'receiverId'>) {
  if (!receiverId || receiverId === notification.senderId) return;
  await addDoc(collection(db, 'notifications'), {
    ...notification,
    receiverId,
    createdAt: serverTimestamp(),
  });
}

export async function createSelfNotification(userId: string, message: string, targetId = ''): Promise<void> {
  await addDoc(collection(db, 'notifications'), {
    receiverId: userId,
    senderId: userId,
    senderName: 'Progress coach',
    senderPhoto: '',
    type: 'achievement',
    message,
    targetId,
    read: false,
    createdAt: serverTimestamp(),
  });
}

// ─── Post Management ──────────────────────────────────────────────

export async function getActivityById(activityId: string): Promise<Activity | null> {
  const docRef = doc(db, 'activities', activityId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Activity;
}

export async function deleteActivity(activityId: string): Promise<void> {
  const activityRef = doc(db, 'activities', activityId);
  try {
    const snap = await getDoc(activityRef);
    let linkedWorkoutId = activityId;
    if (snap.exists()) {
      const data = snap.data();
      if (data.workoutId) linkedWorkoutId = data.workoutId;
    }
    await deleteDoc(activityRef).catch(() => {});
    await deleteDoc(doc(db, 'workouts', linkedWorkoutId)).catch(() => {});
    await deleteDoc(doc(db, 'cardioActivities', linkedWorkoutId)).catch(() => {});
  } catch {
    // If fetching activity failed, still attempt direct delete by id
    await deleteDoc(activityRef).catch(() => {});
  }
  // Also attempt deleting directly by activityId from workouts and cardioActivities
  await deleteDoc(doc(db, 'workouts', activityId)).catch(() => {});
  await deleteDoc(doc(db, 'cardioActivities', activityId)).catch(() => {});
}

// ─── Follow System ──────────────────────────────────────────────

export async function followUser(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) throw new Error('You cannot follow yourself');

  const targetSnap = await getDoc(doc(db, 'users', targetUid));
  if (!targetSnap.exists()) throw new Error('User not found');
  const targetData = targetSnap.data();
  const isPrivate = targetData.privacySettings?.profileVisibility === 'private';

  if (isPrivate) {
    return requestFollow(myUid, targetUid);
  }

  const followingRef = doc(db, `followers/${myUid}/following`, targetUid);
  const followerRef = doc(db, `followers/${targetUid}/followers`, myUid);
  
  const batch = writeBatch(db);
  batch.set(followingRef, { uid: targetUid, followedAt: serverTimestamp() });
  batch.set(followerRef, { uid: myUid, followedAt: serverTimestamp() });
  await batch.commit();
  const senderSnap = await getDoc(doc(db, 'users', myUid));
  const sender = senderSnap.exists() ? senderSnap.data() : {};
  await notify(targetUid, {
    type: 'follow',
    senderId: myUid,
    senderName: sender.displayName || 'An athlete',
    senderPhoto: sender.photoURL || '',
    message: `${sender.displayName || 'An athlete'} followed you`,
    targetId: sender.username || myUid,
    read: false,
  });
}

export async function requestFollow(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) throw new Error('You cannot follow yourself');
  const requestRef = doc(db, `followers/${targetUid}/requests`, myUid);
  await setDoc(requestRef, { uid: myUid, timestamp: serverTimestamp() });
  
  const senderSnap = await getDoc(doc(db, 'users', myUid));
  const sender = senderSnap.exists() ? senderSnap.data() : {};
  await notify(targetUid, {
    type: 'follow_request',
    senderId: myUid,
    senderName: sender.displayName || 'An athlete',
    senderPhoto: sender.photoURL || '',
    message: `${sender.displayName || 'An athlete'} requested to follow you`,
    targetId: sender.username || myUid,
    read: false,
  });
}

export async function acceptFollowRequest(myUid: string, requesterUid: string): Promise<void> {
  const requestRef = doc(db, `followers/${myUid}/requests`, requesterUid);
  const followingRef = doc(db, `followers/${requesterUid}/following`, myUid);
  const followerRef = doc(db, `followers/${myUid}/followers`, requesterUid);
  
  const batch = writeBatch(db);
  batch.set(followingRef, { uid: myUid, followedAt: serverTimestamp() });
  batch.set(followerRef, { uid: requesterUid, followedAt: serverTimestamp() });
  batch.delete(requestRef);
  await batch.commit();

  const senderSnap = await getDoc(doc(db, 'users', myUid));
  const sender = senderSnap.exists() ? senderSnap.data() : {};
  await notify(requesterUid, {
    type: 'follow',
    senderId: myUid,
    senderName: sender.displayName || 'An athlete',
    senderPhoto: sender.photoURL || '',
    message: `${sender.displayName || 'An athlete'} accepted your follow request`,
    targetId: sender.username || myUid,
    read: false,
  });
}

export async function declineFollowRequest(myUid: string, requesterUid: string): Promise<void> {
  const requestRef = doc(db, `followers/${myUid}/requests`, requesterUid);
  await deleteDoc(requestRef);
}

export async function removeFollower(myUid: string, followerUid: string): Promise<void> {
  const followingRef = doc(db, `followers/${followerUid}/following`, myUid);
  const followerRef = doc(db, `followers/${myUid}/followers`, followerUid);
  
  const batch = writeBatch(db);
  batch.delete(followingRef);
  batch.delete(followerRef);
  await batch.commit();
}

export async function unfollowUser(myUid: string, targetUid: string): Promise<void> {
  const followingRef = doc(db, `followers/${myUid}/following`, targetUid);
  const followerRef = doc(db, `followers/${targetUid}/followers`, myUid);
  
  const batch = writeBatch(db);
  batch.delete(followingRef);
  batch.delete(followerRef);
  await batch.commit();
  const senderSnap = await getDoc(doc(db, 'users', myUid));
  const sender = senderSnap.exists() ? senderSnap.data() : {};
  await notify(targetUid, {
    type: 'unfollow',
    senderId: myUid,
    senderName: sender.displayName || 'An athlete',
    senderPhoto: sender.photoURL || '',
    message: `${sender.displayName || 'An athlete'} unfollowed you`,
    targetId: sender.username || myUid,
    read: false,
  });
}

export async function isFollowing(myUid: string, targetUid: string): Promise<boolean> {
  const followingRef = doc(db, `followers/${myUid}/following`, targetUid);
  const snap = await getDoc(followingRef);
  return snap.exists();
}

export async function hasRequestedFollow(myUid: string, targetUid: string): Promise<boolean> {
  const requestRef = doc(db, `followers/${targetUid}/requests`, myUid);
  const snap = await getDoc(requestRef);
  return snap.exists();
}

export async function getFollowing(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, `followers/${uid}/following`));
  return snap.docs.map(d => d.id);
}

export async function getFollowRequests(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, `followers/${uid}/requests`));
  return snap.docs.map(d => d.id);
}

export async function getFollowers(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, `followers/${uid}/followers`));
  return snap.docs.map(d => d.id);
}

export async function getFollowCounts(uid: string): Promise<{ followers: number; following: number }> {
  const [followersSnap, followingSnap] = await Promise.all([
    getDocs(collection(db, `followers/${uid}/followers`)),
    getDocs(collection(db, `followers/${uid}/following`)),
  ]);
  return { followers: followersSnap.size, following: followingSnap.size };
}

export async function getUsersByUids(uids: string[]): Promise<any[]> {
  if (uids.length === 0) return [];
  // Firestore 'in' query supports up to 30 items
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }
  
  const results = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'users'), where(documentId(), 'in', chunk));
    const snap = await getDocs(q);
    results.push(...snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  }
  return results;
}

// ─── User Discovery ─────────────────────────────────────────────

export async function searchUsers(queryStr: string): Promise<any[]> {
  const normalizedQuery = queryStr.toLowerCase().trim();
  
  if (!normalizedQuery) return [];

  // Prefix queries keep discovery bounded as the user base grows. Profiles created
  // before the indexed fields were introduced can be backfilled by the admin tool.
  const end = `${normalizedQuery}\uf8ff`;
  const byUid = new Map<string, any>();
  try {
    const [usernameSnap, displayNameSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('usernameLower', '>=', normalizedQuery), where('usernameLower', '<=', end), limit(20))),
      getDocs(query(collection(db, 'users'), where('displayNameLower', '>=', normalizedQuery), where('displayNameLower', '<=', end), limit(20))),
    ]);
    [...usernameSnap.docs, ...displayNameSnap.docs].forEach(d => byUid.set(d.id, { uid: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Indexed user search failed; using fallback.', error);
  }

  // Older profiles may not have usernameLower/displayNameLower yet. Keep search
  // usable while those records are gradually backfilled.
  if (byUid.size < 20) {
    const fallbackSnap = await getDocs(query(collection(db, 'users'), limit(100)));
    fallbackSnap.docs.forEach(d => {
      const data = d.data();
      const username = String(data.username || '').toLowerCase();
      const displayName = String(data.displayName || '').toLowerCase();
      if (username.startsWith(normalizedQuery) || displayName.startsWith(normalizedQuery) || username.includes(normalizedQuery) || displayName.includes(normalizedQuery)) {
        byUid.set(d.id, { uid: d.id, ...data });
      }
    });
  }
  return [...byUid.values()].slice(0, 20);
}

function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

// ─── Activity Feed ──────────────────────────────────────────────

export async function postActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<string> {
  const cleanedActivity = removeUndefined(activity);
  const docRef = await addDoc(collection(db, 'activities'), {
    ...cleanedActivity,
    createdAt: Timestamp.now(),
  });
  if (activity.visibility !== 'private') {
    const followerUids = await getFollowers(activity.userId);
    await Promise.allSettled(followerUids.map(receiverId => notify(receiverId, {
      type: 'activity',
      senderId: activity.userId,
      senderName: activity.userName,
      senderPhoto: activity.userPhoto,
      message: `${activity.userName} ${activity.summary}`,
      targetId: docRef.id,
      read: false,
    })));
  }
  return docRef.id;
}

export async function getActivity(activityId: string): Promise<Activity | null> {
  const snap = await getDoc(doc(db, 'activities', activityId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Activity) : null;
}

export async function getPublicActivities(limitCount = 100): Promise<Activity[]> {
  const q = query(
    collection(db, 'activities'),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
}

export async function getFeed(userId: string, followingUids: string[]): Promise<Activity[]> {
  // Keep each query scoped to one owner so Firestore can prove the followers-only
  // rule. A server-side fan-out worker can materialize a feed later without
  // changing the client contract.
  const ownerIds = [...new Set([userId, ...followingUids])].slice(0, 31);
  const snapshots = await Promise.all(ownerIds.flatMap(uid => {
    if (uid === userId) {
      return [getDocs(query(collection(db, 'activities'), where('userId', '==', uid)))];
    }
    return [
      getDocs(query(collection(db, 'activities'), where('userId', '==', uid), where('visibility', '==', 'public'))),
      getDocs(query(collection(db, 'activities'), where('userId', '==', uid), where('visibility', '==', 'followers')))
    ];
  }));
  
  let allDocs = snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
  return allDocs
    .sort((a, b) => {
      const va = a.createdAt?.seconds || 0;
      const vb = b.createdAt?.seconds || 0;
      return vb - va;
    })
    .slice(0, 50);
}

export async function getPublicFeed(): Promise<Activity[]> {
  const q = query(
    collection(db, 'activities'),
    where('visibility', '==', 'public')
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Activity))
    .sort((a, b) => {
      const va = a.createdAt?.seconds || 0;
      const vb = b.createdAt?.seconds || 0;
      return vb - va;
    })
    .slice(0, 50);
}

// ─── Likes & Comments ───────────────────────────────────────────

export async function toggleLike(activityId: string, userId: string): Promise<boolean> {
  const likeRef = doc(db, `activities/${activityId}/likes`, userId);
  const activityRef = doc(db, 'activities', activityId);
  const liked = await runTransaction(db, async transaction => {
    const [likeSnap, activitySnap] = await Promise.all([transaction.get(likeRef), transaction.get(activityRef)]);
    if (!activitySnap.exists()) throw new Error('Activity not found');
    const currentCount = Number(activitySnap.data().likesCount || 0);
    if (likeSnap.exists()) {
      transaction.delete(likeRef);
      transaction.update(activityRef, { likesCount: Math.max(0, currentCount - 1) });
      return false;
    }
    transaction.set(likeRef, { userId, likedAt: serverTimestamp() });
    transaction.update(activityRef, { likesCount: currentCount + 1 });
    return true;
  });
  if (liked) {
    const [activitySnap, senderSnap] = await Promise.all([getDoc(activityRef), getDoc(doc(db, 'users', userId))]);
    if (activitySnap.exists()) {
      const activity = activitySnap.data();
      const sender = senderSnap.exists() ? senderSnap.data() : {};
      await notify(activity.userId, {
        type: 'like',
        senderId: userId,
        senderName: sender.displayName || 'An athlete',
        senderPhoto: sender.photoURL || '',
        message: `${sender.displayName || 'An athlete'} liked your activity`,
        targetId: activityId,
        read: false,
      });
    }
  }
  return liked;
}

export async function hasLiked(activityId: string, userId: string): Promise<boolean> {
  const likeRef = doc(db, `activities/${activityId}/likes`, userId);
  const snap = await getDoc(likeRef);
  return snap.exists();
}

export async function addComment(activityId: string, comment: Omit<Comment, 'id' | 'createdAt'>): Promise<string> {
  const safeComment = { ...comment, text: validateComment(comment.text) };
  const docRef = await addDoc(collection(db, `activities/${activityId}/comments`), {
    ...safeComment,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'activities', activityId), { commentsCount: increment(1) });
  const activitySnap = await getDoc(doc(db, 'activities', activityId));
  if (activitySnap.exists()) {
    await notify(activitySnap.data().userId, {
      type: 'comment',
      senderId: comment.userId,
      senderName: comment.userName,
      senderPhoto: comment.userPhoto,
      message: `${comment.userName} commented on your activity`,
      targetId: activityId,
      read: false,
    });
  }
  return docRef.id;
}

export async function getComments(activityId: string): Promise<Comment[]> {
  const snap = await getDocs(collection(db, `activities/${activityId}/comments`));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Comment))
    .sort((a, b) => {
      const va = a.createdAt?.seconds || 0;
      const vb = b.createdAt?.seconds || 0;
      return va - vb; // oldest first for comment threads
    });
}

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const snap = await getDocs(query(
    collection(db, 'notifications'),
    where('receiverId', '==', userId)
  ));
  
  const now = Date.now() / 1000;
  const ONE_WEEK = 7 * 24 * 60 * 60;
  
  const validNotes: AppNotification[] = [];
  const batch = writeBatch(db);
  let deletes = 0;
  
  snap.docs.forEach(d => {
    const data = d.data();
    const time = data.createdAt?.seconds || 0;
    if (now - time > ONE_WEEK) {
      batch.delete(d.ref);
      deletes++;
    } else {
      validNotes.push({ id: d.id, ...data } as AppNotification);
    }
  });
  
  if (deletes > 0) {
    try {
      await batch.commit();
    } catch (err) {
      console.warn('Failed to cleanup old notifications:', err);
    }
  }

  return validNotes
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    })
    .slice(0, 20);
}

export function subscribeToNotifications(
  userId: string,
  onUpdate: (notifications: AppNotification[]) => void,
  onNew?: (notification: AppNotification) => void
): () => void {
  const q = query(collection(db, 'notifications'), where('receiverId', '==', userId));
  return onSnapshot(q, (snap) => {
    const validNotes: AppNotification[] = [];
    const now = Date.now() / 1000;
    const ONE_WEEK = 7 * 24 * 60 * 60;
    
    if (onNew) {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const time = data.createdAt?.seconds || 0;
          // Trigger onNew only if created in the last 15 seconds (to avoid firing on initial load for old notes)
          if (now - time < 15) {
            onNew({ id: change.doc.id, ...data } as AppNotification);
          }
        }
      });
    }

    snap.docs.forEach(d => {
      const data = d.data();
      const time = data.createdAt?.seconds || 0;
      if (now - time <= ONE_WEEK) {
        validNotes.push({ id: d.id, ...data } as AppNotification);
      }
    });

    validNotes.sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    onUpdate(validNotes);
  });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const snap = await getDocs(query(
    collection(db, 'notifications'),
    where('receiverId', '==', userId),
    where('read', '==', false)
  ));
  const batch = writeBatch(db);
  snap.docs.forEach(doc => {
    batch.update(doc.ref, { read: true });
  });
  await batch.commit();
}

export async function getBookmarkedActivities(bookmarkIds: string[]): Promise<Activity[]> {
  if (!bookmarkIds || bookmarkIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < bookmarkIds.length; i += 30) {
    chunks.push(bookmarkIds.slice(i, i + 30));
  }
  
  const results: Activity[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'activities'), where(documentId(), 'in', chunk));
    const snap = await getDocs(q);
    results.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
  }
  return results.sort((a, b) => {
    const va = a.createdAt?.seconds || 0;
    const vb = b.createdAt?.seconds || 0;
    return vb - va;
  });
}

// ─── Live Training Sessions ──────────────────────────────────

export interface ActiveSession {
  uid: string;
  planId: string;
  dayId: string;
  dayTitle: string;
  currentExercise: string;
  startedAt: any;
  updatedAt: any;
  caloriesBurned: number;
  steps?: number;
}

export async function startActiveSession(uid: string, sessionData: Omit<ActiveSession, 'uid' | 'updatedAt'> & { startedAt?: any }) {
  const ref = doc(db, 'activeSessions', uid);
  await setDoc(ref, {
    ...sessionData,
    uid,
    startedAt: sessionData.startedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateActiveSession(uid: string, data: Partial<ActiveSession>) {
  const ref = doc(db, 'activeSessions', uid);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function endActiveSession(uid: string) {
  const ref = doc(db, 'activeSessions', uid);
  const chatRef = collection(db, 'activeSessions', uid, 'chat');
  const snap = await getDocs(chatRef).catch(() => null);
  if (snap && snap.docs.length > 0) {
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit().catch(() => {});
  }
  await deleteDoc(ref).catch(() => {});
}

export async function sendLiveMessage(sessionUid: string, senderUid: string, senderName: string, senderPhoto: string, text: string) {
  const chatRef = collection(db, 'activeSessions', sessionUid, 'chat');
  await addDoc(chatRef, {
    senderUid,
    senderName,
    senderPhoto,
    text,
    createdAt: serverTimestamp(),
  });
}
