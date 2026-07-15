import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc, updateDoc, query, where, serverTimestamp, increment, limit, orderBy, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Activity, Comment, Notification as AppNotification } from '@/types';

async function notify(receiverId: string, notification: Omit<AppNotification, 'id' | 'createdAt' | 'receiverId'>) {
  if (!receiverId || receiverId === notification.senderId) return;
  await addDoc(collection(db, 'notifications'), {
    ...notification,
    receiverId,
    createdAt: serverTimestamp(),
  });
}

// ─── Follow System ──────────────────────────────────────────────

export async function followUser(myUid: string, targetUid: string): Promise<void> {
  if (myUid === targetUid) throw new Error('You cannot follow yourself');
  const followingRef = doc(db, `followers/${myUid}/following`, targetUid);
  const followerRef = doc(db, `followers/${targetUid}/followers`, myUid);
  
  await setDoc(followingRef, { uid: targetUid, followedAt: serverTimestamp() });
  await setDoc(followerRef, { uid: myUid, followedAt: serverTimestamp() });
  const senderSnap = await getDoc(doc(db, 'users', myUid));
  const sender = senderSnap.exists() ? senderSnap.data() : {};
  await notify(targetUid, {
    type: 'follow',
    senderId: myUid,
    senderName: sender.displayName || 'An athlete',
    senderPhoto: sender.photoURL || '',
    message: `${sender.displayName || 'An athlete'} followed you`,
    targetId: myUid,
    read: false,
  });
}

export async function unfollowUser(myUid: string, targetUid: string): Promise<void> {
  const followingRef = doc(db, `followers/${myUid}/following`, targetUid);
  const followerRef = doc(db, `followers/${targetUid}/followers`, myUid);
  
  await deleteDoc(followingRef);
  await deleteDoc(followerRef);
}

export async function isFollowing(myUid: string, targetUid: string): Promise<boolean> {
  const followingRef = doc(db, `followers/${myUid}/following`, targetUid);
  const snap = await getDoc(followingRef);
  return snap.exists();
}

export async function getFollowing(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, `followers/${uid}/following`));
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
    const q = query(collection(db, 'users'), where('__name__', 'in', chunk), where('isPublic', '==', true));
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
  const [usernameSnap, displayNameSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('isPublic', '==', true), where('usernameLower', '>=', normalizedQuery), where('usernameLower', '<=', end), limit(20))),
    getDocs(query(collection(db, 'users'), where('isPublic', '==', true), where('displayNameLower', '>=', normalizedQuery), where('displayNameLower', '<=', end), limit(20))),
  ]);

  const byUid = new Map<string, any>();
  [...usernameSnap.docs, ...displayNameSnap.docs].forEach(d => byUid.set(d.id, { uid: d.id, ...d.data() }));
  return [...byUid.values()].slice(0, 20);
}

// ─── Activity Feed ──────────────────────────────────────────────

export async function postActivity(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'activities'), {
    ...activity,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getFeed(userId: string, followingUids: string[]): Promise<Activity[]> {
  // Keep each query scoped to one owner so Firestore can prove the followers-only
  // rule. A server-side fan-out worker can materialize a feed later without
  // changing the client contract.
  const ownerIds = [...new Set([userId, ...followingUids])].slice(0, 31);
  const snapshots = await Promise.all(ownerIds.map(uid => {
    const constraints = uid === userId
      ? [where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(50)]
      : [where('userId', '==', uid), where('visibility', 'in', ['public', 'followers']), orderBy('createdAt', 'desc'), limit(20)];
    return getDocs(query(collection(db, 'activities'), ...constraints));
  }));
  const allDocs = snapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
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
  const docRef = await addDoc(collection(db, `activities/${activityId}/comments`), {
    ...comment,
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
    where('receiverId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}
