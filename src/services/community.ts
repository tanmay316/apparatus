import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, increment, setDoc, writeBatch, Timestamp, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ClanV2, ClanMembership, ChallengeV2, ChallengeParticipant, SimpleEvent, EventParticipant, ChallengeMetric, ChallengeStatus, SimpleEventStatus, CommunityPost } from '@/types';

// ─── UTILS ────────────────────────────────────────────────────────
export function formatChallengeGoal(target?: number, unit?: string, metric?: string): string {
  const trimmedUnit = (unit || '').trim();
  const trimmedMetric = (metric || '').trim();
  
  if (metric === 'other' || !target || target === 1) {
    return trimmedUnit || trimmedMetric || (target ? `${target}` : '');
  }

  if (trimmedUnit.startsWith(`${target} `) || trimmedUnit === `${target}`) {
    return trimmedUnit;
  }

  return `${target} ${trimmedUnit}`.trim();
}

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
  
  // Demote current leader if exists
  if (currentLeaderId && currentLeaderId !== newLeaderId) {
    const currentLeaderRef = doc(db, 'clan_memberships', `${clanId}_${currentLeaderId}`);
    try {
      const snap = await getDoc(currentLeaderRef);
      if (snap.exists()) {
        batch.update(currentLeaderRef, { role: 'co_leader' });
      }
    } catch { /* ignore */ }
  }
  
  // Promote new leader
  batch.update(doc(db, 'clan_memberships', `${clanId}_${newLeaderId}`), { role: 'leader' });
  
  // Update clan doc
  batch.update(doc(db, 'clans_v2', clanId), { leaderId: newLeaderId, leaderName: newLeaderName, updatedAt: serverTimestamp() });
  
  await batch.commit();
}

// ─── CHALLENGES (V2) ─────────────────────────────────────────────

export async function createChallenge(challenge: Omit<ChallengeV2, 'id' | 'participantCount' | 'createdAt'> & { status?: ChallengeStatus }): Promise<string> {
  const docRef = await addDoc(collection(db, 'challenges_v2'), {
    ...challenge,
    status: challenge.status || 'active',
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

export async function getAllCommunityChallenges(limitCount = 50): Promise<ChallengeV2[]> {
  const q = query(
    collection(db, 'challenges_v2'),
    where('status', 'in', ['upcoming', 'active', 'completed']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  const challenges = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeV2));
  // Sort with upcoming/active first, then by startDate
  return challenges.sort((a, b) => {
    const aTime = a.startDate?.toMillis ? a.startDate.toMillis() : 0;
    const bTime = b.startDate?.toMillis ? b.startDate.toMillis() : 0;
    return bTime - aTime;
  });
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

export async function updateChallengeParticipantScore(challengeId: string, userId: string, newProgress: number): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await updateDoc(doc(db, 'challenge_participants', partId), {
    progress: newProgress,
    updatedAt: serverTimestamp()
  });
  
  // Re-fetch and re-rank leaderboard
  const participantsSnap = await getDocs(
    query(
      collection(db, 'challenge_participants'),
      where('challengeId', '==', challengeId),
      orderBy('progress', 'desc')
    )
  );
  
  const batch = writeBatch(db);
  participantsSnap.docs.forEach((d, idx) => {
    batch.update(d.ref, { rank: idx + 1 });
  });
  await batch.commit();
}

export async function awardChallengeTop3Badges(challengeId: string): Promise<{ success: boolean; message: string }> {
  const challengeSnap = await getDoc(doc(db, 'challenges_v2', challengeId));
  if (!challengeSnap.exists()) throw new Error('Challenge not found');
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as ChallengeV2;

  const leaderboardSnap = await getDocs(
    query(
      collection(db, 'challenge_participants'),
      where('challengeId', '==', challengeId),
      orderBy('progress', 'desc'),
      limit(3)
    )
  );

  if (leaderboardSnap.empty) {
    throw new Error('No participants on the leaderboard to award badges');
  }

  const batch = writeBatch(db);
  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  for (let i = 0; i < leaderboardSnap.docs.length; i++) {
    const pDoc = leaderboardSnap.docs[i];
    const pData = pDoc.data() as ChallengeParticipant;
    const rank = (i + 1) as 1 | 2 | 3;
    const info = rankTitles[rank];

    const badgeData = {
      id: `${challengeId}_rank_${rank}`,
      title: `${challenge.title}`,
      subtitle: `${info.emoji} ${info.name} (Rank #${rank})`,
      description: challenge.description || `Finished #${rank} with ${pData.progress} ${challenge.unit} in "${challenge.title}"`,
      rank,
      sourceType: 'challenge' as const,
      sourceId: challengeId,
      sourceTitle: challenge.title,
      clanId: challenge.clanId || '',
      clanName: challenge.clanName || '',
      awardedAt: now,
      badgeStyle: info.style
    };

    // Update participant doc
    batch.update(pDoc.ref, { badgeAwarded: rank, rank });

    // Add badge to user doc
    const userRef = doc(db, 'users', pData.userId);
    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingBadges = userSnap.data().communityBadges || [];
        const filtered = existingBadges.filter((b: any) => b.id !== badgeData.id);
        batch.update(userRef, { communityBadges: [...filtered, badgeData] });
      }
    } catch { /* ignore user fetch err */ }

    // Create in-app bell notification
    const noteRef = doc(collection(db, 'notifications'));
    batch.set(noteRef, {
      receiverId: pData.userId,
      senderId: challenge.createdBy,
      senderName: challenge.creatorName,
      senderPhoto: challenge.creatorPhoto || '',
      type: 'achievement',
      message: `${info.emoji} Congratulations! You earned the ${info.name} Badge for "${challenge.title}"!`,
      targetId: challengeId,
      read: false,
      createdAt: now
    });
  }

  // Mark challenge as badges awarded and completed
  batch.update(doc(db, 'challenges_v2', challengeId), {
    badgesAwarded: true,
    status: 'completed',
    updatedAt: now
  });

  await batch.commit();
  return { success: true, message: 'Top 3 badges awarded successfully!' };
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
    userPhoto: userPhoto || '',
    progress: 0,
    rank: 0,
    isRanked: false,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  const q = query(collection(db, 'challenge_participants'), where('challengeId', '==', challengeId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'challenges_v2', challengeId), {
    participantCount: snap.size
  });
}

export async function leaveChallenge(challengeId: string, userId: string): Promise<void> {
  const partId = `${challengeId}_${userId}`;
  await deleteDoc(doc(db, 'challenge_participants', partId));

  const q = query(collection(db, 'challenge_participants'), where('challengeId', '==', challengeId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'challenges_v2', challengeId), {
    participantCount: snap.size
  });
}

export async function isUserClanMember(clanId: string, userId: string): Promise<boolean> {
  try {
    const membershipSnap = await getDoc(doc(db, 'clan_memberships', `${clanId}_${userId}`));
    if (membershipSnap.exists() && membershipSnap.data().status !== 'left') return true;
    const clanSnap = await getDoc(doc(db, 'clans_v2', clanId));
    if (clanSnap.exists() && clanSnap.data().leaderId === userId) return true;
    return false;
  } catch {
    return false;
  }
}

export async function isUserJoinedChallenge(challengeId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'challenge_participants', `${challengeId}_${userId}`));
  return snap.exists();
}

