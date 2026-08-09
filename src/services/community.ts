import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, increment, setDoc, writeBatch, Timestamp, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ClanV2, ClanMembership, ChallengeV2, ChallengeParticipant, SimpleEvent, EventParticipant, ChallengeMetric, CommunityPost } from '@/types';

// ─── CLANS (V2) ──────────────────────────────────────────────────

export async function createClan(clan: Omit<ClanV2, 'id' | 'memberCount' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'clans_v2'), {
    ...clan,
    memberCount: 1,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // Add creator as leader
  const memberId = `${docRef.id}_${clan.leaderId}`;
  await setDoc(doc(db, 'clan_memberships', memberId), {
    clanId: docRef.id,
    userId: clan.leaderId,
    userName: clan.leaderName,
    userPhoto: '', // Assuming not passed in create, or can be added to args
    role: 'leader',
    joinedAt: serverTimestamp(),
    status: 'active'
  });
  
  return docRef.id;
}

export async function deleteClan(clanId: string): Promise<void> {
  // We can just delete the clan doc. We could also delete memberships/posts/events/challenges
  // but to keep it simple, we just delete the main doc for now.
  await deleteDoc(doc(db, 'clans_v2', clanId));
}
export async function getClan(id: string): Promise<ClanV2 | null> {
  const snap = await getDoc(doc(db, 'clans_v2', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ClanV2;
}

export async function getPublicClans(limitCount = 20): Promise<ClanV2[]> {
  const q = query(
    collection(db, 'clans_v2'),
    where('visibility', '==', 'public'),
    where('status', '==', 'active'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClanV2));
}

export async function getUserClans(userId: string): Promise<ClanV2[]> {
  const q = query(collection(db, 'clan_memberships'), where('userId', '==', userId), where('status', '==', 'active'));
  const snap = await getDocs(q);
  const clanIds = snap.docs.map(d => d.data().clanId);
  
  if (clanIds.length === 0) return [];
  
  const clanPromises = clanIds.map(id => getDoc(doc(db, 'clans_v2', id)));
  const clanSnaps = await Promise.all(clanPromises);
  
  const results: ClanV2[] = [];
  clanSnaps.forEach(s => {
    if (s.exists()) {
      results.push({ id: s.id, ...s.data() } as ClanV2);
    }
  });
  
  return results;
}

export async function updateClan(id: string, data: Partial<ClanV2>): Promise<void> {
  await updateDoc(doc(db, 'clans_v2', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function disbandClan(id: string, reason?: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. Delete all posts
  const postsSnap = await getDocs(query(collection(db, 'community_posts'), where('communityId', '==', id)));
  postsSnap.docs.forEach(d => batch.delete(d.ref));

  // 2. Delete all events
  const eventsSnap = await getDocs(query(collection(db, 'simple_events'), where('clanId', '==', id)));
  eventsSnap.docs.forEach(d => batch.delete(d.ref));

  // 3. Delete all challenges
  const challengesSnap = await getDocs(query(collection(db, 'challenges_v2'), where('clanId', '==', id)));
  challengesSnap.docs.forEach(d => batch.delete(d.ref));

  // 4. Delete all memberships
  const membershipsSnap = await getDocs(query(collection(db, 'clan_memberships'), where('clanId', '==', id)));
  membershipsSnap.docs.forEach(d => batch.delete(d.ref));

  // 5. Delete clan
  batch.delete(doc(db, 'clans_v2', id));

  await batch.commit();
}

export async function joinClan(userId: string, userName: string, userPhoto: string, clanId: string): Promise<void> {
  const memberId = `${clanId}_${userId}`;
  await setDoc(doc(db, 'clan_memberships', memberId), {
    clanId,
    userId,
    userName,
    userPhoto,
    role: 'member',
    joinedAt: serverTimestamp(),
    status: 'active'
  });
  await updateDoc(doc(db, 'clans_v2', clanId), {
    memberCount: increment(1)
  });
}

export async function leaveClan(userId: string, clanId: string): Promise<void> {
  const memberId = `${clanId}_${userId}`;
  await updateDoc(doc(db, 'clan_memberships', memberId), {
    status: 'left'
  });
  await updateDoc(doc(db, 'clans_v2', clanId), {
    memberCount: increment(-1)
  });
}

export async function getClanMembers(clanId: string): Promise<ClanMembership[]> {
  const q = query(collection(db, 'clan_memberships'), where('clanId', '==', clanId), where('status', '==', 'active'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClanMembership));
}

export async function updateClanMemberRole(clanId: string, userId: string, newRole: 'leader' | 'co_leader' | 'member'): Promise<void> {
  const memberId = `${clanId}_${userId}`;
  await updateDoc(doc(db, 'clan_memberships', memberId), {
    role: newRole
  });
}

export async function transferLeadership(clanId: string, currentLeaderId: string, newLeaderId: string, newLeaderName: string): Promise<void> {
  const batch = writeBatch(db);
  
  // Demote current leader
  batch.update(doc(db, 'clan_memberships', `${clanId}_${currentLeaderId}`), { role: 'co_leader' });
  
  // Promote new leader
  batch.update(doc(db, 'clan_memberships', `${clanId}_${newLeaderId}`), { role: 'leader' });
  
  // Update clan doc
  batch.update(doc(db, 'clans_v2', clanId), { leaderId: newLeaderId, leaderName: newLeaderName, updatedAt: serverTimestamp() });
  
  await batch.commit();
}

// ─── CHALLENGES (V2) ─────────────────────────────────────────────

export async function createChallenge(challenge: Omit<ChallengeV2, 'id' | 'status' | 'participantCount' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'challenges_v2'), {
    ...challenge,
    status: 'active', // assuming active upon creation, or should check dates
    participantCount: 1,
    createdAt: serverTimestamp(),
  });
  
  // Add creator as participant
  const partId = `${docRef.id}_${challenge.createdBy}`;
  await setDoc(doc(db, 'challenge_participants', partId), {
    challengeId: docRef.id,
    userId: challenge.createdBy,
    userName: challenge.creatorName,
    userPhoto: challenge.creatorPhoto,
    progress: 0,
    rank: 1,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return docRef.id;
}

export async function getPublicChallenges(limitCount = 20): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('visibility', '==', 'public'),
    where('status', 'in', ['upcoming', 'active']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
}

export async function getClanChallenges(clanId: string): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('clanId', '==', clanId),
    where('status', 'in', ['upcoming', 'active', 'completed'])
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
}

export async function updateChallenge(id: string, data: Partial<ChallengeV2>): Promise<void> {
  await updateDoc(doc(db, 'challenges_v2', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteChallenge(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'challenges_v2', id));
  
  const participantsSnap = await getDocs(query(collection(db, 'challenge_participants'), where('challengeId', '==', id)));
  participantsSnap.docs.forEach(d => batch.delete(d.ref));
  
  await batch.commit();
}

export async function getUserChallenges(userId: string): Promise<ChallengeV2[]> {
  const q = query(collection(db, 'challenge_participants'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const challengeIds = snap.docs.map(d => d.data().challengeId);
  
  if (challengeIds.length === 0) return [];
  
  const results: ChallengeV2[] = [];
  for (let i = 0; i < challengeIds.length; i += 10) {
    const chunk = challengeIds.slice(i, i + 10);
    const cq = query(collection(db, 'challenges_v2'), where(documentId(), 'in', chunk));
    const cs = await getDocs(cq);
    results.push(...cs.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2)));
  }
  return results;
}

export async function joinChallenge(challengeId: string, userId: string, userName: string, userPhoto: string): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await setDoc(doc(db, 'challenge_participants', partId), {
    challengeId,
    userId,
    userName,
    userPhoto,
    progress: 0,
    rank: 999999, // Will be updated
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'challenges_v2', challengeId), {
    participantCount: increment(1)
  });
}

export async function leaveChallenge(challengeId: string, userId: string): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await deleteDoc(doc(db, 'challenge_participants', partId));
  await updateDoc(doc(db, 'challenges_v2', challengeId), {
    participantCount: increment(-1)
  });
}

export async function getChallengeLeaderboard(challengeId: string, limitCount = 50): Promise<ChallengeParticipant[]> {
  const q = query(
    collection(db, 'challenge_participants'),
    where('challengeId', '==', challengeId),
    orderBy('progress', 'desc'),
    orderBy('updatedAt', 'asc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  
  // Assign ranks locally based on fetched order
  return snap.docs.map((d, index) => ({ 
    id: d.id, 
    ...d.data(),
    rank: index + 1 
  } as ChallengeParticipant));
}

export async function updateUserChallengeProgress(userId: string, updates: { metric: ChallengeMetric, amount: number }[]): Promise<void> {
  // Fetch all active challenges for the user
  const userChallenges = await getUserChallenges(userId);
  if (!userChallenges.length) return;

  const activeChallenges = userChallenges.filter(c => c.status === 'active');
  if (!activeChallenges.length) return;

  const batch = writeBatch(db);
  
  for (const update of updates) {
    const matchingChallenges = activeChallenges.filter(c => c.metric === update.metric);
    for (const challenge of matchingChallenges) {
      if (!challenge.id) continue;
      const partId = `${challenge.id}_${userId}`;
      const partRef = doc(db, 'challenge_participants', partId);
      batch.update(partRef, {
        progress: increment(update.amount),
        updatedAt: serverTimestamp()
      });
    }
  }

  await batch.commit();
}

// ─── EVENTS (V2) ─────────────────────────────────────────────────

export async function createSimpleEvent(event: Omit<SimpleEvent, 'id' | 'status' | 'participantCount' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'simple_events'), {
    ...event,
    status: 'upcoming',
    participantCount: 1,
    createdAt: serverTimestamp(),
  });
  
  const partId = `${docRef.id}_${event.createdBy}`;
  await setDoc(doc(db, 'simple_event_participants', partId), {
    eventId: docRef.id,
    userId: event.createdBy,
    userName: event.creatorName,
    userPhoto: event.creatorPhoto,
    joinedAt: serverTimestamp()
  });
  
  return docRef.id;
}

export async function getPublicEvents(limitCount = 20): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('visibility', '==', 'public'),
    where('status', 'in', ['upcoming', 'ongoing']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
}

export async function getClanEvents(clanId: string): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('clanId', '==', clanId),
    where('status', 'in', ['upcoming', 'ongoing', 'completed'])
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
}

export async function updateSimpleEvent(id: string, data: Partial<SimpleEvent>): Promise<void> {
  await updateDoc(doc(db, 'simple_events', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteSimpleEvent(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'simple_events', id));
  
  const participantsSnap = await getDocs(query(collection(db, 'simple_event_participants'), where('eventId', '==', id)));
  participantsSnap.docs.forEach(d => batch.delete(d.ref));
  
  await batch.commit();
}

export async function joinEvent(eventId: string, userId: string, userName: string, userPhoto: string): Promise<void> {
  const partId = `${eventId}_${userId}`;
  await setDoc(doc(db, 'simple_event_participants', partId), {
    eventId,
    userId,
    userName,
    userPhoto,
    joinedAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'simple_events', eventId), {
    participantCount: increment(1)
  });
}

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const partId = `${eventId}_${userId}`;
  await deleteDoc(doc(db, 'simple_event_participants', partId));
  await updateDoc(doc(db, 'simple_events', eventId), {
    participantCount: increment(-1)
  });
}

// ─── CLAN POSTS & COMMENTS ───────────────────────────────────────

export interface PostComment {
  id?: string;
  postId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  createdAt: Timestamp | null;
}

export const createClanPost = async (postData: Omit<CommunityPost, 'id' | 'likesCount' | 'commentsCount' | 'createdAt' | 'likedUserIds'> & { imageUrl?: string }) => {
  const docRef = await addDoc(collection(db, 'community_posts'), {
    ...postData,
    imageUrl: postData.imageUrl || null,
    likesCount: 0,
    commentsCount: 0,
    likedUserIds: [],
    createdAt: serverTimestamp()
  });
  return docRef.id;
};

export async function getClanPosts(clanId: string, limitCount = 20): Promise<CommunityPost[]> {
  const q = query(
    collection(db, 'community_posts'),
    where('communityId', '==', clanId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunityPost));
}

export async function likeClanPost(postId: string, isLiking: boolean): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  if (isLiking) {
    await updateDoc(postRef, { likesCount: increment(1) });
  } else {
    await updateDoc(postRef, { likesCount: increment(-1) });
  }
}

export async function createPostComment(comment: Omit<PostComment, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'community_post_comments'), {
    ...comment,
    createdAt: serverTimestamp(),
  });
  
  await updateDoc(doc(db, 'community_posts', comment.postId), {
    commentsCount: increment(1)
  });
  
  return docRef.id;
}

export async function getPostComments(postId: string, limitCount = 50): Promise<PostComment[]> {
  const q = query(
    collection(db, 'community_post_comments'),
    where('postId', '==', postId),
    orderBy('createdAt', 'asc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PostComment));
}
