import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, increment, orderBy, addDoc, Timestamp, writeBatch, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ClanV2, ClanMembership, ChallengeV2, ChallengeParticipant, SimpleEvent, EventParticipant, ChallengeMetric } from '@/types';

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
    orderBy('memberCount', 'desc'),
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
  
  // Firestore IN queries support max 10
  const results: ClanV2[] = [];
  for (let i = 0; i < clanIds.length; i += 10) {
    const chunk = clanIds.slice(i, i + 10);
    const cq = query(collection(db, 'clans_v2'), where('__name__', 'in', chunk));
    const cs = await getDocs(cq);
    results.push(...cs.docs.map(d => ({ id: d.id, ...d.data() } as ClanV2)));
  }
  return results;
}

export async function updateClan(id: string, data: Partial<ClanV2>): Promise<void> {
  await updateDoc(doc(db, 'clans_v2', id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function disbandClan(id: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, 'clans_v2', id), {
    status: 'disbanded',
    disbandReason: reason,
    updatedAt: serverTimestamp()
  });
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
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
}

export async function getClanChallenges(clanId: string): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('clanId', '==', clanId),
    where('status', 'in', ['upcoming', 'active', 'completed']),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
}

export async function getUserChallenges(userId: string): Promise<ChallengeV2[]> {
  const q = query(collection(db, 'challenge_participants'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const challengeIds = snap.docs.map(d => d.data().challengeId);
  
  if (challengeIds.length === 0) return [];
  
  const results: ChallengeV2[] = [];
  for (let i = 0; i < challengeIds.length; i += 10) {
    const chunk = challengeIds.slice(i, i + 10);
    const cq = query(collection(db, 'challenges_v2'), where('__name__', 'in', chunk));
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
    where('status', 'in', ['upcoming', 'active']),
    orderBy('startTime', 'asc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
}

export async function getClanEvents(clanId: string): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('clanId', '==', clanId),
    where('status', 'in', ['upcoming', 'active', 'completed']),
    orderBy('startTime', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
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