export async function isUserJoinedEvent(eventId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'simple_event_participants', `${eventId}_${userId}`));
  return snap.exists();
}

export async function getChallengeParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const q = query(
    collection(db, 'challenge_participants'),
    where('challengeId', '==', challengeId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeParticipant));
}

export async function getChallengeLeaderboard(challengeId: string): Promise<ChallengeParticipant[]> {
  const q = query(
    collection(db, 'challenge_participants'),
    where('challengeId', '==', challengeId)
  );
  const snap = await getDocs(q);
  
  const list = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ChallengeParticipant))
    .filter(p => p.isRanked === true && typeof p.rank === 'number' && p.rank > 0 && p.rank < 9999);

  // Sort strictly by published rank
  list.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  return list;
}

export async function updateLeaderboardRanks(
  challengeId: string,
  updatedRanks: { userId: string; rank: number; progress?: number; customResult?: string; badgeAwarded?: 1 | 2 | 3 }[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const item of updatedRanks) {
    const partRef = doc(db, 'challenge_participants', `${challengeId}_${item.userId}`);
    batch.update(partRef, {
      rank: item.rank,
      progress: item.progress ?? 0,
      customResult: item.customResult || '',
      isRanked: true,
      badgeAwarded: item.badgeAwarded || null,
      updatedAt: serverTimestamp()
    });
  }
  await batch.commit();
}

