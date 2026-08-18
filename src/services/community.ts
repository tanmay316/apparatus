import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, increment, setDoc, writeBatch, Timestamp, documentId, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ClanV2, ClanMembership, ChallengeV2, ChallengeParticipant, SimpleEvent, EventParticipant, ChallengeMetric, ChallengeStatus, SimpleEventStatus, CommunityPost, EarnedCommunityBadge, ClanPoll, ClanPollOption, ClanPollVoter, CommunityAnnouncement, ClanMessage, AppNotificationType, ClanJoinRequest } from '@/types';
import { notify } from '@/services/social';

// ─── UTILS ────────────────────────────────────────────────────────
export function cleanDoc<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        typeof (value as any).toMillis !== 'function'
      ) {
        result[key] = cleanDoc(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          item !== null && typeof item === 'object' && !(item instanceof Date) && typeof (item as any).toMillis !== 'function'
            ? cleanDoc(item)
            : (item === undefined ? null : item)
        );
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

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
  const docRef = await addDoc(collection(db, 'clans_v2'), cleanDoc({
    ...clan,
    memberCount: 1,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  
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
        batch.set(userRef, { 
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData 
        }, { merge: true });
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

  // Create Celebration Feed Posts for the Winners
  for (let i = 0; i < leaderboardSnap.docs.length; i++) {
    const pData = leaderboardSnap.docs[i].data() as ChallengeParticipant;
    const rank = (i + 1) as 1 | 2 | 3;
    const info = rankTitles[rank];

    if (challenge.clanId) {
      const postRef = doc(collection(db, 'community_posts'));
      batch.set(postRef, {
        communityId: challenge.clanId,
        authorId: pData.userId,
        authorName: pData.userName,
        authorPhoto: pData.userPhoto || '',
        title: `🏆 Challenge Winner!`,
        text: `Congratulations to ${pData.userName} for placing #${rank} and winning the ${info.name} badge in "${challenge.title}"!`,
        likesCount: 0,
        commentsCount: 0,
        likedUserIds: [],
        createdAt: now
      });
    } else {
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        userId: pData.userId,
        userName: pData.userName,
        userPhoto: pData.userPhoto || '',
        type: 'achievement',
        workoutId: null,
        summary: `Won ${info.name} in ${challenge.title}`,
        details: {
          challengeId,
          challengeTitle: challenge.title,
          clanId: '',
          rank,
          badgeName: info.name,
          badgeEmoji: info.emoji
        },
        visibility: 'public',
        likesCount: 0,
        commentsCount: 0,
        createdAt: now
      });
    }
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

  // Auto-sync topWinner to challenge if missing
  if (list.length > 0 && list[0].rank === 1) {
    getDoc(doc(db, 'challenges_v2', challengeId)).then((cSnap) => {
      if (cSnap.exists()) {
        const cData = cSnap.data();
        if (!cData.topWinner || cData.topWinner.userId !== list[0].userId) {
          updateDoc(doc(db, 'challenges_v2', challengeId), {
            topWinner: {
              userId: list[0].userId,
              userName: list[0].userName || 'Champion',
              userPhoto: list[0].userPhoto || '',
              customResult: list[0].customResult || '',
              rank: 1
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  }

  return list;
}

export async function updateLeaderboardRanks(
  challengeId: string,
  updatedRanks: { id?: string; userId: string; rank: number; progress?: number; customResult?: string; badgeAwarded?: 1 | 2 | 3 }[]
): Promise<void> {
  const challengeSnap = await getDoc(doc(db, 'challenges_v2', challengeId));
  const challengeData = challengeSnap.exists() ? (challengeSnap.data() as ChallengeV2) : null;
  const challengeTitle = challengeData?.title || 'Community Challenge';

  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  // ── STEP 1: Update participant ranks in a dedicated batch (CRITICAL) ──
  const rankBatch = writeBatch(db);
  let topWinner: { userId: string; userName: string; userPhoto: string; customResult: string; rank: number } | null = null;

  for (const item of updatedRanks) {
    const partRef = doc(db, 'challenge_participants', item.id || `${challengeId}_${item.userId}`);
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);

    rankBatch.set(partRef, {
      rank: item.rank,
      progress: item.progress ?? 0,
      customResult: item.customResult || '',
      isRanked: true,
      badgeAwarded: badgeAward || null,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // Commit rank updates first – this is the most important write
  await rankBatch.commit();
  console.log('[updateLeaderboardRanks] Rank batch committed successfully for', challengeId);

  // ── STEP 2: Update user badges & topWinner individually (non-critical) ──
  for (const item of updatedRanks) {
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);
    const userRef = doc(db, 'users', item.userId);

    try {
      const userSnap = await getDoc(userRef);
      const uData = userSnap.exists() ? userSnap.data() : {};
      const existingBadges = uData.communityBadges || [];
      // Completely remove any existing badges for this specific challenge
      const filtered = existingBadges.filter((b: any) => b.sourceId !== challengeId && !b.id.startsWith(challengeId) && !b.id.startsWith(`challenge_${challengeId}`));

      if (badgeAward && rankTitles[badgeAward]) {
        const info = rankTitles[badgeAward];
        const badgeData: EarnedCommunityBadge = {
          id: `${challengeId}_rank_${badgeAward}`,
          title: challengeTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${item.rank})`,
          description: item.customResult || `Finished #${item.rank} with ${item.progress || 0} in "${challengeTitle}"`,
          rank: badgeAward,
          sourceType: 'challenge',
          sourceId: challengeId,
          sourceTitle: challengeTitle,
          clanId: challengeData?.clanId || '',
          clanName: challengeData?.clanName || '',
          awardedAt: now,
          badgeStyle: info.style
        };

        await setDoc(userRef, {
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData
        }, { merge: true });
        console.log('[updateLeaderboardRanks] Badge updated for user', item.userId, 'rank', badgeAward);

        if (item.rank === 1 && !topWinner) {
          topWinner = {
            userId: item.userId,
            userName: uData.displayName || 'Champion',
            userPhoto: uData.photoURL || '',
            customResult: item.customResult || '',
            rank: 1
          };
        }

        // Notify the winner (fire-and-forget)
        addDoc(collection(db, 'notifications'), {
          receiverId: item.userId,
          senderId: challengeData?.createdBy || item.userId,
          senderName: challengeData?.creatorName || 'Apparatus Arena',
          senderPhoto: challengeData?.creatorPhoto || '',
          type: 'achievement',
          message: `${info.emoji} Congratulations! You won the ${info.name} Medal in "${challengeTitle}"!`,
          targetId: challengeId,
          read: false,
          createdAt: now
        }).catch(() => {});

      } else {
        // If medal was removed or user is rank > 3, update badges without the stale challenge badge
        if (filtered.length !== existingBadges.length) {
          await setDoc(userRef, {
            communityBadges: filtered
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error('[updateLeaderboardRanks] Failed to update badge for user', item.userId, err);
    }
  }

  // ── STEP 3: Update topWinner on the challenge doc ──
  if (topWinner) {
    await setDoc(doc(db, 'challenges_v2', challengeId), {
      topWinner: topWinner
    }, { merge: true }).catch(() => {});
  }

  // ── STEP 4: Automatically create or update the celebration post for this challenge ──
  try {
    const sortedWinners = [...updatedRanks]
      .filter(r => r.rank >= 1 && r.rank <= 3)
      .sort((a, b) => a.rank - b.rank);

    if (sortedWinners.length > 0) {
      const top3Data = await Promise.all(
        sortedWinners.slice(0, 3).map(async (w) => {
          let name = 'Athlete';
          let photo = '';
          try {
            const uSnap = await getDoc(doc(db, 'users', w.userId));
            if (uSnap.exists()) {
              const ud = uSnap.data();
              name = ud.displayName || name;
              photo = ud.photoURL || '';
            }
          } catch {}
          const score = formatCleanScore(w, challengeData?.unit);
          return {
            rank: w.rank as 1 | 2 | 3,
            name,
            score,
            userPhoto: photo,
          };
        })
      );

      const rankEmojis = ['🥇', '🥈', '🥉'];
      const podiumText = top3Data.map((w, i) => {
        const emoji = rankEmojis[i] || '🎖️';
        const scoreStr = w.score ? ` • ${w.score}` : '';
        return `${emoji} ${w.rank}${w.rank === 1 ? 'st' : w.rank === 2 ? 'nd' : 'rd'}: ${w.name}${scoreStr}`;
      }).join('\n');

      const postCreatedAt = challengeData?.endDate || now;

      if (challengeData?.clanId) {
        // Clan-specific challenge -> community_posts
        const existingPostsSnap = await getDocs(
          query(collection(db, 'community_posts'), where('sourceId', '==', challengeId))
        );

        if (!existingPostsSnap.empty) {
          await updateDoc(existingPostsSnap.docs[0].ref, {
            title: `🏆 Challenge Concluded: ${challengeTitle}`,
            text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
            winners: top3Data,
            sourceType: 'challenge',
            sourceId: challengeId,
            clanName: challengeData?.clanName || 'Clan',
            updatedAt: now
          });
        } else {
          await addDoc(collection(db, 'community_posts'), {
            communityId: challengeData.clanId,
            clanName: challengeData?.clanName || 'Clan',
            title: `🏆 Challenge Concluded: ${challengeTitle}`,
            text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
            winners: top3Data,
            authorId: 'system',
            authorName: 'Apparatus Arena',
            authorPhoto: '',
            likesCount: 0,
            likedUserIds: [],
            commentsCount: 0,
            sourceType: 'challenge',
            sourceId: challengeId,
            createdAt: postCreatedAt,
          });
        }
      } else {
        // Public challenge -> activities
        const existingActsSnap = await getDocs(
          query(collection(db, 'activities'), where('details.challengeId', '==', challengeId))
        );

        if (!existingActsSnap.empty) {
          await updateDoc(existingActsSnap.docs[0].ref, {
            summary: `🏆 Challenge Concluded: ${challengeTitle}`,
            details: {
              text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
              challengeId: challengeId,
              challengeTitle: challengeTitle,
              winners: top3Data,
            },
            updatedAt: now
          });
        } else {
          await addDoc(collection(db, 'activities'), {
            userId: 'system',
            userName: 'Apparatus Arena',
            userPhoto: '',
            type: 'achievement',
            summary: `🏆 Challenge Concluded: ${challengeTitle}`,
            details: {
              text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
              challengeId: challengeId,
              challengeTitle: challengeTitle,
              winners: top3Data,
            },
            visibility: 'public',
            likesCount: 0,
            commentsCount: 0,
            createdAt: postCreatedAt,
          });
        }
      }
    }
  } catch (err) {
    console.error('[updateLeaderboardRanks] Failed to create/update celebration post:', err);
  }
}

export async function updateEventLeaderboardRanks(
  eventId: string,
  updatedRanks: { id?: string; userId: string; rank: number; customResult?: string; badgeAwarded?: 1 | 2 | 3 }[]
): Promise<void> {
  const eventSnap = await getDoc(doc(db, 'simple_events', eventId));
  const eventData = eventSnap.exists() ? (eventSnap.data() as SimpleEvent) : null;
  const eventTitle = eventData?.title || 'Community Event';

  const now = Timestamp.now();

  const rankTitles = {
    1: { name: 'Gold Champion', style: 'gold' as const, emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver' as const, emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze' as const, emoji: '🥉' },
  };

  // ── STEP 1: Update participant ranks in a dedicated batch (CRITICAL) ──
  const rankBatch = writeBatch(db);
  let topWinner: { userId: string; userName: string; userPhoto: string; customResult: string; rank: number } | null = null;

  for (const item of updatedRanks) {
    const partRef = doc(db, 'simple_event_participants', item.id || `${eventId}_${item.userId}`);
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);

    rankBatch.set(partRef, {
      rank: item.rank,
      customResult: item.customResult || '',
      isRanked: true,
      badgeAwarded: badgeAward || null,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // Commit rank updates first – this is the most important write
  await rankBatch.commit();
  console.log('[updateEventLeaderboardRanks] Rank batch committed successfully for', eventId);

  // ── STEP 2: Update user badges & topWinner individually (non-critical) ──
  for (const item of updatedRanks) {
    const badgeAward = item.badgeAwarded !== undefined ? item.badgeAwarded : (item.rank <= 3 && item.rank >= 1 ? (item.rank as 1 | 2 | 3) : undefined);
    const userRef = doc(db, 'users', item.userId);

    try {
      const userSnap = await getDoc(userRef);
      const uData = userSnap.exists() ? userSnap.data() : {};
      const existingBadges = uData.communityBadges || [];
      // Completely remove any existing badges for this specific event
      const filtered = existingBadges.filter((b: any) => b.sourceId !== eventId && !b.id.startsWith(eventId) && !b.id.startsWith(`event_${eventId}`));

      if (badgeAward && rankTitles[badgeAward]) {
        const info = rankTitles[badgeAward];
        const badgeData: EarnedCommunityBadge = {
          id: `${eventId}_rank_${badgeAward}`,
          title: eventTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${item.rank})`,
          description: item.customResult || `Finished #${item.rank} in "${eventTitle}"`,
          rank: badgeAward,
          sourceType: 'event',
          sourceId: eventId,
          sourceTitle: eventTitle,
          clanId: eventData?.clanId || '',
          clanName: eventData?.clanName || '',
          awardedAt: now,
          badgeStyle: info.style
        };

        await setDoc(userRef, {
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData
        }, { merge: true });
        console.log('[updateEventLeaderboardRanks] Badge updated for user', item.userId, 'rank', badgeAward);

        if (item.rank === 1 && !topWinner) {
          topWinner = {
            userId: item.userId,
            userName: uData.displayName || 'Champion',
            userPhoto: uData.photoURL || '',
            customResult: item.customResult || '',
            rank: 1
          };
        }

        // Notify winner (fire-and-forget)
        addDoc(collection(db, 'notifications'), {
          receiverId: item.userId,
          senderId: eventData?.createdBy || item.userId,
          senderName: eventData?.creatorName || 'Apparatus Arena',
          senderPhoto: '',
          type: 'achievement',
          message: `${info.emoji} Congratulations! You won the ${info.name} Medal in "${eventTitle}"!`,
          targetId: eventId,
          read: false,
          createdAt: now
        }).catch(() => {});

      } else {
        // If medal was removed or user is rank > 3, update badges without the stale event badge
        if (filtered.length !== existingBadges.length) {
          await setDoc(userRef, {
            communityBadges: filtered
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error('[updateEventLeaderboardRanks] Failed to update badge for user', item.userId, err);
    }
  }

  // ── STEP 3: Update topWinner on the event doc ──
  if (topWinner) {
    await setDoc(doc(db, 'simple_events', eventId), {
      topWinner: topWinner
    }, { merge: true }).catch(() => {});
  }

  // ── STEP 4: Create celebration post in feed ──
  try {
    const top3 = updatedRanks.filter(r => r.rank >= 1 && r.rank <= 3).sort((a, b) => a.rank - b.rank);
    if (top3.length > 0) {
      const rankEmojis = ['🥇', '🥈', '🥉'];
      const podiumText = top3.map((w, i) => {
        const emoji = rankEmojis[i] || '🎖️';
        const resStr = w.customResult ? ` • ${w.customResult}` : '';
        return `${emoji} ${w.rank}${w.rank === 1 ? 'st' : w.rank === 2 ? 'nd' : 'rd'}: Athlete${resStr}`;
      }).join('\n');

      if (eventData?.clanId) {
        await addDoc(collection(db, 'community_posts'), {
          communityId: eventData.clanId,
          clanName: eventData.clanName || 'Clan',
          title: `🏆 Event Concluded: ${eventTitle}`,
          text: `Congratulations to our champions for their outstanding performance in "${eventTitle}"!\n\n${podiumText}`,
          authorId: 'system',
          authorName: 'Apparatus Arena',
          authorPhoto: '',
          likesCount: 0,
          likedUserIds: [],
          commentsCount: 0,
          sourceType: 'event',
          sourceId: eventId,
          createdAt: now
        });
      } else {
        await addDoc(collection(db, 'activities'), {
          userId: 'system',
          userName: 'Apparatus Arena',
          userPhoto: '',
          type: 'achievement',
          summary: `🏆 Event Concluded: ${eventTitle}`,
          details: {
            text: `Congratulations to our champions for their outstanding performance in "${eventTitle}"!\n\n${podiumText}`,
            eventId,
            eventTitle
          },
          visibility: 'public',
          likesCount: 0,
          commentsCount: 0,
          createdAt: now
        });
      }
    }
  } catch (err) {
    console.error('[updateEventLeaderboardRanks] Failed to create celebration feed post', err);
  }
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
        batch.set(userRef, { 
          communityBadges: [...filtered, badgeData],
          unseenMedalAward: badgeData 
        }, { merge: true });
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

    // Create a feed record
    if (event.clanId) {
      const postRef = doc(collection(db, 'community_posts'));
      batch.set(postRef, {
        communityId: event.clanId,
        authorId: winner.userId,
        authorName: winner.userName,
        authorPhoto: winner.userPhoto || '',
        title: `🏆 ${info.name} Winner!`,
        text: `Congratulations to ${winner.userName} for placing #${winner.rank} and winning the ${info.name} badge in "${event.title}"!`,
        likesCount: 0,
        commentsCount: 0,
        likedUserIds: [],
        createdAt: now
      });
    } else {
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        userId: winner.userId,
        userName: winner.userName,
        userPhoto: winner.userPhoto || '',
        type: 'achievement',
        workoutId: null,
        summary: `Won ${info.name} in ${event.title}`,
        details: {
          eventId,
          eventTitle: event.title,
          clanId: '',
          rank: winner.rank,
          badgeName: info.name,
          badgeEmoji: info.emoji
        },
        visibility: 'public',
        likesCount: 0,
        commentsCount: 0,
        createdAt: now
      });
    }
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

import { storage } from '@/lib/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import type { PostComment } from '@/types';
export type { PostComment };

export const createClanPost = async (postData: Omit<CommunityPost, 'id' | 'likesCount' | 'commentsCount' | 'createdAt' | 'likedUserIds'> & { imageUrl?: string; images?: string[]; poll?: ClanPoll }) => {
  const images = postData.images && postData.images.length > 0
    ? postData.images
    : (postData.imageUrl ? [postData.imageUrl] : []);

  const docRef = await addDoc(collection(db, 'community_posts'), cleanDoc({
    ...postData,
    title: (postData.title || '').trim(),
    text: (postData.text || '').trim(),
    imageUrl: images[0] || null,
    images: images,
    poll: postData.poll || null,
    likesCount: 0,
    commentsCount: 0,
    likedUserIds: [],
    createdAt: serverTimestamp()
  }));

  // If this post includes a poll, notify clan members
  if (postData.poll && postData.clanId) {
    notifyClanMembers({
      clanId: postData.clanId,
      senderId: postData.authorId,
      senderName: postData.authorName,
      title: `📊 New Poll in Clan`,
      body: `${postData.authorName}: "${postData.poll.question}" — Tap to vote!`,
      type: 'clan_poll',
      link: `/clan/${postData.clanId}`,
      extraData: { postId: docRef.id, clanId: postData.clanId }
    }).catch(err => console.warn('Failed to notify clan members for poll:', err));
  }

  return docRef.id;
};

export async function getClanPostById(postId: string): Promise<CommunityPost | null> {
  try {
    const snap = await getDoc(doc(db, 'community_posts', postId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as CommunityPost;
  } catch (err) {
    console.error('Error fetching clan post by id:', err);
    return null;
  }
}

export async function updateClanPost(
  postId: string,
  data: {
    title?: string;
    text?: string;
    images?: string[];
    imageUrl?: string | null;
    poll?: ClanPoll | null;
  }
): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  const images = data.images !== undefined
    ? data.images
    : (data.imageUrl ? [data.imageUrl] : undefined);

  const updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };
  if (data.title !== undefined) updates.title = data.title.trim();
  if (data.text !== undefined) updates.text = data.text.trim();
  if (images !== undefined) {
    updates.images = images;
    updates.imageUrl = images[0] || null;
  }
  if (data.poll !== undefined) {
    updates.poll = data.poll;
  }

  await updateDoc(postRef, updates);
}

export async function voteOnClanPoll(
  postId: string,
  optionId: string,
  user: { uid: string; displayName?: string | null; photoURL?: string | null }
): Promise<ClanPoll> {
  const postRef = doc(db, 'community_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) throw new Error('Post not found');
  const postData = snap.data() as CommunityPost;
  const poll = postData.poll;
  if (!poll) throw new Error('Poll not found on this post');

  // Expiration check
  if (poll.hasExpiration && poll.expiresAt) {
    const expTime = new Date(poll.expiresAt).getTime();
    if (!isNaN(expTime) && Date.now() > expTime) {
      throw new Error('This poll has expired and is no longer accepting votes.');
    }
  }

  const userId = user.uid;
  const isMultiple = Boolean(poll.isMultipleChoice);
  const userVotes = { ...(poll.userVotes || {}) };
  const currentUserSelectedOptionIds: string[] = userVotes[userId] || [];

  let nextUserSelectedOptionIds: string[] = [];

  if (isMultiple) {
    if (currentUserSelectedOptionIds.includes(optionId)) {
      nextUserSelectedOptionIds = currentUserSelectedOptionIds.filter(id => id !== optionId);
    } else {
      nextUserSelectedOptionIds = [...currentUserSelectedOptionIds, optionId];
    }
  } else {
    if (currentUserSelectedOptionIds.includes(optionId)) {
      nextUserSelectedOptionIds = [];
    } else {
      nextUserSelectedOptionIds = [optionId];
    }
  }

  if (nextUserSelectedOptionIds.length === 0) {
    delete userVotes[userId];
  } else {
    userVotes[userId] = nextUserSelectedOptionIds;
  }

  const voterInfo: ClanPollVoter = {
    userId: user.uid,
    userName: user.displayName || 'Clan Member',
    userPhoto: user.photoURL || '',
  };

  const updatedOptions: ClanPollOption[] = poll.options.map(opt => {
    let voterIds = [...(opt.voterIds || [])];
    let voters = [...(opt.voters || [])];

    const wasVoted = currentUserSelectedOptionIds.includes(opt.id);
    const isNowVoted = nextUserSelectedOptionIds.includes(opt.id);

    if (wasVoted && !isNowVoted) {
      voterIds = voterIds.filter(id => id !== userId);
      voters = voters.filter(v => v.userId !== userId);
    } else if (!wasVoted && isNowVoted) {
      if (!voterIds.includes(userId)) voterIds.push(userId);
      if (!poll.isAnonymous) {
        if (!voters.some(v => v.userId === userId)) voters.push(voterInfo);
      }
    }

    return {
      ...opt,
      votesCount: voterIds.length,
      voterIds,
      voters: poll.isAnonymous ? [] : voters,
    };
  });

  const allVotedUsers = Object.keys(userVotes);
  const totalVotesCount = updatedOptions.reduce((acc, curr) => acc + curr.votesCount, 0);

  const updatedPoll: ClanPoll = {
    ...poll,
    options: updatedOptions,
    totalVotes: totalVotesCount,
    votedUserIds: allVotedUsers,
    userVotes,
  };

  await updateDoc(postRef, {
    poll: cleanDoc(updatedPoll),
  });

  return updatedPoll;
}

export async function removePollFromClanPost(postId: string): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  await updateDoc(postRef, {
    poll: null,
    updatedAt: serverTimestamp(),
  });
}

export async function getClanMembership(clanId: string, userId: string): Promise<ClanMembership | null> {
  try {
    const memberId = `${clanId}_${userId}`;
    const snap = await getDoc(doc(db, 'clan_memberships', memberId));
    if (!snap.exists()) return null;
    return snap.data() as ClanMembership;
  } catch (err) {
    console.error('Error fetching clan membership:', err);
    return null;
  }
}

export async function getClanPosts(clanId: string, limitCount = 50): Promise<CommunityPost[]> {
  try {
    const q = query(
      collection(db, 'community_posts'),
      where('communityId', '==', clanId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityPost))
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
        return timeB - timeA;
      })
      .slice(0, limitCount);
  } catch (err) {
    console.error('Error fetching clan posts:', err);
    return [];
  }
}

export async function likeClanPost(postId: string, isLiking: boolean): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  if (isLiking) {
    await updateDoc(postRef, { likesCount: increment(1) });
  } else {
    await updateDoc(postRef, { likesCount: increment(-1) });
  }
}

export async function toggleLikeClanPost(postId: string, userId: string): Promise<boolean> {
  const postRef = doc(db, 'community_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return false;
  const data = snap.data() as CommunityPost;
  const likedUserIds = Array.isArray(data.likedUserIds) ? data.likedUserIds : [];
  const isLiked = likedUserIds.includes(userId);
  const updatedLikes = isLiked
    ? likedUserIds.filter(id => id !== userId)
    : [...likedUserIds, userId];
  
  await updateDoc(postRef, {
    likedUserIds: updatedLikes,
    likesCount: updatedLikes.length
  });

  if (!isLiked && data.authorId !== userId) {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const userData = userSnap.exists() ? userSnap.data() : {};
    const senderName = userData.displayName || 'An athlete';
    const postContext = data.clanName ? ` in ${data.clanName}` : (data.title ? `: "${data.title}"` : '');
    await notify(data.authorId, {
      type: 'like',
      senderId: userId,
      senderName,
      senderPhoto: userData.photoURL || '',
      message: `${senderName} liked your post${postContext}`,
      targetId: postId,
      read: false,
    });
  }

  return !isLiked;
}

export async function createPostComment(comment: Omit<PostComment, 'id' | 'createdAt'>): Promise<string> {
  const images = comment.images && comment.images.length > 0
    ? comment.images
    : (comment.imageUrl ? [comment.imageUrl] : []);

  const docRef = await addDoc(collection(db, 'community_post_comments'), {
    ...comment,
    imageUrl: images[0] || null,
    images: images,
    parentId: comment.parentId || null,
    replyToUserId: comment.replyToUserId || null,
    replyToUserName: comment.replyToUserName || null,
    likesCount: 0,
    likedUserIds: [],
    dislikesCount: 0,
    dislikedUserIds: [],
    createdAt: serverTimestamp(),
  });
  
  await updateDoc(doc(db, 'community_posts', comment.postId), {
    commentsCount: increment(1)
  }).catch(() => {});

  // Send Notification
  try {
    const targetUserId = comment.replyToUserId;
    if (targetUserId && targetUserId !== comment.userId) {
      await notify(targetUserId, {
        type: 'comment',
        senderId: comment.userId,
        senderName: comment.userName,
        senderPhoto: comment.userPhoto || '',
        message: `${comment.userName} replied to your comment`,
        targetId: comment.postId,
        read: false,
      });
    } else if (!targetUserId) {
      const postSnap = await getDoc(doc(db, 'community_posts', comment.postId));
      if (postSnap.exists()) {
        const postData = postSnap.data();
        if (postData.authorId && postData.authorId !== comment.userId) {
          const postContext = postData.clanName ? ` in ${postData.clanName}` : (postData.title ? `: "${postData.title}"` : '');
          await notify(postData.authorId, {
            type: 'comment',
            senderId: comment.userId,
            senderName: comment.userName,
            senderPhoto: comment.userPhoto || '',
            message: `${comment.userName} commented on your post${postContext}`,
            targetId: comment.postId,
            read: false,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error sending comment notification:', err);
  }
  
  return docRef.id;
}

export async function getPostComments(postId: string, limitCount = 100): Promise<PostComment[]> {
  try {
    const q = query(
      collection(db, 'community_post_comments'),
      where('postId', '==', postId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PostComment))
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
        return timeA - timeB;
      })
      .slice(0, limitCount);
  } catch (err) {
    console.error('Error fetching post comments:', err);
    return [];
  }
}

export async function toggleLikePostComment(commentId: string, userId: string): Promise<void> {
  const commentRef = doc(db, 'community_post_comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) return;
  const data = snap.data() as PostComment;
  const likedUserIds = Array.isArray(data.likedUserIds) ? data.likedUserIds : [];
  const dislikedUserIds = Array.isArray(data.dislikedUserIds) ? data.dislikedUserIds : [];
  
  const isLiked = likedUserIds.includes(userId);
  const newLikes = isLiked ? likedUserIds.filter(id => id !== userId) : [...likedUserIds, userId];
  const newDislikes = dislikedUserIds.filter(id => id !== userId);
  
  await updateDoc(commentRef, {
    likedUserIds: newLikes,
    likesCount: newLikes.length,
    dislikedUserIds: newDislikes,
    dislikesCount: newDislikes.length
  });

  if (!isLiked && data.userId !== userId) {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const userData = userSnap.exists() ? userSnap.data() : {};
    await notify(data.userId, {
      type: 'like',
      senderId: userId,
      senderName: userData.displayName || 'An athlete',
      senderPhoto: userData.photoURL || '',
      message: `${userData.displayName || 'An athlete'} liked your comment`,
      targetId: data.postId,
      read: false,
    });
  }
}

export async function toggleDislikePostComment(commentId: string, userId: string): Promise<void> {
  const commentRef = doc(db, 'community_post_comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) return;
  const data = snap.data() as PostComment;
  const likedUserIds = Array.isArray(data.likedUserIds) ? data.likedUserIds : [];
  const dislikedUserIds = Array.isArray(data.dislikedUserIds) ? data.dislikedUserIds : [];
  
  const isDisliked = dislikedUserIds.includes(userId);
  const newDislikes = isDisliked ? dislikedUserIds.filter(id => id !== userId) : [...dislikedUserIds, userId];
  const newLikes = likedUserIds.filter(id => id !== userId);
  
  await updateDoc(commentRef, {
    dislikedUserIds: newDislikes,
    dislikesCount: newDislikes.length,
    likedUserIds: newLikes,
    likesCount: newLikes.length
  });
}

export async function deletePostComment(commentId: string, postId: string): Promise<void> {
  // 1. Delete the comment
  await deleteDoc(doc(db, 'community_post_comments', commentId));
  
  // 2. Also delete any nested child replies
  const repliesSnap = await getDocs(query(collection(db, 'community_post_comments'), where('parentId', '==', commentId)));
  const batch = writeBatch(db);
  repliesSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit().catch(() => {});
  
  const totalDeleted = 1 + repliesSnap.size;
  
  // 3. Decrement commentsCount on the post
  const postRef = doc(db, 'community_posts', postId);
  await updateDoc(postRef, {
    commentsCount: increment(-totalDeleted)
  }).catch(() => {});
}

export async function deleteClanPost(postId: string): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  const snap = await getDoc(postRef);
  const data = snap.exists() ? (snap.data() as CommunityPost) : null;
  
  // 1. Clean up images from Firebase Storage if stored there
  if (data) {
    const imagesToDelete = [
      ...(data.images || []),
      ...(data.imageUrl ? [data.imageUrl] : [])
    ];
    for (const url of imagesToDelete) {
      if (url && typeof url === 'string' && (url.includes('firebasestorage.googleapis.com') || url.includes('appspot.com'))) {
        try {
          const decoded = decodeURIComponent(url.split('?')[0]);
          const pathIndex = decoded.indexOf('/o/');
          if (pathIndex !== -1) {
            const fullPath = decoded.substring(pathIndex + 3);
            await deleteObject(storageRef(storage, fullPath)).catch(() => {});
          }
        } catch (e) {
          console.warn('Could not delete storage image:', e);
        }
      }
    }
  }

  // 2. Delete the post and all comments/replies
  const batch = writeBatch(db);
  batch.delete(postRef);
  const commentsSnap = await getDocs(query(collection(db, 'community_post_comments'), where('postId', '==', postId)));
  commentsSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function getUserCommunityBadges(userId: string): Promise<EarnedCommunityBadge[]> {
  if (!userId) return [];
  const badgeMap = new Map<string, EarnedCommunityBadge>();

  const rankTitles: Record<number, { name: string; style: 'gold' | 'silver' | 'bronze'; emoji: string }> = {
    1: { name: 'Gold Champion', style: 'gold', emoji: '🥇' },
    2: { name: 'Silver Runner-Up', style: 'silver', emoji: '🥈' },
    3: { name: 'Bronze 3rd Place', style: 'bronze', emoji: '🥉' },
  };

  // 1. From User Document (Baseline)
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const list = uData.communityBadges || [];
      list.forEach((b: EarnedCommunityBadge) => {
        if (b && (b.sourceId || b.id)) {
          const sourceKey = b.sourceId ? `${b.sourceType || 'challenge'}_${b.sourceId}` : b.id;
          badgeMap.set(sourceKey, b);
        }
      });
    }
  } catch (e) {
    console.error('Failed to fetch badges from user doc', e);
  }

  // 2. From Live Challenge Participants (Authoritative Source of Truth)
  try {
    const q = query(
      collection(db, 'challenge_participants'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      const sourceKey = `challenge_${data.challengeId}`;
      const rawRank = data.badgeAwarded !== undefined ? data.badgeAwarded : (typeof data.rank === 'number' && data.rank <= 3 && data.rank >= 1 ? data.rank : undefined);
      const rank = rawRank as 1 | 2 | 3 | undefined;

      if (rank && rankTitles[rank]) {
        let cTitle = 'Challenge Victory';
        let clanId = '';
        let clanName = '';
        try {
          const cSnap = await getDoc(doc(db, 'challenges_v2', data.challengeId));
          if (cSnap.exists()) {
            const cData = cSnap.data();
            cTitle = cData.title || cTitle;
            clanId = cData.clanId || '';
            clanName = cData.clanName || '';
          }
        } catch {}

        const info = rankTitles[rank];
        const bObj: EarnedCommunityBadge = {
          id: `${data.challengeId}_rank_${rank}`,
          title: cTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${data.rank || rank})`,
          description: data.customResult || `Rank #${data.rank || rank} in "${cTitle}"`,
          rank,
          sourceType: 'challenge',
          sourceId: data.challengeId,
          sourceTitle: cTitle,
          clanId,
          clanName,
          awardedAt: data.updatedAt || data.joinedAt || Timestamp.now(),
          badgeStyle: info.style
        };
        // Always overwrite with the live participant rank
        badgeMap.set(sourceKey, bObj);
      } else if (data.challengeId) {
        // If participant is no longer ranked top 3 and has no badge, remove stale badge
        badgeMap.delete(sourceKey);
      }
    }
  } catch (e) {
    console.error('Failed to fetch badges from challenge participants', e);
  }

  // 3. From Live Event Participants (Authoritative Source of Truth)
  try {
    const q = query(
      collection(db, 'simple_event_participants'),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      const sourceKey = `event_${data.eventId}`;
      const rawRank = data.badgeAwarded !== undefined ? data.badgeAwarded : (typeof data.rank === 'number' && data.rank <= 3 && data.rank >= 1 ? data.rank : undefined);
      const rank = rawRank as 1 | 2 | 3 | undefined;

      if (rank && rankTitles[rank]) {
        let eTitle = 'Event Victory';
        let clanId = '';
        let clanName = '';
        try {
          const eSnap = await getDoc(doc(db, 'simple_events', data.eventId));
          if (eSnap.exists()) {
            const eData = eSnap.data();
            eTitle = eData.title || eTitle;
            clanId = eData.clanId || '';
            clanName = eData.clanName || '';
          }
        } catch {}

        const info = rankTitles[rank];
        const bObj: EarnedCommunityBadge = {
          id: `${data.eventId}_rank_${rank}`,
          title: eTitle,
          subtitle: `${info.emoji} ${info.name} (Rank #${data.rank || rank})`,
          description: data.customResult || `Rank #${data.rank || rank} in "${eTitle}"`,
          rank,
          sourceType: 'event',
          sourceId: data.eventId,
          sourceTitle: eTitle,
          clanId,
          clanName,
          awardedAt: data.updatedAt || Timestamp.now(),
          badgeStyle: info.style
        };
        badgeMap.set(sourceKey, bObj);
      } else if (data.eventId) {
        badgeMap.delete(sourceKey);
      }
    }
  } catch (e) {
    console.error('Failed to fetch badges from event participants', e);
  }

  const allBadges = Array.from(badgeMap.values());
  allBadges.sort((a, b) => (a.rank || 3) - (b.rank || 3));
  return allBadges;
}

function formatCleanScore(w: any, unit?: string): string {
  if (w.customResult && String(w.customResult).trim()) {
    let res = String(w.customResult).trim();
    if (res.startsWith('0 ') && res.length > 2 && !res.startsWith('0.')) {
      res = res.slice(2).trim();
    }
    return res;
  }
  const cleanUnit = (unit || '').trim();
  const rawProg = w.progress !== undefined && w.progress !== null ? w.progress : '';
  const progNum = Number(rawProg);
  if (rawProg !== '' && !isNaN(progNum) && progNum > 0) {
    if (cleanUnit.startsWith(`${rawProg} `) || cleanUnit === `${rawProg}`) {
      return cleanUnit;
    }
    return `${rawProg} ${cleanUnit}`.trim();
  }
  if (cleanUnit && cleanUnit !== '0') {
    if (cleanUnit.startsWith('0 ') && cleanUnit.length > 2 && !cleanUnit.startsWith('0.')) {
      return cleanUnit.slice(2).trim();
    }
    return cleanUnit;
  }
  return '';
}

/**
 * BACKFILL SCRIPT: Retroactively generates celebration posts for past concluded events and challenges.
 */
export async function backfillCelebrationPosts(): Promise<{ events: number; challenges: number; success: boolean; details?: string }> {
  let createdEvents = 0;
  let createdChallenges = 0;

  try {
    const nowMs = Date.now();
    console.log('[Backfill] Starting celebration post backfill...');

    // Pre-fetch all existing community posts and activities to avoid duplicate creation
    const existingClanPostsSnap = await getDocs(collection(db, 'community_posts'));
    const existingActivitiesSnap = await getDocs(collection(db, 'activities'));

    // ────────────────────────────────────────────────────────────────
    // 1. BACKFILL CHALLENGES (challenges_v2)
    // ────────────────────────────────────────────────────────────────
    const chalSnap = await getDocs(collection(db, 'challenges_v2'));
    console.log(`[Backfill] Found ${chalSnap.docs.length} challenges in challenges_v2`);

    for (const d of chalSnap.docs) {
      const challenge = { id: d.id, ...d.data() } as ChallengeV2;
      const endMs = challenge.endDate?.toMillis ? challenge.endDate.toMillis() : (challenge.endDate as any)?.seconds ? (challenge.endDate as any).seconds * 1000 : 0;
      
      const isConcluded = challenge.status === 'completed' || challenge.badgesAwarded || (endMs > 0 && endMs <= nowMs);
      if (!isConcluded) {
        console.log(`[Backfill] Challenge "${challenge.title}" (${challenge.id}) is not concluded yet. Skipping.`);
        continue;
      }

      // Fetch participants for this challenge
      const partSnap = await getDocs(
        query(collection(db, 'challenge_participants'), where('challengeId', '==', challenge.id))
      );

      if (partSnap.empty) {
        console.log(`[Backfill] No participants for challenge "${challenge.title}".`);
        continue;
      }

      const participants = partSnap.docs.map(doc => doc.data() as ChallengeParticipant);
      participants.sort((a, b) => {
        const rankA = (typeof a.rank === 'number' && a.rank > 0 && a.rank < 9999) ? a.rank : 9999;
        const rankB = (typeof b.rank === 'number' && b.rank > 0 && b.rank < 9999) ? b.rank : 9999;
        if (rankA !== rankB) return rankA - rankB;
        const progA = typeof a.progress === 'number' ? a.progress : Number(a.progress) || 0;
        const progB = typeof b.progress === 'number' ? b.progress : Number(b.progress) || 0;
        return progB - progA;
      });

      const top3 = participants.slice(0, 3);
      const rankEmojis = ['🥇', '🥈', '🥉'];
      const podiumText = top3.map((w, i) => {
        const emoji = rankEmojis[i] || '🎖️';
        const score = formatCleanScore(w, challenge.unit);
        const scoreStr = score ? ` • ${score}` : '';
        return `${emoji} ${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'}: ${w.userName || 'Athlete'}${scoreStr}`;
      }).join('\n');

      const top3Cleaned = top3.map((w, i) => ({
        rank: (i + 1) as 1 | 2 | 3,
        name: w.userName || 'Athlete',
        score: formatCleanScore(w, challenge.unit),
        userPhoto: w.userPhoto || ''
      }));

      const postCreatedAt = challenge.endDate || Timestamp.now();

      // Check if existing post exists
      const existingClanPostDoc = existingClanPostsSnap.docs.find(doc => {
        const p = doc.data();
        return (p.sourceId === challenge.id || p.title?.includes(challenge.title)) &&
          (challenge.clanId ? p.communityId === challenge.clanId : true);
      });

      const existingActivityDoc = existingActivitiesSnap.docs.find(doc => {
        const a = doc.data();
        return a.details?.challengeId === challenge.id || a.summary?.includes(challenge.title) || a.title?.includes(challenge.title);
      });

      if (existingClanPostDoc) {
        // Update existing clan post with clean text & structured winners
        await updateDoc(existingClanPostDoc.ref, {
          title: `🏆 Challenge Concluded: ${challenge.title}`,
          text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
          winners: top3Cleaned,
          sourceType: 'challenge',
          sourceId: challenge.id,
        });
        createdChallenges++;
        console.log(`[Backfill] Updated existing clan celebration post for challenge "${challenge.title}"`);
        continue;
      }

      if (existingActivityDoc) {
        // Update existing activity with clean text & structured winners
        await updateDoc(existingActivityDoc.ref, {
          summary: `🏆 Challenge Concluded: ${challenge.title}`,
          details: {
            text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
            challengeId: challenge.id,
            challengeTitle: challenge.title,
            winners: top3Cleaned,
          }
        });
        createdChallenges++;
        console.log(`[Backfill] Updated existing public celebration activity for challenge "${challenge.title}"`);
        continue;
      }

      if (challenge.clanId) {
        // Clan-specific challenge -> post to community_posts
        await addDoc(collection(db, 'community_posts'), {
          communityId: challenge.clanId,
          clanName: challenge.clanName || 'Clan',
          title: `🏆 Challenge Concluded: ${challenge.title}`,
          text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
          winners: top3Cleaned,
          authorId: 'system',
          authorName: 'Apparatus Arena',
          authorPhoto: '',
          likesCount: 0,
          likedUserIds: [],
          commentsCount: 0,
          sourceType: 'challenge',
          sourceId: challenge.id,
          createdAt: postCreatedAt,
        });
        createdChallenges++;
        console.log(`[Backfill] Created clan celebration post for challenge "${challenge.title}" in clan ${challenge.clanId}`);
      } else {
        // Public challenge -> post to activities
        await addDoc(collection(db, 'activities'), {
          userId: 'system',
          userName: 'Apparatus Arena',
          userPhoto: '',
          type: 'achievement',
          summary: `🏆 Challenge Concluded: ${challenge.title}`,
          details: {
            text: `The challenge has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
            challengeId: challenge.id,
            challengeTitle: challenge.title,
            winners: top3Cleaned,
          },
          visibility: 'public',
          likesCount: 0,
          commentsCount: 0,
          createdAt: postCreatedAt,
        });
        createdChallenges++;
        console.log(`[Backfill] Created public celebration post for challenge "${challenge.title}"`);
      }

      // Send in-app and local push notification to Top 3 Winners
      const rankInfoMap: Record<number, { name: string; emoji: string }> = {
        1: { name: 'Gold Champion', emoji: '🥇' },
        2: { name: 'Silver Runner-Up', emoji: '🥈' },
        3: { name: 'Bronze 3rd Place', emoji: '🥉' },
      };

      top3.forEach((w, i) => {
        if (w.userId) {
          const info = rankInfoMap[i + 1] || { name: 'Winner', emoji: '🎖️' };
          addDoc(collection(db, 'notifications'), {
            receiverId: w.userId,
            senderId: challenge.createdBy || 'system',
            senderName: challenge.creatorName || 'Apparatus Arena',
            senderPhoto: '',
            type: 'achievement',
            message: `${info.emoji} Congratulations! You placed Rank #${i + 1} (${info.name}) in "${challenge.title}"!`,
            targetId: challenge.id,
            read: false,
            createdAt: Timestamp.now()
          }).catch(() => {});
        }
      });
    }

    // ────────────────────────────────────────────────────────────────
    // 2. BACKFILL EVENTS (simple_events)
    // ────────────────────────────────────────────────────────────────
    const simpleEventsSnap = await getDocs(collection(db, 'simple_events'));
    console.log(`[Backfill] Found ${simpleEventsSnap.docs.length} events in simple_events`);

    for (const d of simpleEventsSnap.docs) {
      const event = { id: d.id, ...d.data() } as SimpleEvent;
      const endMs = event.endTime?.toMillis ? event.endTime.toMillis() : (event.endTime as any)?.seconds ? (event.endTime as any).seconds * 1000 : 0;

      const isConcluded = event.status === 'completed' || event.badgesAwarded || !!event.topWinner || (endMs > 0 && endMs <= nowMs);
      if (!isConcluded) {
        console.log(`[Backfill] Event "${event.title}" (${event.id}) is not concluded yet. Skipping.`);
        continue;
      }

      // Fetch participants for this event
      const partSnap = await getDocs(
        query(collection(db, 'simple_event_participants'), where('eventId', '==', event.id))
      );

      let winnersList: { userName: string; result?: string; rank?: number }[] = [];

      if (!partSnap.empty) {
        const parts = partSnap.docs.map(doc => doc.data() as EventParticipant);
        parts.sort((a, b) => (a.rank || 999) - (b.rank || 999));
        winnersList = parts.slice(0, 3).map((p, idx) => ({
          userName: p.userName || 'Athlete',
          result: formatCleanScore(p, ''),
          rank: p.rank || (idx + 1)
        }));
      } else if (event.topWinner) {
        winnersList = [{
          userName: event.topWinner.userName || 'Athlete',
          result: formatCleanScore(event.topWinner, ''),
          rank: 1
        }];
      }

      if (winnersList.length === 0) {
        console.log(`[Backfill] No participants or winners found for event "${event.title}".`);
        continue;
      }

      const rankEmojis = ['🥇', '🥈', '🥉'];
      const podiumText = winnersList.map((w, i) => {
        const emoji = rankEmojis[i] || '🎖️';
        const resStr = w.result ? ` • ${w.result}` : '';
        return `${emoji} ${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'}: ${w.userName}${resStr}`;
      }).join('\n');

      const top3Cleaned = winnersList.map((w, i) => ({
        rank: (i + 1) as 1 | 2 | 3,
        name: w.userName,
        score: w.result || '',
        userPhoto: ''
      }));

      const postCreatedAt = event.endTime || Timestamp.now();

      // Check if existing post exists
      const existingClanPostDoc = existingClanPostsSnap.docs.find(doc => {
        const p = doc.data();
        return (p.sourceId === event.id || p.title?.includes(event.title)) &&
          (event.clanId ? p.communityId === event.clanId : true);
      });

      const existingActivityDoc = existingActivitiesSnap.docs.find(doc => {
        const a = doc.data();
        return a.details?.eventId === event.id || a.summary?.includes(event.title) || a.title?.includes(event.title);
      });

      if (existingClanPostDoc) {
        await updateDoc(existingClanPostDoc.ref, {
          title: `🏆 Event Concluded: ${event.title}`,
          text: `The event has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
          winners: top3Cleaned,
          sourceType: 'event',
          sourceId: event.id,
        });
        createdEvents++;
        console.log(`[Backfill] Updated existing clan celebration post for event "${event.title}"`);
        continue;
      }

      if (existingActivityDoc) {
        await updateDoc(existingActivityDoc.ref, {
          summary: `🏆 Event Concluded: ${event.title}`,
          details: {
            text: `The event has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
            eventId: event.id,
            eventTitle: event.title,
            winners: top3Cleaned,
          }
        });
        createdEvents++;
        console.log(`[Backfill] Updated existing public celebration activity for event "${event.title}"`);
        continue;
      }

      if (event.clanId) {
        // Clan-specific event -> post to community_posts
        await addDoc(collection(db, 'community_posts'), {
          communityId: event.clanId,
          clanName: event.clanName || 'Clan',
          title: `🏆 Event Concluded: ${event.title}`,
          text: `The event has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
          winners: top3Cleaned,
          authorId: 'system',
          authorName: 'Apparatus Arena',
          authorPhoto: '',
          likesCount: 0,
          likedUserIds: [],
          commentsCount: 0,
          sourceType: 'event',
          sourceId: event.id,
          createdAt: postCreatedAt,
        });
        createdEvents++;
        console.log(`[Backfill] Created clan celebration post for event "${event.title}" in clan ${event.clanId}`);
      } else {
        // Public event -> post to activities
        await addDoc(collection(db, 'activities'), {
          userId: 'system',
          userName: 'Apparatus Arena',
          userPhoto: '',
          type: 'achievement',
          summary: `🏆 Event Concluded: ${event.title}`,
          details: {
            text: `The event has officially concluded! Huge congratulations to our champions:\n\n${podiumText}`,
            eventId: event.id,
            eventTitle: event.title,
            winners: top3Cleaned,
          },
          visibility: 'public',
          likesCount: 0,
          commentsCount: 0,
          createdAt: postCreatedAt,
        });
        createdEvents++;
        console.log(`[Backfill] Created public celebration post for event "${event.title}"`);
      }

      // Send in-app and local push notification to Top 3 Winners of Event
      const rankInfoMap: Record<number, { name: string; emoji: string }> = {
        1: { name: 'Gold Champion', emoji: '🥇' },
        2: { name: 'Silver Runner-Up', emoji: '🥈' },
        3: { name: 'Bronze 3rd Place', emoji: '🥉' },
      };

      const eventParts = partSnap.docs.map(doc => doc.data() as EventParticipant);
      top3Cleaned.forEach((w) => {
        const matchingPart = eventParts.find(p => p.userName === w.name);
        if (matchingPart?.userId) {
          const rankInfo = rankInfoMap[w.rank] || { name: 'Winner', emoji: '🎖️' };
          addDoc(collection(db, 'notifications'), {
            receiverId: matchingPart.userId,
            senderId: event.createdBy || 'system',
            senderName: event.creatorName || 'Apparatus Arena',
            senderPhoto: '',
            type: 'achievement',
            message: `${rankInfo.emoji} Congratulations! You placed Rank #${w.rank} (${rankInfo.name}) in "${event.title}"!`,
            targetId: event.id,
            read: false,
            createdAt: Timestamp.now()
          }).catch(() => {});
        }
      });
    }

    console.log(`[Backfill] Completed! Created/Updated ${createdEvents} events, ${createdChallenges} challenges.`);
    return { events: createdEvents, challenges: createdChallenges, success: true };
  } catch (error: any) {
    console.error('[Backfill] Error backfilling celebration posts:', error);
    return { events: createdEvents, challenges: createdChallenges, success: false, details: error?.message };
  }
}

// ─── CLAN NOTIFICATIONS ───────────────────────────────────────────

export async function notifyClanMembers(params: {
  clanId: string;
  senderId: string;
  senderName: string;
  title: string;
  body: string;
  type: AppNotificationType;
  link?: string;
  extraData?: any;
}): Promise<void> {
  try {
    const { clanId, senderId, senderName, title, body, type, link, extraData } = params;
    const members = await getClanMembers(clanId);
    if (!members || members.length === 0) return;

    const notifPromises = members
      .filter(m => m.userId && m.userId !== senderId)
      .map(m =>
        addDoc(collection(db, 'app_notifications'), cleanDoc({
          userId: m.userId,
          title,
          body,
          type,
          link: link || `/clan/${clanId}`,
          read: false,
          createdAt: serverTimestamp(),
          extra: {
            clanId,
            senderId,
            senderName,
            ...(extraData || {})
          }
        })).catch(err => console.warn('Failed to send notification to member:', m.userId, err))
      );

    await Promise.allSettled(notifPromises);
  } catch (err) {
    console.error('Error notifying clan members:', err);
  }
}

// ─── CLAN ANNOUNCEMENTS ───────────────────────────────────────────

export async function createClanAnnouncement(
  announcement: Omit<CommunityAnnouncement, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const clanId = announcement.clanId || announcement.communityId;
  const docRef = await addDoc(collection(db, 'community_announcements'), cleanDoc({
    ...announcement,
    clanId,
    communityId: clanId,
    title: (announcement.title || '').trim(),
    content: (announcement.content || '').trim(),
    isPinned: Boolean(announcement.isPinned),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  // Notify all clan members of the announcement
  const snippet = announcement.title
    ? `${announcement.title}: ${announcement.content.slice(0, 100)}`
    : announcement.content.slice(0, 120);

  notifyClanMembers({
    clanId,
    senderId: announcement.authorId,
    senderName: announcement.authorName,
    title: `📢 Announcement from ${announcement.authorName}`,
    body: snippet,
    type: 'clan_announcement',
    link: `/clan/${clanId}`,
    extraData: { announcementId: docRef.id, clanId }
  }).catch(err => console.warn('Failed to notify clan members for announcement:', err));

  return docRef.id;
}

export async function getClanAnnouncements(clanId: string): Promise<CommunityAnnouncement[]> {
  try {
    const q = query(
      collection(db, 'community_announcements'),
      where('communityId', '==', clanId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityAnnouncement))
      .sort((a, b) => {
        // Pinned first, then newest by date
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = a.createdAt && typeof (a.createdAt as any).toMillis === 'function'
          ? (a.createdAt as any).toMillis()
          : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
        const timeB = b.createdAt && typeof (b.createdAt as any).toMillis === 'function'
          ? (b.createdAt as any).toMillis()
          : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
        return timeB - timeA;
      });
  } catch (err) {
    console.error('Error fetching clan announcements:', err);
    return [];
  }
}

export async function updateClanAnnouncement(
  announcementId: string,
  data: Partial<CommunityAnnouncement>
): Promise<void> {
  const ref = doc(db, 'community_announcements', announcementId);
  const updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };
  if (data.title !== undefined) updates.title = data.title.trim();
  if (data.content !== undefined) updates.content = data.content.trim();
  if (data.isPinned !== undefined) updates.isPinned = data.isPinned;

  await updateDoc(ref, updates);
}

export async function deleteClanAnnouncement(announcementId: string): Promise<void> {
  await deleteDoc(doc(db, 'community_announcements', announcementId));
}

// ─── CLAN DISCUSSION & CHAT ──────────────────────────────────────

export function subscribeClanMessages(
  clanId: string,
  onMessages: (messages: ClanMessage[]) => void,
  onError?: (error: any) => void
): () => void {
  const q = query(
    collection(db, 'clan_messages'),
    where('clanId', '==', clanId),
    limit(150)
  );

  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ClanMessage))
        .sort((a, b) => {
          const timeA = a.createdAt && typeof (a.createdAt as any).toMillis === 'function'
            ? (a.createdAt as any).toMillis()
            : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
          const timeB = b.createdAt && typeof (b.createdAt as any).toMillis === 'function'
            ? (b.createdAt as any).toMillis()
            : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
          return timeA - timeB;
        });
      onMessages(msgs);
    },
    (err) => {
      console.error('Error in clan chat subscription:', err);
      onError?.(err);
    }
  );
}

export async function sendClanMessage(
  data: Omit<ClanMessage, 'id' | 'createdAt' | 'updatedAt' | 'reactions' | 'isEdited' | 'isDeleted'>
): Promise<string> {
  const docRef = await addDoc(collection(db, 'clan_messages'), cleanDoc({
    ...data,
    text: (data.text || '').trim(),
    imageUrl: data.imageUrl || null,
    images: data.images || (data.imageUrl ? [data.imageUrl] : []),
    replyTo: data.replyTo ? cleanDoc(data.replyTo) : null,
    reactions: {},
    isEdited: false,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  // Notify all clan members of the chat message (WhatsApp style)
  let preview = data.text ? data.text.slice(0, 140) : (data.imageUrl ? '📷 Photo' : 'New message');
  if (data.replyTo) {
    preview = `↩️ ${data.replyTo.userName}: ${preview}`;
  }

  notifyClanMembers({
    clanId: data.clanId,
    senderId: data.userId,
    senderName: data.userName,
    title: `💬 ${data.userName}`,
    body: preview,
    type: 'clan_message',
    link: `/clan/${data.clanId}`,
    extraData: { messageId: docRef.id, clanId: data.clanId }
  }).catch(err => console.warn('Failed to notify clan members for chat message:', err));

  return docRef.id;
}

export async function editClanMessage(
  messageId: string,
  newText: string
): Promise<void> {
  const ref = doc(db, 'clan_messages', messageId);
  await updateDoc(ref, {
    text: newText.trim(),
    isEdited: true,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClanMessage(
  messageId: string
): Promise<void> {
  const ref = doc(db, 'clan_messages', messageId);
  await updateDoc(ref, {
    text: 'This message was deleted',
    imageUrl: null,
    images: [],
    isDeleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleClanMessageReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const ref = doc(db, 'clan_messages', messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const msg = snap.data() as ClanMessage;
  const reactions = { ...(msg.reactions || {}) };
  const currentUsers = reactions[emoji] || [];

  if (currentUsers.includes(userId)) {
    reactions[emoji] = currentUsers.filter(uid => uid !== userId);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  } else {
    reactions[emoji] = [...currentUsers, userId];
  }

  await updateDoc(ref, { reactions });
}

// ─── CLAN JOIN REQUESTS (PRIVATE CLANS) ───────────────────────────

export async function requestToJoinClan(
  clanId: string,
  clanName: string,
  user: { uid: string; displayName?: string | null; photoURL?: string | null },
  message?: string
): Promise<string> {
  // Check if there is already a pending request
  const existingReq = await getUserClanJoinRequest(clanId, user.uid);
  if (existingReq) {
    return existingReq.id!;
  }

  const docRef = await addDoc(collection(db, 'clan_join_requests'), cleanDoc({
    clanId,
    clanName,
    userId: user.uid,
    userName: user.displayName || 'Athlete',
    userPhoto: user.photoURL || '',
    message: (message || '').trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  // Notify clan leaders and co-leaders
  try {
    const members = await getClanMembers(clanId);
    const leadership = members.filter(m => (m.role === 'leader' || m.role === 'co_leader') && m.userId !== user.uid);
    const requesterName = user.displayName || 'Athlete';
    const trimmedMsg = (message || '').trim();

    const notifPromises = leadership.map(leader =>
      addDoc(collection(db, 'app_notifications'), cleanDoc({
        userId: leader.userId,
        title: `🛡️ Join Request: ${clanName}`,
        body: `${requesterName} requested to join your clan${trimmedMsg ? `: "${trimmedMsg}"` : '.'} Tap to review.`,
        type: 'clan_join_request',
        link: `/clan/${clanId}?requests=true`,
        read: false,
        createdAt: serverTimestamp(),
        extra: {
          clanId,
          requestId: docRef.id,
          requesterId: user.uid,
          requesterName,
        }
      })).catch(err => console.warn('Failed to notify leader for join request:', leader.userId, err))
    );

    await Promise.allSettled(notifPromises);
  } catch (err) {
    console.error('Error notifying leaders of join request:', err);
  }

  return docRef.id;
}

export async function getClanJoinRequests(clanId: string): Promise<ClanJoinRequest[]> {
  try {
    const q = query(
      collection(db, 'clan_join_requests'),
      where('clanId', '==', clanId),
      where('status', '==', 'pending'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as ClanJoinRequest))
      .sort((a, b) => {
        const timeA = a.createdAt && typeof (a.createdAt as any).toMillis === 'function'
          ? (a.createdAt as any).toMillis()
          : ((a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0);
        const timeB = b.createdAt && typeof (b.createdAt as any).toMillis === 'function'
          ? (b.createdAt as any).toMillis()
          : ((b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0);
        return timeB - timeA;
      });
  } catch (err) {
    console.error('Error fetching clan join requests:', err);
    return [];
  }
}

export async function getUserClanJoinRequest(clanId: string, userId: string): Promise<ClanJoinRequest | null> {
  try {
    const q = query(
      collection(db, 'clan_join_requests'),
      where('clanId', '==', clanId),
      where('userId', '==', userId),
      where('status', '==', 'pending'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as ClanJoinRequest;
  } catch (err) {
    console.error('Error fetching user clan join request:', err);
    return null;
  }
}

export async function cancelClanJoinRequest(requestId: string): Promise<void> {
  await deleteDoc(doc(db, 'clan_join_requests', requestId));
}

export async function acceptClanJoinRequest(
  requestId: string,
  clanId: string,
  clanName: string,
  requester: { userId: string; userName: string; userPhoto: string }
): Promise<void> {
  // 1. Update request status to accepted
  const reqRef = doc(db, 'clan_join_requests', requestId);
  await updateDoc(reqRef, {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });

  // 2. Add as active clan member
  await joinClan(requester.userId, requester.userName, requester.userPhoto, clanId);

  // 3. Notify the requester
  await addDoc(collection(db, 'app_notifications'), {
    userId: requester.userId,
    title: `🎉 Clan Request Accepted!`,
    body: `You are now a member of ${clanName}! Welcome to the clan.`,
    type: 'clan_join_accepted',
    link: `/clan/${clanId}`,
    read: false,
    createdAt: serverTimestamp(),
    extra: { clanId, clanName }
  }).catch(err => console.warn('Failed to notify accepted requester:', err));
}

export async function declineClanJoinRequest(
  requestId: string,
  clanId: string,
  clanName: string,
  requesterId: string
): Promise<void> {
  // 1. Update request status to declined
  const reqRef = doc(db, 'clan_join_requests', requestId);
  await updateDoc(reqRef, {
    status: 'declined',
    updatedAt: serverTimestamp(),
  });

  // 2. Notify the requester
  await addDoc(collection(db, 'app_notifications'), {
    userId: requesterId,
    title: `Clan Request Update`,
    body: `Your request to join ${clanName} was declined by the leadership.`,
    type: 'clan_join_request',
    link: `/clan/${clanId}`,
    read: false,
    createdAt: serverTimestamp(),
    extra: { clanId, clanName }
  }).catch(err => console.warn('Failed to notify declined requester:', err));
}