export async function updateEventLeaderboardRanks(
  eventId: string,
  updatedRanks: { userId: string; rank: number; customResult?: string; badgeAwarded?: 1 | 2 | 3 }[]
): Promise<void> {
  const batch = writeBatch(db);
  for (const item of updatedRanks) {
    const partRef = doc(db, 'simple_event_participants', `${eventId}_${item.userId}`);
    batch.update(partRef, {
      rank: item.rank,
      customResult: item.customResult || '',
      isRanked: true,
      badgeAwarded: item.badgeAwarded || null
    });
  }
  await batch.commit();
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

export async function createSimpleEvent(event: Omit<SimpleEvent, 'id' | 'participantCount' | 'createdAt'> & { status?: SimpleEventStatus }): Promise<string> {
  const docRef = await addDoc(collection(db, 'simple_events'), {
    ...event,
    status: event.status || 'upcoming',
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

export async function getAllCommunityEvents(limitCount = 50): Promise<SimpleEvent[]> {
  const q = query(
    collection(db, 'simple_events'),
    where('status', 'in', ['upcoming', 'ongoing', 'active', 'completed']),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  const events = snap.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent));
  return events.sort((a, b) => {
    const aTime = a.startTime?.toMillis ? a.startTime.toMillis() : 0;
    const bTime = b.startTime?.toMillis ? b.startTime.toMillis() : 0;
    return bTime - aTime;
  });
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

export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const q = query(
    collection(db, 'simple_event_participants'),
    where('eventId', '==', eventId),
    orderBy('joinedAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventParticipant));
}

export async function getUserEvents(userId: string): Promise<SimpleEvent[]> {
  const q = query(collection(db, 'simple_event_participants'), where('userId', '==', userId));
  const snap = await getDocs(q);
  const eventIds = snap.docs.map(d => d.data().eventId);
  if (eventIds.length === 0) return [];

  const results: SimpleEvent[] = [];
  for (let i = 0; i < eventIds.length; i += 10) {
    const chunk = eventIds.slice(i, i + 10);
    const eq = query(collection(db, 'simple_events'), where(documentId(), 'in', chunk));
    const es = await getDocs(eq);
    results.push(...es.docs.map(d => ({ id: d.id, ...d.data() } as SimpleEvent)));
  }
  return results;
}

export async function awardEventTop3Badges(
  eventId: string,
  topWinners: { userId: string; userName: string; userPhoto?: string; rank: 1 | 2 | 3 }[]
): Promise<{ success: boolean; message: string }> {
  const eventSnap = await getDoc(doc(db, 'simple_events', eventId));
  if (!eventSnap.exists()) throw new Error('Event not found');
  const event = { id: eventSnap.id, ...eventSnap.data() } as SimpleEvent;

  const batch = writeBatch(db);
  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  for (const winner of topWinners) {
    const info = rankTitles[winner.rank];
    const badgeData = {
      id: `${eventId}_rank_${winner.rank}`,
      title: `${event.title}`,
      subtitle: `${info.emoji} ${info.name} (Rank #${winner.rank})`,
      description: event.description || `Awarded for Rank #${winner.rank} in "${event.title}"`,
      rank: winner.rank,
      sourceType: 'event' as const,
      sourceId: eventId,
      sourceTitle: event.title,
      clanId: event.clanId || '',
      clanName: event.clanName || '',
      awardedAt: now,
      badgeStyle: info.style
    };

    // Update participant doc if exists
    const partRef = doc(db, 'simple_event_participants', `${eventId}_${winner.userId}`);
    try {
      const pSnap = await getDoc(partRef);
      if (pSnap.exists()) {
        batch.update(partRef, { badgeAwarded: winner.rank });
      }
    } catch { /* ignore */ }

    // Update user profile
    const userRef = doc(db, 'users', winner.userId);
    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingBadges = userSnap.data().communityBadges || [];
        const filtered = existingBadges.filter((b: any) => b.id !== badgeData.id);
        batch.update(userRef, { communityBadges: [...filtered, badgeData] });
      }
    } catch { /* ignore */ }

    // In-app notification
    const noteRef = doc(collection(db, 'notifications'));
    batch.set(noteRef, {
      receiverId: winner.userId,
      senderId: event.createdBy,
      senderName: event.creatorName,
      senderPhoto: event.creatorPhoto || '',
      type: 'achievement',
      message: `${info.emoji} Congratulations! You earned the ${info.name} Badge for "${event.title}"!`,
      targetId: eventId,
      read: false,
      createdAt: now
    });
  }

  batch.update(doc(db, 'simple_events', eventId), {
    badgesAwarded: true,
    status: 'completed',
    updatedAt: now
  });

  await batch.commit();
  return { success: true, message: 'Event badges awarded successfully!' };
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
    userPhoto: userPhoto || '',
    rank: 0,
    isRanked: false,
    joinedAt: serverTimestamp()
  });

  const q = query(collection(db, 'simple_event_participants'), where('eventId', '==', eventId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'simple_events', eventId), {
    participantCount: snap.size
  });
}

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const partId = `${eventId}_${userId}`;
  await deleteDoc(doc(db, 'simple_event_participants', partId));

  const q = query(collection(db, 'simple_event_participants'), where('eventId', '==', eventId));
  const snap = await getDocs(q);
  await updateDoc(doc(db, 'simple_events', eventId), {
    participantCount: snap.size
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

export async function deleteClanPost(postId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'community_posts', postId));
  const commentsSnap = await getDocs(query(collection(db, 'community_post_comments'), where('postId', '==', postId)));
  commentsSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
